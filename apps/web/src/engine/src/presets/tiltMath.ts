import { clamp } from 'lodash-es'

// #388: the stylus's true angle from vertical, recovered from PointerEvent's
// two tilt readings. One function, imported everywhere tilt magnitude is
// needed, because before this the same `hypot(tiltX, tiltY)` expression was
// open-coded in six places and every one of them was wrong the same way.
//
// tiltX/tiltY are NOT the components of a vector. Each is the angle of the
// stylus's *projection* onto one plane (X-Z and Y-Z respectively). Writing
// them as φ = the azimuth of the grip (which way the pen leans, seen from
// above) and θ = the angle from vertical (the only thing dab shape should
// care about):
//
//   tan(tiltX) = tan θ · cos φ
//   tan(tiltY) = tan θ · sin φ
//
// Square and add, and cos²φ + sin²φ = 1 removes the azimuth entirely:
//
//   tan²(tiltX) + tan²(tiltY) = tan²θ     ->     θ = atan(√(tan²x + tan²y))
//
// So it is the *tangents* that combine by Pythagoras, not the angles. Doing
// it on the angles themselves leaves φ in the result: a 45°/45° diagonal grip
// read as 63.6° when the pen was really at 54.7°, so the same physical lean
// produced a different dab shape depending on how the hand happened to be
// turned. The error vanishes when one component is zero (which is why this
// went unnoticed — an axis-aligned grip reads exactly right) and is worst on
// the diagonal.
//
// The old formula could also return more than 90°, which is not a possible
// angle from vertical at all: an 80/80 grip gave 113°, hence tiltNorm 1.26
// and pencil aspect 13 against a stated maximum of 7. atan cannot — its
// result is in [0, 90) by construction. That's why nothing here clamps the
// *output*: the ceiling is a property of the formula now, not a patch bolted
// on after it.
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** PointerEvent's own documented range for tiltX/tiltY. Inputs are clamped to
 *  it before the tangent, purely to keep a malformed/out-of-spec device
 *  reading from making the intermediate value meaningless — tan is monotonic
 *  across the whole open interval, so this never alters a legal reading. */
const MAX_REPORTED_TILT_DEG = 90

/** Angle between the stylus and the screen normal, in degrees, 0 (upright) to
 *  90 (flat on the glass). `tiltX`/`tiltY` are PointerEvent's own values, in
 *  degrees. */
export function tiltMagnitudeDeg(tiltX: number, tiltY: number): number {
  // tan(90°) is 1.633e16 rather than Infinity in IEEE doubles, so the ±90 edge
  // needs no special case: it flows through hypot and comes back out of atan
  // as 90° to within a rounding error.
  const tx = Math.tan(clamp(tiltX, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD)
  const ty = Math.tan(clamp(tiltY, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD)
  return Math.atan(Math.hypot(tx, ty)) * RAD_TO_DEG
}

/** The same value on DabShapingProfile's 0..1 scale (tilt magnitude / 90).
 *  Guaranteed to land in [0, 1) — see the ceiling note above. */
export function tiltNormFrom(tiltX: number, tiltY: number): number {
  return tiltMagnitudeDeg(tiltX, tiltY) / MAX_REPORTED_TILT_DEG
}

/**
 * The other half of the same recovery (#482): φ, the azimuth of the grip —
 * which way the pen leans, seen from above — in radians, screen frame, measured
 * the same way canvas angles are (from +x, turning toward +y, i.e. clockwise on
 * a screen whose y runs down).
 *
 * This is #388's unfixed twin, and it hid for the same reason the magnitude bug
 * did. Divide the two identities at the top of this file:
 *
 *   tan(tiltY) / tan(tiltX) = (tanθ · sin φ) / (tanθ · cos φ) = tan φ
 *
 * so the azimuth is atan2 of the two *tangents*, exactly as the magnitude is
 * hypot of the two tangents. `atan2(tiltY, tiltX)` — atan2 of the angles, which
 * is what every caller used until now — is the same category error, and it is
 * wrong by the same shape: exact whenever one component is zero (an
 * axis-aligned grip, which is how it went unnoticed) or when the two are equal
 * (the exact diagonal), and worst in between. A 30/60 grip read 63.4° against a
 * true 71.6°; 20/70 read 74.1° against 82.5°. So a leaning pencil's ellipse
 * pointed up to ~8° away from the direction the pen was actually leaning.
 *
 * #388 fixed the magnitude and left this one behind on purpose — at the time
 * the azimuth had no consumer that cared. It has one now (dabShaping.ts's
 * `barrel` anchor), and a nib that claims to follow the pen's body has to
 * follow it.
 */
export function tiltAzimuthRad(tiltX: number, tiltY: number): number {
  // Same clamp and the same ±90 reasoning as tiltMagnitudeDeg above: tan(90°)
  // is a large finite double, and atan2 handles it without a special case.
  const tx = Math.tan(clamp(tiltX, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD)
  const ty = Math.tan(clamp(tiltY, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD)
  return Math.atan2(ty, tx)
}
