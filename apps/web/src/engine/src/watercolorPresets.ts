import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { gain, PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, type PressureResponse } from './brushPenPresets'
import { tiltOrPathAngle, type DabShapingProfile, type HeadTaperProfile } from './dabShaping'
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
export const WATERCOLOR_PRESET: PencilPreset = { opacity: 0.77, hardness: 0.88, sizeMultiplier: 1.0 }

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

/** dabShaping.ts's shapingForTool dispatches here for tool === 'watercolor'. */
export function shapingForWatercolorPreset(presetName: string | undefined): DabShapingProfile {
  return WATERCOLOR_SHAPING_BY_RESPONSE[watercolorResponseFromPreset(presetName)]
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
    dryContact: 1 - smoothstepJs(0.20, 0.62, water),
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
    granulation: mix(0.05, 0.26, pigment),
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
    strength: mix(0.12, 1.0, pigment),
  }
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
const WATER_RUN_RADII = 20
/** A brush dragged a long way is damp, not bone dry — and a hand reloads long
 *  before this in practice. */
const WATER_FLOOR = 0.30

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
const PIGMENT_RUN_RADII = 48
const PIGMENT_FLOOR = 0.84

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

/** Pigment remaining after the same travel. Same shape, much longer run. */
export function watercolorPigmentLoad(usedRadii: number): number {
  return PIGMENT_FLOOR + (1 - PIGMENT_FLOOR) * Math.exp(-usedRadii / PIGMENT_RUN_RADII)
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
// The tool has no size ladder and no nib list, so the per-stroke `preset`
// string — the same slot that carries a pencil grade or a marker nib — is free.
// v1 spent it on the pressure response alone; v4 packs the mix into it too, as
// `response:water:pigment` with the two levels as integer percents.
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
): string {
  const pct = (v: number): number => Math.round(clamp01(v) * 100)
  return `${response}:${pct(mixLevels.water)}:${pct(mixLevels.pigment)}:${pigmentCode}`
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
