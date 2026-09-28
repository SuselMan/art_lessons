import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { gain, PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, type PressureResponse } from './brushPenPresets'
import { anchoredAngleShaping, tiltOrPathAngle, DEFAULT_NIB_ANCHOR,
  type DabShapingProfile, type HeadTaperProfile, type TipBendProfile } from './dabShaping'
// Type-only, so it is erased and cannot join the import cycle this file's
// header warns about. The config is not marker-specific any more (#489).
import type { NibAngleConfig } from './markerPresets'
import type { PencilPreset } from './pencilPresets'
import { DEFAULT_WATERCOLOR_PIGMENT, isWatercolorPigmentCode } from './watercolorPigments'

// #468, ADR 011: watercolor. Started as an experiment outside the release
// track; since 2026-08-18 it ships in the first release (docs/MANIFESTO.md's
// own dated note, and docs/TOOLSET.md). What is still open before that release
// is listed in #314 §9 — chiefly that the composite has never been checked for
// pixel-identical output across two GPUs, which for a shared canvas is a
// correctness question and not a polish one.
//
// This file and dabShaping.ts import from each other, the same safe circular
// edge markerPresets.ts and brushPenPresets.ts already document: everything
// crossing the boundary is either a function declaration (hoisted at link
// time) or a type-only import (erased outright). Never add a top-level `const`
// re-export across it.
//
// The one thing to understand before reading any number here: **this is not a
// fluid simulation.** A watercolor stroke is a pure function of its own dabs
// and the paper, exactly like a marker stroke, because the Operation Log
// requires it (ADR 011 §2). Everything below buys the *look* of a wash out of
// per-stroke quantities the ribbon rasterizer already accumulates — there is
// no water, no drying clock, and no state shared between two strokes.
//
// Geometrically this tool is the brush pen: a soft round nib whose contact
// patch opens up several-fold under hand pressure, swept as a ribbon. That is
// what a loaded round sable does too, and #455 split the rasterizer from the
// ink model precisely so a second tool could take one without the other. What
// makes it read as watercolor instead of ink is entirely in the deposit model
// (DAB_FRAG's u_inkMode = 9) and in three constants below.

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

// ─── Preset (ADR 011 §5) ────────────────────────────────────────────────────

/** Transparency is the whole material. Where the brush pen sits at 0.97 —
 *  a covering ink — a single watercolor pass must leave the paper plainly
 *  visible through it, and reach depth only by being glazed over.
 *
 *  0.77 is the *ceiling* — what a pass lays down when the saturation curve is
 *  fully resolved. Raised from v3's 0.42 in v4: pigment now moves that curve
 *  instead of being pinned at its top, so a mid-pigment pass no longer reaches
 *  the ceiling and the whole tool went pale when the level became a real
 *  control. Set by measurement: a mid-pigment ("damp") bar now reads at about
 *  the same depth against paper that v3's flat pass did, so the three named
 *  mixes spread either side of where the tool used to sit rather than all
 *  landing below it. This is the single number to reach for first if it reads
 *  too strong or too weak overall.
 *
 *  #468 v11 — 0.77, up from 0.64, and it buys nothing on its own. The
 *  saturation curve was lengthened so that a wash sits below its end rather
 *  than pinned at it (WATERCOLOR_SATURATE_INK, and §11 for why a rim needs the
 *  headroom); that alone would have made every wash paler by the same factor.
 *  This puts the tone back exactly where it was — measured against the graded
 *  wash, which reads 105.2 to 31.7 against 106.7 to 32.8 before the pair of
 *  changes.
 *
 *  `hardness` is inert here for the same reason it is inert for the brush pen:
 *  it drives DAB_FRAG's soft-profile edge, and a ribbon tool's silhouette is
 *  geometry instead. Carried at the brush pen's value rather than an accidental
 *  one. */
//  #536 — 0.99, up from 0.77, and it buys nothing on its own. The composite's
//  density curve stopped being a smoothstep pinned at its top and became a
//  Beer-Lambert film that an ordinary pass leaves at about 0.78; without this
//  every wash would simply have gone a quarter paler. 0.77 / 0.78 puts the tone
//  back exactly where it was — the effective alpha of the default mix is 0.462
//  before and after — while everything that modulates the deposit can now be
//  seen, which was the entire point of the change.
export const WATERCOLOR_PRESET: PencilPreset = { opacity: 0.99, hardness: 0.88, sizeMultiplier: 1.0 }

// ─── Pressure → width (ADR 011 §5) ──────────────────────────────────────────

/** Higher than the brush pen's 0.15. A pen nib is a stiff sliver that really
 *  does draw a hairline at the lightest touch; a round brush carrying water
 *  keeps a rounded belly in contact no matter how lightly it is laid down, and
 *  cannot be coaxed below roughly a third of its own width without being
 *  turned on its tip — which is a different technique, not a lighter touch. */
const WATERCOLOR_WIDTH_FLOOR = 0.32

/** Same reason as BRUSH_PEN_MIN_PRESSURE: tablets emit unstable near-zero
 *  pressure in the first samples after contact, and without a floor the head of
 *  every stroke breaks up. Identical value — this is a property of the digitiser,
 *  not of the brush. */
const WATERCOLOR_MIN_PRESSURE = 0.05

/** Same three named feels the brush pen offers (#454, and #409's tilt responses
 *  before it), same curve, same k. Re-exported under this tool's own name so a
 *  future divergence has somewhere to land without touching call sites. */
export const WATERCOLOR_PRESSURE_RESPONSES = PRESSURE_RESPONSES
export const DEFAULT_WATERCOLOR_RESPONSE = DEFAULT_PRESSURE_RESPONSE

const WATERCOLOR_RESPONSE_K: Record<PressureResponse, number> = {
  soft:   1.05,
  normal: 1.35,
  firm:   1.80,
}

/** Width as a fraction of the nominal size, for an already-floored pressure. */
export function watercolorWidth(pressure: number, response: PressureResponse): number {
  return WATERCOLOR_WIDTH_FLOOR + (1 - WATERCOLOR_WIDTH_FLOOR) * gain(pressure, WATERCOLOR_RESPONSE_K[response])
}

/** A wet brush is heavier and slower than a pen nib, and its own load damps
 *  hand tremor before the paper ever sees it.
 *
 *  #482: expressed as a distance, like every other input filter now, and the
 *  move corrected a claim as well as a unit. This shipped as a per-sample
 *  weight of 0.55, documented as smoothing "harder than the brush pen's 0.35"
 *  with a test asserting `> 0.35` — both backwards, because the filter is
 *  `y += (u - y) * k` and a larger k tracks the input *more* closely. So the
 *  wet brush was in fact the twitchier of the two.
 *
 *  Converted rather than retuned: 0.55 at the reference the pen's own 10 px was
 *  picked against (500 px/s on a 120 Hz stylus, samples ~4.2 px apart) is
 *  5.3 px. That is deliberately still shorter than the pen's 10 px — i.e. the
 *  documentation was wrong and the number stays — because changing how someone
 *  else's live experiment feels is not this branch's business. What is fixed is
 *  that the number now means the same thing on every device. */
const WATERCOLOR_PRESSURE_SMOOTHING_PX = 5.3

/** #482: profile data rather than a post-pass. Barely a taper at all — a
 *  loaded brush lands rather than arrives at a point. */
export const WATERCOLOR_HEAD_TAPER: HeadTaperProfile = { startScale: 0.72, lengthPx: 6 }

// ─── Dab shaping ────────────────────────────────────────────────────────────

function watercolorShapingFor(response: PressureResponse): DabShapingProfile {
  return {
    size:   pressure => watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response),
    // Slightly more tilt-driven ovality than the brush pen's 0.25: laying a
    // round brush over genuinely does broaden its footprint into an oval, and
    // that is how a wash is actually laid. Still nowhere near enough for tilt
    // to compete with pressure for control of the width — the moment it does,
    // this stops being a brush and starts being a charcoal stick.
    aspect: tiltNorm => 1 + 0.40 * tiltNorm,
    angle:  tiltOrPathAngle,
    pressureSmoothingPx: WATERCOLOR_PRESSURE_SMOOTHING_PX,
    // #482, ADR 012 §8 — same move as the brush pen's, same reason.
    headTaper: WATERCOLOR_HEAD_TAPER,
  }
}

// ─── Nibs (#489) ────────────────────────────────────────────────────────────
//
// Until now this tool had exactly one nib and spent no part of its preset
// string on saying so. Three now, and the vocabulary is deliberately the same
// word the marker uses for the same shape: after #482 a nib is a shape a tool
// wears, not a property of the tool, and two names for one shape would put that
// back.
//
//   round   the brush as it shipped — a soft round belly that opens under
//           pressure. Still the default, and still what every stroke recorded
//           before this parses as.
//   chisel  a flat. A painter calls it that; the token stays `chisel` so the
//           marker's flat side and this one are one word.
//   flex    a pointed brush that bends and trails, the brush pen's nib wet.
export const WATERCOLOR_NIBS = ['round', 'chisel', 'flex'] as const
export type WatercolorNib = (typeof WATERCOLOR_NIBS)[number]
export const DEFAULT_WATERCOLOR_NIB: WatercolorNib = 'round'

export function isWatercolorNib(v: string): v is WatercolorNib {
  return (WATERCOLOR_NIBS as readonly string[]).includes(v)
}

/** Fifth field of the preset string, absent from every stroke recorded before
 *  #489 — which therefore replay as the round brush they were drawn with. */
export function watercolorNibFromPreset(presetName: string | undefined): WatercolorNib {
  const token = presetName?.split(':')[4]
  return token && isWatercolorNib(token) ? token : DEFAULT_WATERCOLOR_NIB
}

// ─── The flat (#489) ────────────────────────────────────────────────────────
//
// A flat brush is not a wet marker chisel, and the difference is the one thing
// worth getting right here. A felt chisel is a solid wedge: its footprint is a
// fixed 5:1 and pressing it only scales the whole thing. A flat brush is a row
// of hairs held in a ferrule — the ferrule sets the *width* and does not move,
// while pressing splays the hairs and lengthens the patch along the handle. So
// pressure drives its **proportions**, not its scale, which is why `aspect`
// needed pressure at all (dabShaping.ts's own note).
//
// That falls out as: `size` is the thickness and `aspect` is exactly its
// reciprocal, so the long axis stays at the nominal size whatever the pressure.
// The number in the toolbar is therefore the broad edge — the width of the mark
// the flat side lays down — which is both what a brush is sold by and the same
// rule #336 settled for the marker's chisel.
//
// Held on edge a real flat lays a line thinner than this floor, but that is a
// technique (turning the brush up on its corner), not a lighter touch — the
// same distinction WATERCOLOR_WIDTH_FLOOR is drawn on for the round nib.
const WATERCOLOR_FLAT_THICKNESS_FLOOR = 0.18
/** Fully loaded and pressed. Still elongated: a flat that reaches 1:1 has
 *  stopped being a flat — and the first pass put this at 0.55, which by that
 *  same standard had very nearly stopped. It reads as 1.85:1 under a firm hand
 *  and 2.1:1 under an ordinary one, and the whole point of picking a flat is
 *  that it does not look like the round brush next to it. 0.40 keeps it at
 *  about 2.5:1 pressed, which is where a real one that is being leaned on
 *  sits. */
const WATERCOLOR_FLAT_THICKNESS_CEIL = 0.40

function watercolorFlatThickness(pressure: number, response: PressureResponse): number {
  const p = Math.max(pressure, WATERCOLOR_MIN_PRESSURE)
  return WATERCOLOR_FLAT_THICKNESS_FLOOR
    + (WATERCOLOR_FLAT_THICKNESS_CEIL - WATERCOLOR_FLAT_THICKNESS_FLOOR) * gain(p, WATERCOLOR_RESPONSE_K[response])
}

// ─── The flexible round (#489) ──────────────────────────────────────────────
//
// The brush pen's nib, wet. Not a copy of its numbers: every one of them moves
// the same way and for one reason, which is that a loaded sable is heavier and
// more compliant than a synthetic tip built to spring back. So it bends
// further, it takes longer to come round, and it drags its load further behind
// the hand. Stating the direction is the point — the magnitudes are a first
// pass like everything else here, and if they are wrong they should be wrong
// consistently rather than each having drifted on its own.
//
// Everything else is the round nib unchanged: same width response, same tilt
// ovality, same head taper. This *is* the round brush — bending is what a round
// brush does when you drag it, and #472 built that as a profile field precisely
// so a second tool could take it without taking the first tool's ink model.

/** Elongation at full pressure, against the pen's 0.85. */
const WATERCOLOR_FLEX_ELONGATION = 1.05
/** Distance the nib takes to come round, in its own widths — the pen's 1.5. A
 *  brush's fibres are longer relative to their width and carry water, and the
 *  lag is of the order of that length. */
const WATERCOLOR_FLEX_LAG_WIDTHS = 2.2
/** Floor under that, world px. Above the pen's 6 for the same reason the ratio
 *  is above its 1.5. */
const WATERCOLOR_FLEX_MIN_LAG_PX = 8
/** Trail at full speed and full bend, in nib widths. Well under the lag
 *  distance, and it has to be: the trail eases in over that distance, so a
 *  deeper one would grow faster than the dabs advance and hand the ribbon two
 *  consecutive dabs reversed along the path. 0.30 against 2.2 is nowhere near
 *  it — the same margin the pen keeps at 0.18 against 1.5. */
const WATERCOLOR_FLEX_TRAIL_WIDTHS = 0.30
/** A loaded brush starts to lag the hand sooner than a pen nib does (0.5/2.5):
 *  it is the water that lags, and there is more of it. */
const WATERCOLOR_FLEX_SPEED_SLOW = 0.35
const WATERCOLOR_FLEX_SPEED_FAST = 2.0

function watercolorFlexTipBend(response: PressureResponse): TipBendProfile {
  return {
    // The same curve as the width and with the same k, for the reason the pen
    // gives at length: one deformation is happening, and width and length are
    // two views of it, so a brush described as "firm" should be as reluctant to
    // lengthen as it is to widen.
    elongation: pressure =>
      1 + WATERCOLOR_FLEX_ELONGATION * gain(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), WATERCOLOR_RESPONSE_K[response]),
    lagWidths: WATERCOLOR_FLEX_LAG_WIDTHS,
    minLagPx: WATERCOLOR_FLEX_MIN_LAG_PX,
    trailWidths: speed => WATERCOLOR_FLEX_TRAIL_WIDTHS
      * clamp01((speed - WATERCOLOR_FLEX_SPEED_SLOW) / (WATERCOLOR_FLEX_SPEED_FAST - WATERCOLOR_FLEX_SPEED_SLOW)),
  }
}

function watercolorFlexShaping(response: PressureResponse): DabShapingProfile {
  // Built from watercolorShapingFor rather than by spreading the round table:
  // both tables are evaluated at module load, and this one is above it, so
  // reading it here is a temporal dead zone — the same trap this file's own
  // header warns about for the import cycle, in local form. The factory is a
  // function declaration and is hoisted, so it is safe at any point.
  return { ...watercolorShapingFor(response), tipBend: watercolorFlexTipBend(response) }
}

const WATERCOLOR_FLEX_BY_RESPONSE: Record<PressureResponse, DabShapingProfile> = {
  soft:   watercolorFlexShaping('soft'),
  normal: watercolorFlexShaping('normal'),
  firm:   watercolorFlexShaping('firm'),
}

/** ADR 004 §1's ~45deg, the same default the marker's chisel falls back to —
 *  one shape, one resting angle.
 *
 *  A function, and it has to be. This file and dabShaping.ts import each other,
 *  and the header above states the rule: only function declarations and
 *  type-only imports may cross that edge. `anchoredAngleShaping` is a
 *  declaration and is hoisted; `DEFAULT_NIB_ANCHOR` is a `const`, so reading it
 *  while this module's body runs is a read into dabShaping's temporal dead zone
 *  whenever dabShaping is the module entered first.
 *
 *  Which is exactly what happened — the browser threw "Cannot access
 *  DEFAULT_NIB_ANCHOR before initialization" on the first real page load, with
 *  the whole suite green, because a test file entering through this module
 *  finishes dabShaping before this body runs and never sees it. Deferring the
 *  read to call time is the fix; the rule in the header is why it was avoidable
 *  in the first place. */
function watercolorDefaultNibAngle(): NibAngleConfig {
  return { angle: Math.PI / 4, anchor: DEFAULT_NIB_ANCHOR }
}

function watercolorChiselShaping(response: PressureResponse, nibAngle: NibAngleConfig): DabShapingProfile {
  return {
    size:   pressure => watercolorFlatThickness(pressure, response),
    // Tilt ignored outright, unlike the round nib's 1 + 0.40 * tiltNorm. Laying
    // a round brush over genuinely broadens its footprint because the belly is
    // what touches; a flat's footprint is a row of hairs in a ferrule, and
    // leaning it rocks it onto a corner rather than widening it. Modelling that
    // rocking is a real thing to do and is not this pass.
    aspect: (_tiltNorm, pressure) => 1 / watercolorFlatThickness(pressure, response),
    angle:  anchoredAngleShaping(nibAngle.angle, nibAngle.anchor),
    pressureSmoothingPx: WATERCOLOR_PRESSURE_SMOOTHING_PX,
    headTaper: WATERCOLOR_HEAD_TAPER,
  }
}

const WATERCOLOR_SHAPING_BY_RESPONSE: Record<PressureResponse, DabShapingProfile> = {
  soft:   watercolorShapingFor('soft'),
  normal: watercolorShapingFor('normal'),
  firm:   watercolorShapingFor('firm'),
}

/** Same free `presetName` slot the brush pen uses for its pressure response,
 *  and for the same reason (#454): no size ladder and no nib list means the
 *  per-stroke string that carries a pencil grade or a marker nib is available,
 *  so the setting rides the recorded StrokeOperation with no new field. A peer
 *  replays the stroke with the response it was drawn with, not whatever they
 *  have selected. */
export function watercolorResponseFromPreset(presetName: string | undefined): PressureResponse {
  // First field only since v4: the string is `response:water:pigment` now (see
  // watercolorPresetString). A bare `normal` — every watercolor stroke recorded
  // before v4 — still parses, because split() on a string with no separator
  // returns the whole thing as its first element.
  const token = presetName?.split(':')[0]
  return token && isPressureResponse(token) ? token : DEFAULT_WATERCOLOR_RESPONSE
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'watercolor'.
 *
 *  Only the round nib comes out of the prebuilt table: the flat's angle is a
 *  live per-stroke setting, so it is a factory for exactly the reason the
 *  marker's chisel is one (markerPresets.ts's own note). Every other nib stays
 *  a lookup that allocates nothing, which is what #309 cleared this path for. */
export function shapingForWatercolorPreset(
  presetName: string | undefined, nibAngle?: NibAngleConfig,
): DabShapingProfile {
  const response = watercolorResponseFromPreset(presetName)
  const nib = watercolorNibFromPreset(presetName)
  if (nib === 'chisel') return watercolorChiselShaping(response, nibAngle ?? watercolorDefaultNibAngle())
  if (nib === 'flex') return WATERCOLOR_FLEX_BY_RESPONSE[response]
  return WATERCOLOR_SHAPING_BY_RESPONSE[response]
}

// ─── Water and pigment (#468 v4, ADR 011 §4) ───────────────────────────────
//
// v4's central idea, and the first thing here that is a *model of a brush*
// rather than a rendering effect: the brush carries two independent quantities,
// and almost everything the tool does is a consequence of their ratio.
//
//   WATER   how much liquid the brush is carrying
//   PIGMENT how much paint is dissolved in that liquid
//
// One "wetness" slider cannot express this, because the interesting states are
// not on a line:
//
//   little water, little pigment  — a weak, nearly spent brush
//   little water, much pigment    — DRY BRUSH: saturated, broken, scratchy
//   much water,   little pigment  — a very pale, far-spreading wash
//   much water,   much pigment    — a deep wet flood
//
// Water must not act as opacity. It governs *geometry and behaviour* — how far
// the wash travels past the brush, how soft its edges are, how coarsely it
// pools, how likely a tideline is, and whether the paper's relief breaks the
// contact at all. Pigment governs *how much paint* — colour density,
// granulation, how much settles at the tideline. Route either one into the
// other and the tool collapses back into an opacity brush.

export interface WatercolorMix {
  /** 0..1 */
  water: number
  /** 0..1 */
  pigment: number
}

export const WATERCOLOR_MIX_DEFAULT: WatercolorMix = { water: 0.55, pigment: 0.60 }

/** The three named states the tool ships with. A user who never opens the two
 *  sliders still gets three genuinely different brushes, which is the point:
 *  the parameters exist so that presets can mean something, not so that
 *  everyone has to tune them. */
export const WATERCOLOR_MIX_PRESETS = ['dry', 'damp', 'wet'] as const
export type WatercolorMixPreset = (typeof WATERCOLOR_MIX_PRESETS)[number]

export const WATERCOLOR_MIX_BY_PRESET: Record<WatercolorMixPreset, WatercolorMix> = {
  // Little water, much pigment. The brush is barely damp, so it only reaches
  // the crests of the paper and lays a broken, scratchy, strongly coloured
  // mark — the state the test sheet had no example of at all before v4.
  dry:  { water: 0.18, pigment: 0.88 },
  damp: { water: 0.55, pigment: 0.60 },
  // Much water, less pigment: a flood that travels well past the brush and
  // dries pale, with tidelines wherever it happened to sit still.
  wet:  { water: 0.92, pigment: 0.42 },
}

export function isWatercolorMixPreset(v: string): v is WatercolorMixPreset {
  return (WATERCOLOR_MIX_PRESETS as readonly string[]).includes(v)
}

// ─── What water controls ────────────────────────────────────────────────────

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Everything water decides, resolved in one place so the relationships are
 *  legible side by side rather than scattered across a profile literal. */
export function watercolorWaterEffects(water: number): {
  spreadOfRadius: number
  edgeSoft: number
  edgeWander: number
  cloud: number
  tideLo: number
  tideHi: number
  dryContact: number
} {
  return {
    // How far the wash leaves the brush's footprint, as a fraction of the
    // stroke's radius. A dry brush barely leaves it at all — its mark really is
    // the contact patch — while a flood travels visibly further than the hand
    // went, which is the single strongest cue that this is not a marker.
    spreadOfRadius: mix(0.10, 0.42, water),
    // #468 v8, ADR 011 §8 — how softly the boundary resolves. Water's number
    // outright now, not a ceiling that noise picks a value under.
    //
    // That difference is the whole revision. With noise choosing, a mark's edge
    // came out hard here and lost there for no reason the hand could see or
    // repeat — so "leave this edge hard, soften that one", an exercise anyone
    // is set in their first week, was not something the tool could do. Now the
    // setting decides and noise only wobbles it.
    edgeSoft: mix(0.05, 0.40, water),
    // How far the boundary may wander off the brush's own outline, as a
    // fraction of the blur it is thresholded against. Dry paint goes where it
    // is put; a flood finds its own shape.
    //
    // Also water's number rather than a fixed wide range. v2 through v7 spent
    // 0.10..0.62 of the blur on noise regardless of the mix, so even a nearly
    // dry brush produced a boundary that ignored the hand — exactly the
    // complaint that procedural fields, and not the user, were deciding what
    // the mark looked like.
    edgeWander: mix(0.05, 0.42, water),
    // Coarse pooling. More liquid means more room for it to gather unevenly.
    //
    // #468 v9 — down to 0.04..0.19, from 0.16..0.52 in v4-v7. At the old range a
    // damp wash swung +/-22% in tone, which measured as the single largest
    // source of unevenness in a flat wash and is far more than the exercise
    // tolerates. Every reduction here was made against that measurement.
    // This is the material's texture, not its main event: it should be visible
    // when looked for and invisible when the task is "lay an even tone".
    cloud: mix(0.04, 0.19, water),
    // The band the tideline's gating field is thresholded against. A dry mark
    // has almost no perimeter with a rim (there was never a pool to retreat);
    // a wet one has a rim over most of it. Narrow band, high threshold = rare.
    tideLo: mix(0.72, 0.24, water),
    tideHi: mix(0.96, 0.60, water),
    // How strongly the paper's own relief breaks the contact. 0 above about
    // 0.62 water: a loaded brush floods the valleys and touches everything.
    // Below that it rises fast, and by 0.2 the brush is riding the crests.
    // (s17.29) 0.22-0.55, from 0.20-0.62: series 6 - at 0.21 water the
    // photograph's mark is broken over its whole length, at 0.36 it is a
    // film with the tooth breaking through only where the brush ran fast.
    dryContact: 1 - smoothstepJs(0.22, 0.55, water),
  }
}

/** Everything pigment decides.
 *
 *  Note what is *not* here: any multiplier on the composite's own opacity.
 *  Pigment reaches the finished pixel through exactly one route — how much
 *  paint the deposit lays down, which feeds the saturation curve. An early v4
 *  had it scale the composite as well, and the tool immediately went pale and
 *  flat: the same double-counting that made the opacity slider quarter a mark
 *  when it was meant to halve it (see RibbonProfile.depositPerRadius). One
 *  quantity, one route. */
export function watercolorPigmentEffects(pigment: number): {
  depositPerRadius: number
  granulation: number
  wetEdge: number
  strength: number
} {
  return {
    // How much paint each radius of travel lays down — the quantity that feeds
    // the saturation curve. **A constant, not pigment's number.**
    //
    // Pigment used to drive this, which put a pale wash low on the saturation
    // curve — the steep part, where every fluctuation in the deposit turns into
    // a visible fluctuation in tone. Measured: dropping the deposit to get a
    // usable graded wash pushed a flat wash's unevenness from 4.8% to 8.4%. The
    // two exercises want opposite things from this one number, so it stopped
    // being one number: pigment now reaches the pixel only through `strength`
    // below.
    //
    // (The v9 edit that was supposed to do this failed to write, and the file
    // kept the old line for a revision while the commit message said otherwise
    // — so pigment really was acting twice again, the exact fault v4 removed.
    // Caught by re-reading the constants out of the source rather than
    // trusting the changelog.)
    //
    // Held high enough that an ordinary pass saturates, so the wash's tone is
    // *insensitive* to how the deposit wobbles — which is what a flat wash
    // needs. Depletion still scales it, so a brush running dry still thins;
    // what it no longer does is decide how strong the paint is.
    depositPerRadius: 1.05,
    // Heavy pigment granulates; a dilute wash barely does.
    // (s17.30) 0.10 at full pigment, from 0.26: A/B on Ilya's series 1 and 3
    // (clean replay against the photographs) - the body's mottle was this,
    // not the cloud (cloud off changed nothing, granulation off gave a flat
    // plastic film). The photographs' body is calm with a faint grain; 0.26
    // read as "процедурная пятнистость по всей плёнке" (the design thread).
    granulation: mix(0.03, 0.10, pigment),
    // How much settles at the drying perimeter. There is nothing to leave
    // behind in nearly clear water.
    wetEdge: mix(0.22, 0.72, pigment),
    // How strong the paint is, applied once, at the composite (#468 v9).
    //
    // v4 removed a multiplier here because pigment was *also* driving the
    // deposit, and two routes for one quantity made the control quadratic — the
    // same fault the opacity slider had. The principle is unchanged; what
    // changed is which single route it takes. This one is linear in the setting
    // and independent of where the saturation curve happens to sit, so a graded
    // wash grades evenly instead of doing nothing across the top of the slider
    // and falling off a cliff at the bottom.
    //
    // (#536) The floor is **zero**, down from 0.12, and that is a control being
    // made honest rather than a number being retuned. At 0.12 the bottom of the
    // slider still painted: "no pigment" laid a pale wash, so the one technique
    // the two-axis brush exists to make possible — lay clean water, then take
    // paint into it — could not be expressed at all, because there was no way
    // to put down water alone. Zero pigment now means zero pigment mass, and
    // what the stroke leaves behind is wetness (see the paper-wetness field),
    // which is exactly what clean water leaves on paper.
    strength: mix(0.0, 1.0, pigment),
  }
}

/** (#536, ADR 011 §17.4) This stroke's own offset into the wash's mottling
 *  field, from its recorded id.
 *
 *  Derived rather than stored: `strokeId` is already on the operation and on
 *  the live packet, so the author, every peer and every replay resolve the
 *  identical pair without a byte of new payload — and two strokes over the same
 *  patch resolve different ones, which is the entire point. A field anchored to
 *  the paper instead of to the stroke is a texture nothing can repaint, which
 *  is what a whole sheet of it looked like before this existed.
 *
 *  Any cheap avalanche over the characters will do; what matters is that it is
 *  a pure function of the id and spreads similar ids apart — nanoid gives us
 *  strings differing in one character, and those must not land on neighbouring
 *  offsets. */
export function mottleSeedFromStrokeId(strokeId: string | undefined): [number, number] {
  if (!strokeId) return [0, 0]
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < strokeId.length; i++) {
    const c = strokeId.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b + c + i, 0x85ebca6b) >>> 0
  }
  // Into a range wide enough that two strokes land in unrelated parts of the
  // noise, and finite enough that float precision in the shader is unbothered.
  return [(a % 100000) / 97.0, (b % 100000) / 89.0]
}

/** GLSL's smoothstep, in JS. */
function smoothstepJs(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// ─── Load, and how it runs out ──────────────────────────────────────────────
//
// Both quantities deplete along the stroke, and — this is the whole point of
// separating them — at *different rates*. Water leaves fast: it soaks into the
// paper and evaporates. Pigment stays on the hairs much longer.
//
// So a single long stroke walks through the states by itself:
//
//   wet and saturated  →  ordinary  →  dry and still strongly pigmented
//                                       →  broken, scratchy dry brush
//
// That progression is a behaviour, not an effect, and it is very far from a
// marker. Both are integrated in units of the brush's *own radius* rather than
// in pixels, so one pair of constants describes a 12px brush and a 120px one.

/** Water goes first. 20 radii is roughly a long single sweep. */
//  #536 — 12, from 20. "Кисть явно должна кончаться быстрее" after the first
//  build where the depletion was visible at all; the previous numbers were
//  chosen when none of it reached a pixel.
//  (#536, §17.21) 20 again, from 12. The 12 was chosen when the only thing
//  the water clock showed was the mark, and the pigment still ran 48 radii
//  with a floor; the pigment run has since come down to 32/8 with no floor,
//  and now that the standing water is drawn from the same clock, 12 made the
//  puddle end long before the mark did: "вода заканчивается гораздо быстрее
//  чем штрих".
const WATER_RUN_RADII = 20
/** (#536, §17.18) 0.04, from 0.22. The old floor meant a brush never ran
 *  dry along a stroke — "почему вода в кисти не заканчивается никогда?" — so
 *  the dry-brush tail (contact breaking up, hairs showing) could not happen
 *  on a long line. Near zero now: a brush dragged three runs is dry, and the
 *  hand reloads at the next pen-down anyway (the load resets per stroke). */
const WATER_FLOOR = 0.04

/** Pigment outlasts water by better than two to one, which is what produces the
 *  dry-brush end of a stroke rather than a stroke that simply fades.
 *
 *  #468 v9 — the floor is 0.84, up from 0.66, and the reason is the flat-wash
 *  exercise. At 0.66 a single band 40 radii long lost a fifth of its tone from
 *  end to end; bands are laid in alternating directions, so that falloff became
 *  a zigzag *across* the finished wash and was the second largest contributor
 *  to its unevenness (measured, after the cloud field).
 *
 *  A real painter recharges the brush between bands, which the model already
 *  does — the load resets per stroke. What was wrong was how much one band
 *  could lose on its own. Water still runs down hard, so the dry-brush arc
 *  survives; it is the *paint* that now barely thins. */
//  #536 — 14 radii and a floor of 0.40, from 48 and 0.84. Ilya, with a real
//  brush: the paint runs out *before* the water does, and an arbitrarily long
//  line has to change along its length. Both were true of the model on paper
//  and neither was visible, because the deposit sat above the composite's
//  saturation ceiling and a sixteen per cent change in it moved no pixels at
//  all. With the curve fixed the depletion is worth having again, so it is
//  restored to something a hand can see.
//
//  This deliberately re-opens the trade v9 closed. The flat-wash exercise is
//  what pushed the floor to 0.84: bands are laid in alternating directions, so
//  a band losing a fifth of its tone end to end became a zigzag across the
//  finished wash. The counter-argument is that a painter recharges the brush
//  between bands and the model already resets the load per stroke, so what is
//  left is how much one band may lose — and that is now a number to be measured
//  against the exercise rather than assumed safe.
//
//  (#536, ADR 011 §17.14) Two runs now, by the brush's water, and NO floor.
//  Ilya with a wet brush: "пигмент очень быстро расходуется, в жизни больше
//  пигмента на штрих выходит" — a line at full water faded in about nine
//  brush widths, where a loaded round brush gives forty to eighty. And with
//  the same brush scribbled in a puddle: "красится адски интенсивно" — which
//  was the floor: at 0.10 a brush never empties, and two hundred dabs on one
//  spot at ten per cent each is an infinite brush, saturating the deposit.
//  One quantity, wrong at both ends. The structural fix is the budget: with
//  the floor at zero the pigment a stroke can deliver is the integral of the
//  curve, rate × run, whatever path it travels — a scribble on the spot and a
//  straight line of the same length lay down the same mass, and neither can
//  exceed it (watercolorPresets.test.ts holds this as an invariant). The run
//  by water is then only how that finite mass is spread along the path:
//  water keeps dissolving paint out of the hairs, so a wet brush spends it
//  slowly and far, a dry one fast and near. A tuning shape, not a law — if
//  the wet line lives too long, only the spread changes, never the amount.
const PIGMENT_RUN_DRY_RADII = 8
// (s17.28) 80, from 32: on Ilya's photographs a loaded wet stroke of sixteen
// radii is nearly one tone end to end (a tenth lighter at the lift), where 32
// lost a third of it; the dry run stays short - his dry strokes do fade.
const PIGMENT_RUN_WET_RADII = 80

// ─── The touch-down (#536) ──────────────────────────────────────────────────
//
// Ilya, with a real brush in his hand: more pigment goes down at the start of
// a stroke than later. He is right, and the model had none of it — pigment
// barely thins at all along a stroke, and deliberately so (PIGMENT_FLOOR's own
// note: a long band losing a fifth of its tone turned into a zigzag across a
// flat wash, and the floor was raised to 0.84 to kill it).
//
// So the two demands pull the same number in opposite directions, and the way
// out is that they are not the same number. What a loaded brush does is not
// *fade along its length*; it dumps its surplus in the first moment of contact
// and then runs at a steady rate. Two terms at two spatial scales:
//
//   this one   a short surplus over the normal dose, gone within a radius or
//              two of the touch-down;
//   the run    the existing long, nearly flat depletion, unchanged.
//
// A band forty radii long therefore has no gradient down it — the zigzag does
// not come back — while the head of every mark reads a little heavier, which is
// what the hand sees.

/** How much extra the brush dumps as it lands, as a fraction of the normal
 *  dose. Small: this must read as "the brush arrived carrying something", not
 *  as a separate dark segment at the start of the line. */
//  (#536, s17.20) 0.9, from 0.2, over 1.0 radii from 0.8. Ilya, twice: "в
//  начале штриха пигмент должен ложиться интенсивнее, в реальности начало
//  штриха выглядит насыщеннее всегда". A loaded brush does dump on landing.
//  (#536, s17.20, twice) 1.6, from 0.9, over 1.2 radii: "вначале штриха
//  должно ложиться больше пигмента всё ещё".
// (s17.37) Split by the dwell test: a touch with no pause is only a little
// darker than the body (base), a pause unloads the reservoir (dwell part,
// at full saturation). The photograph's dwell puddle is ~2x the body.
const WATERCOLOR_START_EXCESS_BASE = 0.3
const WATERCOLOR_START_EXCESS_DWELL = 1.8

/** How fast that surplus is spent, in the brush's own radii. Under one radius
 *  on purpose. Two to four radii — the first number reached for — is a
 *  perfectly readable *piece of the mark*, and a flat wash is a series of
 *  bands, so at that length the wash would grow a periodic dark head at every
 *  stroke instead of a gradient down each one: the same spatial structure v9
 *  removed, just shorter. */
const WATERCOLOR_START_EXCESS_RADII = 1.2

/** The multiplier on the deposit at `usedRadii` into the stroke.
 *
 *  `landedWet` gates it, and gating on *the paper* rather than on "is this the
 *  same wash" is the point. A wash is a bookkeeping fact about time; what
 *  decides whether a brush dumps its load is whether it came down on dry paper
 *  or into standing water — a loaded brush lowered into a bead merges with it
 *  and dumps nothing. That rule then covers three cases with one predicate: the
 *  head of a mark on dry paper, a second pass over something still wet, and the
 *  sixth band of a flat wash laid up against the wet fifth. */
/** (s17.26) How much more pigment a wet sheet pulls out of the brush than a
 *  dry one: the water on the paper draws the paint out by capillarity, which
 *  is why a charge-in reads strong at the brush and feathers away, not pale.
 *  Without it the same brush laid the same dose into a puddle, the front
 *  spread it over three times the area, and a stroke into clean water came
 *  out at half a dry stroke's density (0.35 against 0.61). */
export function watercolorWetPull(paperWet: number): number {
  return 1 + WC_WET_PULL * clamp01(paperWet)
}
export const WC_WET_PULL = 1.0

/** (s17.27) How deep the water stands under a dab, as a share of the mark's
 *  standing level: 1 where the brush landed with its surplus (the puddle)
 *  and wherever it works into a wet wash, WC_FILM_STAND for the film it
 *  lays along the stroke. Two records the front reads apart (see the seed
 *  in WC_FIELD_OP_FRAG): the film's edge is the stroke's contour, the
 *  puddle's front dries last and runs ragged into the film. */
export function watercolorPuddleDepth(usedRadii: number, landedWet: number, paperWet: number, dwellMs = 0): number {
  // The landing puddle runs out over WC_PUDDLE_RADII of travel - slower than
  // the deposit's surplus (WATERCOLOR_START_EXCESS_RADII): the photographs'
  // dark start is one to two stroke widths long. None on a wet landing:
  // there the sheet's water is the puddle (the w term).
  // (s17.37) ...and none without a DWELL: a brush that lands and goes lays
  // a film from the first touch (the dwell test's first stroke has no
  // puddle edge); the puddle is what the standing brush's reservoir
  // leaves, by the time it stood.
  const e = watercolorDwellWater(dwellMs) * (1 - clamp01(landedWet)) * Math.exp(-usedRadii / WC_PUDDLE_RADII)
  const w = clamp01(paperWet / WC_PUDDLE_WET_FULL)
  return 1 - (1 - WC_FILM_STAND) * (1 - e) * (1 - w)
}
export const WC_FILM_STAND = 0.45
export const WC_PUDDLE_RADII = 3
export const WC_PUDDLE_WET_FULL = 0.5

/** (s17.28) The least a dab has to have moved from the last one DEPOSITED for
 *  it to deposit at all - a share of the nib's radius, never under a pixel
 *  and a half. The deposit is laid per unit of travel, and a pen held still
 *  is not still: the tablet reports it a pixel this way and that at 120 Hz,
 *  and DabSystem's spacing collapses to its 1 px floor at that speed, so a
 *  half-second dwell before the lift arrived as forty dabs a pixel apart -
 *  forty pixels of "travel" packed into one nib, a blob at every end of
 *  Ilya's strokes where the paper had a light lift. Sensor noise is not
 *  travel. A slow stroke that really moves crosses the quantum every few
 *  samples and loses nothing: the kept dab's travel is the whole distance
 *  from the last kept one. */
/** (s17.28) The deposit a stroke's FILM carries per texel, in units of the
 *  profile's depositPerRadius, before the brush's load and landing surplus.
 *  Under MAX blending (AccumulationBuffer.beginMaxDraw) a texel holds one
 *  stamp's value, so the value is the film itself, spacing-free; under the
 *  old additive sum it was seg/R per stamp and 2R/seg stamps deep. Set so
 *  the calibration stroke keeps D_body 0.6. */
export const WC_FILM_DOSE = 0.62

export function watercolorTravelQuantum(radiusPx: number): number {
  return Math.max(WC_TRAVEL_QUANTUM_MIN_PX, radiusPx * WC_TRAVEL_QUANTUM)
}
export const WC_TRAVEL_QUANTUM = 0.06
export const WC_TRAVEL_QUANTUM_MIN_PX = 1.5

export function watercolorStartExcess(usedRadii: number, landedWet: number, dwellMs = 0): number {
  const gate = 1 - clamp01(landedWet)
  // (s17.37) The surplus is mostly the brush's DWELL on landing: Ilya's
  // dwell test - no pause, a start only a little darker with no edge; a
  // pause, a dark landing puddle growing with it. A base for the moment
  // of contact, the rest by the time the brush stood.
  const dose = WATERCOLOR_START_EXCESS_BASE + WATERCOLOR_START_EXCESS_DWELL * watercolorDwellPigment(dwellMs)
  return 1 + dose * gate * Math.exp(-usedRadii / WATERCOLOR_START_EXCESS_RADII)
}
// ─── The landing dwell (#536, ADR 011 s17.37) ───────────────────────────────
//
// How long the brush stood at its landing before it moved (t_eff: the time
// the nib stayed within WC_DWELL_RADIUS of the landing point), and what it
// does: the reservoir unloads water and pigment while it stands, saturating
// as an exponential - the water faster than the pigment (the design thread's
// tau_w 0.35-0.6 s, tau_p 0.5-0.8 s). Both 0..1.
export const WC_DWELL_RADIUS = 0.3
export const WC_DWELL_TAU_WATER_MS = 450
export const WC_DWELL_TAU_PIGMENT_MS = 650
export function watercolorDwellWater(dwellMs: number): number {
  return 1 - Math.exp(-Math.max(dwellMs, 0) / WC_DWELL_TAU_WATER_MS)
}
export function watercolorDwellPigment(dwellMs: number): number {
  return 1 - Math.exp(-Math.max(dwellMs, 0) / WC_DWELL_TAU_PIGMENT_MS)
}

/** Water remaining after `usedRadii` radii of travel, as a fraction of the
 *  load the stroke started with.
 *
 *  `usedRadii` is a *path integral*: each segment contributes its own length
 *  divided by the radius the brush had over that segment, so a stroke that
 *  swells and thins under pressure depletes correctly rather than being
 *  measured against whatever its final width happened to be. The engine
 *  accumulates it across batches on the stroke's own scratch, which is what
 *  makes a live stroke, a one-shot replay and a chunked replay agree. */
export function watercolorWaterLoad(usedRadii: number): number {
  return WATER_FLOOR + (1 - WATER_FLOOR) * Math.exp(-usedRadii / WATER_RUN_RADII)
}

/** (#536, §17.21) Whether the brush's water runs out along a stroke at all:
 *  only when it carries pigment. A clean-water brush is a bottomless one —
 *  "вода без пигмента могла бы вообще не заканчиваться, удобно было бы для
 *  рисования по мокрому": wetting the sheet for wet-in-wet is one long
 *  gesture, and a puddle that stops where the clock says it does is a puddle
 *  the hand has to lay in instalments. The pigment clock is untouched — it is
 *  the paint that has to run out along a line, and a water brush has none. */
export function watercolorBrushRunsDry(pigment: number): boolean {
  return pigment > 0
}

// ─── Blooms and tidelines (#536, ADR 011 §17.23) ───────────────────────────
//
// Two things a puddle does that a diffusion cannot: pigment goes to the EDGE.
// While a stroke's own puddle dries, water flows to its rim and carries paint
// there — the tideline, a dark line round every dried wash. And a drop of
// water into a wash that is damp but not wet pushes the wash's paint outward
// to where the drop's water stops — the bloom, a light patch with a hard
// ragged dark edge ("cauliflower"). Both are advection down a water-pressure
// gradient, gated where the water ends; wetDiffusion.ts holds the oracle,
// WC_DIFFUSE_FRAG the GPU twin.

/** How strongly a mark laid into paper of recorded wetness `paperWet` blooms
 *  the wash under it: nothing on dry paper (a glaze), nothing on a wet one
 *  (the paint just mingles — bloom_sf_2632), the most on a damp one. */
export function watercolorBloomStrength(paperWet: number, pigmentLevel = 1): number {
  const w = clamp01(paperWet)
  const rise = smoothstepJs(WC_BLOOM_DAMP_LO, WC_BLOOM_DAMP_PEAK, w)
  const fall = 1 - smoothstepJs(WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, w)
  // (s17.39) Standing down on WET paper is for a loaded pass: its paint
  // mingles with the wash's and a flat wash keeps no inner rims (s17.25).
  // Clean water is a drop whatever the wash's state: it pushes the wash's
  // paint to its front. Ilya's water dabs into a fresh wash (landed 0.9,
  // bloom 0) were light spots made by the diffusion alone, each its own,
  // where the photograph shows one lightened pool with one soft rim.
  const water = 1 - clamp01(pigmentLevel)
  return rise * Math.max(fall, water * WC_BLOOM_WATER_ON_WET)
}
export const WC_BLOOM_WATER_ON_WET = 0.6
/** (s17.25) How completely a mark's water joins the puddle it lands in:
 *  one puddle has one drying front, so where this mark's front runs into
 *  an earlier mark's water there is no tideline at all - the passes of a
 *  flat wash merge, only the wash's outer contour keeps a rim. Nothing on
 *  dry or damp paper (a glaze and a bloom both keep their own edge), all
 *  of it on wet: the same wet threshold the bloom stands down at. */
export function watercolorPuddleMerge(paperWet: number): number {
  return smoothstepJs(WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, clamp01(paperWet))
}
/** (s17.26) How much of the bloom a brush's own pigment cancels: clean
 *  water pushes the wash's paint out to its front in full, a brush loaded
 *  with paint pushes a third as much - and lays its own on top, so a second
 *  pass of full paint into a damp wash reads darker, not paler. Ilya: "мокрое
 *  на мокром даже с полным пигментом делает лужу сильно светлее". */
export function watercolorBloomPush(pigmentLevel: number): number {
  return 1 - WC_BLOOM_PIGMENT_CANCEL * clamp01(pigmentLevel)
}
// (s17.43) 0.7 -> 1.0: a LOADED stroke into a wet wash does not bloom the
// wash at all. At 0.7 a full-pigment stroke still lifted a tenth of the
// earlier paint from under its dome and piled it at its domain's edge - the
// lighter band of the first colour inside the second ending in a crisp line
// that Ilya annotated twice ("чёткая линия смены цвета", "вот эта линия").
// The real cauliflower needs the brush wetter than the wash; clean water
// keeps the whole of it, a half-loaded brush half.
export const WC_BLOOM_PIGMENT_CANCEL = 1.0
/** (s17.26) How much a mark's own tideline stands down where it lies over an
 *  earlier mark that was still damp: a drying front needs dry paper to stop
 *  at, and over damp paper the water just keeps going - the only edge there
 *  is the bloom's. Rises from barely damp; complete well before wet. */
export function watercolorDampOver(paperWet: number): number {
  return smoothstepJs(WC_DAMP_OVER_LO, WC_DAMP_OVER_HI, clamp01(paperWet))
}
export const WC_DAMP_OVER_LO = 0.08
export const WC_DAMP_OVER_HI = 0.35
/** (s17.26) The standing water at which a mark's tideline is at full
 *  strength; below it the rim scales down - a nearly dry brush leaves next
 *  to no line. */
export const WC_TIDE_STANDING_FULL = 0.6
export const WC_BLOOM_DAMP_LO = 0.06
export const WC_BLOOM_DAMP_PEAK = 0.25
export const WC_BLOOM_WET_LO = 0.45
export const WC_BLOOM_WET_HI = 0.7
// ─── The water front (#536, ADR 011 §17.24) ────────────────────────────────
//
// Where a mark's water stops is decided by the sheet, not by the brush: the
// domain it wets is wider than the footprint, its edge runs ahead in the
// paper's valleys and stalls on its ridges, and that edge is where the
// tideline and a bloom's ring end up. waterFront.ts is the oracle, measured
// against a photograph of a bloom; WC_WATER_FRONT_FRAG the GPU twin.

/** Edge cost uphill: |ij| · max(floor, 1 + climb · Δh) per cell, paper
 *  height 0..1. Calibrated on the BAKED medium paper, not the oracle's
 *  synthetic one, whose relief per pixel is half as steep (|Δh| 0.04 against
 *  0.09): a radius-30 disc with a budget of 10 cells runs to 1.26 R with
 *  10–16 lobes and an angular spread of 0.08 at 30, against the photo's
 *  1.3 and 10–12; 60 stalls it at 1.19 R. */
export const WC_FRONT_CLIMB = 30
/** 0.22 let a valley run 4.5x further than a ridge: on a stroke's 3 px budget
 *  that is a 14 px spike, and every stroke came out a cookie (Ilya). 0.5 keeps
 *  the lobes at twice the mean run. */
export const WC_FRONT_FLOOR = 0.85
/** The inward pass that places the band (s17.24): same law, a gentler
 *  relief, so the band is `width` cells deep with fingers a few cells
 *  longer in the valleys - at the outward pass's floor a valley ran the
 *  band a third of the way to the centre and the ring read as a smear. */
export const WC_FRONT_CLIMB_IN = 15
export const WC_FRONT_FLOOR_IN = 0.5
/** Relaxation steps per settle, capped: each is one cheap 8-tap pass.
 *  (s17.29) ...on dry paper. A mark that lands wet runs a longer front
 *  (watercolorSpreadBudget), and its cap grows by WC_FRONT_WET_STEPS times
 *  the landing wetness - a big brush on dry paper never pays for a run
 *  its dry-paper cost would stop at a pixel anyway. */
export const WC_FRONT_MAX_STEPS = 56
export const WC_FRONT_WET_STEPS = 160
/** (s17.44) The outward front's pass schedule for a run of `steps` cells:
 *  dyadic jumps from the largest power of two under the run down to 2, then
 *  WC_FRONT_UNIT_PASSES unit passes - the jumps carry the front across the
 *  domain, the unit passes put back the cell-scale detail the relief gives
 *  its edge. On a 400 px brush into a wash that is ~15 passes where the
 *  plain relaxation needed 216, and those passes were most of the settle's
 *  cost on the tablet (70 ms an entry). */
export const WC_FRONT_UNIT_PASSES = 8
export function watercolorFrontStrides(steps: number): number[] {
  if (steps <= WC_FRONT_UNIT_PASSES) return Array.from({ length: steps }, () => 1)
  const out: number[] = []
  for (let st = 2 ** Math.floor(Math.log2(steps)); st >= 2; st /= 2) out.push(st)
  for (let i = 0; i < WC_FRONT_UNIT_PASSES; i++) out.push(1)
  return out
}
export function watercolorFrontSteps(budget: number, radiusPx: number, landedWet: number): number {
  const l = clamp01(landedWet)
  const cap = WC_FRONT_MAX_STEPS + Math.round(WC_FRONT_WET_STEPS * l)
  // (s17.44) The radius is what a landing puddle's front has to cross to
  // reach the film (s17.27) - on a DRY landing. A wet landing seeds the
  // whole footprint as the puddle (s17.41), so its front starts at the
  // footprint's edge and only the budget is left to run: on a 120 px brush
  // into a wash that was 216 passes over a 1536-px field for a run of 100,
  // the settle's largest single cost.
  return Math.min(cap, Math.ceil(1.4 * budget + radiusPx * (1 - l)))
}
/** (s17.29) The front CARRIES the mark's mobile paint: per carry step a
 *  texel hands this share of its paint to its in-domain neighbours that lie
 *  further along the front's cost (the water runs from the footprint to
 *  the front), split between them by conductance to the WC_CARRY_POW - the
 *  cheap step along a valley takes nearly all of it, the dear one over a
 *  ridge next to none, which is what makes fingers of near-body density
 *  rather than a halo. Where no neighbour lies further along the cost -
 *  the front itself - the paint stays: it piles at the front. */
//  (s17.31) 0.5, from 1.0, and the strides up to HALF the budget: at full
//  equalisation over the whole water domain a loaded stroke into a damp
//  wash drained its own body into the wash (Ilya's colour pairs: "вокруг
//  одного штриха светлый слой"); the photographs keep the body's density
//  and send narrow fingers out. The pigment's horizon is shorter than the
//  water's - the sheet filters it - so the carry equalises part-way, over
//  the nearer half of the domain.
export const WC_CARRY_RATE = 0.5
/** (s17.35) The share of a texel's mobile paint that travels with the front
 *  at all; the rest stays in the footprint as if fixed. */
export const WC_CARRY_TRAVEL = 0.35
export const WC_CARRY_POW = 3
export const WC_CARRY_MAX_STEPS = 24
/** The pigment's horizon as a share of the water front's budget. */
//  (s17.40) 1.0, from 0.5: at half the budget the moved paint ended on an
//  iso-line of the cost that, in a uniform film, is a smooth curve parallel
//  to the footprint - Ilya's "жёлтый проникает ровной линией" - while the
//  ragged front lay further out unused. To the front, with the fade
//  (WC_CARRY_FADE) and the travelling share keeping the body.
export const WC_CARRY_HORIZON = 1.0
/** The carry's strides, texels, one per step: dyadic up to the budget and
 *  back, repeated until the paint can have travelled the whole budget
 *  (rate x stride summed), capped. A coarse step reaches into the
 *  footprint's flat interior (cost 0 throughout, so a unit step there has
 *  no gradient to follow) as far as its stride - and that is the supply:
 *  with the top stride at a quarter of the budget only a thin ring of the
 *  footprint fed the fingers and they filled to a third of the body
 *  (oracle on the room's series 5); at the whole budget the interior
 *  feeds them and they fill to 0.75-0.95 of the body over most of the
 *  run, the photograph's density. The fine strides take the coarse steps'
 *  blockiness out again, as the diffusion schedule does. */
export function watercolorCarryStrides(budgetPx: number): number[] {
  const top = Math.max(1, Math.floor(budgetPx * WC_CARRY_HORIZON))
  const up: number[] = []
  for (let s = 1; s <= top; s *= 2) up.push(s)
  const cycle = [...up, ...up.slice().reverse()]
  // Whole cycles only: the fine strides after the coarse ones are what
  // takes the coarse steps' blocks out, so a cycle never ends on a coarse
  // step whatever the budget.
  const out: number[] = [...cycle]
  let sum = cycle.reduce((a, s) => a + s, 0)
  while (sum * WC_CARRY_RATE < budgetPx && out.length + cycle.length <= WC_CARRY_MAX_STEPS) {
    out.push(...cycle)
    sum += cycle.reduce((a, s) => a + s, 0)
  }
  return out
}
/** (s17.27) How much dearer a front's step onto dry paper is than over the
 *  wash's own film: at 4 a stroke's spread past the brush is a quarter of
 *  its budget - a pixel - and its edge is the brush's contour; inside the
 *  film the same budget runs the puddle's front out along the valleys. */
export const WC_FRONT_DRY_COST = 24
/** (s17.40) ...and at least this share of the budget per cell of dry paper:
 *  two cells of run past the brush whatever the budget. */
export const WC_FRONT_DRY_SHARE = 0.5
/** How far the water runs past the footprint, px, from the mark's radius,
 *  the brush's water and the wetness it landed in: a wet brush on wet paper
 *  spreads a third of its radius (the photo's drop: 1.3 x), the same brush
 *  on dry paper a tenth — a wet-on-dry mark bleeds only a little. */
export function watercolorSpreadBudget(radiusPx: number, water: number, landedWet: number): number {
  const w = clamp01(water), l = clamp01(landedWet)
  // (s17.27) At least 0.3 R: this is also how far a landing puddle's front
  // runs into the stroke's film (the backrun's fingers, 0.2-0.3 R in the
  // photographs); past the film, onto dry paper, WC_FRONT_DRY_COST divides
  // it to a pixel.
  // In COST units, and over the baked paper's relief a cell costs 1.6 on
  // average (measured: a 1.2-unit puddle seed reached the film's 5.3 in two
  // to three cells) - so 0.6 R of budget is about 0.35 R of run, the
  // photographs' backrun and the drop's 1.3 R alike.
  // (s17.29) On WET paper the run is the mark's own: a loaded stroke into a
  // wet wash sends its paint a third of its width into the wash (Ilya's
  // series 5: the fingers reach ~0.65 R), which is ~1.05 R of cost; 0.6 R
  // gave 15 px on a 160 px stroke and the fingers vanished at the room's
  // scale. On dry paper the term is a tenth of that, as before.
  // (s17.34) ...and a mark landing in DEEP water - a clean puddle, a wash
  // still flooded - has the puddle's own water to travel in: its pigment
  // runs across the puddle, not a radius past its own footprint (Ilya's
  // series 4, paint into clean water: feathery tracks over half the
  // puddle; ours stopped at 15 px). An absolute run on top, in cost units,
  // that only a flooded landing earns. The design thread would keep the
  // water front's budget and give the pigment its own horizon; here the
  // carry can only move within the front's domain, so the domain grows.
  const puddle = WC_SPREAD_PUDDLE * smoothstepJs(WC_SPREAD_PUDDLE_LO, 1, l)
  return Math.max(2, Math.min(WC_SPREAD_BUDGET_MAX, radiusPx * (0.5 + WC_SPREAD_WET * w * (0.15 + 0.85 * l)) + puddle))
}
// (s17.43) 0.55 -> 0.4: "растекание при смешивании должно быть чуть меньше".
export const WC_SPREAD_WET = 0.4
export const WC_SPREAD_PUDDLE = 60
export const WC_SPREAD_PUDDLE_LO = 0.75
/** The cap, cost units: 8 bits resolve 0.6 of a unit at this costMax, which
 *  still places a front to a cell. */
export const WC_SPREAD_BUDGET_MAX = 160

/** The share of the wash's settled paint that a drop of water lifts and
 *  carries to its front, at full bloom strength (watercolorBloomStrength):
 *  the light interior of a bloom and its dark ring. Not derived from the
 *  band's width like the tideline's share: the photo (bloom_wa_drop) has
 *  the centre at half the wash's density whatever the ring's width, and the
 *  ring is then as dark as that mass on that band makes it (1.5-3x in the
 *  deposit for a 40 px drop, compressed by the composite's saturation).
 *
 *  Why a relocation and not the oracle's advection: the GPU fields are eight
 *  bits, and a drift of a few per cent of a value of forty codes per step
 *  rounds to nothing - measured, the advection at three times the oracle's
 *  rate only flattened the profile. Moving the share in one pass keeps the
 *  amount whatever the precision. */
export const WC_BLOOM_SHARE = 0.65
/** How much darker than its body a mark's rim ends up — the tideline of
 *  every wash (str_ldm_2809, gran_wa_main): the band gets this much of the
 *  body's density on top of its own. The share of the interior moved is
 *  worked out from it and the mark's radius, so a broad wash and a thin
 *  line get the same rim rather than the broad one drowning in it. */
//  (s17.30) 1.6, from 2.0: on Ilya's layer of circles and blots the line
//  read as a drawn outline - "слишком контрастный".
export const WC_TIDE_RIM = 0.9
/** (s17.41) How much of the earlier paint a wet landing re-mobilises across
 *  the puddle it joined, at the dome's full (WC_FIELD_OP_FRAG mode 18).
 *  (s17.42) Under the group-dry oracle the floor is 1: the earlier paint
 *  never dried, so all of it under the dome is one liquid with the new. */
export const WC_REMOB_DOME = 0.6
/** (#536, s17.30) Which round of the watercolour work this build carries,
 *  shown next to the app version in Settings: Ilya tests the LAN dev server
 *  from a tablet, and "which version am I looking at" has to be answerable
 *  from the screen. Bumped by hand with each ADR 011 §17 section. */
export const WATERCOLOR_ROUND = 'акварель r32 (§17.59)'
/** The rim band's width, px at world scale: the sliver just inside the
 *  footprint's edge that the moved paint lands on — from WC_RIM_INSET_PX
 *  inside the edge (clear of the stamp's anti-aliased fringe) inward. */
export const WC_RIM_BAND_PX = 10
export const WC_RIM_INSET_PX = 3
/** How far the rim's edge wanders, px, with a slow noise of the world
 *  position: a stroke's tideline barely (the edge is the stroke's), a
 *  bloom's ring a lot — the cauliflower (bloom_akv_2). */
export const WC_RIM_WARP_TIDE_PX = 1
export const WC_RIM_WARP_BLOOM_PX = 3
/** The share of the interior's paint to move so that a band WC_RIM_BAND_PX
 *  wide at the edge of a mark of radius `radiusPx` ends up `rim` denser
 *  than the body: an interior of area ~radius per unit edge feeds a band of
 *  area ~band per unit edge. Capped: never more than most of the paint. */
export function watercolorRimShare(rim: number, radiusPx: number, bandPx = WC_RIM_BAND_PX): number {
  const r = Math.max(radiusPx, bandPx)
  return Math.min(0.6, rim * bandPx / r)
}

/** (#536) The half-width of the brush *being held*, recovered from one dab it
 *  made — as opposed to the half-width of that particular footprint.
 *
 *  The hair count is a property of the ferrule, so it has to be measured
 *  against the brush rather than against however hard the stroke happened to
 *  start. It could not simply be measured over the whole gesture instead: the
 *  composite's scalars are resolved on the first call, and a live stroke's
 *  first call sees one pointer event's worth of dabs while a replay's sees all
 *  of them — so anything aggregated over "the dabs so far" makes the mark
 *  differ between the two. The gesture's first dab is the one thing both are
 *  guaranteed to agree on, which is why every scalar here comes from it, and
 *  this divides the two things that shrink it back out again.
 *
 *  That mattered exactly as much as the brush is small. A 30 px round brush
 *  begun with a light touch lands its first dab at well under half the set
 *  width, which put barely three bundles across the whole mark and read as
 *  broad waves; a 100 px brush begun the same way still had eight. Which is
 *  "щетина хорошо видна только на крупной кисти", and it is arithmetic rather
 *  than perception.
 *
 *  The flat needs no correction and must not be given one: its shaping puts the
 *  thickness on the minor axis and its reciprocal on the aspect, so the long
 *  axis — which is the ferrule — already cancels out pressure exactly. */
export function watercolorFerrulePx(
  minorPx: number, aspectRatio: number, pressure: number, presetName: string | undefined,
): number {
  const long = minorPx * Math.max(aspectRatio, 1)
  if (watercolorNibFromPreset(presetName) === 'chisel') return long
  const response = watercolorResponseFromPreset(presetName)
  const shrunkBy = watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response)
    * WATERCOLOR_HEAD_TAPER.startScale
  // Capped rather than trusted blindly: if a stroke ever reaches here without
  // the head taper applied — a resumed gesture, a hand-built operation — the
  // correction would invent a brush several times the size of the mark, and a
  // bundle count is not worth a surprise.
  return Math.min(long / Math.max(shrunkBy, 0.05), long * 3.0)
}

/** Pigment remaining after the same travel, as a fraction of the load —
 *  so 1 − this is the fraction already delivered, and the two always sum to
 *  the budget (see PIGMENT_RUN_DRY_RADII). `water` is the brush's nominal mix
 *  water, a constant of the stroke, which is what keeps a live stroke and a
 *  replay of it on the same curve. */
export function watercolorPigmentLoad(usedRadii: number, water = 0): number {
  return Math.exp(-usedRadii / watercolorPigmentRun(water))
}

/** The run, in radii, over which the brush spends 1 − 1/e of its pigment. */
export function watercolorPigmentRun(water: number): number {
  return PIGMENT_RUN_DRY_RADII + (PIGMENT_RUN_WET_RADII - PIGMENT_RUN_DRY_RADII) * clamp01(water)
}

/** The delivery rate per radius, relative to a dry brush's. The budget is
 *  rate × run, and the run grows with water — so the rate shrinks by the same
 *  factor, or a wet brush would carry four times the paint rather than the
 *  same paint further. Measured before this existed: the second pass over a
 *  puddle at full water "красит что-то очень жёстко, нереально" — it was
 *  laying four dry brushes' worth. A wet line is a long thin transparent
 *  trail; a dry one short and concentrated; both from one load. */
export function watercolorPigmentRate(water: number): number {
  return WATERCOLOR_PIGMENT_GAIN * (1 - WATERCOLOR_WET_RATE_DROP * clamp01(water))
}
/** (#536, s17.20) The whole curve, up: "пигмента в кисти должно быть больше
 *  на всех значениях пигмента" — after the budget was made finite the brush
 *  carried too little at every setting. A gain on the rate, so the budget
 *  rises with it and the shape along the path stays. */
//  (#536, §17.24) 2.1, from 1.6: the calibration stroke (100/100, one
//  straight stroke, real GPU) read an optical density of 0.51 in the body
//  against the paper; the target agreed in the thread is 0.6–0.7 with the
//  rim at 1.5 times that. "Бледно" is now one number, this one.
const WATERCOLOR_PIGMENT_GAIN = 2.4
/** How much lower a fully wet brush's delivery rate is than a dry one's.
 *  The first cut kept the budget one number at every water (rate = run_dry /
 *  run), and a line at full water started "слишком блекло" while its fade
 *  looked right - so the whole curve wanted lifting, not reshaping. Half:
 *  a wet brush starts at half a dry brush's rate and runs four times as
 *  far, so it carries twice the paint - a loaded wet brush does. */
const WATERCOLOR_WET_RATE_DROP = 0.5

/** (#536, ADR 011 §17.13) How much of the water a brush delivers to the
 *  sheet stays on it as STANDING water, by what the sheet already held.
 *
 *  Standing water is a balance on the paper — delivered, minus what the sheet
 *  absorbs — not a property of the brush, and the two came apart on Ilya's
 *  sheet in both directions. A puddle laid by one long clean stroke read
 *  patchy when the record was the brush's depleted load; a loaded brush
 *  scribbled on dry paper read as dry-on-dry when a pigment stroke recorded
 *  no water of its own at all ("въедается как мелок"). So: a clean-water
 *  stroke's delivery stays whole (retention 1 — that is what a puddle is),
 *  and a pigment stroke's is kept in proportion to how wet the sheet under
 *  the dab already was — a thin film on dry paper, most of it where there
 *  was a puddle to join. The dab's recorded wetness digit is the "already",
 *  so a replay keeps the same water.
 *
 *  Known limit, deliberate: a stroke does not read its own water before
 *  pen-up (see _paintDabs on why), so ten passes over one spot do not yet
 *  pile the film up into a puddle. The API is written as delivery and
 *  retention so that they can, without the record changing shape. */
export function watercolorWaterRetention(water: number): number {
  const w = clamp01(water)
  const t = w <= WATERCOLOR_RETAIN_FROM ? 0 : (w - WATERCOLOR_RETAIN_FROM) / (1 - WATERCOLOR_RETAIN_FROM)
  return WATERCOLOR_RETAIN_DAMP + (WATERCOLOR_RETAIN_FLOODED - WATERCOLOR_RETAIN_DAMP) * t * t * (3 - 2 * t)
}
/** What a pigment stroke's water leaves standing on dry paper, by how much
 *  the brush carries. A damp brush's film soaks in almost at once; a flooded
 *  brush leaves a real puddle the sheet cannot drink — and that puddle has
 *  the paint in it: "лужа по сути должна уже быть немного подкрашена". So at
 *  full water a pigment stroke's own mark diffuses nearly as a puddle does,
 *  levelling into a tinted film; at damp it keeps its structure. Applied to
 *  the brush's water as it stands at each dab, not the nominal mix, so the
 *  dry tail of a long line leaves no standing water to run in. */
const WATERCOLOR_RETAIN_DAMP = 0.15
const WATERCOLOR_RETAIN_FLOODED = 0.85
const WATERCOLOR_RETAIN_FROM = 0.25

/** (#536, §17.21) How much of the delivered water stands on the sheet, by
 *  the brush's LOAD — the fraction of its water left (watercolorWaterLoad),
 *  not the water itself: the whole film while the load is above HI, none at
 *  the floor, smoothstep between. The shaders write the same rule into
 *  coverage .b (wcStandingGate in WC_NOISE_GLSL — shaders.test.ts holds them
 *  to these numbers).
 *
 *  It was smoothstep(0.05, 0.35) on the absolute water, which made the water
 *  SETTING shorten the puddle: at 40 % water the brush read as nearly dry from
 *  its second radius, and the puddle was gone while the mark went on for
 *  twenty. On the load, a 40 % brush lays a 40 % puddle that fades along the
 *  stroke exactly as a full one does.
 *
 *  Then linear in the load, which still ended the puddle before the mark
 *  ("лужа всё ещё кончается раньше, чем штрих"): a saturated brush does not
 *  lay a thinner film with every radius — the hairs hold more than they can
 *  release, so the film stays whole over the body of the stroke and gives out
 *  where the brush does. Full to HI = 0.35 of the load, which with the run of
 *  20 radii is the first ~21; half at load 0.2, ~32 radii, where the pigment
 *  has reached its own e-fold and the hairs are showing; gone at the floor.
 *  The puddle now lasts the wet body of the mark and ends with its dry tail. */
export const WC_STANDING_GATE_LO = WATER_FLOOR
export const WC_STANDING_GATE_HI = 0.35
export function watercolorStandingGate(load: number): number {
  const t = clamp01((load - WC_STANDING_GATE_LO) / (WC_STANDING_GATE_HI - WC_STANDING_GATE_LO))
  return t * t * (3 - 2 * t)
}

/** (#536, §17.21) The standing water one dab leaves on the sheet — the
 *  number the live wetness field is fed, and the same number the ribbon
 *  writes into the wash's coverage .b, so the puddle the composite draws and
 *  the puddle the diffusion runs in are one puddle.
 *
 *  They were two. The field took the nominal mix for every dab of a stroke
 *  ("how wet a patch of paper is barely cares which end of the stroke wetted
 *  it") while the record cut it where the brush had run dry — so a puddle
 *  scribbled in one gesture drew its sheen and its bead over the whole
 *  scribble, and carried pigment only along the first run of it: "пигмент
 *  растекается … в рамках своей лужи, хотя лужа значительно больше". A brush
 *  that has run dry wets nothing, and now the sheen says so too.
 *
 *  `mixWater` the preset's nominal water, `retain` what dry paper keeps of it
 *  (1 for clean water, watercolorWaterRetention for pigment), `paperWet` the
 *  wetness the dab was laid into (already-wet paper keeps everything), and
 *  `load` the fraction of the brush's water left at this dab, after the
 *  clocks (watercolorWaterLoad). What the field records is the max with what
 *  was there; the shader takes the same max against the recorded wetness. */
export function watercolorStandingWater(mixWater: number, retain: number, paperWet: number, load: number): number {
  const w = clamp01(paperWet)
  return mixWater * (retain + (1 - retain) * w) * watercolorStandingGate(load)
}

// ─── Wet-in-wet: the halo (#536, ADR 011 §17.10) ───────────────────────────
//
// Paint dropped into standing water does not stay where the brush put it: a
// dark core remains, and around it a wider, paler, granular halo runs out into
// the water. In Ilya's photographs the halo takes a blot from about 110 px to
// about 190 px across.
//
// Everything before this tried to produce that in the *composite*, and it
// could not, for a reason worth keeping: the composite recomputes a pixel from
// the deposit under it, and the deposit is written only along the brush's own
// path. Outside that path there is nothing to recompute *from*. Pushing the
// silhouette out, blurring it, sampling rings — all of it was reshaping a
// boundary around a region with no pigment in it, and measured as a 15 px blot
// answering every change with 15.
//
// So the halo is laid at deposit time instead: every dab that lands on wet
// paper gets a second, wider, weaker stamp into the very same buffers. From
// then on the pigment out there is real, and every per-pixel term that reads
// the deposit — the paper's grain, the hair, the wetness gate on the boundary,
// transport — works in the halo without knowing it is one. Deterministic, too:
// the wetness under each dab is the recorded digit, so replay lays the same
// halo.

/** How much wider the halo stamp is than the dab, at full paper wetness and a
 *  fully wet brush. 1.9 makes a blot in standing water about 1.7-1.9x across,
 *  which is what the photographs show. */
const WATERCOLOR_HALO_GROWTH = 0.9

/** How much of a wet-in-wet dab's pigment leaves the brush's own footprint for
 *  the water around it, at full wetness. A share, never an addition — and the
 *  distinction is the whole of two complaints at once.
 *
 *  It used to be a per-pixel dose laid *on top of* the dab's own, so a scribble
 *  of N dabs in one spot stacked N halo discs: the halo filled "at once and
 *  thick", and the pigment never ran out however long the brush stayed, since
 *  every dab conjured a disc's worth. And the core kept its full dose, which is
 *  the wax-crayon feel — paint that has "caught on the sheet for good" and
 *  merely smears. What actually happens is that a share of the dab dissolves
 *  into the standing water: the mark under the brush comes out *lighter* by
 *  that share, and that same share is what the halo is made of. Conserved, so
 *  a scribble accumulates halo and core in the one fixed proportion, and a
 *  brush running dry runs dry in both. */
//  (#536, s17.17) Zero: retired in favour of the diffusion (s17.11). The halo
//  was the stamp-shaped guess at wet-in-wet spreading from before the mobile
//  phase existed, and once both ran the mark in a puddle was "сразу больше
//  самой кисти" - a second, wider disc laid under the brush the instant it
//  touched wet paper - and a second pass over a puddle came out heavier and
//  spread differently from the first, because only the pass that landed wet
//  got the extra disc. A mark now starts at the brush's own size and runs
//  from there, once, at the settle. The plumbing stays for the record.
// (s17.43) Already 0 when the colour-change line was hunted, and stays so:
// the halo stamp is the wet-in-wet spread of ADR 011 s17.10,
// a wider stamp of shed pigment clipped by the coverage - a hard-edged disc
// around every wet dab, laid before the water front (s17.24) and the carry
// (s17.29) existed to move the paint for real. With those two doing the
// spreading it only added a second, cruder edge; off, kept for an A/B.
const WATERCOLOR_HALO_SHED = 0

/** (§17.46) Whether the halo stamp is laid at all. Its BOUND - the dab grown
 *  by up to 1.9x plus three bloom reaches on wet paper - sized every batch's
 *  tiles, film rebuild and composite rect even with the stamp off, so a big
 *  brush crossing its own wet wash repainted and recomposited three to four
 *  times the area it touched, every frame: the tablet dropped one frame in
 *  six into a wet wash against one in thirty on dry paper. */
export const WATERCOLOR_HALO_DRAWN = WATERCOLOR_HALO_SHED > 0

/** A nearly dry brush still bleeds into standing water — plainly, in Ilya's
 *  words, only much less than a wet one. The floor on the brush's own share of
 *  the growth. */
const WATERCOLOR_HALO_DRY = 0.45

/** The halo stamp for one dab: how much wider than the dab, and what fraction
 *  of its dose. Both zero-effect on dry paper, so a dry-paper stroke lays no
 *  halo at all and is bit-for-bit what it was. */
/** The halo stamp for one dab: how much wider than the dab, and what share of
 *  its dose leaves for the water. Both zero-effect on dry paper, so a dry-paper
 *  stroke lays no halo, keeps its whole dose, and is bit-for-bit what it was.
 *
 *  The engine hands the shed share to a stamp `scale` times wider, whose ink
 *  pass normalises by radius — so per pixel the halo carries shed / scale of
 *  the core, i.e. the pigment is spread as if along a ring rather than over a
 *  disc. That is deliberate: in a real blot the migrating pigment does not fill
 *  the water evenly, it gathers toward the front, which is why a halo is
 *  visible at all and why it ends in a tideline. */
export function watercolorHalo(paperWet: number, brushWater: number): { scale: number; shed: number; wet: number } {
  const wet = clamp01(paperWet) * (WATERCOLOR_HALO_DRY + (1 - WATERCOLOR_HALO_DRY) * clamp01(brushWater))
  return { scale: 1 + WATERCOLOR_HALO_GROWTH * wet, shed: WATERCOLOR_HALO_SHED * wet, wet }
}

/** How far past the composite's own bloom the halo reaches, in multiples of the
 *  gesture's spread reach, at full wetness.
 *
 *  The halo cannot be sized off the dab alone. The composite already blooms a
 *  mark well past its dabs (u_spreadPx, up to WATERCOLOR_SPREAD_CAP_PX), and
 *  for a light touch that bloom is the larger part of what is visible: on a
 *  replay of Ilya's own dab the core showed at about 2.6 times the dab's
 *  radius, and a halo stamp 1.84 times the dab was *inside* it. Measured with
 *  the density view — the stamp landed exactly where asked and was invisible
 *  for it. So the halo is the dab's own growth *plus* this much of the reach,
 *  which is what puts it outside the bloomed silhouette on every brush size. */
//  3.0, measured: at 2.0 the density view put the halo's half-height edge at
//  1.33x the bloomed core on a replay of Ilya's dab; the photographs want about
//  1.7x, and the reach is linear in this.
export const WATERCOLOR_HALO_PAST_BLOOM = 3.0

// ─── The brush drinks (#536, ADR 011 §17.7) ───────────────────────────────────
//
// Ilya: a brush dragged through a puddle takes water with it, stays damp for a
// while after it leaves, and drags the puddle out behind it — while the puddle
// itself dries sooner for having been drunk from.
//
// The unit of this exchange is **one stroke**, and that is a decision rather
// than an omission. Pen-down always hands back a freshly charged brush (the
// scratch's own beginStroke), because the alternative gives the brush hidden
// state the user has to keep in their head: why is it wet, how do I dry it,
// does switching tools reset it, does undo. That is a dipping simulator, and
// not dipping was the first thing asked of this tool. Within one stroke,
// though, the exchange is exactly what the hand expects.
//
// Expressed as a *rewind of the water clock* rather than as a second water
// quantity, and that is what makes the tail fall out for free: picking up
// water puts the brush back to where it was N radii ago, and from there it
// runs down again at the ordinary rate. The brush therefore leaves the puddle
// wetter than it entered and converges back to the dry curve over the same
// distance it gained — which is "растянет лужу чутка", in the model's own
// units.
//
// Two properties this shape gives away for nothing, both of which a separate
// reservoir would have had to be argued into:
//
//  - the brush can never end up wetter than fully loaded, because the clock
//    stops at zero;
//  - it is monotone in paper wetness and in travel, so no amount of dwelling
//    in a puddle can run it away.

/** How many radii of water clock one radius of travel through *fully* wet paper
 *  gives back. Above 1 on purpose: at exactly 1 a brush in a puddle would only
 *  hold its level, and what the hand sees is a brush that visibly recovers. */
const WATERCOLOR_PICKUP_RADII = 2.6

/** What one *stroke* of a bone-dry brush takes off a patch of paper, as a
 *  fraction — the field applies it once per cell per gesture (PaperWetness.
 *  drain), and it is scaled by how dry the brush actually is.
 *
 *  #536 — it used to be a third, per pointer batch, flat, and that ate the
 *  thing it was meant to serve. A dot scribbled inside a puddle crosses the
 *  same few cells on every batch, so each batch sampled cells the previous one
 *  had just drained, and the recorded profile of a stroke lying wholly in
 *  standing water ran e,a,7,6,5,4,3,2,1,0… within thirty dabs — read straight
 *  out of Ilya's operation log. Everything that decides how far paint runs is
 *  gated on that digit, which is why no tuning of the spread ever showed on
 *  screen: for most of the stroke the paper was recorded dry. Lowering the
 *  fraction alone did not fix it (0.955^40 is still 0.16); the cap did. */
const WATERCOLOR_PAPER_DRAIN = 0.25

/** The water clock after one segment: travel spends it, wet paper gives it
 *  back. `paperWet` is what the stroke *recorded* seeing under this dab, never
 *  a live reading — so replay walks the identical curve (paperWetness.ts). */
export function watercolorWaterClock(usedRadii: number, stepRadii: number, paperWet: number): number {
  const drunk = WATERCOLOR_PICKUP_RADII * clamp01(paperWet) * stepRadii
  return Math.max(0, usedRadii + stepRadii - drunk)
}

/** How much of its wetness a patch of paper loses to a brush passing over it,
 *  as a fraction. The mirror of watercolorWaterClock and deliberately not
 *  derived from it: the paper's side of this exchange lives entirely in the
 *  live field, which is never replayed and never has to agree with anyone
 *  else's copy — so it is free to be a simple, legible number rather than a
 *  conserved quantity. */
export function watercolorPaperDrained(paperWet: number, brushWater: number): number {
  // A loaded brush has nowhere to put more water and takes next to none; only
  // a dry one drinks. Without this term a flooded brush dried the puddle it was
  // laying, which is backwards twice over.
  return WATERCOLOR_PAPER_DRAIN * clamp01(paperWet) * (1 - clamp01(brushWater))
}

// ─── Measuring a nib that is not round (#489) ───────────────────────────────
//
// Every scalar in the wet model is expressed in *radii*: water and pigment
// deplete per radius travelled, the bloom and the migration ring are fractions
// of a radius, and the deposit is a dose per radius. That worked while the tool
// had exactly one nib, because a round brush has one radius. A flat brush does
// not, and picking the wrong axis is not a rounding error — at 4:1 it is a
// factor of four in how fast the brush runs dry.
//
// The two questions below are genuinely different, and answering both with one
// number is what a naive `dab.size * 0.5` does today.

/**
 * The radius the wet model measures *travel* by — how far this nib has moved in
 * its own units, world px.
 *
 * Derived rather than chosen. Water leaves the brush at a rate set by the area
 * it wets per unit distance, which is the nib's width **across** the direction
 * of travel; what it has to spend is its load, which scales with the nib's
 * area. So depletion per unit distance goes as `w_perp / area`, and the radius
 * that reproduces that through the existing `seg / radius` is
 *
 *     r = a·b / hypot(a·sin psi, b·cos psi)      psi = nib angle - travel angle
 *
 * with `a`, `b` the semi-axes. For a round nib that is exactly `r` at every
 * angle, so this changes nothing for the tool as it shipped — the direction
 * term only wakes up when the axes differ.
 *
 * The payoff is that it comes out right at both ends without a second rule.
 * Dragged broadside a flat brush wets a band four times as wide and this
 * returns the *short* axis, so it drains four times as fast — which is what a
 * loaded flat actually does. Dragged edge-on it returns the long axis and lasts
 * four times as long. And because the deposit dose is `seg / radius` over that
 * same wider band, the tone per pixel comes out identical either way: a flat
 * brush should not paint darker just because it was turned.
 *
 * `travelAngle` is null where there is no direction to speak of — a tap, or the
 * dwell tick stamping in place. The isotropic answer there is the radius of the
 * circle with the same area, which is again exactly `r` for a round nib.
 */
export function watercolorTravelRadius(
  semiMajor: number, semiMinor: number, nibAngle: number, travelAngle: number | null,
): number {
  const a = Math.max(semiMajor, 0.01)
  const b = Math.max(semiMinor, 0.01)
  if (travelAngle === null) return Math.sqrt(a * b)
  const psi = nibAngle - travelAngle
  return (a * b) / Math.hypot(a * Math.sin(psi), b * Math.cos(psi))
}

/**
 * The radius the wet model measures *spreading* by — how far paint wanders out
 * from the mark, world px.
 *
 * A different question from the one above and it gets a different answer: a
 * bloom is isotropic. Paint does not know which way the brush was going when it
 * left, it knows how much water was put down, and that is the nib's area. So
 * this is the radius of the circle with the same area — the same value
 * `watercolorTravelRadius` falls back to when there is no direction, and again
 * exactly `r` for a round nib.
 */
export function watercolorSpreadRadius(semiMajor: number, semiMinor: number): number {
  return Math.sqrt(Math.max(semiMajor, 0.01) * Math.max(semiMinor, 0.01))
}

/** How far one segment advances the depletion clock. Separated from the decay
 *  curves so the engine never has to know either run length, and so both halves
 *  are testable without a GL context. */
export function watercolorWaterStep(segmentLengthPx: number, radiusPx: number): number {
  return segmentLengthPx / Math.max(radiusPx, 0.5)
}

// ─── Preset string (#468 v4) ────────────────────────────────────────────────
//
// The tool started with no size ladder and no nib list, so the per-stroke
// `preset` string — the same slot that carries a pencil grade or a marker nib —
// was free. v1 spent it on the pressure response alone; v4 packed the mix into
// it too, v5 added which paint, and #489 a nib after all:
//
//     response : water% : pigment% : pigmentCode : nib
//
// Each field was added on the end and each is absent from every stroke recorded
// before it, so a short string is not a malformed one — it is an older stroke,
// and it replays as what it was drawn with.
//
// Riding the existing string rather than adding Operation fields is deliberate
// and matches what the marker already does with `${nib}:${size}`: #366 exists
// to shrink operation payloads, and every new field is paid for by every
// operation in every room forever. It also means a peer replays the stroke with
// the mix it was actually drawn with rather than whatever they have selected.
//
// A string with no mix in it — every watercolor stroke recorded before v4 —
// parses to the default, so it still replays.

export function watercolorPresetString(
  response: PressureResponse, mixLevels: WatercolorMix, pigmentCode = DEFAULT_WATERCOLOR_PIGMENT,
  nib: WatercolorNib = DEFAULT_WATERCOLOR_NIB,
): string {
  const pct = (v: number): number => Math.round(clamp01(v) * 100)
  return `${response}:${pct(mixLevels.water)}:${pct(mixLevels.pigment)}:${pigmentCode}:${nib}`
}

/** (#468 v5) Which paint the stroke was made with — the Colour Index code, the
 *  same one printed on a real tube. Fourth field of the preset string, and
 *  absent from every stroke recorded before v5, which fall back to the default.
 *
 *  A code rather than the four numbers it stands for: the numbers are a
 *  property of the paint and may be re-tuned, and a stroke should keep meaning
 *  "this was cobalt" rather than freezing whatever cobalt's granulation figure
 *  happened to be on the day it was drawn. */
export function watercolorPigmentFromPreset(presetName: string | undefined): string {
  const code = presetName?.split(':')[3]
  return code && isWatercolorPigmentCode(code) ? code : DEFAULT_WATERCOLOR_PIGMENT
}

/** (#536) What must be unchanged for a stroke to join the wash already on the
 *  paper, rather than glaze over it.
 *
 *  The rule used to be "the whole preset string, plus the colour", which meant
 *  **moving either mix slider ended the wash**. That silently forbade the one
 *  sequence this tool's two axes exist for: lay clean water, turn the pigment
 *  up, paint into it. Those are necessarily two strokes with different mixes,
 *  so they were necessarily two washes, and the second could not know the first
 *  had ever happened.
 *
 *  What legitimately ends a wash is a different *paint* — that is a second,
 *  glazed layer with its own frozen backdrop. How much water and how much of
 *  that paint the brush happens to be carrying is a property of the brush at
 *  that moment, not of what is lying on the paper; neither is which nib is
 *  held, nor how the stylus is being read. So none of them appear here.
 *
 *  Layer and tool are checked by the caller, which has them to hand. */
export function watercolorWashSignature(_presetName: string | undefined, _color: readonly number[]): string {
  // (#536, s17.19) Neither the colour nor the pigment any more: the wash
  // carries the colour of every paint laid into it per texel, as optical
  // depth (pigmentOptics.ts), so a second paint joins a wet wash and MIXES
  // rather than opening its own and glazing once dry. The pigment's other
  // properties - granulation, staining - are still the wash's scalars from
  // its first paint; a mixture takes them from whichever paint opened the
  // wash. Recorded debt (§17.9): the honest form is mass-weighted moments.
  return 'wc'
}

export function watercolorMixFromPreset(presetName: string | undefined): WatercolorMix {
  if (!presetName) return WATERCOLOR_MIX_DEFAULT
  const parts = presetName.split(':')
  if (parts.length < 3) return WATERCOLOR_MIX_DEFAULT
  // Empty tokens rejected explicitly: Number('') is 0, not NaN, so a string of
  // bare separators would otherwise parse as a real "no water, no pigment" mix
  // rather than as the malformed string it is.
  if (!parts[1] || !parts[2]) return WATERCOLOR_MIX_DEFAULT
  const water = Number(parts[1])
  const pigment = Number(parts[2])
  if (!Number.isFinite(water) || !Number.isFinite(pigment)) return WATERCOLOR_MIX_DEFAULT
  return { water: clamp01(water / 100), pigment: clamp01(pigment / 100) }
}

// ─── Pooling at the end of a wet stroke (#468 v4, ADR 011 §4.3) ─────────────

/** Slow enough at liftoff to count as having stopped rather than flicked. */
const POOL_SPEED_MAX = 0.9
/** Below this much water there is nothing to pool. */
const POOL_WATER_MIN = 0.45
/** Most extra dabs a pool can add, at a dead stop with a full brush. */
const POOL_MAX_DABS = 7

/** Appends repeat dabs at the stroke's last position when a wet brush is set
 *  down and lifted slowly, so the end of the mark carries a real puddle instead
 *  of the round cap a swept nib leaves.
 *
 *  Extra *dabs* rather than a special-case term, and that is what makes it
 *  work at all: they are recorded on the operation like any others, so every
 *  participant replays the same pool and an undo removes it with the stroke.
 *  A term that existed only at draw time would show on the artist's screen and
 *  nowhere else — the exact failure ADR 009 §4 documents for tapers.
 *
 *  They land on top of each other, so the ribbon's dwell-creep distance gives
 *  them a real deposit (see _markerSegmentLength) without widening the mark:
 *  more pigment in one place, which is what a puddle is. */
export function applyWatercolorPooling(dabs: Dab[], exitSpeed: number, water: number): void {
  if (!dabs.length || water < POOL_WATER_MIN) return
  const slowness = clamp01(1 - exitSpeed / POOL_SPEED_MAX)
  const wetness = clamp01((water - POOL_WATER_MIN) / (1 - POOL_WATER_MIN))
  const extra = Math.round(POOL_MAX_DABS * slowness * wetness)
  if (extra <= 0) return
  const last = dabs[dabs.length - 1]
  for (let i = 0; i < extra; i++) dabs.push({ ...last })
}

// ─── Taper (ADR 011 §5) ─────────────────────────────────────────────────────
// Both ends far shallower than the brush pen's. That tool tapers to 0.35 at the
// head and up to 0.75 at the tail because a flexible ink nib genuinely does
// arrive and leave at a point. A loaded brush does not: it *lands* — it puts
// down its belly and a small pool of pigment more or less at once — and when it
// leaves it drags a last damp streak rather than a calligraphic point.
//
// The head is baked from arc length, never from speed, for the architectural
// reason ADR 009 states and that applies unchanged here: head dabs are painted
// before the stroke's entry speed has been measured, and arc length is known
// immediately and deterministically.


const TAIL_SPEED_SLOW = 0.5
const TAIL_SPEED_FAST = 2.5
const TAIL_LEN_SLOW_PX = 3
const TAIL_LEN_FAST_PX = 16
const TAIL_DEPTH_SLOW = 0.10
const TAIL_DEPTH_FAST = 0.40

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Narrows the end of a stroke, in place. Structurally applyBrushPenEndTaper
 *  with shallower numbers, including its honest limit (ADR 009 §4, unchanged
 *  here): the tail can never reach further back than the stroke's last
 *  segment, because doing so would mean unpainting pixels already on canvas. */
export function applyWatercolorEndTaper(dabs: Dab[], exitSpeed: number): void {
  if (!dabs.length) return
  const t = (exitSpeed - TAIL_SPEED_SLOW) / (TAIL_SPEED_FAST - TAIL_SPEED_SLOW)
  const tailPx = lerp(TAIL_LEN_SLOW_PX, TAIL_LEN_FAST_PX, t)
  const depth  = lerp(TAIL_DEPTH_SLOW, TAIL_DEPTH_FAST, t)

  let dist = 0
  for (let i = dabs.length - 1; i >= 0; i--) {
    if (i < dabs.length - 1) {
      const next = dabs[i + 1]
      dist += Math.hypot(next.x - dabs[i].x, next.y - dabs[i].y)
    }
    if (dist >= tailPx) break
    const u = dist / tailPx
    dabs[i].size *= 1 - depth * (1 - u)
  }
}
