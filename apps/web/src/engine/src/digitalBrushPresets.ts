import { clamp } from 'lodash-es'

import { tiltOrPathAngle, type DabShapingProfile } from './dabShaping'
import type { PencilPreset } from './pencilPresets'

// #547, ADR 013: the digital brush — the first tool here that does not model a
// material.
//
// Every other tool in this engine is a model of one physical thing, with its
// own ADR and its own calibrated constants, and the user picks named feels
// rather than numbers (ADR 009 §2 states that rule outright). This file is the
// opposite by design: the tool *is* its brush set, and a brush is a record of
// numbers. A pencil must not turn into charcoal when a slider moves; a brush
// must turn into another brush exactly that way.
//
// Both disciplines are right for what they cover, which is why this is a
// separate ToolType rather than an eighth preset hung off something existing.

// ─── Curves (ADR 013 §5) ────────────────────────────────────────────────────
// Piecewise-linear, given as points, the shape libmypaint uses for every one of
// its input mappings. Deliberately data rather than the closures every other
// tool's DabShapingProfile is built from: a brush is authored, not compiled, so
// its response has to be something a file can carry.
//
// libmypaint is ISC-licensed, which is why the model can be taken from there at
// all; Krita's own engine is GPL-3.0 and this client ships as a JS bundle to the
// browser, which is distribution. ADR 013 §2 records that fork in full.

/** Control points in x order, x in 0..1, y unbounded above 0. At least two. */
export type BrushCurve = readonly (readonly [x: number, y: number])[]

/** Piecewise-linear read of `curve` at `x`, clamped to the end values outside
 *  the authored range.
 *
 *  Linear search rather than a binary one on purpose: a curve is 2-5 points, and
 *  this runs once per dab per output. A loop over four numbers beats the branch
 *  misprediction of anything cleverer, and it keeps the function obviously pure
 *  — which matters more than speed here, because replay has to reproduce it dab
 *  for dab (ADR 002). */
export function curveAt(curve: BrushCurve, x: number): number {
  const t = clamp(x, 0, 1)
  if (t <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]
    if (t > x1) continue
    const [x0, y0] = curve[i - 1]
    const span = x1 - x0
    // Two points authored at the same x are a step, not a division by zero.
    return span <= 0 ? y1 : y0 + (y1 - y0) * ((t - x0) / span)
  }
  return curve[curve.length - 1][1]
}

// ─── The tip (ADR 013 §5, revised) ──────────────────────────────────────────
// The shape of one imprint, separated from everything about how the brush
// *behaves*. v1 collapsed it into a bare `hardness` number because there was
// exactly one tip family, and that was the mistake the design review named: it
// makes the bitmap tip a change of format rather than a second value.
//
// So the tip is a structure from the start, and it already carries the two
// fields a round tip does not need — aspect and rotation — because a flat brush
// is nothing but those two, and a model that cannot express it is a model that
// has to be reopened.

/** How the footprint is oriented in the world.
 *
 *  Not a free angle function, deliberately: these are the three answers that
 *  mean something to a painter, and each is a different *frame* (ADR 012 §3 makes
 *  the same distinction for the marker's chisel). A round tip ignores all three,
 *  which is why the field can be there from day one at no cost. */
export type TipRotation =
  /** Anchored to the canvas — a flat brush held at one angle, the way a
   *  calligrapher holds a chisel. The mark is wide across the travel and thin
   *  along it, which is the whole expressive range of a flat brush. */
  | 'fixed'
  /** Swings to follow the stroke, so the mark keeps a constant width. */
  | 'path'

export interface BrushTip {
  /** 'round' is the only procedural family in v1. 'bitmap' is the second value
   *  this union exists for — a mask sampled per dab, which is what turns the set
   *  from four brushes into a library (ADR 013 §8, v2). */
  kind: 'round'
  /** 0 = a gradient with no edge at all, 1 = a disc. Feeds DAB_FRAG's
   *  u_inkMode=10 stamp, and also dabSpacing's footprint rule — a hard-edged
   *  stamp has to be laid denser or the mark reads as a row of discs (#478). */
  hardness: number
  /** Long axis / short axis. 1 = round. Above 1 the tip is flat, and what the
   *  stroke's width does then is decided by `rotation`. */
  aspect: number
  rotation: TipRotation
  /** World angle of the long axis, radians, read only when rotation is 'fixed'.
   *  Canvas-anchored rather than screen-anchored, so rotating the viewport does
   *  not rotate the brush — see DabShapingProfile.angle on why the frame has to
   *  be named rather than assumed. */
  angle: number
}

/** The round tip every brush in v1 wears, spelled once. */
function roundTip(hardness: number): BrushTip {
  return { kind: 'round', hardness, aspect: 1, rotation: 'path', angle: 0 }
}

// ─── The brush (ADR 013 §5) ─────────────────────────────────────────────────

export interface BrushDescriptor {
  /** Stable across versions — it is half of the recorded preset token. */
  id: string
  /** Bumped by **any** edit that changes a pixel. See ADR 013 §7: the token a
   *  stroke records carries this, so improving a brush never repaints the
   *  strokes already drawn with it — the old version keeps resolving to the old
   *  numbers forever, and new strokes record the new one.
   *
   *  This is the same permanence rule `dabs`/`dabsPacked` follow in
   *  StrokeOperation, and it is the whole reason the token is not just an id. */
  version: number
  /** The shape of one imprint. See BrushTip — and note that this is the only
   *  field here that describes the *mark*; everything else describes behaviour. */
  tip: BrushTip
  /** How strongly the paper's own relief breaks this brush's contact with it,
   *  0..1, feeding the composite's rim term (RibbonProfile.paperRim).
   *
   *  A property of the **preset**, not of the tool, and that correction came out
   *  of the design review: v1's ADR said "a digital brush does not touch paper,
   *  full stop", which is right for Hard Round and wrong for the whole Dry/Rough
   *  family, where the sheet's tooth *is* the mechanism of the texture. Grafetto
   *  has a real height-mapped paper, so declining to use it would be throwing
   *  away the one thing we have that Procreate does not.
   *
   *  0 for every brush in v1 — the fabric of a rough brush is a mask (v2), and
   *  turning this up before those exist would only make Hard Round grainy. */
  paperInteraction: number
  /** Step between stamps as a fraction of the footprint's diameter. Smaller
   *  than the engine's 0.22 default for every brush here: that number was
   *  calibrated for tools whose dabs blend through paper grain, and a soft
   *  digital stamp shows its own ripple much sooner. */
  spacing: number
  /** How much one stamp lays down, before the pressure curve. Accumulates in
   *  the stroke's coverage buffer and saturates at 1 — this is *flow*, and it
   *  is the half of the pair that makes overlapping strokes build up.
   *
   *  Kept strictly apart from opacity, which the user sets and which the
   *  composite applies once to the finished silhouette. Collapsing the two is
   *  precisely what makes a hand-rolled digital brush darken at every
   *  self-crossing; see ADR 013 §3. */
  flow: number
  /** Multiplier on the size slider, per dab, as a function of pressure. */
  sizeByPressure: BrushCurve
  /** Multiplier on `flow`, per dab, as a function of pressure. */
  flowByPressure: BrushCurve
  /** Distance, world px, over which the pressure low-pass reaches ~63% of a new
   *  reading. Digital brushes track pressure closely enough for a tablet's own
   *  noise to show, exactly as the brush pen does (#454) — and for the same
   *  reason this is a distance rather than a per-sample weight (#472): a weight
   *  makes the filter's cutoff the digitiser's report rate, so the same gesture
   *  comes out differently on a 60 Hz and a 240 Hz stylus. */
  pressureSmoothingPx: number
  /** Stroke opacity this brush is authored at, before the user's own slider. */
  opacity: number
}

/** Full-range identity: pressure 0 draws nothing, pressure 1 draws the size on
 *  the slider. The floor is not 0 — a stylus reports near-zero noise at contact
 *  and a dab of literally zero width is a gap in the stroke, not a light touch.
 *  Same problem BRUSH_PEN_MIN_PRESSURE guards from the other side. */
const SIZE_FULL: BrushCurve = [[0, 0.08], [0.5, 0.55], [1, 1]]

/** An inking response: a knee rather than a ramp. Width is nearly flat through
 *  the middle of the range and opens up only when the hand leans in, which is
 *  what lets a line be *held* at a width instead of wobbling with the hand's
 *  own pressure noise. The liner arrived at the same shape from the other
 *  direction (#532). */
const SIZE_KNEE: BrushCurve = [[0, 0.25], [0.35, 0.42], [0.75, 0.62], [1, 1]]

/** Flow that comes on early and saturates: a brush loaded with paint does not
 *  hold back until the hand presses hard. */
const FLOW_EARLY: BrushCurve = [[0, 0.35], [0.4, 0.85], [1, 1]]

/** Flow that tracks pressure nearly linearly — for a brush meant to build tone
 *  in passes rather than cover in one. */
const FLOW_LINEAR: BrushCurve = [[0, 0.12], [1, 1]]

/** Ink does not thin out: it is either laid down or it is not. */
const FLOW_FLAT: BrushCurve = [[0, 0.9], [0.25, 1], [1, 1]]

/** Covering, but not indifferent to the hand: a painting brush lays nearly all
 *  its paint from a light touch onward, and the little that is left to pressure
 *  is what keeps a stroke from looking printed. */
const FLOW_COVERING: BrushCurve = [[0, 0.6], [0.35, 0.9], [1, 1]]

/** The shipped set (ADR 013 §7 — frozen and versioned; there is deliberately no
 *  way for a user to edit these, because a stroke's preset token is resolved by
 *  *code* on every participant's client and an editable brush would have to
 *  travel inside the operation instead).
 *
 *  Four rather than a hundred, and the four are chosen to differ in the one
 *  axis a set has to differ in first — how the edge of the mark behaves — not
 *  in decorative texture. Fine, characterful and textured tips are v2's job
 *  (they need a mask atlas and a bake step); this set has to prove the tool. */
export const DIGITAL_BRUSHES: readonly BrushDescriptor[] = [
  {
    id: 'soft-round',
    version: 1,
    tip: roundTip(0.12),
    paperInteraction: 0,
    // Tight, because a soft stamp's own ripple is what shows first: the profile
    // falls off over most of the radius, so consecutive stamps have to overlap
    // heavily before the mark reads as continuous rather than as beads.
    spacing: 0.06,
    flow: 0.28,
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    id: 'medium-round',
    version: 1,
    tip: roundTip(0.45),
    paperInteraction: 0,
    spacing: 0.08,
    flow: 0.55,
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    id: 'hard-round',
    version: 1,
    tip: roundTip(0.82),
    paperInteraction: 0,
    spacing: 0.10,
    flow: 0.85,
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_EARLY,
    pressureSmoothingPx: 10,
    opacity: 1,
  },
  {
    id: 'ink-round',
    version: 1,
    // Not 1.0: a stamp with no ramp at all is a jagged disc, and the shader's
    // floor would quietly override it anyway (see the aaNorm clamp in
    // DAB_FRAG's u_inkMode=10 branch). Naming the value here keeps the two
    // from disagreeing silently.
    tip: roundTip(0.94),
    paperInteraction: 0,
    spacing: 0.09,
    flow: 1,
    sizeByPressure: SIZE_KNEE,
    flowByPressure: FLOW_FLAT,
    // Harder than the rest: an inking line is drawn slowly and deliberately,
    // and that is exactly where unfiltered pressure noise is most visible.
    pressureSmoothingPx: 14,
    opacity: 1,
  },
  {
    // The brush that turns this tool from "another pen" into something you can
    // paint with: it is for laying colour *masses*, and the first thing it has
    // to prove is that the engine can cover an area evenly rather than only
    // draw good lines.
    id: 'opaque-paint',
    version: 1,
    // Between medium and hard on purpose. A painting brush's edge is neither a
    // gradient nor a cut: it is soft enough that two adjacent strokes merge into
    // one mass, and defined enough that a shape has a boundary.
    tip: roundTip(0.62),
    paperInteraction: 0,
    spacing: 0.08,
    flow: 0.95,
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_COVERING,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    // The first non-round tip, and it earns its place twice: it is a genuinely
    // needed painting brush, and it is the proof that `tip` is really detached
    // from hardness — a flat brush is nothing but aspect and rotation, so if the
    // model could not express it, the model was wrong.
    id: 'flat',
    version: 1,
    tip: {
      kind: 'round',
      hardness: 0.7,
      // 4:1, the same proportion the marker's chisel and watercolor's flat both
      // settled on — wide enough that turning the stroke changes its width
      // dramatically, narrow enough to still be a brush rather than a ruler.
      aspect: 4,
      // Anchored to the canvas, not swung along the path. This is the whole
      // character of a flat brush: held at one angle, it paints a broad band
      // across the travel and a thin line along it, and the width of the mark
      // becomes something the hand controls by *direction*. A tip that swung to
      // follow the stroke would keep one width and be a round brush wearing an
      // ellipse.
      rotation: 'fixed',
      // 45 degrees: the angle a brush is actually held at, and the one where
      // both extremes — the broad sweep and the thin edge — are a quarter turn
      // apart in either direction.
      angle: Math.PI / 4,
    },
    paperInteraction: 0,
    // Tighter than the round brushes: the step is bounded by the *short* axis
    // (the worst case, and the right one — dabSpacing's own note), so a 4:1 tip
    // at the same fraction advances a quarter as far relative to its silhouette.
    spacing: 0.05,
    flow: 0.9,
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_COVERING,
    pressureSmoothingPx: 10,
    opacity: 1,
  },
]

export const DEFAULT_DIGITAL_BRUSH = 'medium-round'

export const DIGITAL_BRUSH_IDS: readonly string[] =
  DIGITAL_BRUSHES.map(b => b.id)

// ─── The recorded token (ADR 013 §7) ────────────────────────────────────────

/** `brush:<id>@<version>` — what a StrokeOperation carries in its `preset`
 *  slot, the same field a pencil grade or a marker's `${nib}:${size}` rides.
 *
 *  The version is in the token rather than looked up at replay time, and that
 *  is the entire mechanism of §7: a stroke drawn today keeps resolving to
 *  today's numbers after the brush is retuned. Every other tool here lacks that
 *  and quietly repaints its own history on recalibration. */
export function digitalBrushPreset(id: string, version: number): string {
  return `brush:${id}@${version}`
}

/** Inverse of the above, defensive in the same way markerNibFromPreset is: an
 *  unrecognised or missing token resolves to the default brush's current
 *  version rather than throwing, because this runs on the replay path where a
 *  hard failure would take out the whole room's history rather than one mark. */
export function digitalBrushFromPreset(presetName: string | undefined): BrushDescriptor {
  const fallback = DIGITAL_BRUSHES.find(b => b.id === DEFAULT_DIGITAL_BRUSH) ?? DIGITAL_BRUSHES[0]
  if (!presetName) return fallback
  const m = /^brush:([A-Za-z0-9-]+)@(\d+)$/.exec(presetName)
  if (!m) {
    // A bare id, for the settings layer: the UI stores which brush is selected,
    // and it has no business knowing about versions — the token is assembled at
    // the moment a stroke is recorded (see engine's own _strokePreset).
    return DIGITAL_BRUSHES.find(b => b.id === presetName) ?? fallback
  }
  const [, id, version] = m
  // Matched on id *and* version: once a second version of a brush exists, both
  // live here side by side and an old stroke must find the old one. Until then
  // an unknown version falls back to the id's current descriptor, which is the
  // only honest answer for a stroke recorded by a client newer than this one.
  return DIGITAL_BRUSHES.find(b => b.id === id && b.version === Number(version))
    ?? DIGITAL_BRUSHES.find(b => b.id === id)
    ?? fallback
}

// ─── Engine-facing derivations ──────────────────────────────────────────────

/** How much one stamp of this brush lays down at this pressure.
 *
 *  Derived rather than recorded, and that is what keeps the payload unchanged:
 *  `Dab.pressure` is already in the log and the descriptor is frozen by the
 *  token, so a replay recomputes the identical number without a new field. */
export function digitalBrushFlow(brush: BrushDescriptor, pressure: number): number {
  return clamp(brush.flow * curveAt(brush.flowByPressure, pressure), 0, 1)
}

/** The `PencilPreset` slot the rest of the engine resolves for every tool.
 *
 *  `hardness` is not decorative here the way it is for the brush pen (where it
 *  is documented as inert): it feeds both the stamp's own profile and
 *  dabSpacing's footprint rule, so the step tightens automatically for a hard
 *  brush. `sizeMultiplier` is 1 — a digital brush has no material whose grade
 *  makes it draw wider than the slider says. */
export function digitalBrushPresetFor(presetName: string | undefined): PencilPreset {
  const brush = digitalBrushFromPreset(presetName)
  return { opacity: brush.opacity, hardness: brush.tip.hardness, sizeMultiplier: 1 }
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'digitalBrush'.
 *
 *  Built from the descriptor rather than authored as closures — the adapter ADR
 *  013 §5 describes. Note what is *absent*: no tipBend, no headTaper, no
 *  speedContact. Those model a physical nib bending, and this brush has no
 *  fibres to bend. A digital stroke's ends are shaped by flow and by the hand,
 *  which is what the tool's users expect and what makes it feel unlike the
 *  brush pen sitting next to it in the toolbar. */
export function shapingForDigitalBrushPreset(presetName: string | undefined): DabShapingProfile {
  const { tip, sizeByPressure, pressureSmoothingPx } = digitalBrushFromPreset(presetName)
  return {
    size: pressure => curveAt(sizeByPressure, pressure),
    // Straight off the tip, and independent of both tilt and pressure. A
    // physical nib's proportions change as it is leaned or pressed because it
    // deforms; a digital tip is a shape, and a shape that silently changed
    // proportions under the hand would be a nib model wearing a brush's name.
    aspect: () => tip.aspect,
    // 'fixed' is canvas-anchored, so it ignores both tilt and the camera — see
    // DabShapingProfile.angle on why the frame must be named. 'path' falls
    // through to the shared helper, which is also what a round tip gets and
    // where rotating a circle costs nothing.
    angle: tip.rotation === 'fixed'
      ? () => tip.angle
      : tiltOrPathAngle,
    pressureSmoothingPx,
  }
}

/** Whether this brush's footprint is elongated enough to scallop — the second
 *  spacing bound (#485), which watercolor's flat nib already opts into and a
 *  round one must not (its own doc explains why the round case is left alone). */
export function digitalBrushScallops(presetName: string | undefined): boolean {
  return digitalBrushFromPreset(presetName).tip.aspect > 1.05
}

// ─── Determinism helper (ADR 013 §6) ────────────────────────────────────────

/** A stable 0..1 pseudo-random value for a dab, given the stroke it belongs to
 *  and the dab's index in that stroke.
 *
 *  Nothing in the shipped set uses this yet — scatter and jitter arrive with
 *  the textured brushes of v2. It exists now because the *rule* has to exist
 *  before the first brush that needs it, not after: `Math.random()` in a dab's
 *  geometry would mean the teacher's stroke draws differently on the student's
 *  screen, and undo/replay would not reproduce the mark it just erased (ADR 002).
 *
 *  Integer hash (xorshift-style mix of two 32-bit words) rather than anything
 *  float-based, for the reason .claude/rules.md gives about cross-device
 *  determinism: integer arithmetic is exact everywhere, float accumulation is
 *  not guaranteed to be bit-identical across GPUs and JS engines. */
export function brushDabRandom(strokeSeed: number, dabIndex: number): number {
  let h = (strokeSeed ^ Math.imul(dabIndex + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000
}

/** Folds a stroke's id into the 32-bit seed `brushDabRandom` takes. The id is
 *  recorded on the operation, so every participant folds the same string. */
export function brushStrokeSeed(strokeId: string | undefined): number {
  let h = 0x811c9dc5
  if (!strokeId) return h >>> 0
  for (let i = 0; i < strokeId.length; i++) {
    h = Math.imul(h ^ strokeId.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}
