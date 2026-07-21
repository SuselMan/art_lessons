import type { Dab, ToolType } from '@art-lessons/shared'
import { clamp } from 'lodash-es'

import type { PencilPreset } from './pencilPresets'

// Fixed calibrated width steps (ADR 003, MVP scope) — real fineliner sets
// ship discrete tip sizes, not a free slider; a free/advanced size is a UI
// concern (#243), not an engine one (any pixel width reaches the engine via
// the same physicalSize path regardless of which UI control produced it).
export const LINER_SIZES_MM = [0.1, 0.2, 0.3, 0.5, 0.8] as const

export type LinerSizeMm = (typeof LINER_SIZES_MM)[number]

// Unlike graphite (PENCIL_PRESETS' per-grade opacity/hardness/sizeMultiplier
// spread), a fineliner has no hardness scale — every calibrated width is the
// same pigment ink through a different nozzle diameter, so one flat preset
// covers all of them:
//  - opacity: high — a fineliner reaches near-saturated coverage on the
//    first pass (ADR 003 §5), unlike graphite's per-grade opacity anchors.
//  - hardness: high (crisp edge) — innerEdge = hardness*0.85 in DAB_FRAG, so
//    a value near eraser's own 0.85 gives a hard-edged core instead of
//    graphite's soft falloff (ANCHOR_H..2B range 0.25-0.55).
//  - sizeMultiplier: 1 — the calibrated mm steps above already encode the
//    physical width directly; no extra per-preset radius fudge needed.
export const LINER_PRESET: PencilPreset = { opacity: 0.95, hardness: 0.88, sizeMultiplier: 1.0 }

// ─── Flow (ADR 003 §3, §7, revised #245) ────────────────────────────────────
// "Flow" here means the per-dab opacity multiplier baked in by
// engine/index.ts's _bakeDabOpacity. Pressure's own contribution to flow
// lives in the shader instead (DAB_FRAG's u_inkMode branch derives its
// deposit-pressure floor straight from the real per-fragment pressure — see
// that branch's own comment) — this file only adds speed and tilt on top.
//
// Physical model agreed with Ilya (2026-07-21 chat), replacing the original
// ADR §3's mild ±8-12% curve: ink leaves the tip at roughly a constant rate
// *per unit time*, not a fixed amount per dab. A fast stroke spreads that
// same rate over more distance -> less ink per unit length -> visibly
// lighter; a slow stroke concentrates it -> visibly darker. This unifies
// speed's own effect with dwell's (linerDwell.ts... see dwellFlow below) —
// both are the same underlying "ink accumulates over time, not distance"
// idea, just measured two different ways (instantaneous speed while
// moving vs. elapsed time while fully stopped).

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

// speed unit matches the same `speed` PointerInput/_bakeDabOpacity already
// use for pencil's own speedFactor (Math.max(0.7, 1 - speed*0.15), floor at
// speed≈2) — reusing that scale so "very fast" means the same thing for both
// tools. First-pass, not yet calibrated against a real device (same caveat
// as PENCIL_PRESETS' own interpolation comment) — verify by eye against a
// real stroke and retune LINER_SPEED_REFERENCE/_MIN/_MAX if the effect reads
// too strong or too weak.
const LINER_SPEED_REFERENCE = 1    // "comfortable" drawing speed -> flow 1.0 (baseline, no change)
const LINER_SPEED_FLOW_MIN = 0.5   // very fast stroke -> visibly lighter
const LINER_SPEED_FLOW_MAX = 1.4   // very slow stroke -> visibly darker/thicker, continuous with dwellFlow's own start
const LINER_SPEED_EPS = 0.05       // guards divide-by-zero as speed -> 0; clamp (not this) does the real bounding

/** ADR 003 §3 (revised #245): flow ~ REFERENCE / speed — a real inverse
 *  relationship (ink deposited per unit length rises as speed drops),
 *  clamped to a sane range instead of the original mild linear curve.
 *  Continuous with dwellFlow's own start value (both equal 1.0 at
 *  "comfortable" speed / zero elapsed dwell), so a stroke slowing toward a
 *  stop doesn't visibly jump when _paintDwellDab's timer takes over once
 *  DabSystem itself stops producing dabs (see engine/index.ts's own dwell
 *  comment for why that handoff exists at all). */
export function linerSpeedFlow(speed: number): number {
  return clamp(LINER_SPEED_REFERENCE / Math.max(speed, LINER_SPEED_EPS), LINER_SPEED_FLOW_MIN, LINER_SPEED_FLOW_MAX)
}

/** ADR 003 §7: tilt affects flow only in the extreme range — almost no
 *  effect below 55°, a mild reduction 55-70°, a bit more past 70° (never
 *  agressive at ordinary writing angles). `tiltDeg` is tiltMag in degrees
 *  (see DabSystem's own tiltMag = hypot(tiltX, tiltY)), not the normalized
 *  tiltNorm DabShapingProfile.aspect uses. */
export function linerTiltFlow(tiltDeg: number): number {
  if (tiltDeg < 55) return 1
  if (tiltDeg < 70) return lerp(1, 0.95, (tiltDeg - 55) / 15)
  return lerp(0.95, 0.85, (tiltDeg - 70) / 20)
}

// ─── Start/end (ADR 003 §6) ─────────────────────────────────────────────────
// "Без pressure-taper в ноль" is already guaranteed by DabShapingProfile's
// own width floor (dabShaping.ts) and DAB_FRAG's shader-level deposit floor
// — a stylus reporting near-zero pressure right at liftoff never shrinks or
// fades the line to nothing. The one taper this tool *does* want is the
// opposite case: a fast release should narrow the very tip slightly (ADR:
// "5-15%"), which pressure alone can't express (a fast flick often still
// reports full pressure right up to release) — this needs the exit speed
// _onEnd already has (e.speed), applied as a post-process over the last few
// dabs of the final segment, independent of DabSystem's own geometry.
const LINER_TAPER_SPEED_START = 0.8 // below this, no taper at all
const LINER_TAPER_SPEED_FULL  = 2.5 // at/above this, taper is maxed out
const LINER_TAPER_MAX = 0.15        // ADR: "сужение на 5-15%"
const LINER_TAPER_DAB_COUNT = 4     // ramp over the last N dabs of the final segment

/** Mutates `dabs` (the final segment's dabs from DabSystem.endStroke) in
 *  place, shrinking the last few dabs' `size` when the pointer was still
 *  moving fast at release. A no-op for a slow/stopped release — see this
 *  file's own comment on why that case needs no special handling. First-pass
 *  thresholds, not yet calibrated against a real device (same caveat as
 *  PENCIL_PRESETS' own interpolation comment). */
export function applyLinerEndTaper(dabs: Dab[], exitSpeed: number): void {
  if (!dabs.length) return
  const strength = lerp(0, LINER_TAPER_MAX, (exitSpeed - LINER_TAPER_SPEED_START) / (LINER_TAPER_SPEED_FULL - LINER_TAPER_SPEED_START))
  if (strength <= 0) return
  const n = Math.min(LINER_TAPER_DAB_COUNT, dabs.length)
  for (let i = 0; i < n; i++) {
    const d = dabs[dabs.length - n + i]
    const t = (i + 1) / n // ramps toward the very last dab
    d.size *= 1 - strength * t
  }
}

// ─── Dwell (#245, ADR 003 §3/§9 revised) ────────────────────────────────────
// A resting stylus keeps leaking ink into the same spot — the same
// constant-flow-over-time model linerSpeedFlow above uses for a moving
// stroke, taken to its limit as speed -> 0. DabSystem itself never produces
// a dab for a stationary pointer (its arc-length spacing needs real
// distance travelled, see continueStroke's own >0.5px guard) for any tool,
// so this needs its own timer-driven mechanism in the engine
// (PencilEngine._paintDwellDab) — this file only owns the *config* and the
// pure elapsed-time -> flow curve, kept generic per-tool (not liner-only)
// since Ilya flagged this will matter for Rapidograph and possibly a future
// marker tool too.

export interface DwellConfig {
  /** Net movement (px) below which the pointer counts as "resting" — see
   *  engine/index.ts's own _dwellAnchorX/Y for how this is tracked. */
  stillThresholdPx: number
  /** How often (ms) the engine's timer checks in and, if still resting,
   *  paints one more pooling dab. */
  intervalMs: number
  /** Grace period (ms) after movement stops before the first pooling dab —
   *  without this, an ordinary stroke's brief pause at a corner would start
   *  visibly pooling ink; only a genuinely sustained rest should. */
  minDwellMs: number
  /** Time constant (ms) for dwellFlow's own saturating ramp — larger means
   *  it takes longer to approach maxFlow. */
  tau: number
  /** Ceiling flow can ever reach while dwelling — bounds how dark a resting
   *  point can get, matching linerSpeedFlow's own upper bound at speed 0. */
  maxFlow: number
}

// First-pass, not yet calibrated against a real device (same caveat as
// PENCIL_PRESETS' own interpolation comment) — verify by eye and retune.
export const LINER_DWELL: DwellConfig = {
  stillThresholdPx: 2,
  intervalMs: 70,
  minDwellMs: 150,
  tau: 250,
  maxFlow: LINER_SPEED_FLOW_MAX,
}

/** Saturating ramp from 1.0 (the instant movement stops — continuous with
 *  linerSpeedFlow's own value at "comfortable" speed) up toward
 *  cfg.maxFlow as elapsedMs (time since the pointer last moved past
 *  cfg.stillThresholdPx) grows — an exponential approach, never actually
 *  reaching the ceiling but close enough within a few multiples of
 *  cfg.tau. */
export function dwellFlow(elapsedMs: number, cfg: DwellConfig): number {
  return 1 + (cfg.maxFlow - 1) * (1 - Math.exp(-elapsedMs / cfg.tau))
}

/** Only 'liner' opts in today — Technical Pen/Rapidograph and a possible
 *  future marker are expected to reuse this same mechanism with their own
 *  DwellConfig once they exist (see this section's own file comment); every
 *  other current tool gets null (no dwell timer at all, unchanged from
 *  before this existed). */
export function dwellConfigForTool(tool: ToolType): DwellConfig | null {
  return tool === 'liner' ? LINER_DWELL : null
}
