// (#441) Rebuilding the graphite-catch channel from the height channel, at
// load time, so it never has to be downloaded.
//
// The bake used to ship both channels interleaved — 2048² × 2 bytes = 8 MiB
// raw, ~7.4 MB after gzip, and gzip is nearly useless on it because the data
// is close to white noise (height carries 7.58 bits of entropy per byte,
// catch 5.86, out of 8). No repacking helps: brotli on de-interleaved planes
// and WebP lossless both bottom out around 6.2 MiB, ~12% off. The only way
// past that is to stop sending one of the two channels.
//
// And catch *is* redundant, almost exactly. bakePaperTextures.ts's catchAt is
// a two-tap finite difference of the pre-gamma field, and the shipped height
// is that same field raised to a solved display gamma — so inverting the
// gamma per 8-bit level recovers enough of the field to recompute catch.
// Measured against the full-precision channel it replaces, across the three
// shipped papers: RMSE 1.3–2.4 out of 255, worst-case texel off by 5–10, and
// the grain's standard deviation matches to a tenth of a level (97.9 vs 97.9
// on coarse). The bake asserts this every run rather than trusting the
// measurement — see MAX_CATCH_RMSE there.
//
// Two invariants this file is written to preserve, both of which the old
// interleaved format bought by brute force:
//
//  - **The catch amplification still never touches a GPU.** It magnifies a
//    difference of two close values by ~30x, and a fragment shader's "highp"
//    is a request rather than a guarantee — that is what made the same stroke
//    land differently on a desktop and a tablet before the offline bake. This
//    runs in plain JS doubles, exactly like the bake did.
//  - **Every client still ends up with identical bytes.** See
//    PAPER_CATCH_LUT_SCALE for how the table avoids ever asking a client to
//    evaluate Math.pow, whose last-bit behaviour is not specified across JS
//    engines.
//
// The cost is one ~4.2M-iteration pass over the texture on load (tens of ms on
// a laptop, a few hundred on a weak tablet) in exchange for ~3.5 MB not
// downloaded. On the connections this app is actually used over that is not a
// close call.

/** One entry per possible 8-bit height value — the table is indexed by the
 *  stored byte itself, so its size is fixed by the format, not chosen. */
export const PAPER_CATCH_LUT_SIZE = 256

/** The table travels in the manifest as **integers**, in units of 2^-20.
 *
 *  Fixed point rather than JSON floats for one reason that matters and one
 *  that is merely nice. The one that matters: a client must never evaluate
 *  Math.pow, because its last-bit result is implementation-defined, and a
 *  single-ULP disagreement across 4.2M texels will land on a rounding boundary
 *  somewhere and give two devices different grain — the exact cross-device
 *  drift the offline bake exists to eliminate. Baking the table removes pow
 *  from the client entirely, and multiplying by a negative power of two is
 *  exact in IEEE-754, so decoding introduces nothing of its own. The nice one:
 *  `6511656` is eight characters where a round-tripped double is eighteen,
 *  which keeps the manifest — fetched before anything else can start — small
 *  and readable.
 *
 *  2^-20 is ~1e-6 against table values up to ~6.2, four orders below the
 *  1/255 quantum the result is rounded to. And it is not an error term in any
 *  case: the bake builds catch through this same quantized table, so the
 *  quantization is part of the definition rather than a loss against it. */
export const PAPER_CATCH_LUT_SCALE = 1 / (1 << 20)

/** Bakes the per-paper table that turns a stored height byte into the term
 *  buildPaperCatch differences.
 *
 *  It folds three things the client would otherwise need separately: the
 *  inverse display gamma (recovering the pre-gamma field the slope was
 *  measured on), the paper's own `catchGain`, and catchAt's constant 3.0.
 *  Folding is not just tidiness — it means a client never sees `gamma` or
 *  `gain` as numbers it could apply in a different order, and floating-point
 *  addition is not associative, so "a different order" is "different bytes".
 *  The bake computes catch through this same function, so whatever order this
 *  fixes is the definition. */
export function buildPaperCatchLut(gamma: number, gain: number): number[] {
  const lut = new Array<number>(PAPER_CATCH_LUT_SIZE)
  for (let v = 0; v < PAPER_CATCH_LUT_SIZE; v++) {
    lut[v] = Math.round(Math.pow(v / 255, 1 / gamma) * gain * 3 / PAPER_CATCH_LUT_SCALE)
  }
  return lut
}

/** Expands a bare height plane into the interleaved LUMINANCE_ALPHA grid the
 *  engine uploads: `[height0, catch0, height1, catch1, ...]`, matching
 *  gl.texImage2D(..., gl.LUMINANCE_ALPHA, ...) and what DISPLAY_FRAG reads as
 *  `.r` and DAB_FRAG as `.a`.
 *
 *  `height` must be a square grid; the resolution is derived from its length
 *  the same way uploadPaperTexture derives the texture's, so the two cannot
 *  disagree about what they are looking at.
 *
 *  The +1 taps wrap, because the tile is seamless and a clamped edge would put
 *  a one-texel line of wrong tooth along two sides of every repeat — at
 *  PAPER_WORLD_SIZE that is a line every 157 world units across the canvas. */
export function buildPaperCatch(height: Uint8Array, lut: readonly number[]): Uint8Array {
  const res = Math.round(Math.sqrt(height.length))
  if (res * res !== height.length) {
    throw new Error(`Paper height plane is ${height.length} bytes, which is not a square grid`)
  }
  if (lut.length !== PAPER_CATCH_LUT_SIZE) {
    throw new Error(`Paper catch table has ${lut.length} entries, expected ${PAPER_CATCH_LUT_SIZE}`)
  }

  // Decoded once into a typed array rather than scaled per texel: 256
  // multiplications instead of 12.6M, and it keeps the inner loop free of any
  // arithmetic that isn't the difference itself.
  const g = new Float64Array(PAPER_CATCH_LUT_SIZE)
  for (let v = 0; v < PAPER_CATCH_LUT_SIZE; v++) g[v] = lut[v] * PAPER_CATCH_LUT_SCALE

  const out = new Uint8Array(height.length * 2)
  for (let y = 0; y < res; y++) {
    const row = y * res
    const rowDown = (y + 1 === res ? 0 : y + 1) * res
    for (let x = 0; x < res; x++) {
      const i = row + x
      const h = height[i]
      const here = g[h]
      // The same 0.6/0.8 tilt direction the bake used and DAB_FRAG's sampling
      // was matched to (#163): a constant, deliberately not a real pen's tilt,
      // so every stroke gets the same directional response on every device.
      const v = (here - g[height[row + (x + 1 === res ? 0 : x + 1)]]) * 0.6
              + (here - g[height[rowDown + x]]) * 0.8 + 0.5
      out[i * 2] = h
      out[i * 2 + 1] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
    }
  }
  return out
}
