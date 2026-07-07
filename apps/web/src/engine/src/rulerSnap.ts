// Ruler tool (#89) — projects a raw pointer position onto the ruler's
// infinite line when it's within a small perpendicular tolerance, so a
// pencil stroke drawn "along" a placed ruler comes out straight. This is
// called from PencilEngine._onStart/_onMove/_onPredict, BEFORE the position
// ever reaches DabSystem — so the snapped position is what actually gets
// spline-fit, dab-painted, and recorded into the stroke's Operation. Every
// replica (this client's own undo/redo replay, a peer receiving the
// operation) sees the same already-straight geometry, not a raw wobbly path
// that only *looked* straight locally via some overlay trick.
//
// Simplification vs. a "fully general" ruler (see #89's own scope note in
// the issue body, and the task's own suggestion that a reduced first pass
// beats over-engineering):
//   - Snapping is a pure per-sample proximity check against the ruler's
//     *infinite* line, not clamped to the segment between its two placed
//     endpoints. A stroke that starts within tolerance and drifts along the
//     line past an endpoint keeps snapping, rather than requiring the
//     placed ruler to be "long enough" for the whole intended line.
//   - There's no direction-alignment check: only how close the raw point is
//     to the line matters, never whether the stroke's recent travel
//     direction matches the ruler's own direction. Simpler to reason about
//     and implement, and it degrades gracefully — a point that wanders away
//     from the line just stops snapping and draws freehand from there,
//     rather than the engine trying to guess intent from motion history.

export interface RulerLine {
  a: { x: number; y: number }
  b: { x: number; y: number }
}

// Perpendicular distance (canvas-pixel space, same convention as Dab.x/y)
// beyond which a point draws freehand instead of snapping. A first-pass
// constant, not yet tuned against a real device (same spirit as
// DabSystem's CORNER_ANGLE_START/_FULL) — picked wide enough that a
// hand-drawn stroke can comfortably track the ruler without feeling
// twitchy, but narrow enough that it doesn't read as "magnetic" across a
// large fraction of the canvas.
export const RULER_SNAP_TOLERANCE_PX = 28

// Guards a degenerate (still-being-placed, zero-length) ruler — the instant
// it's first placed, before the user has dragged a second, distinct
// endpoint away from the first.
const MIN_RULER_LENGTH_SQ = 1e-6

/** Projects (x, y) onto `line`'s infinite extension and returns that point
 *  if it's within `tolerance` px of it; otherwise returns (x, y) unchanged.
 *  Also returns (x, y) unchanged for a degenerate (near-zero-length) line,
 *  rather than dividing by zero. */
export function snapToRuler(
  x: number, y: number, line: RulerLine, tolerance: number = RULER_SNAP_TOLERANCE_PX,
): { x: number; y: number } {
  const dx = line.b.x - line.a.x
  const dy = line.b.y - line.a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < MIN_RULER_LENGTH_SQ) return { x, y }

  const apx = x - line.a.x
  const apy = y - line.a.y
  const t = (apx * dx + apy * dy) / lenSq
  const projX = line.a.x + t * dx
  const projY = line.a.y + t * dy

  const dist = Math.hypot(x - projX, y - projY)
  return dist <= tolerance ? { x: projX, y: projY } : { x, y }
}
