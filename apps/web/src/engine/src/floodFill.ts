// (#453) The fill tool's core: pixels in, coverage mask out.
//
// Pure CPU and pure data — no GL, no engine state — for two reasons. The
// obvious one is that it is then unit-testable, unlike almost everything else
// that produces pixels here (MockGL never rasterizes, see
// project_mockgl_no_marker). The load-bearing one is that a flood fill is a
// *threshold* on pixel values, and thresholds amplify: two GPUs that agree to
// within a least-significant bit disagree about which side of `tolerance` a
// pixel falls on, and one pixel's disagreement at a 1px gap in a pencil line
// is the difference between a filled shape and a filled canvas.
//
// That is why the result of this travels in the operation as a raster (ADR
// 009) instead of the parameters that produced it. And that in turn is why
// nothing in this file has to be deterministic across devices: only the author
// ever runs it. Tolerance, gap closing and the coverage ramp can all be
// rewritten later without versioning a single already-recorded operation —
// the exact opposite of selectionMask.ts next door, which rasterizes a polygon
// every participant replays and is pinned to the byte because of it.

/** Cap per axis on a fill domain. A bounded room's canvas is comfortably
 *  inside it (A4 at 300dpi is 2480x3508); an infinite room's content bounds
 *  are not bounded by anything, and neither the GPU's max texture size nor a
 *  main-thread scan of the result would survive being handed one. Past this
 *  the domain is a box of this size centred on the seed — a fill that reaches
 *  its edge reports `clipped`, exactly as one that reaches the canvas edge
 *  does, so the cap surfaces as the same "this leaked" message rather than as
 *  a silently different result. */
export const FILL_MAX_DIM = 4096

export interface FillSource {
  /** RGBA8, **premultiplied** — layer buffers' own storage, handed over
   *  without an unpremultiply step on purpose (see `visualDistance`). */
  pixels: Uint8Array
  width: number
  height: number
  /** What shows through where the drawing is transparent: the room's paper
   *  colour, 0–255 per channel. Every comparison happens *over* this. */
  background: readonly [number, number, number]
}

export interface FillParams {
  /** Seed in source-local pixels. */
  seedX: number
  seedY: number
  /** 0–1. 0 fills only what matches the seed exactly; 1 fills anything the
   *  domain is connected through. */
  tolerance: number
  /** 0–3 px. Morphological closing radius applied to the *blocked* set before
   *  the fill runs — seals a gap up to 2r wide without moving any boundary the
   *  fill was going to respect anyway. */
  gapClose: number
  /** 0–3 px. Dilation of the finished mask, i.e. how far the paint creeps
   *  *under* the line it stopped at. Kills the pale seam at the join; nothing
   *  to do with the soft edge below, which is a different problem. */
  expand: number
}

export interface FillResult {
  /** One byte of coverage per source pixel, row-major, same dimensions as the
   *  source. */
  coverage: Uint8Array
  /** Tight bounds of non-zero coverage, source-local, max-exclusive. Null when
   *  nothing was filled at all. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  /** The fill reached the edge of the domain — i.e. the region was not closed
   *  (or the seed was outside anything closed). The caller is expected to say
   *  so out loud: a fill that quietly covers the whole canvas is an operation
   *  in a permanent log that nobody asked for. */
  clipped: boolean
}

/** Where the soft edge sits, as a fraction of `tolerance`. A pixel closer than
 *  `tolerance * SOFT_LOW` is solid fill, one past `tolerance` is not fill at
 *  all, and the band between them is the antialiased rim.
 *
 *  The rim is derived from the source's own values rather than from distance
 *  to the boundary, and that is the entire trick: a pencil edge is already
 *  antialiased in *alpha*, so a pixel where the graphite covers 40% reads as
 *  40% of the way toward "blocked" and takes 60% fill. Blur the mask instead
 *  and the two antialiased edges (ink's and fill's) add up to a visible seam;
 *  step it hard and the fill has jaggies the drawing does not. */
const SOFT_LOW = 0.6

/** Distance between two pixels as they are *seen*, not as they are stored.
 *
 *  Layer buffers hold premultiplied colour, so a transparent pixel's RGB is
 *  zero and carries no information — comparing straight-alpha RGB there would
 *  be comparing noise, which is what makes a naive bucket tear a drawing into
 *  islands. Compositing over the paper first removes the question: `rgb +
 *  bg*(1-a)` is exactly what the display pass puts on screen, and for
 *  premultiplied input it needs no division and stays well-defined at a = 0.
 *
 *  Max-channel rather than a Euclidean or perceptual norm: `tolerance` is a
 *  slider a person drags until the fill stops leaking, and max-channel is the
 *  one metric where "I doubled it" means twice as much of every channel. A
 *  perceptual distance would be defensible here later — it changes nothing
 *  downstream, since only the author runs this. */
function visualDistance(
  pixels: Uint8Array, i: number,
  seedR: number, seedG: number, seedB: number,
  bgR: number, bgG: number, bgB: number,
): number {
  const a = pixels[i + 3]
  const t = (255 - a) / 255
  const r = pixels[i]     + bgR * t
  const g = pixels[i + 1] + bgG * t
  const b = pixels[i + 2] + bgB * t
  const dr = Math.abs(r - seedR)
  const dg = Math.abs(g - seedG)
  const db = Math.abs(b - seedB)
  return dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db)
}

/** Separable box dilation/erosion of an 8-bit field, radius `r`, in place via
 *  one scratch buffer. A square structuring element rather than a disc: at
 *  r <= 3 the two differ by at most a corner pixel, and separability is what
 *  keeps this O(w*h) instead of O(w*h*r²) on a canvas-sized domain.
 *
 *  `pick` is Math.max for a dilation and Math.min for an erosion — the pair is
 *  what a morphological closing is made of, and writing them as one function
 *  keeps the two halves provably symmetric. */
function morphPass(
  field: Uint8Array, width: number, height: number, r: number,
  pick: (a: number, b: number) => number,
): void {
  if (r <= 0) return
  const tmp = new Uint8Array(field.length)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let v = field[row + x]
      const lo = x - r < 0 ? 0 : x - r
      const hi = x + r >= width ? width - 1 : x + r
      for (let k = lo; k <= hi; k++) v = pick(v, field[row + k])
      tmp[row + x] = v
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = tmp[y * width + x]
      const lo = y - r < 0 ? 0 : y - r
      const hi = y + r >= height ? height - 1 : y + r
      for (let k = lo; k <= hi; k++) v = pick(v, tmp[k * width + x])
      field[y * width + x] = v
    }
  }
}

/** Scanline flood fill over `open` (non-zero = the fill may pass), 4-connected,
 *  writing 1 into `filled`. Iterative with an explicit stack of spans: a
 *  recursive or per-pixel-stack fill blows the JS stack (or the heap) on a
 *  canvas-sized region, which is exactly the size this is for.
 *
 *  Returns whether any filled pixel sat on the domain border. */
function scanlineFill(
  open: Uint8Array, filled: Uint8Array,
  width: number, height: number, seedX: number, seedY: number,
): boolean {
  let touchedEdge = false
  // Each entry is one horizontal span still to be grown from: [x1, x2, y].
  const stack: number[] = [seedX, seedX, seedY]
  while (stack.length > 0) {
    const y = stack.pop()!
    const x2 = stack.pop()!
    const x1 = stack.pop()!
    const row = y * width
    // Walk out from the span in both directions, then hand the row above and
    // below whatever this row actually covered.
    let left = x1
    while (left >= 0 && open[row + left] !== 0 && filled[row + left] === 0) left--
    left++
    let right = x2
    while (right < width && open[row + right] !== 0 && filled[row + right] === 0) right++
    right--
    if (left > right) continue
    for (let x = left; x <= right; x++) filled[row + x] = 1
    if (left === 0 || right === width - 1 || y === 0 || y === height - 1) touchedEdge = true
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue
      const nrow = ny * width
      let x = left
      while (x <= right) {
        while (x <= right && (open[nrow + x] === 0 || filled[nrow + x] !== 0)) x++
        if (x > right) break
        const start = x
        while (x <= right && open[nrow + x] !== 0 && filled[nrow + x] === 0) x++
        stack.push(start, x - 1, ny)
      }
    }
  }
  return touchedEdge
}

/** Finds the connected region around the seed and returns its coverage.
 *
 *  Five steps, each of which exists because of something a drawing actually
 *  does:
 *
 *   1. **Soft membership.** Every pixel gets 0–255 for "how much like the seed
 *      is this", over the paper (see `visualDistance` and `SOFT_LOW`). This is
 *      both the connectivity test and, for the pixels that survive, the
 *      antialiased edge — one pass, not two.
 *   2. **Gap closing.** A closing on the blocked set, so a pencil line with
 *      holes in it (which every pencil line has — `DAB_FRAG` modulates deposit
 *      by the paper's grain) still bounds a region.
 *   3. **The fill itself**, 4-connected from the seed.
 *   4. **Expand**, pushing the finished mask under the line it stopped at.
 *   5. **Coverage**, solid inside, soft membership at the rim.
 */
export function computeFill(source: FillSource, params: FillParams): FillResult {
  const { pixels, width, height, background } = source
  const { seedX, seedY, tolerance, gapClose, expand } = params
  const empty: FillResult = { coverage: new Uint8Array(0), bounds: null, clipped: false }
  if (width <= 0 || height <= 0) return empty
  if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return empty

  const [bgR, bgG, bgB] = background
  const seedIdx = (seedY * width + seedX) * 4
  const seedA = (255 - pixels[seedIdx + 3]) / 255
  const seedR = pixels[seedIdx]     + bgR * seedA
  const seedG = pixels[seedIdx + 1] + bgG * seedA
  const seedB = pixels[seedIdx + 2] + bgB * seedA

  // Step 1. `hi` is where the fill stops entirely, `lo` where it is still
  // solid; between them is the rim. Both floored at a pixel's own quantum so
  // tolerance 0 still fills a flat region rather than the single seed pixel.
  const hi = Math.max(1, tolerance * 255)
  const lo = hi * SOFT_LOW
  const soft = new Uint8Array(width * height)
  for (let p = 0, i = 0; p < soft.length; p++, i += 4) {
    const d = visualDistance(pixels, i, seedR, seedG, seedB, bgR, bgG, bgB)
    if (d <= lo) soft[p] = 255
    else if (d >= hi) soft[p] = 0
    else soft[p] = Math.round(255 * (hi - d) / (hi - lo))
  }

  // Step 2. Closing the blocked set is the same operation as *opening* the
  // open one — complementing swaps dilation and erosion — so this is an
  // erosion followed by a dilation of `open`. Which is why it does not simply
  // shrink the region the fill can reach: an opening deletes structures
  // narrower than its element (the 1–2px channel leaking through a pencil
  // line) and restores every wider one to exactly where it was, so the
  // boundary the fill stops at does not move.
  //
  // Run on the soft field rather than a binary one, so a gap whose two pixels
  // are each half-covered by graphite closes like the half-blocked thing it
  // looks like, instead of counting as wide open.
  //
  // What morphology cannot do is tell a corridor from a room: a *region*
  // narrower than the element is deleted along with the leaks, because at that
  // width they are the same shape. So the radius steps down until the seed
  // survives it. A narrow region then fills with weaker gap closing instead of
  // not filling at all, which is the right way round — the alternative is a
  // tool that silently does nothing when you tap a thin gap between two lines,
  // and no slider explains that.
  const seedP = seedY * width + seedX
  let open = soft
  for (let r = Math.round(gapClose); r > 0; r--) {
    const candidate = soft.slice()
    morphPass(candidate, width, height, r, Math.min)
    morphPass(candidate, width, height, r, Math.max)
    if (candidate[seedP] !== 0) { open = candidate; break }
  }
  if (open[seedP] === 0) return empty

  // Step 3.
  const filled = new Uint8Array(width * height)
  const clipped = scanlineFill(open, filled, width, height, seedX, seedY)

  // Step 4. Dilating the binary mask, not the coverage: expand exists to slide
  // the paint under an opaque line, and under a line "how much paint" is not a
  // question anyone can see the answer to.
  const ex = Math.round(expand)
  if (ex > 0) {
    for (let p = 0; p < filled.length; p++) filled[p] = filled[p] !== 0 ? 255 : 0
    morphPass(filled, width, height, ex, Math.max)
    for (let p = 0; p < filled.length; p++) filled[p] = filled[p] !== 0 ? 1 : 0
  }

  // Step 5. A pixel the expansion reached is solid even where its own
  // membership was partial — that is the point of it. Everything else carries
  // its membership, which is the antialiased rim.
  const coverage = new Uint8Array(width * height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const p = row + x
      if (filled[p] === 0) continue
      const c = ex > 0 ? 255 : soft[p]
      if (c === 0) continue
      coverage[p] = c
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { coverage, bounds: null, clipped }
  return {
    coverage,
    bounds: { minX, minY, maxX: maxX + 1, maxY: maxY + 1 },
    clipped,
  }
}

/** Turns coverage into the straight-alpha RGBA bytes an `area_fill` raster is
 *  made of, cropped to `bounds`.
 *
 *  Solid colour in RGB across the whole rect including where coverage is zero,
 *  rather than transparent-black outside: PNG filters a constant row to almost
 *  nothing, so a flat rect costs less on the wire than a rect whose RGB
 *  wobbles with the alpha — and the alpha channel already says which pixels
 *  are paint. */
export function coverageToRgba(
  coverage: Uint8Array, width: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  color: readonly [number, number, number],
): { pixels: Uint8Array; width: number; height: number } {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  const out = new Uint8Array(w * h * 4)
  const [r, g, b] = color
  for (let y = 0; y < h; y++) {
    const src = (bounds.minY + y) * width + bounds.minX
    let dst = y * w * 4
    for (let x = 0; x < w; x++, dst += 4) {
      out[dst] = r
      out[dst + 1] = g
      out[dst + 2] = b
      out[dst + 3] = coverage[src + x]
    }
  }
  return { pixels: out, width: w, height: h }
}
