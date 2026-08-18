import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { tiltOrPathAngle, type DabShapingProfile } from './dabShaping'
import type { PencilPreset } from './pencilPresets'

// This file and dabShaping.ts import from each other, the same safe circular
// edge markerPresets.ts already documents at length: everything crossing the
// boundary is either a function declaration (hoisted at link time, before
// either module's body runs) or a type-only import (erased outright). Never
// add a top-level `const` re-export across it — that is the shape that
// actually breaks.

// #454, ADR 009: the brush pen — a flexible nib whose contact patch changes
// several-fold under hand pressure. The whole tool is that one fact; everything
// in this file follows from it.
//
// The distinction that matters is against the liner, not against the pencil.
// A fineliner's width swings ±7% (LINER_WIDTH_FLOOR/_CEIL in dabShaping.ts)
// because a steel or fibre tip of a fixed gauge does not deform. A brush pen's
// swings from 0.15 to 1.0 of its nominal size, and a user who cannot feel that
// within a few strokes has been handed the wrong tool.

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

// ─── Preset (ADR 009 §9) ────────────────────────────────────────────────────
// Ink is a covering deposit, not a translucent film — so this is close to
// opaque on the first pass, unlike the marker's own dye presets, and closer to
// LINER_PRESET than to anything graphite.
//
// `hardness` is inert for this tool: it feeds DAB_FRAG's soft-profile edge
// (innerEdge = hardness*0.85), and the brush pen's silhouette comes from the
// ribbon's own geometry instead (ADR 009 §1), whose edge is a fixed canvas-px
// ramp. Set to the liner's value anyway rather than left at some accidental
// number, so a future path that does read it gets ink-like behaviour.
export const BRUSH_PEN_PRESET: PencilPreset = { opacity: 0.97, hardness: 0.88, sizeMultiplier: 1.0 }

// ─── Pressure → width (ADR 009 §2) ──────────────────────────────────────────
// One curve, three configs — the same discipline tiltCurve.ts states for tilt
// (materials differ in their numbers, never in the shape of the function).
//
//   width(p) = FLOOR + (1 - FLOOR) · gain(p, k)
//
// `gain` is symmetric about (0.5, 0.5) and flat at both ends, which is not a
// compromise but exactly the two things ADR 009 asks for at once:
//
//  - **flat bottom** — a light touch really can hold a very thin line, and the
//    hand doesn't have to find a narrow slot of pressure values to do it.
//  - **flat top** — width almost stops growing past ~85% pressure, so the pen
//    can be leaned on hard without a jump in thickness, the way a real flexible
//    nib has a physical limit to how far it flattens. ADR 009 asks for that
//    soft saturation as its own requirement; it needs no mechanism of its own
//    because it *is* the shape of this curve.
//
// A linear `min + pressure * range` is explicitly rejected by the ADR: it draws
// a digital sausage of varying diameter, not a pen stroke.

/** Never thinner than this fraction of the nominal size — a nib that vanishes
 *  at light pressure is unusable, and stylus pressure near zero is mostly
 *  noise (see BRUSH_PEN_MIN_PRESSURE, which guards the other end of the same
 *  problem). */
const BRUSH_PEN_WIDTH_FLOOR = 0.15

/** Floor under the *reported* pressure while the pen is down. Tablets emit
 *  unstable near-zero values in the first samples after contact; without this
 *  the head of a stroke breaks up. Distinct from the width floor above: this
 *  one is about believing the device, that one about the nib's own geometry. */
export const BRUSH_PEN_MIN_PRESSURE = 0.05

/** Symmetric S-curve, standard `gain` shape: k = 1 is the identity, k > 1
 *  concentrates the response in the middle of the range and flattens both
 *  ends. Exactly invertible and monotone for any k > 0, so a recorded dab's
 *  width never fails to correspond to some pressure.
 *
 *  Exported for watercolorPresets.ts (#468), which needs the identical curve
 *  under a different width floor — a wet round brush and a brush-pen nib both
 *  open up under pressure with flat ends, they just start from different
 *  minimum contact patches. A function *declaration*, so this cross-import is
 *  the same hoisted-at-link-time shape this file's header already permits. */
export function gain(x: number, k: number): number {
  const t = clamp01(x)
  return t < 0.5
    ? 0.5 * Math.pow(2 * t, k)
    : 1 - 0.5 * Math.pow(2 - 2 * t, k)
}

/** How firm the nib feels, as a user setting (ADR 009 §2). Modelled on #409's
 *  tilt responses: the user gets three named feels, never a curve editor —
 *  "how fast should this come on" depends on the hand and the grip, so it is a
 *  choice rather than a number to be discovered.
 *
 *  Only `k` differs. The width floor and the pressure floor are the same in all
 *  three: those are properties of the nib, not preferences of the hand. */
export type PressureResponse = 'soft' | 'normal' | 'firm'

export const PRESSURE_RESPONSES = ['soft', 'normal', 'firm'] as const satisfies readonly PressureResponse[]

export const DEFAULT_PRESSURE_RESPONSE: PressureResponse = 'normal'

export function isPressureResponse(v: string): v is PressureResponse {
  return (PRESSURE_RESPONSES as readonly string[]).includes(v)
}

/** soft — the nib opens up early; firm — it has to be pushed. `normal` is the
 *  curve ADR 009 tabulates: against the anchors the spec asked for (0.2→0.25,
 *  0.5→0.55, 0.8→0.85) it lands at 0.273 / 0.575 / 0.877, i.e. the right shape
 *  sitting ~0.025 high through the middle. Uncalibrated first pass like every
 *  other constant of a new tool here — retuning is this one number. */
const PRESSURE_RESPONSE_K: Record<PressureResponse, number> = {
  soft:   1.05,
  normal: 1.35,
  firm:   1.80,
}

/** Width as a fraction of the nominal size, for an already-floored pressure. */
export function brushPenWidth(pressure: number, response: PressureResponse): number {
  return BRUSH_PEN_WIDTH_FLOOR + (1 - BRUSH_PEN_WIDTH_FLOOR) * gain(pressure, PRESSURE_RESPONSE_K[response])
}

// ─── Pressure smoothing (ADR 009 §3) ────────────────────────────────────────
// Raw tablet pressure is noisy, and nothing in this project smooths it today —
// PointerInput passes e.pressure through untouched. The brush pen is the first
// tool whose mark shows that noise, exactly as charcoal was the first whose
// mark showed tilt noise (#305).
//
// Deliberately livelier than charcoal's tilt filter (CHARCOAL_FEEL.smoothing):
// tilt smoothing is filtering out hand tremor in how the stylus is *held*,
// while pressure here is a deliberate expressive act — over-smooth it and the
// fast thickness changes the tool exists for never reach the screen.
//
// Separate from coordinate smoothing by construction, which is the other thing
// ADR 009 asks for: coordinates are smoothed by the spline, pressure by this.
export const BRUSH_PEN_PRESSURE_SMOOTHING = 0.35

// ─── Dab shaping (ADR 009 §2, §6) ───────────────────────────────────────────

function brushPenShapingFor(response: PressureResponse): DabShapingProfile {
  return {
    // The pressure floor lives here rather than in PointerInput because it is a
    // property of this tool's reading of the device, not of the device: every
    // other tool still sees the true reported value, and Dab.pressure keeps
    // storing the real one (see dabShaping.ts's #245 note on why a per-tool
    // remap of the stored pressure was reverted once already).
    size:   pressure => brushPenWidth(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), response),
    // ADR 009 §6: a soft round-to-slightly-oval brush nib. 1.0 upright, about
    // 1.1 at a tilt a hand actually reaches — enough to keep the mark from
    // reading as a perfect circle stamped along a path, nowhere near enough to
    // let tilt compete with pressure for control of the width. A strong tilt
    // response would turn this into a marker or a charcoal stick, which are the
    // two tools it most needs to not be.
    aspect: tiltNorm => 1 + 0.25 * tiltNorm,
    // Nothing tool-specific about the angle — the same tilt-or-path formula
    // every tool that isn't a chisel uses.
    angle:  tiltOrPathAngle,
    // #305's low-pass, applied to pressure instead of tilt (DabSystem's own
    // _filterPressure). Opt-in per profile exactly as tiltSmoothing is, so no
    // other tool pays for it.
    pressureSmoothing: BRUSH_PEN_PRESSURE_SMOOTHING,
  }
}

const BRUSH_PEN_SHAPING_BY_RESPONSE: Record<PressureResponse, DabShapingProfile> = {
  soft:   brushPenShapingFor('soft'),
  normal: brushPenShapingFor('normal'),
  firm:   brushPenShapingFor('firm'),
}

/** The brush pen has no size ladder and no nib list, so its `presetName` slot —
 *  the same per-stroke string that carries a pencil grade, a charcoal type or
 *  a marker's `${nib}:${size}` — is free to carry the pressure response
 *  instead. That keeps the setting on the recorded StrokeOperation with no new
 *  field and no new plumbing, so a peer replays the stroke with the response it
 *  was actually drawn with rather than whatever they have selected.
 *
 *  Falls back to `normal` for a missing or unrecognized token, same defensive
 *  default markerNibFromPreset takes. */
export function brushPenResponseFromPreset(presetName: string | undefined): PressureResponse {
  return presetName && isPressureResponse(presetName) ? presetName : DEFAULT_PRESSURE_RESPONSE
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'brushPen'. */
export function shapingForBrushPenPreset(presetName: string | undefined): DabShapingProfile {
  return BRUSH_PEN_SHAPING_BY_RESPONSE[brushPenResponseFromPreset(presetName)]
}

// ─── Taper (ADR 009 §4) ─────────────────────────────────────────────────────
// Without a narrowing at both ends the tool reads as a tube of varying
// diameter. With too much of one it stops being controllable — so both tapers
// here are short.
//
// The two ends are *not* symmetric, and the reason is architectural rather
// than aesthetic. Head dabs are painted live, before anything about the rest of
// the stroke is known — in particular the entry speed has not been measured
// yet. Arc length travelled is known immediately and is deterministic, so it is
// what the head taper runs on; every participant replaying the operation
// recomputes nothing at all, because the taper is baked into the dab's size
// before it is ever recorded.

/** Width multiplier at the very first dab of a stroke. */
const HEAD_TAPER_START = 0.35
/** Arc length (canvas px) over which the head ramps back up to full width.
 *  Short on purpose: ADR 009 rejects a long decorative taper. */
const HEAD_TAPER_PX = 10

/**
 * Narrows the first few px of a stroke, in place. `arcLenBefore` is the arc
 * length already travelled by earlier batches of this same stroke (0 for the
 * first), `prevDab` the last dab of that batch — both needed because a stroke
 * arrives in batches whose boundaries are an artefact of pointer event timing,
 * and the taper must not restart at each one.
 *
 * Returns the running arc length including this batch, for the next call.
 */
export function applyBrushPenHeadTaper(dabs: Dab[], prevDab: Dab | undefined, arcLenBefore: number): number {
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

// The tail, unlike the head, can use the exit speed — by the time endStroke
// runs it has been measured. Same post-process shape as the liner's
// applyLinerEndTaper, with two differences: it goes far deeper (a liner tapers
// at most 15%, a brush pen up to 75%), and it ramps over arc *length* rather
// than over a dab count, because dab count depends on spacing and length
// doesn't.
//
// Speed sets both how long and how deep, which is what makes a quick flick end
// in a point and a deliberate stop end square. That works because of a
// coincidence worth stating: samples arrive on a clock, so a fast stroke's
// final segment is *long* — exactly when a long taper is wanted — while a slow
// one's is short, where there is nothing to taper anyway. The honest limit of
// this approach, recorded in ADR 009 §4: the tail can never be longer than the
// stroke's last segment. Reaching further back would mean unpainting pixels
// already on the canvas, and holding the tail back until liftoff would add
// latency at the tip, which is the one thing #104 spent its effort removing.

const TAIL_SPEED_SLOW = 0.5  // at/below: barely any taper — the pen was simply lifted
const TAIL_SPEED_FAST = 2.5  // at/above: full length and depth
const TAIL_LEN_SLOW_PX = 4
const TAIL_LEN_FAST_PX = 22
const TAIL_DEPTH_SLOW = 0.25
const TAIL_DEPTH_FAST = 0.75

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Narrows the end of a stroke, in place. `dabs` is the final segment's dabs
 *  as returned by DabSystem.endStroke; `exitSpeed` the pointer speed at
 *  release (the same `e.speed` the liner's own taper reads). */
export function applyBrushPenEndTaper(dabs: Dab[], exitSpeed: number): void {
  if (!dabs.length) return
  const t = (exitSpeed - TAIL_SPEED_SLOW) / (TAIL_SPEED_FAST - TAIL_SPEED_SLOW)
  const tailPx = lerp(TAIL_LEN_SLOW_PX, TAIL_LEN_FAST_PX, t)
  const depth  = lerp(TAIL_DEPTH_SLOW, TAIL_DEPTH_FAST, t)

  // Walked backwards from the last dab: `u` is the distance from the tip,
  // normalized by the taper's length, so the multiplier is 1 - depth at the
  // very tip and 1 where the taper begins. Linear in width, i.e. a straight-
  // sided point — the shape a real brush tip leaves.
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
