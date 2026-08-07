import { clamp } from 'lodash-es'

import {
  DEFAULT_TILT_RESPONSE, tiltCurveInverse, tiltCurveLerp, tiltResponseT, type TiltResponse,
} from './tiltCurve'

// Charcoal's tilt→shape response (#305, ADR 005 "Форма от наклона"). Charcoal
// is used as a stick, not a sharpened point: upright it works on its end,
// tilted it works on the edge, laid over it works on the broad side. That's
// three recognizable behaviours, and this file owns the mapping.
//
// #403 turned that mapping from a plateau ladder into the same smooth curve
// graphite uses (tiltCurve.ts). The ladder gave each of the three behaviours
// its own flat region — an edge plateau deliberately straddling the ordinary
// 40-55° writing grip, so "edge" was the default working mode rather than
// something to hunt for. That reads well on paper and badly in the hand
// (Ilya, 06.08): inside a plateau the tool stops answering the stylus, and
// there is no way to tell that from having stopped moving. A monotone curve
// always answers.
//
// What that costs, stated plainly because it is the thing to check on a
// device: elongation and narrowing are now driven by the same `t`, so the
// stick's thin edge arrives gradually instead of being fully present across a
// whole band of grips. At 40° the short axis lands near 0.79 where the ladder
// pinned it at 0.55. `curve` below 1 is the knob that buys most of that back —
// it opens the response fast off vertical and then eases, which is what the
// early plateau did — and if the two really need independent onsets, the next
// step is a second exponent for width rather than a return to plateaus.
//
// Why not model the rigid cylinder literally: a flat-ended cylinder tilted off
// vertical touches the paper at ONE rim point, and the contact patch there is
// an arc running *perpendicular* to the tilt direction, which *shrinks* as tilt
// grows; only at ~90° does the cylinder's side come down and give a long patch
// running *along* the tilt. So the true geometry flips its elongation axis by
// 90° partway through, and is non-monotonic besides. Nobody wants that from a
// drawing tool, and no amount of filtering hides a 90° flip.
//
// The resolution: a real stick isn't *tilted* into the broad position, it's
// *regripped* — held in the palm and dragged sideways. Stylus tilt here stands
// in for a change of grip, not for rotating a rigid body. So this maps intent,
// not the rigid body, which is what lets one orientation serve the whole range
// instead of flipping mid-way.
//
// Which orientation, then, is a usability question rather than a geometric one,
// and it has been answered both ways. #305 picked *perpendicular* to the lean,
// which is literally right for the regime that matters most — the rim arc is
// the edge you turn the stick onto to draw thin. #404 replaced it with the
// shared tiltOrPathAngle, i.e. *along* the lean, for one reason: every other
// tool in the app elongates along the lean, and a charcoal stick that did the
// opposite was a rule with exactly one exception and no explanation short of
// cylinder geometry. In the hand this inverts the gesture — lean across the
// stroke for a broad band, along it for a thin line — and the tests pin the
// property that actually matters either way, that the orientation never flips
// partway through the range.

/** Live-tunable because the right thresholds depend on how a specific hand
 *  holds a specific stylus — not something to settle by reasoning (ADR 005).
 *  Mutated in place by the debug overlay's sliders, same idiom as
 *  PENCIL_SOUND_TUNING and the paperFill knobs.
 *
 *  Shape parameters are baked into each Dab at record time, so moving a slider
 *  only affects *subsequent* strokes — already-drawn marks (and every replayed
 *  one) keep the geometry they were recorded with. That's the property that
 *  makes a live tuning knob safe here at all. */
export interface CharcoalFeelConfig {
  /** Tilt (degrees from vertical) at which the response is fully open — the
   *  stick worked flat on its broad side. Must stay comfortably under 90: a
   *  stylus cannot be laid flat on a tablet, and normalizing against 90 is
   *  exactly the mistake #305 was written to fix. */
  fullDeg: number
  /** Exponent on the normalized tilt — see tiltCurve.ts. Below 1 opens the
   *  response up quickly off vertical and then eases, which is the closest a
   *  single curve gets to the edge plateau this replaced; above 1 holds the
   *  round end face longer and arrives at the broad side late. */
  curve: number
  /** Dab elongation (along the tilt azimuth) at full tilt. */
  aspectMax: number
  /** Short-axis multiplier at full tilt. Below 1, and that is the point: laid
   *  over, a cylinder contacts along a *line*, so the mark's width comes from
   *  the long axis being swept sideways, not from the short axis growing.
   *  Without it, leaning the stick would just draw a longer version of the
   *  round dab rather than a thinner one. */
  widthMax: number
  /** How much lighter a fully tilted dab deposits than an upright one — the
   *  same pressure spread over a much larger contact patch. 0 = no reduction. */
  broadLightening: number
  /** How much extra mark-grain a fully tilted dab shows, on top of the
   *  material's own `crumble`. Less pressure per unit area means the stick
   *  rides the paper's tooth instead of being pressed into it. 0 = no boost. */
  broadGrainBoost: number
  /** Per-sample weight of the tilt low-pass (0..1): higher follows the stylus
   *  faster, lower is steadier. Stylus tilt is markedly noisier than position,
   *  and without this the shape visibly flutters between regimes. */
  smoothing: number
  /** Effective pressure at zero reported pressure (Ilya: "уголь легче
   *  ложится"). Graphite's deposit is linear in pressure, which is right for a
   *  hard lead that has to be *pushed* into the paper — but charcoal is
   *  friable enough that merely touching it to the sheet already leaves a real
   *  mark, so a linear response makes a light touch read as nearly nothing.
   *  0 restores the graphite-style behaviour. */
  pressureFloor: number
  /** Exponent applied to pressure before the floor is mixed in. Below 1 lifts
   *  the low end (a light touch deposits far more) while still arriving at
   *  exactly full deposit at full pressure, so "press harder = darker" is
   *  preserved rather than flattened away. 1 is a straight line. */
  pressureGamma: number
  /** Smallest share of deposit a dropped-out ("the stick skipped here") spot
   *  still receives, 0..1. Must stay above 0: the dropout field is a fixed
   *  function of world position, so a true zero is a hole no number of passes
   *  can ever fill — charcoal literally could not cover a sheet solid, which
   *  is the bug this exists to prevent. Lower = more broken-looking single
   *  strokes but slower to build up solid; 1 disables dropouts entirely. */
  skipFloor: number
  /** How strongly pressure closes the dropouts, 0..1. This — not skipFloor —
   *  is what lets a firm pass cover solid: at 1 a full-pressure stroke skips
   *  nothing, while a light one still breaks up completely. Raising skipFloor
   *  to do the same job instead mutes the gaps at *every* pressure and flattens
   *  the material. */
  gateRelief: number
  /** Depth of the mark-grain modulation, on top of the per-type `crumble`.
   *  High values make the selected grain variant read as real breaks in the
   *  stroke rather than a faint dither; the shader floors the result so even
   *  the deepest trough still deposits something. */
  grainDepth: number
}

// First-pass values, NOT calibrated on a real device — same status as every
// other constant in this tool. fullDeg is carried over from the ladder's own
// broadFullDeg (the one number that meant the same thing before and after),
// and aspectMax/widthMax from its broad plateau. `curve` starts at 2, matching
// graphite, so the two materials genuinely differ in numbers rather than in
// feel-by-accident; the old edge plateau sat around aspect 3.5 for a 30-50°
// grip, where this lands near 2.6-5.6, so that band is the first thing to
// re-feel.
export const CHARCOAL_FEEL: CharcoalFeelConfig = {
  fullDeg: 62,
  curve: 2,
  aspectMax: 8,
  widthMax: 0.5,
  broadLightening: 0.45,
  broadGrainBoost: 0.9,
  smoothing: 0.15,
  pressureFloor: 0.3,
  pressureGamma: 0.6,
  skipFloor: 0.12,
  gateRelief: 0.85,
  grainDepth: 2.5,
}

/** Pressure -> effective deposit pressure for charcoal (DAB_FRAG mirrors this
 *  exactly). At the defaults: 0.0 -> 0.30, 0.25 -> 0.58, 0.5 -> 0.76,
 *  1.0 -> 1.00 — a light touch lays down roughly half of a firm one instead of
 *  graphite's near-nothing, while the top of the range is untouched. */
export function charcoalPressureResponse(pressure: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  const shaped = Math.pow(clamp(pressure, 0, 1), cfg.pressureGamma)
  return cfg.pressureFloor + (1 - cfg.pressureFloor) * shaped
}

/** Slider descriptors for the debug overlay (#305). Lives here, next to the
 *  config it drives, so adding a knob is one edit rather than one here and one
 *  in the Room page's JSX — the same reason FEATURE_FLAGS is a table. */
export const CHARCOAL_FEEL_SLIDERS: readonly {
  key: keyof CharcoalFeelConfig; label: string; min: number; max: number; step: number
}[] = [
  { key: 'fullDeg',         label: 'full tilt°',  min: 20,  max: 90, step: 1 },
  { key: 'curve',           label: 'curve pow',   min: 0.3, max: 4,  step: 0.05 },
  { key: 'aspectMax',       label: 'max aspect',  min: 1,   max: 20, step: 0.1 },
  { key: 'widthMax',        label: 'max width',   min: 0.1, max: 1.5, step: 0.01 },
  { key: 'broadLightening', label: 'broad light', min: 0,   max: 0.9, step: 0.01 },
  { key: 'broadGrainBoost', label: 'broad grain', min: 0,   max: 3,  step: 0.05 },
  { key: 'smoothing',       label: 'tilt smooth', min: 0.02, max: 1, step: 0.01 },
  { key: 'pressureFloor',   label: 'press floor', min: 0,   max: 0.9, step: 0.01 },
  { key: 'pressureGamma',   label: 'press gamma', min: 0.2, max: 2,  step: 0.05 },
  { key: 'skipFloor',       label: 'skip floor',  min: 0.02, max: 1, step: 0.01 },
  { key: 'gateRelief',      label: 'press fills', min: 0,   max: 1, step: 0.01 },
  { key: 'grainDepth',      label: 'grain depth', min: 0,   max: 6, step: 0.1 },
]

/** Position along the response, 0 (end face flat on the paper) to 1 (broad
 *  side), with the curve exponent applied. Replaces #305's pair of smoothstep
 *  plateau weights — see this file's header for why the plateaus went.
 *
 *  `response` (#409) is the user's pick among the three ramp shapes, the same
 *  three graphite offers — charcoal keeps its own aspectMax/widthMax, so the
 *  stick still opens up far wider than a lead does, it just gets there along
 *  the ramp the hand asked for. The ladder is not one of the three. */
export function charcoalTiltT(
  tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL, response: TiltResponse = DEFAULT_TILT_RESPONSE,
): number {
  return tiltResponseT(tiltDeg, response, cfg.fullDeg, cfg.curve)
}

/** Dab elongation along the tilt azimuth: 1 (round) -> aspectMax. */
export function charcoalAspect(
  tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL, response: TiltResponse = DEFAULT_TILT_RESPONSE,
): number {
  return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.aspectMax)
}

/** Short-axis multiplier: 1 (the full end face) -> widthMax (the line contact
 *  of the stick laid over). */
export function charcoalWidthFactor(
  tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL, response: TiltResponse = DEFAULT_TILT_RESPONSE,
): number {
  return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.widthMax)
}

/** How far along the round->broad axis a *recorded* dab sits, derived from its
 *  own baked `aspectRatio` rather than re-deriving it from tilt.
 *
 *  That indirection is deliberate: aspectRatio is baked at record time from the
 *  *filtered* tilt and the config as it stood then, so reading it back is the
 *  only way a later consumer (opacity baking, the shader) stays consistent with
 *  the dab it's actually drawing — re-running the curve against a since-moved
 *  slider, or against unfiltered tilt, would silently disagree. DAB_FRAG
 *  computes the identical value from v_aspectRatio and u_charcoalBroadAspect.
 *
 *  #403 left this untouched on purpose: it was already the exact inverse of the
 *  aspect mapping, and the ladder's own top plateau (broadAspect) has simply
 *  become the curve's top (aspectMax), so the identity still holds and the
 *  shader's copy of it needed no GLSL change at all. #409 left it untouched for
 *  the same reason one step further out: a response shape lives inside `t`, and
 *  this inverts the lerp around `t`, so it recovers the right broadness from a
 *  dab recorded under any of the three — no GLSL change there either. */
export function charcoalBroadness(aspectRatio: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  return tiltCurveInverse(aspectRatio, cfg.aspectMax)
}

/** Deposit multiplier for a dab at this broadness — the broad side spreads the
 *  same pressure over a much bigger patch, so it lays down lighter. */
export function charcoalBroadDensity(broadness: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  return 1 - cfg.broadLightening * broadness
}
