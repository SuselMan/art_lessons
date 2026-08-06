import { tiltCurveInverse, tiltCurveLerp, tiltCurveT } from './tiltCurve'

// Graphite's tilt→shape response (#389). Replaces the two-line model
// dabShaping.ts carried since the engine's first commit:
//
//   size:   pressure => 0.3 + 0.7 * pressure        // tilt ignored entirely
//   aspect: tiltNorm => 1 + tiltNorm³ * 6           // tiltNorm = tilt / 90
//
// Two things were wrong with it, and the exponent was the smaller one.
//
// 1. It normalized against 90°. A stylus cannot lie flat on a tablet, so the
//    curve only opened up at an angle no hand ever reaches: the advertised ×7
//    elongation existed solely at the unreachable end, and an ordinary 45°
//    working grip got 1.75 — very nearly a circle. This is the identical
//    mistake #305 diagnosed and fixed for charcoal ("the old curve only maxed
//    out at 90°, which is the whole reason this exists"); graphite simply
//    stayed on the pre-#305 model a while longer. Normalizing against a tilt
//    the hand actually reaches is the fix, and it matters more than the shape
//    of the curve in between.
// 2. Tilt did not touch width at all. A lead is a cone: stood upright it draws
//    with the point, leaned over it draws with the side of that cone, and the
//    mark gets *wider* as well as longer — and lighter, because the same
//    downward force is now spread across far more paper.
//
// Deliberately a smooth curve rather than charcoal's plateau ladder (Ilya,
// 06.08): steps make sense for a stick that has three distinct faces to work
// on, but a cone has no such discontinuities, and a user feeling their way
// into a plateau can't tell whether the tool stopped responding or they
// stopped moving. Charcoal is expected to follow the same way later.
//
// The curve itself lives in tiltCurve.ts and is shared with charcoal (#403);
// this file is only graphite's numbers for it. θ is the *true* angle from
// vertical (tiltMath.ts), not the old hypot approximation — these numbers are
// calibrated against the corrected formula and mean nothing against the old
// one.

/** Live-tunable for the same reason CharcoalFeelConfig is (ADR 005): where a
 *  particular hand actually holds a particular stylus is not something to
 *  settle by reasoning, only by drawing with it. Mutated in place by the debug
 *  overlay's sliders.
 *
 *  Shape is baked into each Dab at record time, so moving a slider changes
 *  only *subsequent* strokes — already-drawn and replayed marks keep the
 *  geometry they were recorded with. That's what makes a live knob safe here. */
export interface PencilTiltConfig {
  /** Tilt (degrees from vertical) at which the response is fully open. Must
   *  stay well under 90 — that ceiling being unreachable is the bug this
   *  replaces. ~60° is a firm, deliberate lean that a hand can still hold. */
  fullDeg: number
  /** Exponent applied to the normalized tilt. 1 is a straight line, 2 the
   *  quadratic this ships with — low tilt stays nearly round (a pencil held
   *  almost upright should draw a point, not a short dash) while the response
   *  builds toward the lean. Exposed as a knob rather than hardcoded because
   *  "how fast should it come on" is precisely the kind of question that only
   *  answers itself on the tablet. */
  curve: number
  /** Dab elongation, along the tilt azimuth, at full tilt. */
  aspectMax: number
  /** Short-axis multiplier at full tilt. Above 1: the side of the cone is a
   *  broader contact than its point. This is the term the old model was
   *  missing outright — without it a leaned pencil drew a mark that was longer
   *  but no wider, which is not what leaning a pencil does. */
  widthMax: number
  /** How much lighter a fully tilted dab deposits, 0..1. The same downward
   *  force spread across a much larger contact patch has to lay down less per
   *  unit area, and without it the broad regime just paints a bigger equally
   *  dark mark. 0 disables. */
  lightening: number
  /** Per-sample weight of the tilt low-pass, 0..1 (higher follows the stylus
   *  faster, lower is steadier). Graphite ran on raw tilt until now, which it
   *  got away with only because tilt barely affected the dab — once it does,
   *  the reported angle's noise is visible as flutter in the mark. */
  smoothing: number
}

// First pass, NOT calibrated on a device — the same status every other tuning
// constant in this engine starts with. fullDeg assumes an ordinary drawing
// grip sits near 40-55° and that a deliberate "lay it over to shade" lean is
// around 60°.
export const PENCIL_TILT: PencilTiltConfig = {
  fullDeg: 60,
  curve: 2,
  aspectMax: 5,
  widthMax: 1.4,
  lightening: 0.35,
  smoothing: 0.25,
}

/** Slider descriptors for the debug overlay. Lives next to the config it
 *  drives, same as CHARCOAL_FEEL_SLIDERS, so adding a knob is one edit rather
 *  than one here and one in the Room page's JSX. */
export const PENCIL_TILT_SLIDERS: readonly {
  key: keyof PencilTiltConfig; label: string; min: number; max: number; step: number
}[] = [
  { key: 'fullDeg',    label: 'full tilt°',  min: 20,  max: 90, step: 1 },
  { key: 'curve',      label: 'curve pow',   min: 0.5, max: 4,  step: 0.05 },
  { key: 'aspectMax',  label: 'max aspect',  min: 1,   max: 12, step: 0.1 },
  { key: 'widthMax',   label: 'max width',   min: 0.5, max: 2.5, step: 0.01 },
  { key: 'lightening', label: 'tilt light',  min: 0,   max: 0.9, step: 0.01 },
  { key: 'smoothing',  label: 'tilt smooth', min: 0.02, max: 1, step: 0.01 },
]

/** Position along the response, 0 (upright) to 1 (at or past fullDeg), with
 *  the curve exponent already applied. Everything else here is a linear
 *  interpolation driven by this one number, which is also what makes the
 *  inverse (pencilTiltness) exact. */
export function pencilTiltT(tiltDeg: number, cfg: PencilTiltConfig = PENCIL_TILT): number {
  return tiltCurveT(tiltDeg, cfg.fullDeg, cfg.curve)
}

/** Dab elongation along the tilt azimuth: 1 (round) -> aspectMax. */
export function pencilTiltAspect(tiltDeg: number, cfg: PencilTiltConfig = PENCIL_TILT): number {
  return tiltCurveLerp(pencilTiltT(tiltDeg, cfg), cfg.aspectMax)
}

/** Short-axis multiplier: 1 (the point) -> widthMax (the side of the cone). */
export function pencilTiltWidthFactor(tiltDeg: number, cfg: PencilTiltConfig = PENCIL_TILT): number {
  return tiltCurveLerp(pencilTiltT(tiltDeg, cfg), cfg.widthMax)
}

/** How far along the response a *recorded* dab sits, recovered from its own
 *  baked `aspectRatio` instead of re-derived from tilt — the exact inverse of
 *  pencilTiltAspect.
 *
 *  Same indirection, and the same reason, as charcoalBroadness: aspectRatio was
 *  baked from the filtered tilt against the config as it stood at record time,
 *  so reading it back is the only way a later consumer (opacity baking) stays
 *  consistent with the dab actually being drawn. Re-running the curve against a
 *  since-moved slider would silently disagree with the geometry. */
export function pencilTiltness(aspectRatio: number, cfg: PencilTiltConfig = PENCIL_TILT): number {
  return tiltCurveInverse(aspectRatio, cfg.aspectMax)
}

/** Deposit multiplier for a dab at this tiltness — see `lightening`. */
export function pencilTiltDensity(tiltness: number, cfg: PencilTiltConfig = PENCIL_TILT): number {
  return 1 - cfg.lightening * tiltness
}
