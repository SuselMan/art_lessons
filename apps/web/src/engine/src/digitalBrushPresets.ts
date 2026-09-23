import { clamp } from 'lodash-es'

import { tiltOrPathAngle, type DabShapingProfile } from './dabShaping'
import type { PencilPreset } from './pencilPresets'
import type { BrushTextureId, TipMaskId } from './tipMasks'

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
 *  Not a free angle function, deliberately: these are the answers that mean
 *  something to a painter, and each is a different *frame* (ADR 012 §3 makes
 *  the same distinction for the marker's chisel). A round tip ignores all of
 *  them, which is why the field can be there from day one at no cost. */
export type TipRotation =
  /** Anchored to the canvas — a flat brush held at one angle, the way a
   *  calligrapher holds a chisel. The mark is wide across the travel and thin
   *  along it, which is the whole expressive range of a flat brush. Also what a
   *  stamp that must stay upright (a grass clump) wants. */
  | 'fixed'
  /** Swings to follow the stroke, unless the pen is tilted, in which case the
   *  pen's own azimuth wins (tiltOrPathAngle). Right for a round tip, where the
   *  angle only matters for the shape of an elongated one. */
  | 'path'
  /** (#573) Follows the direction of travel and nothing else. A bristle tip's
   *  hairs have to sit *across* the stroke for each to drag its own streak, and
   *  letting pen tilt turn them would line them up along it — one streak. */
  | 'travel'

export interface BrushTip {
  /** 'round' is the procedural radial ramp. 'bitmap' (#573) is a mask sampled
   *  per stamp (tipMasks.ts), which is what turns the set from a row of round
   *  brushes into a library. */
  kind: 'round' | 'bitmap'
  /** Which mask, when kind is 'bitmap'. */
  mask?: TipMaskId
  /** 0 = a gradient with no edge at all, 1 = a disc. Feeds the round stamp's
   *  profile, and also dabSpacing's footprint rule — a hard-edged stamp has to
   *  be laid denser or the mark reads as a row of discs (#478). A bitmap tip's
   *  edge is in its picture; there it only feeds the spacing rule. */
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

/** The round tip most brushes wear, spelled once. */
function roundTip(hardness: number): BrushTip {
  return { kind: 'round', hardness, aspect: 1, rotation: 'path', angle: 0 }
}

function bitmapTip(mask: TipMaskId, rotation: TipRotation, hardness = 0.7): BrushTip {
  return { kind: 'bitmap', mask, hardness, aspect: 1, rotation, angle: 0 }
}

// ─── Scatter and jitter (#573, ADR 013 §6 and §11) ──────────────────────────

/** How one recorded dab becomes several stamps, and how much each stamp is
 *  allowed to differ from the dab it came from.
 *
 *  Every value is a *spread*, never a direction, and every draw comes out of
 *  brushDabRandom seeded by the dab itself (see brushDabSeed) — so the teacher's
 *  splatter lands on the student's screen drop for drop. None of it is
 *  recorded: the dab is, and the stamps are a pure function of it. */
export interface BrushScatter {
  /** Stamps per dab. */
  count: number
  /** How far a stamp may land from the dab, as a fraction of the dab's
   *  diameter. 0 stamps on the path. */
  radius: number
  /** Each stamp's size as a fraction of the dab's — a splatter is a spray of
   *  drops much smaller than the area it covers. 1 = the dab's own size. */
  scale: number
  /** 0..1 — how much smaller than `scale` a stamp may randomly come out. */
  sizeJitter: number
  /** 0..1 of a full turn a stamp may be rotated by at random. 1 spins it
   *  freely, which is what keeps a textured tip from printing the same picture
   *  in a visible row. */
  angleJitter: number
  /** 0..1 — how much lighter than full a stamp may randomly come out. */
  flowJitter: number
}

// ─── The brush (ADR 013 §5) ─────────────────────────────────────────────────

/** Rows of the brush picker, in display order (#573). A property of the brush
 *  rather than a table in the UI, so a brush cannot be added without deciding
 *  where it goes. */
export type BrushCategory = 'line' | 'paint' | 'soft' | 'texture' | 'scatter'

export const BRUSH_CATEGORIES: readonly BrushCategory[] = ['line', 'paint', 'soft', 'texture', 'scatter']

/** Which renderer a brush goes through.
 *
 *  - `ribbon`: v1's path, the ribbon machinery's coverage stamp (DAB_FRAG's
 *    u_inkMode=10) with flow driven by pressure. Kept, unchanged, only so that
 *    strokes recorded with a `@1` token of the original six brushes replay
 *    exactly as drawn — no brush in the current set uses it (ADR 013 §7).
 *  - `stamp`: the brush's own stamp and composite programs (#573) — bitmap
 *    tips, scatter, paper tooth, screentone, and pressure acting on opacity as
 *    a real ceiling rather than on flow.
 *  - `mixer`: the smudge tool's carried imprint with the brush's own colour
 *    loaded into it (#573) — a brush that paints and picks up what it paints
 *    over. See digitalBrushMixer. */
export type BrushModel = 'ribbon' | 'stamp' | 'mixer'

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
  model: BrushModel
  category: BrushCategory
  /** The shape of one imprint. See BrushTip — and note that this is the only
   *  field here that describes the *mark*; everything else describes behaviour. */
  tip: BrushTip
  /** How strongly the paper's own relief breaks this brush's contact with it,
   *  0..1. A property of the **preset**, not of the tool, and that correction
   *  came out of the design review: v1's ADR said "a digital brush does not
   *  touch paper, full stop", which is right for Hard Round and wrong for the
   *  whole Dry/Rough family, where the sheet's tooth *is* the mechanism of the
   *  texture. Grafetto has a real height-mapped paper, so declining to use it
   *  would be throwing away the one thing we have that Procreate does not.
   *
   *  Read by the `stamp` model only; pressure pushes the mark into the tooth,
   *  the way a pastel stick is pushed into a sheet. */
  paperInteraction: number
  /** Step between stamps as a fraction of the footprint's diameter. Smaller
   *  than the engine's 0.22 default for every continuous brush here: that
   *  number was calibrated for tools whose dabs blend through paper grain, and
   *  a soft digital stamp shows its own ripple much sooner. Larger for a
   *  scatter brush, whose dabs are places to throw stamps from rather than a
   *  line being traced. */
  spacing: number
  /** How much **one full pass of the brush** lays down — 1 is a solid mark
   *  from a single stroke, 0.3 needs three or four passes to get there.
   *
   *  Per *pass*, not per stamp, when `flowPer` is 'pass' (every continuous
   *  brush): stamps sit a twentieth of the footprint apart, so ~20 of them
   *  cover any given pixel in one pass, and read as a per-stamp amount even
   *  0.12 accumulated to 0.92. The engine converts this to a per-stamp value
   *  against the distance actually travelled, which also makes the density
   *  independent of how fast the stroke was drawn.
   *
   *  Kept strictly apart from opacity, which the composite applies once to the
   *  finished silhouette. Collapsing the two is precisely what makes a
   *  hand-rolled digital brush darken at every self-crossing; see ADR 013 §3. */
  flow: number
  /** (#573) 'pass' for a continuous brush (see `flow`); 'stamp' for a scatter
   *  brush, whose stamps are separate marks — a splatter drop is as dark as
   *  its flow says, however far apart the dabs that threw it were. */
  flowPer: 'pass' | 'stamp'
  /** (#573) The width, as a fraction of the dab's diameter, that one pass is
   *  measured across when `flowPer` is 'pass'. 1 for a tip that fills its
   *  footprint. A bristle tip's footprint is mostly empty: each hair is a
   *  twentieth of the brush across, so a pixel under a hair is crossed by a
   *  twentieth as many stamps as the whole-brush reading assumes, and the
   *  streaks came out at a twentieth of the flow asked for. */
  flowSpan?: number
  /** Multiplier on the size slider, per dab, as a function of pressure.
   *  Switched off by the tool's "pressure changes size" setting. */
  sizeByPressure: BrushCurve
  /** `ribbon` model only: multiplier on `flow` as a function of pressure. */
  flowByPressure: BrushCurve
  /** `stamp` and `mixer` models (#573): the stroke's opacity *ceiling* as a
   *  function of pressure — the Photoshop/Krita sense of pressure→opacity, not
   *  flow. Going back over the stroke's own tail at the same light pressure
   *  cannot darken it past this; pressing harder can. Switched off by the
   *  tool's "pressure changes opacity" setting, which pins it at 1. */
  opacityByPressure: BrushCurve
  /** Distance, world px, over which the pressure low-pass reaches ~63% of a new
   *  reading. Digital brushes track pressure closely enough for a tablet's own
   *  noise to show, exactly as the brush pen does (#454) — and for the same
   *  reason this is a distance rather than a per-sample weight (#472): a weight
   *  makes the filter's cutoff the digitiser's report rate, so the same gesture
   *  comes out differently on a 60 Hz and a 240 Hz stylus. */
  pressureSmoothingPx: number
  /** Stroke opacity this brush is authored at, before the user's own slider. */
  opacity: number
  /** (#573) Several stamps per dab, each jittered. Absent = one stamp exactly
   *  on the dab. */
  scatter?: BrushScatter
  /** (#573) The brush's own grain, anchored to the canvas rather than to the
   *  stamp — see tipMasks.ts on why only that survives the overlap of a
   *  continuous stroke. `periodPx` is the world size of one tile of it. */
  texture?: { id: BrushTextureId; periodPx: number; strength: number }
  /** (#573) Halftone pitch, world px — the composite turns the stroke's tone
   *  into dots of a fixed screen instead of a continuous fill. World-anchored,
   *  so two strokes of tone line up into one screen the way two pieces of
   *  screentone film cut from one sheet do. */
  screentonePx?: number
  /** (#573) `mixer` model only. */
  mixer?: {
    /** How much of the brush's own colour is folded back into what it carries
     *  per radius travelled. 1 = never picks anything up (a plain brush); low =
     *  mostly drags what is already on the canvas. */
    load: number
    /** How much of what is under the brush it picks up per radius
     *  travelled. Together with `load` this sets how far a colour is dragged:
     *  the carried paint forgets at `pickup + load` per radius. */
    pickup: number
    /** How strongly the carried paint is laid down per radius travelled. */
    strength: number
  }
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

/** (#573) Size that answers the hand but never collapses: a textured or
 *  bristle tip shrunk to a few pixels is no longer its texture, only a dot. */
const SIZE_HALF: BrushCurve = [[0, 0.4], [1, 1]]

/** (#573) An airbrush's nozzle does not widen under pressure — it sprays more. */
const SIZE_NOZZLE: BrushCurve = [[0, 0.75], [1, 1]]

/** Flow that comes on early but keeps climbing: a brush loaded with paint does
 *  not hold back until the hand presses hard, and it does not stop answering it
 *  either.
 *
 *  Widened from [[0, 0.35], [0.4, 0.85], [1, 1]], and the reason is a report
 *  rather than taste: at that shape the density was within 15% of full over the
 *  whole usable half of the range, so pressing harder changed nothing anyone
 *  could see — and the setting that turns the behaviour off looked broken
 *  because there was nothing to turn off ("свитч кажется не делает нифига",
 *  Ilya). A curve whose effect is invisible is not a gentle curve, it is a
 *  missing one. */
const FLOW_EARLY: BrushCurve = [[0, 0.12], [0.5, 0.6], [1, 1]]

/** Flow that tracks pressure nearly linearly — for a brush meant to build tone
 *  in passes rather than cover in one. */
const FLOW_LINEAR: BrushCurve = [[0, 0.12], [1, 1]]

/** Ink does not thin out: it is either laid down or it is not. */
const FLOW_FLAT: BrushCurve = [[0, 0.9], [0.25, 1], [1, 1]]

/** Covering, but not indifferent to the hand. */
const FLOW_COVERING: BrushCurve = [[0, 0.3], [0.5, 0.75], [1, 1]]

// (#573) Opacity ceilings. Every one of these has to be *visibly* different
// from the switch being off, for the reason FLOW_EARLY's comment records: a
// curve nobody can see is a setting that looks broken.

/** Tone that follows the hand all the way down — shading brushes. */
const OPACITY_LINEAR: BrushCurve = [[0, 0.06], [1, 1]]

/** Tone that reaches a usable density early — painting brushes, where laying
 *  a flat mass should not be an exercise in pressing evenly. */
const OPACITY_EARLY: BrushCurve = [[0, 0.12], [0.5, 0.65], [1, 1]]

/** Ink keeps most of its black at a light touch, but still answers it. */
const OPACITY_INK: BrushCurve = [[0, 0.3], [0.5, 0.8], [1, 1]]

// ─── v1 (frozen) ────────────────────────────────────────────────────────────

/** The set as #547 shipped it, frozen (ADR 013 §7).
 *
 *  Nothing new draws with these: they exist so a stroke whose token says
 *  `brush:soft-round@1` keeps resolving to exactly the numbers and the renderer
 *  it was drawn with. The live set below supersedes each one at `@2`, where the
 *  meaning of pressure changed from flow to an opacity ceiling (#573) — a change
 *  to pixels, and therefore a version. `opacityByPressure` is present only to
 *  satisfy the type: the `ribbon` model never reads it. */
const V1_BRUSHES: readonly BrushDescriptor[] = [
  {
    id: 'soft-round', version: 1, model: 'ribbon', category: 'soft',
    tip: roundTip(0.12), paperInteraction: 0, spacing: 0.06, flow: 0.45, flowPer: 'pass',
    sizeByPressure: SIZE_FULL, flowByPressure: FLOW_LINEAR, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 8, opacity: 1,
  },
  {
    id: 'medium-round', version: 1, model: 'ribbon', category: 'paint',
    tip: roundTip(0.45), paperInteraction: 0, spacing: 0.08, flow: 0.85, flowPer: 'pass',
    sizeByPressure: SIZE_FULL, flowByPressure: FLOW_EARLY, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 8, opacity: 1,
  },
  {
    id: 'hard-round', version: 1, model: 'ribbon', category: 'line',
    tip: roundTip(0.82), paperInteraction: 0, spacing: 0.10, flow: 0.95, flowPer: 'pass',
    sizeByPressure: SIZE_FULL, flowByPressure: FLOW_EARLY, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 10, opacity: 1,
  },
  {
    id: 'ink-round', version: 1, model: 'ribbon', category: 'line',
    tip: roundTip(0.94), paperInteraction: 0, spacing: 0.09, flow: 1, flowPer: 'pass',
    sizeByPressure: SIZE_KNEE, flowByPressure: FLOW_FLAT, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 14, opacity: 1,
  },
  {
    id: 'opaque-paint', version: 1, model: 'ribbon', category: 'paint',
    tip: roundTip(0.62), paperInteraction: 0, spacing: 0.08, flow: 0.95, flowPer: 'pass',
    sizeByPressure: SIZE_FULL, flowByPressure: FLOW_COVERING, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 8, opacity: 1,
  },
  {
    id: 'flat', version: 1, model: 'ribbon', category: 'paint',
    tip: { kind: 'round', hardness: 0.7, aspect: 4, rotation: 'fixed', angle: Math.PI / 4 },
    paperInteraction: 0, spacing: 0.05, flow: 0.9, flowPer: 'pass',
    sizeByPressure: SIZE_FULL, flowByPressure: FLOW_COVERING, opacityByPressure: [[0, 1], [1, 1]],
    pressureSmoothingPx: 10, opacity: 1,
  },
]

// ─── The live set ───────────────────────────────────────────────────────────

/** The shipped set (ADR 013 §7 — frozen and versioned; there is deliberately no
 *  way for a user to edit these, because a stroke's preset token is resolved by
 *  *code* on every participant's client and an editable brush would have to
 *  travel inside the operation instead).
 *
 *  #573 grew it from six to sixteen, and the selection is a survey rather than
 *  a taste: the default sets and the "favourite brushes" lists of Procreate,
 *  Krita, CSP, Photoshop, MyPaint, SAI and Magma, plus what Ctrl+Paint, Marco
 *  Bucci and Proko tell students to use. The same eight to ten brushes keep
 *  coming back; this set is those, minus what the physical tools here already
 *  are (graphite, charcoal, ink, marker, watercolor, smudge). Decorative stamps
 *  — hearts, pawprints — were left out on purpose; the scatter row keeps only
 *  what gets used for backgrounds in a sketch. See ADR 013 §11. */
export const DIGITAL_BRUSHES: readonly BrushDescriptor[] = [
  // ── Line ──
  {
    id: 'ink-round',
    version: 2, model: 'stamp', category: 'line',
    // Not 1.0: a stamp with no ramp at all is a jagged disc, and the shader's
    // floor would quietly override it anyway (see the aaNorm clamp in the stamp
    // shader). Naming the value here keeps the two from disagreeing silently.
    tip: roundTip(0.94),
    paperInteraction: 0,
    spacing: 0.09,
    flow: 1, flowPer: 'pass',
    sizeByPressure: SIZE_KNEE,
    flowByPressure: FLOW_FLAT,
    opacityByPressure: OPACITY_INK,
    // Harder than the rest: an inking line is drawn slowly and deliberately,
    // and that is exactly where unfiltered pressure noise is most visible.
    pressureSmoothingPx: 14,
    opacity: 1,
  },
  {
    // Kohr's "most useful brush in Photoshop" — silhouettes, blocking, and a
    // line you mean.
    id: 'hard-round',
    version: 2, model: 'stamp', category: 'line',
    tip: roundTip(0.82),
    paperInteraction: 0,
    spacing: 0.10,
    flow: 0.95, flowPer: 'pass',
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_EARLY,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 10,
    opacity: 1,
  },
  // ── Paint ──
  {
    id: 'medium-round',
    version: 2, model: 'stamp', category: 'paint',
    tip: roundTip(0.45),
    paperInteraction: 0,
    spacing: 0.08,
    flow: 0.85, flowPer: 'pass',
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_EARLY,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    // For laying colour *masses*: the first thing it has to prove is that the
    // engine can cover an area evenly rather than only draw good lines. Edge
    // between medium and hard: soft enough that two adjacent strokes merge into
    // one mass, defined enough that a shape has a boundary.
    id: 'opaque-paint',
    version: 2, model: 'stamp', category: 'paint',
    tip: roundTip(0.62),
    paperInteraction: 0,
    spacing: 0.08,
    flow: 0.95, flowPer: 'pass',
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_COVERING,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    // A flat brush is nothing but aspect and rotation: held at one angle it
    // paints a broad band across the travel and a thin line along it, and the
    // width of the mark becomes something the hand controls by *direction*.
    // 4:1, the proportion the marker's chisel and watercolor's flat both
    // settled on; 45 degrees, the angle a brush is actually held at.
    id: 'flat',
    version: 2, model: 'stamp', category: 'paint',
    tip: { kind: 'round', hardness: 0.7, aspect: 4, rotation: 'fixed', angle: Math.PI / 4 },
    paperInteraction: 0,
    // Tighter than the round brushes: the step is bounded by the *short* axis,
    // so a 4:1 tip at the same fraction advances a quarter as far relative to
    // its silhouette.
    spacing: 0.05,
    flow: 0.9, flowPer: 'pass',
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_COVERING,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 10,
    opacity: 1,
  },
  {
    // The second brush in every program's list after a hard round: Procreate's
    // Nikko Rull, CSP's Gouache, Photoshop's block brushes. Opaque in the body,
    // broken and dry at the rim, so blocked-in masses read as paint and not as
    // vector fills.
    id: 'textured-paint',
    version: 1, model: 'stamp', category: 'paint',
    // The ragged rim is the mask's; the dry breakup inside the stroke is the
    // canvas-anchored texture's, because only that survives twenty stamps
    // overlapping (tipMasks.ts, brush textures).
    tip: bitmapTip('rough', 'travel'),
    paperInteraction: 0.1,
    texture: { id: 'dry', periodPx: 384, strength: 0.95 },
    spacing: 0.08,
    flow: 0.9, flowPer: 'pass',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_COVERING,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
    // A small wobble only. Enough that the ragged rim is not the same ragged
    // rim printed twenty times across the stroke; any more and the streaks
    // stop running along it.
    scatter: { count: 1, radius: 0, scale: 1, sizeJitter: 0.08, angleJitter: 0.03, flowJitter: 0 },
  },
  {
    // Round bristle / Hair-Fur / Bristle 6. Every hair tip drags its own
    // streak, so one pass paints fur, grass texture, wood grain, or the dry
    // hatching of a real bristle brush.
    id: 'bristle',
    version: 1, model: 'stamp', category: 'paint',
    tip: bitmapTip('bristle', 'travel'),
    paperInteraction: 0,
    // Very tight: a hair has to leave a *line*, and a hair tip is a few pixels
    // across, so the step is bounded by the hair, not by the brush.
    spacing: 0.02,
    flow: 0.9, flowPer: 'pass', flowSpan: 0.12,
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_EARLY,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    // The brush SAI and Krita's Wet presets are loved for, and the one thing a
    // digital painter misses most in a set without it: it lays its own colour
    // and drags what it passes over into it, so two colours blend under one
    // stroke instead of needing a round trip to the smudge tool.
    id: 'mixer',
    version: 1, model: 'mixer', category: 'paint',
    tip: roundTip(0.5),
    paperInteraction: 0,
    spacing: 0.08,
    flow: 1, flowPer: 'pass',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_COVERING,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
    // Forgets at 0.45 per radius, so a colour is carried about two brush
    // widths before the brush's own takes over again — long enough to pull one
    // colour visibly into the next, short enough that a stroke still ends in
    // the colour it was loaded with.
    mixer: { load: 0.15, pickup: 0.3, strength: 1.4 },
  },
  // ── Soft ──
  {
    id: 'soft-round',
    version: 2, model: 'stamp', category: 'soft',
    tip: roundTip(0.12),
    paperInteraction: 0,
    // Tight, because a soft stamp's own ripple is what shows first: the profile
    // falls off over most of the radius, so consecutive stamps have to overlap
    // heavily before the mark reads as continuous rather than as beads.
    spacing: 0.06,
    flow: 0.45, flowPer: 'pass',
    sizeByPressure: SIZE_FULL,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  {
    // Soft Airbrush: gradients, light, atmosphere. Differs from soft-round in
    // the two ways an airbrush differs from a brush — the spray does not widen
    // under pressure, it gets denser, and a single pass is faint, so tone is
    // built up rather than laid.
    id: 'airbrush',
    version: 1, model: 'stamp', category: 'soft',
    tip: roundTip(0),
    paperInteraction: 0,
    spacing: 0.05,
    flow: 0.35, flowPer: 'pass',
    sizeByPressure: SIZE_NOZZLE,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
  },
  // ── Texture ──
  {
    // Chalk and pastel — the textured-tone brush every set carries (Pastel
    // Palooza, Krita's chalk, Procreate's). Grain twice over: the tip's own
    // broken contact, and the sheet's tooth, which a light touch skims and a
    // heavy one presses into.
    id: 'chalk',
    version: 1, model: 'stamp', category: 'texture',
    tip: bitmapTip('chalk', 'fixed', 0.6),
    paperInteraction: 0.7,
    // Its own grit as well as the paper's tooth, so chalk is still chalk on
    // the smooth paper, which has no tooth to give.
    texture: { id: 'grit', periodPx: 160, strength: 0.6 },
    spacing: 0.12,
    flow: 0.75, flowPer: 'pass',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
    // Spun freely, or the tip's grain lines up stamp after stamp into streaks
    // along the stroke — chalk has no direction.
    scatter: { count: 1, radius: 0.04, scale: 1, sizeJitter: 0.1, angleJitter: 1, flowJitter: 0 },
  },
  {
    // Noise: specks for fabric, stone, skin, rust. Its stamps are the marks, so
    // flow is per stamp and the dabs are far apart.
    id: 'grain',
    version: 1, model: 'stamp', category: 'texture',
    tip: bitmapTip('speckle', 'fixed', 0.9),
    paperInteraction: 0,
    spacing: 0.3,
    flow: 0.85, flowPer: 'stamp',
    sizeByPressure: SIZE_NOZZLE,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
    scatter: { count: 1, radius: 0.2, scale: 1, sizeJitter: 0.3, angleJitter: 1, flowJitter: 0.3 },
  },
  {
    // Screentone for manga and comics. The tone of the stroke becomes the size
    // of the dots, so pressure (with the opacity switch on) draws a gradient
    // of dot sizes, the way a tone knife scrapes one.
    id: 'screentone',
    version: 1, model: 'stamp', category: 'texture',
    tip: roundTip(0.35),
    paperInteraction: 0,
    spacing: 0.06,
    flow: 0.7, flowPer: 'pass',
    sizeByPressure: SIZE_NOZZLE,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_LINEAR,
    pressureSmoothingPx: 8,
    opacity: 1,
    screentonePx: 7,
  },
  // ── Scatter ──
  {
    // Splatter: drops thrown off a loaded brush. Small, hard, of every size.
    id: 'splatter',
    version: 1, model: 'stamp', category: 'scatter',
    tip: roundTip(0.9),
    paperInteraction: 0,
    spacing: 0.5,
    flow: 1, flowPer: 'stamp',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
    scatter: { count: 5, radius: 0.9, scale: 0.16, sizeJitter: 0.85, angleJitter: 0, flowJitter: 0.25 },
  },
  {
    // Grass: clumps of blades, always upright — a 'fixed' tip at angle 0, with
    // just enough jitter that the clumps do not stand to attention.
    id: 'grass',
    version: 1, model: 'stamp', category: 'scatter',
    tip: bitmapTip('grass', 'fixed', 0.8),
    paperInteraction: 0,
    spacing: 0.3,
    flow: 1, flowPer: 'stamp',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
    scatter: { count: 1, radius: 0.25, scale: 1, sizeJitter: 0.4, angleJitter: 0.05, flowJitter: 0.3 },
  },
  {
    // Foliage: one drawn leaf, scattered and turned, so a mass of leaves never
    // repeats inside a stroke the way a bitmap of a whole bush would.
    id: 'foliage',
    version: 1, model: 'stamp', category: 'scatter',
    tip: bitmapTip('leaf', 'fixed', 0.8),
    paperInteraction: 0,
    spacing: 0.4,
    flow: 1, flowPer: 'stamp',
    sizeByPressure: SIZE_HALF,
    flowByPressure: FLOW_LINEAR,
    opacityByPressure: OPACITY_EARLY,
    pressureSmoothingPx: 8,
    opacity: 1,
    scatter: { count: 3, radius: 0.6, scale: 0.45, sizeJitter: 0.5, angleJitter: 1, flowJitter: 0.35 },
  },
]

export const DEFAULT_DIGITAL_BRUSH = 'medium-round'

export const DIGITAL_BRUSH_IDS: readonly string[] =
  DIGITAL_BRUSHES.map(b => b.id)

// ─── The recorded token (ADR 013 §7) ────────────────────────────────────────

/** The pressure settings a stroke was drawn with. Both change the mark, so
 *  both are recorded — a peer replaying the stroke has their own switches in
 *  whatever position they left them. */
export interface BrushPressureSettings {
  /** Pressure drives the stamp's size (the brush's sizeByPressure curve). */
  size: boolean
  /** Pressure drives the stroke's opacity ceiling (`stamp`/`mixer`) or the
   *  per-stamp flow (`ribbon`, v1). */
  opacity: boolean
}

const PRESSURE_ALL: BrushPressureSettings = { size: true, opacity: true }

/** Token modifiers, each present only when a behaviour is switched **off** —
 *  so every stroke recorded before a switch existed carries none and replays
 *  exactly as drawn. `flat` is v1's own ("pressure does not drive density"),
 *  kept under its original spelling: strokes already carry it. */
const MOD_OPACITY_OFF = 'flat'
const MOD_SIZE_OFF = 'fixed'

/** `brush:<id>@<version>`, plus a `:flat` / `:fixed` modifier for each
 *  pressure behaviour the user switched off — what a StrokeOperation carries in
 *  its `preset` slot, the same field a pencil grade or a marker's
 *  `${nib}:${size}` rides.
 *
 *  The version is in the token rather than looked up at replay time, and that
 *  is the entire mechanism of §7: a stroke drawn today keeps resolving to
 *  today's numbers after the brush is retuned.
 *
 *  The settings ride the same string for the reason the marker's nib and
 *  watercolor's whole mix do: #366 exists to shrink operation payloads, so a
 *  new Operation field is paid for by every operation in every room forever,
 *  while a slot that already exists is free. */
export function digitalBrushPreset(
  id: string, version: number, pressure: Partial<BrushPressureSettings> | boolean = PRESSURE_ALL,
): string {
  // A bare boolean is v1's signature — "flow from pressure" — kept so nothing
  // that still speaks it has to learn the object form at the same time.
  const p = typeof pressure === 'boolean' ? { opacity: pressure } : pressure
  let token = `brush:${id}@${version}`
  if (p.opacity === false) token += `:${MOD_OPACITY_OFF}`
  if (p.size === false) token += `:${MOD_SIZE_OFF}`
  return token
}

const TOKEN_RE = /^brush:([A-Za-z0-9-]+)@(\d+)((?::[A-Za-z0-9-]+)*)$/

function tokenModifiers(presetName: string | undefined): string[] {
  const m = presetName ? TOKEN_RE.exec(presetName) : null
  return m && m[3] ? m[3].slice(1).split(':') : []
}

/** Which pressure behaviours this recorded stroke had on. Both true for every
 *  token without modifiers, which includes every stroke recorded before the
 *  settings existed. */
export function digitalBrushPressureFromPreset(presetName: string | undefined): BrushPressureSettings {
  const mods = tokenModifiers(presetName)
  return { size: !mods.includes(MOD_SIZE_OFF), opacity: !mods.includes(MOD_OPACITY_OFF) }
}

/** v1's name for the opacity half, still read by the `ribbon` model. */
export function digitalBrushFlowFromPreset(presetName: string | undefined): boolean {
  return digitalBrushPressureFromPreset(presetName).opacity
}

const ALL_BRUSHES: readonly BrushDescriptor[] = [...DIGITAL_BRUSHES, ...V1_BRUSHES]

/** Inverse of the above, defensive in the same way markerNibFromPreset is: an
 *  unrecognised or missing token resolves to the default brush's current
 *  version rather than throwing, because this runs on the replay path where a
 *  hard failure would take out the whole room's history rather than one mark. */
export function digitalBrushFromPreset(presetName: string | undefined): BrushDescriptor {
  const fallback = DIGITAL_BRUSHES.find(b => b.id === DEFAULT_DIGITAL_BRUSH) ?? DIGITAL_BRUSHES[0]
  if (!presetName) return fallback
  const m = TOKEN_RE.exec(presetName)
  if (!m) {
    // A bare id, for the settings layer: the UI stores which brush is selected,
    // and it has no business knowing about versions — the token is assembled at
    // the moment a stroke is recorded (see engine's own _strokePreset).
    return DIGITAL_BRUSHES.find(b => b.id === presetName) ?? fallback
  }
  const [, id, version] = m
  // Matched on id *and* version across the live set and the frozen v1 one: an
  // old stroke must find the old numbers. An unknown version falls back to the
  // id's current descriptor, which is the only honest answer for a stroke
  // recorded by a client newer than this one.
  return ALL_BRUSHES.find(b => b.id === id && b.version === Number(version))
    ?? DIGITAL_BRUSHES.find(b => b.id === id)
    ?? fallback
}

// ─── Engine-facing derivations ──────────────────────────────────────────────

/** `ribbon` model (v1): how much one stamp of this brush lays down at this
 *  pressure.
 *
 *  Derived rather than recorded, and that is what keeps the payload unchanged:
 *  `Dab.pressure` is already in the log and the descriptor is frozen by the
 *  token, so a replay recomputes the identical number without a new field. */
export function digitalBrushFlow(
  brush: BrushDescriptor, pressure: number, flowFromPressure = true,
): number {
  // Off means the stamp lays the same amount however hard the pen is pressed —
  // `brush.flow` outright, which is what every curve here returns at full
  // pressure (they all end at [1, 1]). So turning the setting off does not make
  // the brush weaker, it makes it even.
  const curve = flowFromPressure ? curveAt(brush.flowByPressure, pressure) : 1
  return clamp(brush.flow * curve, 0, 1)
}

/** `stamp`/`mixer` models (#573): the stroke's opacity ceiling at this
 *  pressure. 1 when the switch is off — the mark is what a firm press would
 *  have given, everywhere, rather than weaker. */
export function digitalBrushCeiling(
  brush: BrushDescriptor, pressure: number, opacityFromPressure = true,
): number {
  return opacityFromPressure ? clamp(curveAt(brush.opacityByPressure, pressure), 0, 1) : 1
}

/** The `PencilPreset` slot the rest of the engine resolves for every tool.
 *
 *  `hardness` feeds both the stamp's own profile and dabSpacing's footprint
 *  rule, so the step tightens automatically for a hard brush.
 *
 *  `sizeMultiplier` normalizes an elongated tip against the size slider: every
 *  other tool here takes `Dab.size` as the footprint's **short** axis, right
 *  for a charcoal stick whose width is a fact about the object. A brush's size
 *  is chosen by the person, and what they mean by it is the widest the mark
 *  gets. So the slider names the long axis and this divides back down.
 *
 *  Exactly 1 for every round tip — every brush in the set but 'flat'. */
export function digitalBrushPresetFor(presetName: string | undefined): PencilPreset {
  const brush = digitalBrushFromPreset(presetName)
  return {
    opacity: brush.opacity,
    hardness: brush.tip.hardness,
    sizeMultiplier: 1 / Math.max(brush.tip.aspect, 1),
  }
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'digitalBrush'.
 *
 *  Built from the descriptor rather than authored as closures — the adapter ADR
 *  013 §5 describes. Note what is *absent*: no tipBend, no headTaper, no
 *  speedContact. Those model a physical nib bending, and this brush has no
 *  fibres to bend. */
export function shapingForDigitalBrushPreset(presetName: string | undefined): DabShapingProfile {
  const { tip, sizeByPressure, pressureSmoothingPx } = digitalBrushFromPreset(presetName)
  const { size: sizeFromPressure } = digitalBrushPressureFromPreset(presetName)
  return {
    // (#573) Switched off, the dab is the size on the slider at every pressure
    // — the top of every curve here, since they all end at [1, 1]. Recorded in
    // the token, so the replay agrees without a new field.
    size: sizeFromPressure ? pressure => curveAt(sizeByPressure, pressure) : () => 1,
    // Straight off the tip, and independent of both tilt and pressure. A
    // physical nib's proportions change as it is leaned or pressed because it
    // deforms; a digital tip is a shape.
    aspect: () => tip.aspect,
    // 'fixed' is canvas-anchored, so it ignores both tilt and the camera — see
    // DabShapingProfile.angle on why the frame must be named. 'travel' is the
    // path alone. 'path' falls through to the shared helper, which is also
    // what a round tip gets and where rotating a circle costs nothing.
    angle: tip.rotation === 'fixed'
      ? () => tip.angle
      : tip.rotation === 'travel'
        ? (_tiltMag, _tiltX, _tiltY, pathAngle) => pathAngle
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

/** Whether a stroke with this token paints through the mixer (#573) — the one
 *  brush that takes the smudge tool's route rather than the stamp one. */
export function isMixerBrushPreset(presetName: string | undefined): boolean {
  return digitalBrushFromPreset(presetName).model === 'mixer'
}

// ─── Stamps (#573, ADR 013 §11) ─────────────────────────────────────────────

/** One stamp the `stamp` model draws: where, how big, which way, how much. */
export interface BrushStamp {
  x: number
  y: number
  /** Diameter along the tip's short axis, world px — Dab.size's meaning. */
  size: number
  angle: number
  aspect: number
  /** This stamp's share toward the dab's flow, 0..1, before the pass
   *  normalization — scatter's flow jitter lives here. */
  flowScale: number
}

/** The stamps one recorded dab expands into.
 *
 *  A pure function of the dab and the descriptor, and that is the determinism
 *  argument in full: the dab is in the log, the descriptor is frozen by the
 *  token, so every participant — and every later replay — throws the same
 *  splatter. The seed is the dab's own recorded position rather than its index
 *  in the stroke (the rule ADR 013 §6 first wrote down) because the position is
 *  the one thing a live batch, a one-shot replay and a chunked replay cannot
 *  disagree about, while an index would have to be threaded through all three
 *  and kept in step. */
export function brushStampsForDab(
  brush: BrushDescriptor,
  dab: { x: number; y: number; size: number; angle: number; aspectRatio: number; pressure: number },
): BrushStamp[] {
  const s = brush.scatter
  if (!s) return [{ x: dab.x, y: dab.y, size: dab.size, angle: dab.angle, aspect: dab.aspectRatio, flowScale: 1 }]
  const seed = brushDabSeed(dab.x, dab.y, dab.pressure)
  const out: BrushStamp[] = []
  for (let k = 0; k < s.count; k++) {
    const r = (j: number): number => brushDabRandom(seed, k * 8 + j)
    // Uniform over the disc: sqrt on the radius, or the drops crowd the centre.
    // cos/sin here are not the portability hazard they are in a hash: they only
    // place a stamp, and an ulp of disagreement between two engines is a
    // position error of ~1e-13 px — nothing any rasterizer can resolve.
    const dist = Math.sqrt(r(0)) * s.radius * dab.size
    const theta = r(1) * Math.PI * 2
    const size = dab.size * s.scale * (1 - s.sizeJitter * r(2))
    out.push({
      x: dab.x + Math.cos(theta) * dist,
      y: dab.y + Math.sin(theta) * dist,
      size,
      angle: dab.angle + (r(3) - 0.5) * 2 * Math.PI * s.angleJitter,
      aspect: dab.aspectRatio,
      flowScale: 1 - s.flowJitter * r(4),
    })
  }
  return out
}

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

/** A dab's seed, folded from the float32 bit patterns of its recorded
 *  position and pressure.
 *
 *  float32 because that is what the log stores (dabCodec packs every field with
 *  Math.fround): the live client holds the unrounded doubles, the replaying one
 *  the rounded ones, and hashing the doubles would give the two different
 *  splatters. Rounding first makes them the same bits. */
export function brushDabSeed(x: number, y: number, pressure: number): number {
  let h = 0x811c9dc5
  for (const v of [x, y, pressure]) {
    f32[0] = v
    h = Math.imul(h ^ u32[0], 0x01000193) >>> 0
  }
  return h >>> 0
}

// ─── Mixer (#573) ───────────────────────────────────────────────────────────

/** What the smudge pipeline needs to paint as a mixer brush instead of a
 *  plain stump. */
export interface MixerPaint {
  color: [number, number, number]
  /** Fraction of the brush colour folded into the carried imprint per radius
   *  travelled (and in full on the gesture's first dab — a brush arrives on
   *  the canvas loaded). */
  load: number
  /** Fraction of what is under the brush picked up per radius travelled. */
  pickup: number
  /** Deposit strength per radius travelled, before pressure. */
  strength: number
  /** Whether pressure scales the deposit (the opacity switch). */
  pressure: boolean
  /** Brush size normalization (PencilPreset.sizeMultiplier). */
  sizeMultiplier: number
  /** The pressure curve the deposit follows when `pressure` is on. */
  curve: BrushCurve
}

export function digitalBrushMixer(
  presetName: string | undefined, color: [number, number, number],
): MixerPaint | null {
  const brush = digitalBrushFromPreset(presetName)
  if (brush.model !== 'mixer' || !brush.mixer) return null
  return {
    color,
    load: brush.mixer.load,
    pickup: brush.mixer.pickup,
    strength: brush.mixer.strength,
    pressure: digitalBrushPressureFromPreset(presetName).opacity,
    sizeMultiplier: 1 / Math.max(brush.tip.aspect, 1),
    curve: brush.opacityByPressure,
  }
}

// ─── Determinism helper (ADR 013 §6) ────────────────────────────────────────

/** A stable 0..1 pseudo-random value from a seed and an index.
 *
 *  Used by scatter and jitter (#573, brushStampsForDab), seeded by the dab's own
 *  recorded position. The rule predates its first user on purpose: it had to
 *  exist before the first brush that needed it, not after `Math.random()` had
 *  found its way into a dab's geometry — which would mean the teacher's stroke
 *  draws differently on the student's screen, and undo/replay would not
 *  reproduce the mark it just erased (ADR 002).
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
