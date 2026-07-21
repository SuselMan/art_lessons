import type { Dab } from '@art-lessons/shared'
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

// ─── Flow (ADR 003 §3, §7) ──────────────────────────────────────────────────
// "Flow" here means the per-dab opacity multiplier baked in by
// engine/index.ts's _bakeDabOpacity. Deliberately does NOT re-derive its own
// pressure response (ADR 003 §2's "flow = baseFlow * lerp(0.9, 1.12,
// pressureCurve)") from `dab.pressure` here — by the time a dab reaches
// _bakeDabOpacity, `dab.pressure` has already been remapped by
// DabShapingProfile.depositPressure (dabShaping.ts) from raw stylus pressure
// into the same kind of ~0.94-1.08 multiplier this function would otherwise
// produce, and DAB_FRAG multiplies that value into the deposit gate
// (u_pressure) directly — feeding the *already-remapped* value through a
// second independent pressure curve here would double-apply it (and, worse,
// collapse most of this curve's range, since its input would then sit inside
// [0.94, 1.08] instead of the [0, 1] it expects). Pressure's contribution to
// flow lives in exactly one place (the shader-level gate); this file only
// adds speed and tilt on top.

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
// as PENCIL_PRESETS' own interpolation comment).
const LINER_SPEED_FLOW_MAX = 1.08 // ADR 003 §3: "~1.08 на медленном"
const LINER_SPEED_FLOW_MIN = 0.88 // ADR 003 §3: "до 0.88 на очень быстром"
const LINER_SPEED_FLOW_SLOPE = (LINER_SPEED_FLOW_MAX - LINER_SPEED_FLOW_MIN) / 2 // reaches the floor by speed≈2

/** ADR 003 §3: speedResponse — soft range, not the pencil's one-directional
 *  fade. Slow movement (including a near-stopped pointer right before
 *  release) sits near the max, which is also what stands in for the
 *  "маленькая dwell-точка на остановке" behavior in §6/§9 — no separate
 *  idle-dab timer exists (or exists for any tool: DabSystem only emits dabs
 *  along actual movement, see its arc-length spacing), so a stroke that
 *  slows to a stop before lifting naturally ends on this curve's high end
 *  instead of needing a bespoke mechanism. */
export function linerSpeedFlow(speed: number): number {
  return clamp(LINER_SPEED_FLOW_MAX - speed * LINER_SPEED_FLOW_SLOPE, LINER_SPEED_FLOW_MIN, LINER_SPEED_FLOW_MAX)
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
// "Без pressure-taper в ноль" is already structurally guaranteed by
// DabShapingProfile's width/depositPressure floors (dabShaping.ts) — a
// stylus reporting near-zero pressure right at liftoff never shrinks or
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
