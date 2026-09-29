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
// 010) instead of the parameters that produced it. And that in turn is why
// nothing in this file has to be deterministic across devices: only the author
// ever runs it. Tolerance, gap closing and the coverage ramp can all be
// rewritten later without versioning a single already-recorded operation —
// the exact opposite of selectionMask.ts next door, which rasterizes a polygon
// every participant replays and is pinned to the byte because of it.

/** Cap per axis on a fill domain. A bounded room's canvas is comfortably
 *  inside it (A4 at 300dpi is 2480x3508); an infinite room's content bounds
 *  are not bounded by anything, and neither the GPU's max texture size nor a
 *  main-thread scan of the result would survive being handed one. Past this
 *  the domain is a box of this size centred on the seed, so a fill poured into
 *  an unclosed outline stops there instead of running for as long as memory
 *  holds out. */
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

/** Per-row inclusive x range of a sparse set: `hi[y] < lo[y]` means row `y`
 *  holds nothing. Every morphological step below is driven by one of these
 *  rather than by the domain, which is the whole point — see `openingOfSoft`. */
export interface RowSpans {
  lo: Int32Array
  hi: Int32Array
}

/** The "no content" marker for `lo`. INT32_MAX rather than
 *  Number.MAX_SAFE_INTEGER, which does not survive the store: an Int32Array
 *  keeps the low 32 bits of 2^53-1, i.e. -1, and an empty row then reads back
 *  as the perfectly plausible range -1..-1 — one pixel wide, addressing the
 *  end of the row above. */
const NO_SPAN = 0x7fffffff

function emptySpans(height: number): RowSpans {
  return { lo: new Int32Array(height).fill(NO_SPAN), hi: new Int32Array(height).fill(-1) }
}

function includeInSpans(spans: RowSpans, y: number, x: number): void {
  if (x < spans.lo[y]) spans.lo[y] = x
  if (x > spans.hi[y]) spans.hi[y] = x
}

/** Where the blocked pixels are — everything the fill might stop at. Computed
 *  for free inside `computeFill`'s classification pass; exported so a test can
 *  build one the same way. */
export function blockedRowSpans(soft: Uint8Array, width: number, height: number): RowSpans {
  const spans = emptySpans(height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) if (soft[row + x] !== 255) includeInSpans(spans, y, x)
  }
  return spans
}

/** Per-row extent of a binary mask. Production builds these as it fills (see
 *  `scanlineFill`); exported so a test can build one after the fact. */
export function maskRowSpans(mask: Uint8Array, width: number, height: number): RowSpans {
  const spans = emptySpans(height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) if (mask[row + x] !== 0) includeInSpans(spans, y, x)
  }
  return spans
}

/** Grows each row's range by `r` in both axes — the reach of a radius-`r`
 *  structuring element applied to `spans`. */
function grownSpans(spans: RowSpans, width: number, height: number, r: number): RowSpans {
  const out = emptySpans(height)
  for (let y = 0; y < height; y++) {
    if (spans.hi[y] < spans.lo[y]) continue
    const lo = Math.max(0, spans.lo[y] - r)
    const hi = Math.min(width - 1, spans.hi[y] + r)
    for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) {
      includeInSpans(out, k, lo)
      includeInSpans(out, k, hi)
    }
  }
  return out
}

/** The morphological opening of `soft` by a radius-`r` square — i.e. the gap
 *  closing, since closing the blocked set and opening the open one are the
 *  same operation seen from the two sides (complementing swaps dilation and
 *  erosion).
 *
 *  Written against the *blocked* side on purpose, and that is where the speed
 *  is. `soft` is 255 across almost all of a drawing — paper — so the field this
 *  works on is empty almost everywhere, and the cost of both halves scales with
 *  how much ink there is rather than with how big the canvas is. A dense
 *  separable pass, however carefully written, pays for every pixel of an A4
 *  sheet to discover that nearly all of them are blank: measured at 417 ms for one
 *  closing on a 2480x3508 domain, against 64 ms here for the identical result.
 *
 *  Two properties make the sparse form exact rather than an approximation:
 *
 *   - a *dilation* of the blocked set can only be non-zero within `r` of a
 *     blocked pixel, so stamping each blocked pixel's window covers it;
 *   - an *erosion* takes the minimum over a window, and a window containing
 *     any zero yields zero — so the erosion is zero wherever the dilation was,
 *     and only its support has to be visited at all.
 *
 *  Equivalence to the obvious dense implementation is not argued from those
 *  two sentences alone: `floodFill.test.ts` keeps a plain separable version and
 *  checks the two agree pixel for pixel on random fields. */
export function openingOfSoft(
  soft: Uint8Array, width: number, height: number, r: number, blocked: RowSpans,
): Uint8Array {
  const open = new Uint8Array(soft.length).fill(255)
  if (r <= 0) { open.set(soft); return open }

  // Dilate the blocked set by stamping each blocked pixel's window. Rows are
  // walked through `blocked`, so a domain with a drawing in one corner never
  // touches the rest.
  const dilated = new Uint8Array(soft.length)
  for (let y = 0; y < height; y++) {
    if (blocked.hi[y] < blocked.lo[y]) continue
    for (let x = blocked.lo[y]; x <= blocked.hi[y]; x++) {
      const v = 255 - soft[y * width + x]
      if (v === 0) continue
      const y0 = y - r < 0 ? 0 : y - r
      const y1 = y + r >= height ? height - 1 : y + r
      const x0 = x - r < 0 ? 0 : x - r
      const x1 = x + r >= width ? width - 1 : x + r
      for (let ny = y0; ny <= y1; ny++) {
        const row = ny * width
        for (let nx = x0; nx <= x1; nx++) if (dilated[row + nx] < v) dilated[row + nx] = v
      }
    }
  }

  // Erode it, visiting only where the dilation put something.
  const support = grownSpans(blocked, width, height, r)
  for (let y = 0; y < height; y++) {
    if (support.hi[y] < support.lo[y]) continue
    const row = y * width
    for (let x = support.lo[y]; x <= support.hi[y]; x++) {
      if (dilated[row + x] === 0) continue
      const y0 = y - r < 0 ? 0 : y - r
      const y1 = y + r >= height ? height - 1 : y + r
      const x0 = x - r < 0 ? 0 : x - r
      const x1 = x + r >= width ? width - 1 : x + r
      let m = 255
      for (let ny = y0; ny <= y1 && m > 0; ny++) {
        const nrow = ny * width
        for (let nx = x0; nx <= x1; nx++) {
          const c = dilated[nrow + nx]
          if (c < m) { m = c; if (m === 0) break }
        }
      }
      if (m !== 0) open[row + x] = 255 - m
    }
  }
  return open
}

/** Dilates a binary mask by `r`, in place, and grows `region` to match.
 *
 *  Deliberately *not* the sparse treatment `openingOfSoft` gets, because a
 *  filled region is the opposite kind of set from a blocked one: mostly solid.
 *  Stamping around every member, or hunting for its boundary pixel by pixel,
 *  costs more per pixel than simply sweeping — measured, on a fill covering an
 *  A4 sheet: a per-pixel 8-neighbour boundary hunt took 422 ms, where this sweep
 *  takes 112 ms and the dense separable pass it replaced took 209. Sparseness
 *  is a property of the data, not a technique that is always better.
 *
 *  So: separable, binary, and branch-light. The horizontal half is a pair of
 *  run-distance sweeps ("how far back was the last set pixel") rather than a
 *  window scan, so it reads each pixel twice regardless of `r`; the vertical
 *  half ORs whole rows together. Both are bounded by `region` grown by `r`,
 *  which is what keeps a small fill on a large canvas cheap. */
export function expandFilled(
  filled: Uint8Array, width: number, height: number, r: number, region: RowSpans,
): void {
  const grown = grownSpans(region, width, height, r)
  const src = filled.slice()
  for (let y = 0; y < height; y++) {
    if (grown.hi[y] < grown.lo[y]) continue
    const row = y * width
    const x0 = grown.lo[y], x1 = grown.hi[y]
    let last = -width
    for (let x = x0; x <= x1; x++) {
      if (src[row + x] !== 0) last = x
      filled[row + x] = x - last <= r ? 1 : 0
    }
    last = width * 2
    for (let x = x1; x >= x0; x--) {
      if (src[row + x] !== 0) last = x
      if (last - x <= r) filled[row + x] = 1
    }
  }
  const horizontal = filled.slice()
  for (let y = 0; y < height; y++) {
    if (grown.hi[y] < grown.lo[y]) continue
    const row = y * width
    const x0 = grown.lo[y], x1 = grown.hi[y]
    for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) {
      if (k === y) continue
      const krow = k * width
      for (let x = x0; x <= x1; x++) if (horizontal[krow + x] !== 0) filled[row + x] = 1
    }
  }
  region.lo.set(grown.lo)
  region.hi.set(grown.hi)
}

/** Scanline flood fill over `open` (non-zero = the fill may pass), 4-connected,
 *  writing 1 into `filled`. Iterative with an explicit stack of spans: a
 *  recursive or per-pixel-stack fill blows the JS stack (or the heap) on a
 *  canvas-sized region, which is exactly the size this is for. */
function scanlineFill(
  open: Uint8Array, filled: Uint8Array,
  width: number, height: number, seedX: number, seedY: number,
  region: RowSpans,
): void {
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
    // Spans are what the fill produces anyway, so its own extent is recorded
    // here for nothing — and it is what keeps the two steps after this one off
    // the rest of the domain.
    includeInSpans(region, y, left)
    includeInSpans(region, y, right)
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
  const empty: FillResult = { coverage: new Uint8Array(0), bounds: null }
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
  //
  // Where the blocked pixels are is recorded as it goes: this pass has to look
  // at every pixel anyway, and every step after it can then be driven by the
  // ink instead of by the domain (see `openingOfSoft`).
  const soft = new Uint8Array(width * height)
  const blocked = emptySpans(height)
  for (let y = 0, p = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, p++, i += 4) {
      const d = visualDistance(pixels, i, seedR, seedG, seedB, bgR, bgG, bgB)
      if (d <= lo) { soft[p] = 255; continue }
      soft[p] = d >= hi ? 0 : Math.round(255 * (hi - d) / (hi - lo))
      includeInSpans(blocked, y, x)
    }
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
  let open: Uint8Array = soft
  for (let r = Math.round(gapClose); r > 0; r--) {
    const candidate = openingOfSoft(soft, width, height, r, blocked)
    if (candidate[seedP] !== 0) { open = candidate; break }
  }
  if (open[seedP] === 0) return empty

  // Step 3.
  const filled = new Uint8Array(width * height)
  const region = emptySpans(height)
  scanlineFill(open, filled, width, height, seedX, seedY, region)

  // Step 4. Dilating the binary mask, not the coverage: expand exists to slide
  // the paint under an opaque line, and under a line "how much paint" is not a
  // question anyone can see the answer to.
  const ex = Math.round(expand)
  if (ex > 0) expandFilled(filled, width, height, ex, region)

  // Step 5. A pixel the expansion reached is solid even where its own
  // membership was partial — that is the point of it. Everything else carries
  // its membership, which is the antialiased rim.
  const coverage = new Uint8Array(width * height)
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    if (region.hi[y] < region.lo[y]) continue
    const row = y * width
    for (let x = region.lo[y]; x <= region.hi[y]; x++) {
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
  if (maxX < 0) return { coverage, bounds: null }
  return { coverage, bounds: { minX, minY, maxX: maxX + 1, maxY: maxY + 1 } }
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
