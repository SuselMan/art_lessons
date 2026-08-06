import type { RulerPoint } from './RulerOverlay'

// (#405) What a press on the canvas means while the ruler is the selected
// tool. Two rules had to be reconciled: "dragging anywhere always lays a new
// ruler line" and "an existing line can only be dragged while the ruler is
// selected". Hit-testing the press against the line is the only thing that
// separates them — off the line is a new one, on it is the old one moving.
//
// This lives outside the component, and outside the DOM, on purpose. Before
// #405 the two gestures were two DOM surfaces: a full-viewport catcher div for
// the initial placement drag, removed the moment a line existed, and after
// that the RulerOverlay's own SVG shapes. That split is what forced
// `rulerPlaced` into the store (the catcher had to survive its own drag — see
// the flag's obituary in roomStore.ts) and it cannot express "a new line, on
// top of an existing one" at all, since the catcher was gone by then. One
// always-present catcher plus this function replaces both, and being a
// function of numbers means the rule is stated once and tested directly.

export interface RulerLineGeometry {
  a: RulerPoint
  b: RulerPoint
}

/** Which of the ruler's parts a press has taken hold of. `new` means none of
 *  them: the press starts a fresh line rather than moving this one. */
export type RulerGesture = 'a' | 'b' | 'body' | 'new'

/** Grab radius around each endpoint, and half-width of the band along the
 *  line, both in *screen* px — the sizes are about how hard the target is to
 *  hit with a pen, so they must not shrink with the zoom (the same reasoning
 *  behind TransformGizmo's screen-sized handles, #394). Room divides by the
 *  zoom before calling.
 *
 *  The endpoint radius is comfortably larger than the 7px dot RulerOverlay
 *  draws, and larger than the band, so the two ends stay reachable on a line
 *  whose body is directly under them. */
export const RULER_ENDPOINT_GRAB_PX = 14
export const RULER_BODY_GRAB_PX = 10

/** Squared distance from `p` to the *segment* a→b — the segment rather than
 *  the infinite line, deliberately: snapping extends past the endpoints (see
 *  rulerSnap.ts, which is about guiding a stroke), but grabbing must not.
 *  A press level with a ruler but two screens away from it is not a press on
 *  the ruler, and treating it as one would make a new line impossible to
 *  start anywhere along that whole band. */
function distanceToSegmentSq(p: RulerPoint, a: RulerPoint, b: RulerPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  // Degenerate line (both endpoints in the same place): fall back to the
  // distance to that single point rather than dividing by zero.
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy)
}

/** What a press at `p` grabs, given the line currently on screen.
 *
 *  Tolerances are in the same space as the points themselves (canvas px for a
 *  bounded room, world units for an infinite one) — the caller converts the
 *  screen-px constants above by dividing by the zoom.
 *
 *  Endpoints win over the body where the two overlap: an endpoint is the more
 *  specific target, and the body is reachable everywhere else along the line.
 *  A null line (nothing laid yet, or hidden — a hidden ruler is inert, so the
 *  caller passes null for it) is always `new`. */
export function rulerGestureAt(
  p: RulerPoint,
  line: RulerLineGeometry | null,
  endpointTolerance: number,
  bodyTolerance: number,
): RulerGesture {
  if (!line) return 'new'

  const endpointSq = endpointTolerance * endpointTolerance
  const distASq = (p.x - line.a.x) * (p.x - line.a.x) + (p.y - line.a.y) * (p.y - line.a.y)
  const distBSq = (p.x - line.b.x) * (p.x - line.b.x) + (p.y - line.b.y) * (p.y - line.b.y)
  // Closest endpoint first, so a press between two endpoints sitting almost on
  // top of each other (a line dragged down to nothing) still resolves to one
  // of them rather than always to `a`.
  if (distASq <= endpointSq || distBSq <= endpointSq) return distASq <= distBSq ? 'a' : 'b'

  return distanceToSegmentSq(p, line.a, line.b) <= bodyTolerance * bodyTolerance ? 'body' : 'new'
}
