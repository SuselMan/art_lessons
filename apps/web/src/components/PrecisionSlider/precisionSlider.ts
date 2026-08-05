import { clamp } from 'lodash-es'

// (#390) Drag math for PrecisionSlider, kept out of the component so it can
// be tested without a DOM (same split NumberField already uses).
//
// What this replaces: #105 scaled sensitivity by the finger's *smoothed
// instantaneous speed*. That failed on principle rather than on its
// constants — the same finger displacement produced a different value change
// depending on how fast you had arrived there, so the control was not
// reproducible and the thumb did not track the finger. Speed is a derivative
// the user cannot see or hold still.
//
// What replaces it: sensitivity is a function of *position* — how far
// perpendicular to the track the pointer has been pulled. A position can be
// held, read off the screen, and moved back, which is why Photoshop, Blender
// and Procreate all put precision on the same axis. On the track it is 1:1:
// the thumb goes exactly where the finger goes.

/** Perpendicular slack, in px beyond the track's own edge, that still counts
 *  as "on the track" (1:1). Measured from the edge rather than the centre
 *  line so a 28px-wide track doesn't spend half its own width entering
 *  precision mode. */
export const FULL_SPEED_OFFSET_PX = 40
/** Perpendicular distance at which precision bottoms out at
 *  MAX_PRECISION_FACTOR; further out changes nothing. */
export const MAX_PRECISION_OFFSET_PX = 200
/** Sensitivity at full offset: the whole track length covers a tenth of the
 *  range. */
export const MAX_PRECISION_FACTOR = 10

/** Divisor applied to a drag's along-track movement, from 1 (on the track) up
 *  to MAX_PRECISION_FACTOR. Smoothstepped between the two thresholds so the
 *  rate has no visible corner where the precise zone begins — a linear ramp
 *  is continuous in value but not in feel, and the kink reads as the control
 *  catching on something. */
export function precisionFactor(offsetPx: number): number {
  const span = MAX_PRECISION_OFFSET_PX - FULL_SPEED_OFFSET_PX
  const t = clamp((Math.abs(offsetPx) - FULL_SPEED_OFFSET_PX) / span, 0, 1)
  const eased = t * t * (3 - 2 * t)
  return 1 + eased * (MAX_PRECISION_FACTOR - 1)
}

/** How far `pos` lies outside the closed interval [lo, hi], or 0 while inside
 *  it — the perpendicular offset that feeds `precisionFactor`. */
export function distanceOutside(pos: number, lo: number, hi: number): number {
  if (pos < lo) return lo - pos
  if (pos > hi) return pos - hi
  return 0
}

/** One pointermove of a drag, in normalized track position.
 *
 *  Incremental (delta scaled by the factor *now*) rather than a pure function
 *  of total displacement since the press, and that is forced, not lazy: with
 *  a position-only formula, sliding sideways at a fixed along-track offset
 *  would rescale the accumulated change and the value would jump under a
 *  finger that never moved along the track. Incremental means a purely
 *  perpendicular move contributes exactly zero, so entering and leaving the
 *  precise zone is silent, and moving back the same distance at the same
 *  offset returns to the same value.
 *
 *  `alongDelta` is signed so positive always means "increase" — the
 *  component resolves the orientation before calling. Clamping happens per
 *  move, so overshooting an end and coming back responds immediately instead
 *  of first paying back invisible travel. */
export function advancePosition(
  position: number, alongDelta: number, perpendicularOffset: number, trackLength: number,
): number {
  if (trackLength <= 0) return position
  return clamp(position + alongDelta / (trackLength * precisionFactor(perpendicularOffset)), 0, 1)
}

/** Snaps a raw value to the field's step and range. The caller keeps the
 *  unrounded position across moves and only rounds on the way out, so
 *  per-step rounding never accumulates into drift over a long drag. */
export function roundToStep(value: number, step: number, min: number, max: number): number {
  return clamp(Math.round(value / step) * step, min, max)
}
