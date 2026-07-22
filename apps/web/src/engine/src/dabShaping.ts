import type { ToolType } from '@art-lessons/shared'
import { clamp } from 'lodash-es'

// Per-tool pressure→size and tilt→aspect response curves for DabSystem's
// dab geometry (#240). Previously hardcoded directly in DabSystem._makeDab
// as graphite-pencil curves shared by every tool — only per-dab *opacity*
// branched by tool (see engine/index.ts's _bakeDabOpacity). The fineliner
// (#238) needs a fundamentally different response (±7-15%, not the
// pencil's several-fold swing), so the curves themselves must be
// selectable per tool instead.

export interface DabShapingProfile {
  /** Multiplier on baseSize, given 0..1 smoothed pressure. */
  size(pressure: number): number
  /** Aspect ratio (1 = circular), given tiltNorm = tiltMag/90 (unclamped). */
  aspect(tiltNorm: number): number
  /**
   * Per-dab angle (radians). Given the raw tilt magnitude/components and the
   * spline's path-tangent angle at this dab, so a profile can derive angle
   * from either — or ignore both entirely and return a fixed angle (#249,
   * for a chisel-style nib whose edge orientation is a property of the tool,
   * not of tilt or stroke direction).
   */
  angle(tiltMag: number, tiltX: number, tiltY: number, pathAngle: number): number
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

// #249: the angle formula DabSystem._makeDab hardcoded for every tool before
// this refactor — tilt direction wins once tilt is large enough to trust
// (>15deg magnitude), otherwise fall back to the spline's own path-tangent
// direction. Every existing tool (pencil, eraser, smudge, liner) keeps this
// exact formula; it is the default angle mode, not just pencil's.
function tiltOrPathAngle(tiltMag: number, tiltX: number, tiltY: number, pathAngle: number): number {
  return tiltMag > 15 ? Math.atan2(tiltY, tiltX) : pathAngle
}

// Exact formulas DabSystem._makeDab used before this refactor — kept as the
// default profile so pencil/eraser/smudge (which never had their own
// per-tool geometry, only opacity) render bit-for-bit the same as before.
export const PENCIL_DAB_SHAPING: DabShapingProfile = {
  size:   pressure => 0.3 + 0.7 * pressure,
  aspect: tiltNorm  => 1 + tiltNorm * tiltNorm * tiltNorm * 6.0,
  angle:  tiltOrPathAngle,
}

// ADR 003 §1-2, §6: width/deposit swing only ±7-15% with pressure — never
// the pencil's several-fold size change, and never tapering to zero at the
// stylus's near-zero-pressure liftoff (a real fineliner's tip stays in
// contact right up to release).
const LINER_WIDTH_FLOOR = 0.94
const LINER_WIDTH_CEIL  = 1.08

export const LINER_DAB_SHAPING: DabShapingProfile = {
  size:   pressure => lerp(LINER_WIDTH_FLOOR, LINER_WIDTH_CEIL, pressure),
  // ADR 003 §1: "короткий цилиндрический наконечник" — a mild ellipticity,
  // not the pencil's tiltNorm^3*6 (which reaches x7 at full tilt).
  aspect: tiltNorm => 1 + 0.15 * tiltNorm,
  // Liner never had its own angle response either — same tilt-or-path
  // formula as every other tool.
  angle:  tiltOrPathAngle,
}

// #245: the deposit-pressure floor (ADR 003 §6 — no taper to zero at
// near-zero reported pressure) used to be a DabShapingProfile.
// depositPressure hook baked into the *stored* Dab.pressure at record time.
// Reverted: that collapsed Dab.pressure's whole range down to [0.94, 1.08]
// for every liner dab, which then broke the paper-fill mechanism
// (DAB_FRAG's u_inkMode branch) added in the same follow-up — that branch
// needs the real, unfloored pressure to tell a genuinely light touch from a
// firm one (see shaders.ts's own comment). The floor now lives entirely in
// the shader instead, computed straight from the real per-fragment
// pressure, so Dab.pressure stays the true value for every tool, same as
// before #241 ever introduced the hook.

// #249: fixed-angle mode — ignores tilt and path direction entirely, always
// returning the same angle. This is the hook a chisel-nib marker profile
// needs (ADR 004 §1): a flat, elongated dab stamped at a constant angle
// produces a calligraphy-pen-like variable stroke width purely from
// overlapping dab geometry along the spline, with no new pointer-input
// model. Nothing wires this into shapingForTool yet — the marker tool's own
// nib presets are #251's job, not this refactor's.
export function fixedAngleShaping(angleRadians: number): DabShapingProfile['angle'] {
  return () => angleRadians
}

// pencil/eraser/smudge never had their own geometry (only opacity branched
// per-tool, see engine/index.ts's _bakeDabOpacity) — they all keep riding
// PENCIL_DAB_SHAPING.
export function shapingForTool(tool: ToolType): DabShapingProfile {
  return tool === 'liner' ? LINER_DAB_SHAPING : PENCIL_DAB_SHAPING
}
