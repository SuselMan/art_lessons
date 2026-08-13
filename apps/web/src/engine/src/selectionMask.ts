import type { SelectionShape } from '@grafetto/shared'

import type { WorldRect } from './tileMath'

// (#446) Turns a selection polygon into an 8-bit coverage mask.
//
// Deliberately CPU-side and deliberately not Canvas2D — see ADR 008. In
// short: the result is baked into pixels every participant replays, so it
// falls under .claude/rules.md's cross-device determinism rule, and neither a
// GPU rasterizer (vertex float math plus a fill rule at the edge) nor
// Canvas2D (different in every browser — it is a fingerprinting vector for
// exactly that reason) can promise the same bytes on two machines. Plain
// float64 arithmetic can, and it gets an antialiased edge and real unit tests
// on the way (MockGL never rasterizes, so a GPU mask would have been
// untestable here as well as non-portable).

/** Sub-scanlines per output row. Four gives 5 distinguishable vertical
 *  coverage levels at a near-horizontal edge, which is where banding would
 *  show first; the horizontal direction is already exact (spans are clipped
 *  analytically, not sampled), so this is the only axis that needs sampling
 *  at all. */
const SUBSAMPLES = 4

/** Cap per axis on the rasterized mask. A selection is bounded only by how
 *  far the drawing goes, so at low zoom its box can be far bigger than any
 *  texture the GPU will take (and bigger than is worth rasterizing). Past
 *  this the mask is simply computed at lower resolution: it is sampled by
 *  normalized uv in the shader, so nothing downstream changes — the edge just
 *  gets softer, which is the right thing to lose. */
export const MASK_MAX_DIM = 2048

/** The integer world rect a selection covers, expanded outward so no partly
 *  covered pixel is cut off. Null when there is nothing to fill: fewer than
 *  three points, or a degenerate box (every point on one horizontal or
 *  vertical line) — both are shapes a user can produce by tapping or by
 *  dragging a zero-width rectangle, and neither has an inside. */
export function selectionBounds(selection: SelectionShape): WorldRect | null {
  const { points } = selection
  if (points.length < 6) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const rect = {
    minX: Math.floor(minX), minY: Math.floor(minY),
    maxX: Math.ceil(maxX), maxY: Math.ceil(maxY),
  }
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return null
  return rect
}

/** Mask texture size for a rect — one texel per world pixel until that would
 *  cross MASK_MAX_DIM, then uniformly less. Each axis is capped on its own:
 *  a long thin selection keeps full resolution across its short side. */
export function maskResolution(rect: WorldRect): { width: number; height: number } {
  const w = rect.maxX - rect.minX
  const h = rect.maxY - rect.minY
  return {
    width: Math.max(1, Math.min(w, MASK_MAX_DIM)),
    height: Math.max(1, Math.min(h, MASK_MAX_DIM)),
  }
}

type Edge = {
  // Ordered so y0 < y1 — direction is kept separately, since winding needs it
  // and the scan does not.
  x0: number; y0: number; x1: number; y1: number
  dir: 1 | -1
}

function buildEdges(points: number[]): Edge[] {
  const edges: Edge[] = []
  const n = points.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = points[i * 2], ay = points[i * 2 + 1]
    const bx = points[j * 2], by = points[j * 2 + 1]
    // A horizontal edge crosses no scanline, so it contributes nothing to
    // winding and is dropped rather than special-cased further down.
    if (ay === by) continue
    edges.push(ay < by
      ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 }
      : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 })
  }
  return edges
}

/** Rasterizes `selection` into `width` x `height` coverage bytes (0..255)
 *  spanning `rect`, row-major and **top-down**: byte `y * width + x` is the
 *  pixel whose top-left world corner is
 *  `(rect.minX + x * pxW, rect.minY + y * pxH)`.
 *
 *  Filled by nonzero winding, so a lasso that crosses itself has a defined
 *  result (the crossed lobe stays filled) instead of punching a hole the user
 *  did not ask for — even-odd is the rule that would surprise here.
 *
 *  Coverage is exact horizontally (spans are clipped to pixel edges
 *  analytically) and sampled vertically at SUBSAMPLES sub-scanlines. That
 *  asymmetry is deliberate: exact area coverage of an arbitrary polygon costs
 *  a lot more code, and the visible difference against 4x vertical sampling
 *  is a fraction of one alpha step on a diagonal edge. */
export function rasterizeSelectionMask(
  selection: SelectionShape, rect: WorldRect, width: number, height: number,
): Uint8Array {
  const out = new Uint8Array(width * height)
  const edges = buildEdges(selection.points)
  if (!edges.length) return out

  const pxW = (rect.maxX - rect.minX) / width
  const pxH = (rect.maxY - rect.minY) / height

  // Row buckets: without them every sub-scanline walks every edge, and a
  // freehand lasso is thousands of edges over a thousand rows. Each edge only
  // touches the rows its own y-range covers, which for a hand-drawn contour
  // is a handful.
  const buckets: number[][] = Array.from({ length: height }, () => [])
  for (let e = 0; e < edges.length; e++) {
    const { y0, y1 } = edges[e]
    const first = Math.max(0, Math.floor((y0 - rect.minY) / pxH))
    const last = Math.min(height - 1, Math.ceil((y1 - rect.minY) / pxH))
    for (let row = first; row <= last; row++) buckets[row].push(e)
  }

  const coverage = new Float64Array(width)
  const crossings: Array<{ x: number; dir: 1 | -1 }> = []
  const share = 1 / SUBSAMPLES

  for (let row = 0; row < height; row++) {
    const bucket = buckets[row]
    if (!bucket.length) continue
    coverage.fill(0)
    let touched = false

    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = rect.minY + (row + (s + 0.5) / SUBSAMPLES) * pxH
      crossings.length = 0
      for (const e of bucket) {
        const { x0, y0, x1, y1, dir } = edges[e]
        // Half-open in y (top included, bottom excluded) so a vertex shared by
        // two edges is counted exactly once.
        if (sy < y0 || sy >= y1) continue
        crossings.push({ x: x0 + (sy - y0) * (x1 - x0) / (y1 - y0), dir })
      }
      if (crossings.length < 2) continue
      crossings.sort((a, b) => a.x - b.x)

      let winding = 0
      for (let i = 0; i < crossings.length - 1; i++) {
        winding += crossings[i].dir
        if (winding === 0) continue
        const spanStart = (crossings[i].x - rect.minX) / pxW
        const spanEnd = (crossings[i + 1].x - rect.minX) / pxW
        const from = Math.max(0, spanStart)
        const to = Math.min(width, spanEnd)
        if (to <= from) continue
        touched = true
        const firstPx = Math.floor(from)
        const lastPx = Math.min(width - 1, Math.ceil(to) - 1)
        for (let px = firstPx; px <= lastPx; px++) {
          const overlap = Math.min(to, px + 1) - Math.max(from, px)
          if (overlap > 0) coverage[px] += overlap * share
        }
      }
    }

    if (!touched) continue
    const base = row * width
    for (let x = 0; x < width; x++) {
      const c = coverage[x]
      if (c <= 0) continue
      out[base + x] = c >= 1 ? 255 : Math.round(c * 255)
    }
  }

  return out
}

/** Convenience for callers that just want "the mask for this selection" —
 *  bounds, resolution and bytes in one call. Null for a selection with no
 *  inside (see selectionBounds). */
export function buildSelectionMask(
  selection: SelectionShape,
): { rect: WorldRect; width: number; height: number; data: Uint8Array } | null {
  const rect = selectionBounds(selection)
  if (!rect) return null
  const { width, height } = maskResolution(rect)
  return { rect, width, height, data: rasterizeSelectionMask(selection, rect, width, height) }
}

/** The four corners of an axis-aligned rectangle, as a selection polygon.
 *  Clockwise in app space (y down), which the nonzero fill above does not
 *  care about — it is here so a rectangle selection reads the same way in
 *  logs and tests every time. */
export function rectangleSelection(x0: number, y0: number, x1: number, y1: number): SelectionShape {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1)
  return { points: [minX, minY, maxX, minY, maxX, maxY, minX, maxY] }
}
