import { clamp } from 'lodash-es'

// Charcoal's tilt→shape response (#305, ADR 005 "Форма от наклона"). Charcoal
// is used as a stick, not a sharpened point: upright it works on its end,
// tilted it works on the edge, laid over it works on the broad side. That's
// three recognizable behaviours, and this file owns the mapping.
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
// and every elongated regime runs *perpendicular* to the tilt (see
// dabShaping.ts's perpendicularToTiltAngle): that's exactly right for the edge
// — the rim arc you turn the stick onto to draw thin — and, since the broad
// regime is a stand-in rather than literal geometry, following the same
// orientation there removes the 90° flip entirely instead of trading against
// it. In the hand: lean along the stroke for a broad band, lean across it for
// a thin edge line.

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
  /** Below this tilt (degrees from vertical) the dab stays perfectly round —
   *  the stick's end face flat on the paper. */
  roundMaxDeg: number
  /** At/above this, the "edge" plateau is fully reached. Between roundMaxDeg
   *  and here is the first ramp. */
  edgeFullDeg: number
  /** Where the second ramp starts leaving the edge plateau. The span
   *  edgeFullDeg..here is the plateau itself — deliberately wide enough to
   *  cover an ordinary writing grip (~40-55°), so the edge is the *default*
   *  working mode rather than something to hunt for. */
  broadStartDeg: number
  /** At/above this, the "broad side" plateau is fully reached. Must stay
   *  comfortably under 90°: a stylus cannot be laid flat on a tablet, which is
   *  the whole reason this ladder exists instead of the old curve that only
   *  maxed out at 90°. */
  broadFullDeg: number
  /** Dab elongation (along the tilt azimuth) on the edge plateau. */
  edgeAspect: number
  /** Dab elongation on the broad plateau. */
  broadAspect: number
  /** Short-axis multiplier on the edge plateau — a stick's edge really is
   *  narrower than its end face, so this is below 1. Without it, "edge" would
   *  just be a longer version of the round dab rather than a thinner one. */
  edgeWidth: number
  /** Short-axis multiplier on the broad plateau. Also below 1: laid over, a
   *  cylinder contacts along a *line*; the mark's width comes from the long
   *  axis being swept sideways, not from the short axis growing. */
  broadWidth: number
  /** How much lighter the broad plateau deposits than the round one — the same
   *  pressure spread over a much larger contact patch. 0 = no reduction. */
  broadLightening: number
  /** How much extra mark-grain the broad plateau shows, on top of the material's
   *  own `crumble`. Less pressure per unit area means the stick rides the
   *  paper's tooth instead of being pressed into it. 0 = no boost. */
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
// other constant in this tool. The thresholds specifically assume a normal
// writing grip sits around 40-55° from vertical, which is why the edge plateau
// straddles that range and broad needs a deliberate extra lean.
export const CHARCOAL_FEEL: CharcoalFeelConfig = {
  roundMaxDeg: 20,
  edgeFullDeg: 30,
  broadStartDeg: 50,
  broadFullDeg: 62,
  edgeAspect: 3.5,
  broadAspect: 8,
  edgeWidth: 0.55,
  broadWidth: 0.5,
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
  { key: 'roundMaxDeg',     label: 'round max°',  min: 0,   max: 60, step: 1 },
  { key: 'edgeFullDeg',     label: 'edge full°',  min: 0,   max: 70, step: 1 },
  { key: 'broadStartDeg',   label: 'broad from°', min: 10,  max: 85, step: 1 },
  { key: 'broadFullDeg',    label: 'broad full°', min: 15,  max: 90, step: 1 },
  { key: 'edgeAspect',      label: 'edge aspect', min: 1,   max: 12, step: 0.1 },
  { key: 'broadAspect',     label: 'broad aspect', min: 1,  max: 20, step: 0.1 },
  { key: 'edgeWidth',       label: 'edge width',  min: 0.1, max: 1.5, step: 0.01 },
  { key: 'broadWidth',      label: 'broad width', min: 0.1, max: 1.5, step: 0.01 },
  { key: 'broadLightening', label: 'broad light', min: 0,   max: 0.9, step: 0.01 },
  { key: 'broadGrainBoost', label: 'broad grain', min: 0,   max: 3,  step: 0.05 },
  { key: 'smoothing',       label: 'tilt smooth', min: 0.02, max: 1, step: 0.01 },
  { key: 'pressureFloor',   label: 'press floor', min: 0,   max: 0.9, step: 0.01 },
  { key: 'pressureGamma',   label: 'press gamma', min: 0.2, max: 2,  step: 0.05 },
  { key: 'skipFloor',       label: 'skip floor',  min: 0.02, max: 1, step: 0.01 },
  { key: 'gateRelief',      label: 'press fills', min: 0,   max: 1, step: 0.01 },
  { key: 'grainDepth',      label: 'grain depth', min: 0,   max: 6, step: 0.1 },
]

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Position along the ladder for a given tilt magnitude (degrees from
 *  vertical), as two independent 0..1 weights:
 *   - `edge`  ramps 0->1 across roundMaxDeg..edgeFullDeg and stays 1
 *   - `broad` ramps 0->1 across broadStartDeg..broadFullDeg
 *
 *  Kept as weights rather than a discrete mode enum on purpose. Quantizing
 *  into three modes is what forces hysteresis — and hysteresis makes the shape
 *  depend on which side you approached a threshold from, so the same tilt can
 *  produce two different dabs. Smooth weights need no history at all: the
 *  ramps themselves *are* the "few degrees wide transition zone", applied to
 *  the value instead of to a mode switch. */
export function charcoalTiltWeights(tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): { edge: number; broad: number } {
  return {
    edge: smoothstep(cfg.roundMaxDeg, cfg.edgeFullDeg, tiltDeg),
    broad: smoothstep(cfg.broadStartDeg, cfg.broadFullDeg, tiltDeg),
  }
}

/** Dab elongation along the tilt azimuth: 1 (round) -> edgeAspect -> broadAspect. */
export function charcoalAspect(tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  const { edge, broad } = charcoalTiltWeights(tiltDeg, cfg)
  const toEdge = 1 + (cfg.edgeAspect - 1) * edge
  return toEdge + (cfg.broadAspect - toEdge) * broad
}

/** Short-axis multiplier: 1 (the full end face) -> edgeWidth -> broadWidth. */
export function charcoalWidthFactor(tiltDeg: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  const { edge, broad } = charcoalTiltWeights(tiltDeg, cfg)
  const toEdge = 1 + (cfg.edgeWidth - 1) * edge
  return toEdge + (cfg.broadWidth - toEdge) * broad
}

/** How far along the round->broad axis a *recorded* dab sits, derived from its
 *  own baked `aspectRatio` rather than re-deriving it from tilt.
 *
 *  That indirection is deliberate: aspectRatio is baked at record time from the
 *  *filtered* tilt and the thresholds as they were then, so reading it back is
 *  the only way a later consumer (opacity baking, the shader) stays consistent
 *  with the dab it's actually drawing — re-running the ladder against a since-
 *  moved slider, or against unfiltered tilt, would silently disagree. DAB_FRAG
 *  computes the identical value from v_aspectRatio and u_charcoalBroadAspect. */
export function charcoalBroadness(aspectRatio: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  if (cfg.broadAspect <= 1) return 0
  return clamp((aspectRatio - 1) / (cfg.broadAspect - 1), 0, 1)
}

/** Deposit multiplier for a dab at this broadness — the broad side spreads the
 *  same pressure over a much bigger patch, so it lays down lighter. */
export function charcoalBroadDensity(broadness: number, cfg: CharcoalFeelConfig = CHARCOAL_FEEL): number {
  return 1 - cfg.broadLightening * broadness
}
