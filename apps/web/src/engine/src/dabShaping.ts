import type { ToolType } from '@art-lessons/shared'

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
}

// Exact formulas DabSystem._makeDab used before this refactor — kept as the
// default profile so pencil/eraser/smudge (which never had their own
// per-tool geometry, only opacity) render bit-for-bit the same as before.
export const PENCIL_DAB_SHAPING: DabShapingProfile = {
  size:   pressure => 0.3 + 0.7 * pressure,
  aspect: tiltNorm  => 1 + tiltNorm * tiltNorm * tiltNorm * 6.0,
}

// pencil/eraser/smudge never had their own geometry (only opacity branched
// per-tool, see engine/index.ts's _bakeDabOpacity) — they all keep riding
// PENCIL_DAB_SHAPING. 'liner' is wired to it here too as a placeholder;
// #241 replaces this arm with the real fineliner curves (ADR 003 §1-2).
export function shapingForTool(_tool: ToolType): DabShapingProfile {
  return PENCIL_DAB_SHAPING
}
