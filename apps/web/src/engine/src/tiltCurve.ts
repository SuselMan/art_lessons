import { clamp } from 'lodash-es'

// The shared tilt→shape response every dab-forming material uses (#389 for
// graphite, #403 for charcoal). One curve, two configs — the materials differ
// in their numbers, never in the shape of the function.
//
//   t     = clamp(θ / fullDeg, 0, 1) ^ curve
//   value = 1 + t · (atFull - 1)
//
// Two properties earn this its own module rather than being written twice.
//
// The first is that `fullDeg` is a *reachable* tilt. Both materials previously
// normalized against 90°, which a stylus lying on a tablet cannot reach, so the
// interesting end of the response existed only in theory — diagnosed and fixed
// for charcoal in #305, then for graphite in #389. Anything new that responds
// to tilt should inherit that from here rather than rediscover it.
//
// The second is that `value` is *linear in t*, which makes it exactly
// invertible (tiltCurveInverse). That is what lets a consumer downstream of the
// dab — opacity baking, and DAB_FRAG via v_aspectRatio — recover how far along
// the response a *recorded* dab sits from the aspect ratio baked into it,
// instead of re-running the curve against a config that may have moved since.
// Put the exponent on `value` instead of on `t` and that inverse stops being a
// single divide, so this factoring is load-bearing, not just tidy.
//
// Deliberately not a plateau ladder, which is what charcoal used to have
// (Ilya, 06.08): a hand feeling its way into a plateau cannot tell whether the
// tool stopped responding or the hand stopped moving.

/** Position along the response, 0 (upright) to 1 (at or past `fullDeg`), with
 *  the exponent applied. `curve` of 1 is a straight line; above 1 holds near
 *  round longer and arrives late; below 1 responds fast off vertical and then
 *  eases — which is the closest a single curve gets to an early plateau. */
export function tiltCurveT(tiltDeg: number, fullDeg: number, curve: number): number {
  if (fullDeg <= 0) return 1
  return Math.pow(clamp(tiltDeg / fullDeg, 0, 1), curve)
}

/** Interpolates from 1 (upright) to `atFull` at full tilt. `atFull` above 1
 *  grows the quantity with tilt (graphite's aspect and width), below 1 shrinks
 *  it (charcoal's width — a stick's edge really is narrower than its end
 *  face). */
export function tiltCurveLerp(t: number, atFull: number): number {
  return 1 + (atFull - 1) * t
}

/** The exact inverse of tiltCurveLerp: recovers `t` from a value that was
 *  produced by it. Returns 0 for a degenerate `atFull` of 1, where the value
 *  carries no information about tilt at all. */
export function tiltCurveInverse(value: number, atFull: number): number {
  if (atFull === 1) return 0
  return clamp((value - 1) / (atFull - 1), 0, 1)
}
