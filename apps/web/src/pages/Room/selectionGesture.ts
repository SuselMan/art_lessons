import type { SelectionShape } from '@grafetto/shared'

// (#446) The pure half of drawing a selection: how a stream of pointer
// positions becomes the closed polygon that goes into an operation. Kept out
// of Room/index.tsx for the same reason rulerGesture.ts is — this is the part
// worth testing, and none of it needs an engine, a canvas or a store.

/** The three ways to draw a selection. Rectangle and freehand are one press
 *  and one release; the point-by-point lasso is a sequence of taps ended by
 *  closing on the first point (or by double-tapping / pressing Enter, both of
 *  which Room maps onto `closePolygonSelection` below). */
export const SELECTION_SHAPES = ['rectangle', 'polygon', 'freehand'] as const

export type SelectionShapeKind = (typeof SELECTION_SHAPES)[number]

/** How far apart, in layer pixels, two freehand samples must be to record a
 *  second one. A pen reports far denser than a lasso needs: the points ride in
 *  the operation log forever (ADR 008), and at 3 px a hand-drawn contour keeps
 *  every curve a person can see while shedding most of its samples.
 *
 *  In *layer* pixels, deliberately not screen pixels: zoomed in, a slow
 *  careful outline should keep its detail, and that is exactly when screen
 *  distance would be largest. */
const FREEHAND_MIN_STEP = 3

/** How close a tap must come to the first vertex to close a point-by-point
 *  lasso instead of adding another vertex. In *screen* pixels, because it is a
 *  hit target — the caller divides by the zoom, the same way the ruler's own
 *  grab tolerances do, so closing a lasso is no harder zoomed out than in. */
export const POLYGON_CLOSE_RADIUS = 14

/** Appends a freehand sample unless it is too close to the previous one to be
 *  worth recording. Returns the same array when nothing was added, so a caller
 *  can skip a store update by identity. */
export function appendFreehandPoint(points: number[], x: number, y: number): number[] {
  if (points.length >= 2) {
    const dx = x - points[points.length - 2]
    const dy = y - points[points.length - 1]
    if (dx * dx + dy * dy < FREEHAND_MIN_STEP * FREEHAND_MIN_STEP) return points
  }
  return [...points, x, y]
}

/** True when a tap should close the polygon rather than extend it. Everything
 *  here is in layer coordinates, `tolerance` included — the caller converts
 *  POLYGON_CLOSE_RADIUS by the current zoom, which keeps the whole hit test in
 *  one space instead of needing a layer→screen inverse for one comparison.
 *
 *  Needs at least a triangle already placed: closing a two-point lasso would
 *  produce a line, which has no inside. */
export function closesPolygon(points: number[], x: number, y: number, tolerance: number): boolean {
  if (points.length < 6) return false
  return Math.hypot(x - points[0], y - points[1]) <= tolerance
}

/** The rectangle two drag corners describe, as a polygon. */
export function rectangleFromDrag(x0: number, y0: number, x1: number, y1: number): SelectionShape {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1)
  return { points: [minX, minY, maxX, minY, maxX, maxY, minX, maxY] }
}

/** Turns collected points into a selection, or null when they do not enclose
 *  anything — fewer than three vertices, or an area below half a pixel.
 *
 *  The area test is what makes a stray tap or a 2-px twitch with the lasso
 *  harmless: it clears the selection instead of leaving an invisible sliver
 *  selected, which would then silently scope the next transform to nothing.
 *  Shoelace formula, absolute value — winding direction is the rasterizer's
 *  business, not this one's. */
export function selectionFromPoints(points: number[]): SelectionShape | null {
  if (points.length < 6) return null
  let twiceArea = 0
  const n = points.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    twiceArea += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1]
  }
  if (Math.abs(twiceArea) / 2 < 0.5) return null
  return { points }
}

/** Ends a point-by-point lasso on a double-click.
 *
 *  Drops exactly one trailing vertex, because the two presses of that
 *  double-click placed two: the first is the final corner the user meant, the
 *  second is the "and close it" half of the gesture. Keeping it would leave a
 *  zero-width spur on every lasso ended this way — invisible in the outline,
 *  permanent in the operation log.
 *
 *  Exactly one, not "every coincident trailing point": how far apart two
 *  presses of one double-click land is a device question (a pen on a tablet
 *  wobbles more than a mouse), and a distance threshold here would need a zoom
 *  to compare against. Counting the presses needs neither. */
export function closeAfterDoubleClick(points: number[]): SelectionShape | null {
  return selectionFromPoints(points.length >= 8 ? points.slice(0, -2) : points)
}

/** Maps a flat point list through a 3x3, dividing by w. Null when any point
 *  lands on or past the vanishing line, where there is no picture to draw and
 *  no region to act on — see transformSelection, which is this plus the
 *  "is it still a region" test. */
export function mapSelectionPoints(points: number[], matrix: readonly number[]): number[] | null {
  const out: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1]
    const w = matrix[2] * x + matrix[5] * y + matrix[8]
    if (!(w > 0) || !Number.isFinite(w)) return null
    const nx = (matrix[0] * x + matrix[3] * y + matrix[6]) / w
    const ny = (matrix[1] * x + matrix[4] * y + matrix[7]) / w
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
    out.push(nx, ny)
  }
  return out
}

/** The selection after `matrix` has been applied to it — how a selection
 *  follows the pixels it just moved, so a second drag grabs the piece where it
 *  now is rather than the hole it left.
 *
 *  Takes the 3x3 the transform session works in (see transformMath), and
 *  divides through by w: a Distort is projective, and a selection outline that
 *  ignored that would drift off the content it belongs to precisely when the
 *  transform is at its most extreme. A point that lands on the vanishing line
 *  (w at or below zero) has nowhere to go, and the whole selection is dropped
 *  rather than half-mapped — an outline with one corner at infinity is not a
 *  region anything can be done with. */
export function transformSelection(
  selection: SelectionShape, matrix: readonly number[],
): SelectionShape | null {
  const moved = mapSelectionPoints(selection.points, matrix)
  return moved ? selectionFromPoints(moved) : null
}

/** Axis-aligned bounds of a selection, in layer coordinates — what the
 *  transform gizmo frames when a selection is what is being transformed.
 *  Null for a shape with no points. */
export function selectionBoundsRect(
  selection: SelectionShape,
): { x: number; y: number; width: number; height: number } | null {
  if (selection.points.length < 2) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < selection.points.length; i += 2) {
    const x = selection.points[i], y = selection.points[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
