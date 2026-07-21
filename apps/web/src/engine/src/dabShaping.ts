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
  /** Remaps pressure before it reaches DAB_FRAG's deposit gate (u_pressure) —
   *  geometry above always sees the real stylus pressure; this only affects
   *  how strongly *ink deposit* responds to it. Omitted = identity, i.e.
   *  pencil's real pressure-gated deposit (a light touch fades to nothing).
   *  A fineliner needs a floor here (ADR 003 §6: no taper to zero even at
   *  near-zero reported pressure), which the size curve's own floor alone
   *  can't provide — size only ever scaled dab *radius*, but DAB_FRAG's
   *  `deposit = v_pressure * v_opacity * effectiveCatch * shape + ...`
   *  multiplies raw pressure into ink amount directly. */
  depositPressure?(pressure: number): number
}

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

// Exact formulas DabSystem._makeDab used before this refactor — kept as the
// default profile so pencil/eraser/smudge (which never had their own
// per-tool geometry, only opacity) render bit-for-bit the same as before.
export const PENCIL_DAB_SHAPING: DabShapingProfile = {
  size:   pressure => 0.3 + 0.7 * pressure,
  aspect: tiltNorm  => 1 + tiltNorm * tiltNorm * tiltNorm * 6.0,
}

// ADR 003 §1-2, §6: width/deposit swing only ±7-15% with pressure — never
// the pencil's several-fold size change, and never tapering to zero at the
// stylus's near-zero-pressure liftoff (a real fineliner's tip stays in
// contact right up to release).
const LINER_WIDTH_FLOOR = 0.94
const LINER_WIDTH_CEIL  = 1.08

export const LINER_DAB_SHAPING: DabShapingProfile = {
  size:            pressure  => lerp(LINER_WIDTH_FLOOR, LINER_WIDTH_CEIL, pressure),
  // ADR 003 §1: "короткий цилиндрический наконечник" — a mild ellipticity,
  // not the pencil's tiltNorm^3*6 (which reaches x7 at full tilt).
  aspect:          tiltNorm  => 1 + 0.15 * tiltNorm,
  depositPressure: pressure  => lerp(LINER_WIDTH_FLOOR, LINER_WIDTH_CEIL, pressure),
}

// pencil/eraser/smudge never had their own geometry (only opacity branched
// per-tool, see engine/index.ts's _bakeDabOpacity) — they all keep riding
// PENCIL_DAB_SHAPING.
export function shapingForTool(tool: ToolType): DabShapingProfile {
  return tool === 'liner' ? LINER_DAB_SHAPING : PENCIL_DAB_SHAPING
}
