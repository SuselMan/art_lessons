import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { gain, PRESSURE_RESPONSES, DEFAULT_PRESSURE_RESPONSE, isPressureResponse, type PressureResponse } from './brushPenPresets'
import { tiltOrPathAngle, type DabShapingProfile } from './dabShaping'
import type { PencilPreset } from './pencilPresets'

// #468, ADR 011: watercolor — an experiment, not a tracked release item.
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
 *  0.64 is the *ceiling* — what a pass lays down when the saturation curve is
 *  fully resolved. Raised from v3's 0.42 in v4: pigment now moves that curve
 *  instead of being pinned at its top, so a mid-pigment pass no longer reaches
 *  the ceiling and the whole tool went pale when the level became a real
 *  control. Set by measurement: a mid-pigment ("damp") bar now reads at about
 *  the same depth against paper that v3's flat pass did, so the three named
 *  mixes spread either side of where the tool used to sit rather than all
 *  landing below it. This is the single number to reach for first if it reads
 *  too strong or too weak overall.
 *
 *  `hardness` is inert here for the same reason it is inert for the brush pen:
 *  it drives DAB_FRAG's soft-profile edge, and a ribbon tool's silhouette is
 *  geometry instead. Carried at the brush pen's value rather than an accidental
 *  one. */
export const WATERCOLOR_PRESET: PencilPreset = { opacity: 0.64, hardness: 0.88, sizeMultiplier: 1.0 }

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
 *  hand tremor before the paper ever sees it — so this smooths harder than the
 *  brush pen's 0.35. Not so hard that a deliberate press-and-widen is lost:
 *  that is still the tool's primary control. */
const WATERCOLOR_PRESSURE_SMOOTHING = 0.55

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
    pressureSmoothing: WATERCOLOR_PRESSURE_SMOOTHING,
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
  edgeSoftMax: number
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
    // Upper end of the per-place edge-softness range. Wet edges vary from
    // almost lost to fairly crisp within one mark; dry edges are all crisp,
    // because there is no liquid to feather them.
    edgeSoftMax: mix(0.14, 0.45, water),
    // Coarse pooling. More liquid means more room for it to gather unevenly.
    cloud: mix(0.16, 0.52, water),
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
} {
  return {
    // How much paint each radius of travel lays down — the quantity that feeds
    // the saturation curve, and therefore how quickly the wash reaches its tone.
    depositPerRadius: mix(0.30, 1.10, pigment),
    // Heavy pigment granulates; a dilute wash barely does.
    granulation: mix(0.05, 0.26, pigment),
    // How much settles at the drying perimeter. There is nothing to leave
    // behind in nearly clear water.
    wetEdge: mix(0.22, 0.72, pigment),
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

/** Pigment outlasts water by better than two to one, which is what produces
 *  the dry-brush end of the stroke rather than a stroke that simply fades. */
const PIGMENT_RUN_RADII = 48
const PIGMENT_FLOOR = 0.66

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

export function watercolorPresetString(response: PressureResponse, mixLevels: WatercolorMix): string {
  const pct = (v: number): number => Math.round(clamp01(v) * 100)
  return `${response}:${pct(mixLevels.water)}:${pct(mixLevels.pigment)}`
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

/** Width multiplier at the very first dab. Barely a taper at all. */
const HEAD_TAPER_START = 0.72
/** Arc length (canvas px) over which the head ramps back to full width. */
const HEAD_TAPER_PX = 6

/** Narrows the first few px of a stroke, in place. Same signature and same
 *  batch-continuity contract as applyBrushPenHeadTaper — `arcLenBefore` is the
 *  arc length earlier batches of this same stroke already travelled, so the
 *  taper does not restart at every pointer-event boundary. Returns the running
 *  arc length for the next call. */
export function applyWatercolorHeadTaper(dabs: Dab[], prevDab: Dab | undefined, arcLenBefore: number): number {
  let arc = arcLenBefore
  let prev = prevDab
  for (const dab of dabs) {
    if (prev) arc += Math.hypot(dab.x - prev.x, dab.y - prev.y)
    if (arc < HEAD_TAPER_PX) {
      dab.size *= HEAD_TAPER_START + (1 - HEAD_TAPER_START) * (arc / HEAD_TAPER_PX)
    }
    prev = dab
  }
  return arc
}

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
