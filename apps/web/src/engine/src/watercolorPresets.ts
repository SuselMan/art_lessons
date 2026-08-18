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
 *  0.42 is the *fully built* density of one pass at full pressure over a spot
 *  the brush dwelt on; a normal moving stroke lands well under it (see
 *  WATERCOLOR_SATURATE_INK). Uncalibrated first pass, and this is the single
 *  number to reach for first if the tool reads too strong or too weak.
 *
 *  `hardness` is inert here for the same reason it is inert for the brush pen:
 *  it drives DAB_FRAG's soft-profile edge, and a ribbon tool's silhouette is
 *  geometry instead. Carried at the brush pen's value rather than an accidental
 *  one. */
export const WATERCOLOR_PRESET: PencilPreset = { opacity: 0.42, hardness: 0.88, sizeMultiplier: 1.0 }

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
  return presetName && isPressureResponse(presetName) ? presetName : DEFAULT_WATERCOLOR_RESPONSE
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'watercolor'. */
export function shapingForWatercolorPreset(presetName: string | undefined): DabShapingProfile {
  return WATERCOLOR_SHAPING_BY_RESPONSE[watercolorResponseFromPreset(presetName)]
}

// ─── Water load (#468 v3, ADR 011 §3.8) ─────────────────────────────────────
//
// A loaded brush does not lay the same wash from the first centimetre to the
// last. It unloads: the film thins, the pigment-to-water ratio shifts, and the
// far end of a long stroke is visibly drier than its beginning. v1 and v2 had
// no way to express this at all — see ADR 011 §3.8 for why (the deposit that
// feeds the saturation curve was unnormalized and hit the 8-bit ceiling on the
// very first dab, so `density` was pinned at 1 everywhere and nothing about
// how much paint was actually laid could reach the composite).
//
// Modelled as plain exponential decay toward a floor, integrated along the
// stroke in units of the brush's *own radius* rather than in pixels. Radii,
// not pixels, is the whole point: a big brush carries proportionally more
// water and lays proportionally more wash before it runs dry, so a 12px liner-
// sized brush and a 120px wash brush should deplete over very different
// distances and the same two numbers should describe both.

/** How many brush radii of travel it takes to spend most of the load. 18 is
 *  deliberately long: an ordinary stroke should barely show depletion at all,
 *  and only a genuinely long sweep should visibly dry out. Lower this and every
 *  mark starts fading, which reads as a failing brush rather than as watercolor.
 *
 *  Measured rather than guessed. At 18 an 8-radius mark — a short one, 360px
 *  for a 90px brush — already lost a quarter of its load and visibly faded,
 *  which is not what a loaded round brush does over that distance. At 26 the
 *  same mark keeps ~82% and reads flat, while a 40-radius sweep still falls to
 *  ~47% and dries out plainly. */
const WATER_RUN_RADII = 26

/** Where depletion bottoms out. Never 0 — a brush dragged a long way is drier,
 *  not empty; a real one keeps laying a thin wash until it is lifted.
 *
 *  Raised from 0.32 after looking at a full test sheet: at that depth every
 *  mark on the page visibly faded out and depletion drowned the other three
 *  cues the tool has. Worse, a *small* brush covers far more of its own radii
 *  over the same screen distance than a large one, so thin strokes emptied
 *  almost completely — physically defensible, and still the wrong thing to see
 *  on every line. 0.45 keeps the effect legible on a long sweep without letting
 *  it dominate the material. */
const WATER_FLOOR = 0.45

/** Water remaining after `usedRadii` radii of travel, in 0..1.
 *
 *  `usedRadii` is a *path integral*: each segment contributes its own length
 *  divided by the radius the brush had over that segment, so a stroke that
 *  swells and thins under pressure depletes correctly rather than being
 *  measured against whatever its final width happened to be. The engine
 *  accumulates it across batches on the stroke's own scratch, which is what
 *  makes a live stroke, a one-shot replay and a chunked replay all agree. */
export function watercolorWaterLoad(usedRadii: number): number {
  return WATER_FLOOR + (1 - WATER_FLOOR) * Math.exp(-usedRadii / WATER_RUN_RADII)
}

/** How far one segment advances the depletion clock. Separated from the decay
 *  above so the engine never has to know the run length, and so both halves are
 *  testable without a GL context. */
export function watercolorWaterStep(segmentLengthPx: number, radiusPx: number): number {
  return segmentLengthPx / Math.max(radiusPx, 0.5)
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
