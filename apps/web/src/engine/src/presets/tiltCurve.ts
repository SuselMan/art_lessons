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

// ─── Response shapes, as a user setting (#409) ───────────────────────────────
//
// How fast the response comes on is not a fact to be discovered — it depends on
// how a particular hand holds a particular stylus, and the same numbers that
// read as "finally, the pencil does something" to one grip read as "it flails"
// to another. #389 replaced graphite's response and #403 pulled charcoal onto
// it; the day after, the curve that had just been replaced turned out to be the
// one Ilya preferred (07.08). Two passes of tuning-by-argument had already gone
// into these numbers, so the third pass is a choice rather than another number.
//
// A response is exactly the pair (fullDeg, curve) — the *shape* of the ramp.
// Everything else that arrived alongside the new curve stays on in all three:
// tilt affecting dab width, the tilted dab depositing lighter, the low-pass on
// the tilt signal (#389), and the corrected tilt magnitude (#388, where the
// grip's azimuth used to leak into the dab shape). Those were bugs, and a bug
// is not a flavour to offer back.
//
// The three shapes are the same everywhere they are offered, applied to each
// material's own aspectMax/widthMax — a pencil and a charcoal stick still
// elongate by different amounts, they just arrive there along the same ramp.
// Charcoal's pre-#403 plateau ladder is deliberately NOT among them: it was
// dropped because a hand inside a plateau cannot tell "the tool stopped
// answering" from "I stopped moving" (Ilya, 06.08), and that is not a taste
// that changed.

export const TILT_RESPONSES = ['restrained', 'smooth', 'linear'] as const

export type TiltResponse = (typeof TILT_RESPONSES)[number]

/** What every tool ships with, and what #389/#403 calibrated against: the
 *  material's own fullDeg and curve, untouched. */
export const DEFAULT_TILT_RESPONSE: TiltResponse = 'smooth'

// 'restrained' is graphite's pre-#389 formula (`1 + (θ/90)³ · 6`) re-expressed
// in this module's terms, and its two numbers are the whole of what made that
// version feel different: cubed, so it stays near round well past an ordinary
// working grip, and normalized against a tilt no stylus on a tablet reaches, so
// the top of the range never actually arrives. Written as a response rather
// than restored as the default — #389's own reasoning about reachability still
// holds, this is just no longer the only reading of it on offer.
const RESTRAINED_FULL_DEG = 90
const RESTRAINED_CURVE = 3

const RESPONSE_SET = new Set<string>(TILT_RESPONSES)

/** Type guard for narrowing a stored/engine-option string to a known response
 *  — same shape as isPencilGrade, and used for the same reason: a value read
 *  back out of localStorage is not to be trusted into the engine. */
export function isTiltResponse(v: string): v is TiltResponse {
  return RESPONSE_SET.has(v)
}

/** The tilt at which the chosen response is fully open. Only 'restrained'
 *  overrides the material's own reachable full tilt — that unreachable 90° is
 *  half of what it *is*. */
export function tiltResponseFullDeg(response: TiltResponse, materialFullDeg: number): number {
  return response === 'restrained' ? RESTRAINED_FULL_DEG : materialFullDeg
}

/** The exponent the chosen response applies. 'smooth' defers to the material
 *  (and therefore to the debug overlay's live slider, which is what that
 *  slider is for); the other two are fixed, since a response whose shape moved
 *  with a slider would not be a choice the user could rely on. */
export function tiltResponseCurve(response: TiltResponse, materialCurve: number): number {
  if (response === 'restrained') return RESTRAINED_CURVE
  if (response === 'linear') return 1
  return materialCurve
}

/** tiltCurveT under a chosen response — the single entry point every material
 *  goes through, so "which three shapes exist" is answered here and not once
 *  per material. Takes the material's own two numbers rather than its config
 *  object: this runs per dab, and resolving a response must not allocate. */
export function tiltResponseT(
  tiltDeg: number, response: TiltResponse, materialFullDeg: number, materialCurve: number,
): number {
  return tiltCurveT(
    tiltDeg,
    tiltResponseFullDeg(response, materialFullDeg),
    tiltResponseCurve(response, materialCurve),
  )
}
