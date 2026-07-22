import { clamp } from 'lodash-es'

import { fixedAngleShaping, tiltOrPathAngle, type DabShapingProfile } from './dabShaping'
import type { DwellConfig } from './linerPresets'

// #251, ADR 004 §1: the two marker nib dab-shaping profiles. Mirrors
// linerPresets.ts's structure/documentation style, but there's no
// LINER_PRESET-equivalent flat {opacity, hardness, sizeMultiplier} preset
// here — the ADR doesn't call for bullet/chisel to differ on those, so
// engine/index.ts's _resolvePreset keeps one shared MARKER_PRESET for both
// nibs; this file only owns the two DabShapingProfiles that actually do
// differ (shape/angle). No DwellConfig either — dwellConfigForTool
// (linerPresets.ts) already defaults to null for every tool but 'liner',
// and the ADR doesn't ask for marker dwell/pooling.
//
// This file and dabShaping.ts import from each other (this file needs
// tiltOrPathAngle/fixedAngleShaping/the DabShapingProfile type; dabShaping.ts's
// shapingForTool needs shapingForMarkerPreset below to dispatch a 'marker'
// stroke). That's a real circular import, but a safe one: every value that
// crosses the boundary is either a function declaration (hoisted at link
// time, before either module's top-level body runs) or a type-only import
// (erased entirely at compile time) — never a `const` object read from the
// other module at top level, which is the shape of circular import that
// actually breaks (a TDZ reference before the other module has finished
// evaluating). Keep it that way: don't add a top-level `const` re-export
// crossing this boundary in either direction.

function clamp01(v: number): number {
  return clamp(v, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

// ADR 004 §2 (shared with liner, ADR 003 §1-2/§6): a marker's felt/alcohol
// tip doesn't compress under ordinary hand pressure the way graphite does —
// same ±6-8% width swing as LINER_WIDTH_FLOOR/_CEIL, reused verbatim for
// both marker nibs rather than invented fresh (dabShaping.ts's file header
// gives the same reasoning for why liner needed its own curve in the first
// place; marker's case for reusing liner's, rather than pencil's, is that
// same reasoning).
const MARKER_WIDTH_FLOOR = 0.94
const MARKER_WIDTH_CEIL = 1.08

// ADR 004 §1: "Bullet — почти круглый даб, слабая реакция на нажим/наклон,
// тот же принцип, что уже есть у линера — переиспользуем ту же кривую, не
// изобретаем новую." Deliberately its own named export (not a bare
// `export { LINER_DAB_SHAPING as MARKER_BULLET_DAB_SHAPING }`) so a future
// divergence between the two tools doesn't require touching call sites —
// but the formulas themselves are intentionally identical to
// LINER_DAB_SHAPING in dabShaping.ts right now.
export const MARKER_BULLET_DAB_SHAPING: DabShapingProfile = {
  size:   pressure => lerp(MARKER_WIDTH_FLOOR, MARKER_WIDTH_CEIL, pressure),
  aspect: tiltNorm  => 1 + 0.15 * tiltNorm,
  angle:  tiltOrPathAngle,
}

// ADR 004 §1: Chisel's aspect and angle are both fixed properties of the
// nib, not derived from tilt/pressure/path direction at all — "Угол пера —
// часть конфигурации инструмента... не что-то, что подстраивается под
// направление штриха само." First-pass, uncalibrated numbers (same status
// PENCIL_PRESETS'/LINER_DWELL's own "verify by eye and retune" caveat gives
// every first-pass constant in this codebase) — ADR suggests "порядка 4-6:1"
// for aspect (picking the middle of that range) and "что-то около 45°" for
// angle; real calibration is a QA pass, not this issue.
const MARKER_CHISEL_ASPECT_RATIO = 5              // uncalibrated first pass, ADR 004 §1 range 4-6:1
const MARKER_CHISEL_ANGLE_RADIANS = Math.PI / 4   // uncalibrated first pass, ADR 004 §1 "~45°"

export const MARKER_CHISEL_DAB_SHAPING: DabShapingProfile = {
  // ADR 004 §2: chisel gets the same weak pressure response as bullet/liner
  // — a real chisel-tip marker doesn't compress any more than a bullet one.
  size:   pressure => lerp(MARKER_WIDTH_FLOOR, MARKER_WIDTH_CEIL, pressure),
  // Fixed elongation, ignores tiltNorm entirely.
  aspect: () => MARKER_CHISEL_ASPECT_RATIO,
  // Fixed angle (#249's hook), ignores tilt/path entirely.
  angle:  fixedAngleShaping(MARKER_CHISEL_ANGLE_RADIANS),
}

export type MarkerNib = 'bullet' | 'chisel'

// #252's toolbar sends the preset string as `${nib}:${size}` (e.g.
// "bullet:0.3") through the same channel pencil sends its grade name
// through — only the nib half matters for dab shaping (the size half
// arrives separately, via the engine's own setSize/base-size channel).
// Falls back to 'bullet' for a missing/unrecognized token — the smaller,
// less visually different nib is the safer default than silently rendering
// a stroke as the much more distinctive chisel shape.
export function markerNibFromPreset(presetName: string | undefined): MarkerNib {
  const token = presetName?.split(':')[0]
  return token === 'chisel' ? 'chisel' : 'bullet'
}

/** dabShaping.ts's shapingForTool dispatches here for tool === 'marker'. */
export function shapingForMarkerPreset(presetName: string | undefined): DabShapingProfile {
  return markerNibFromPreset(presetName) === 'chisel' ? MARKER_CHISEL_DAB_SHAPING : MARKER_BULLET_DAB_SHAPING
}

// ADR 004 "Ревизия v1.5" §1/§4 (expert's proposal): pressure gets its own
// named term in the deposit formula (`flowPerDistance * segmentLength *
// pressureFactor`) instead of being silently absorbed into "flow" the way
// speed/tilt already are — mild influence by design (a felt/alcohol tip
// doesn't compress the way graphite does, same reasoning
// MARKER_WIDTH_FLOOR/_CEIL already give for width), never a resonant swing.
const MARKER_PRESSURE_FLOW_FLOOR = 0.85 // uncalibrated first pass
const MARKER_PRESSURE_FLOW_CEIL = 1.15  // uncalibrated first pass

export function markerPressureFlow(pressure: number): number {
  return lerp(MARKER_PRESSURE_FLOW_FLOOR, MARKER_PRESSURE_FLOW_CEIL, pressure)
}

// ADR 004 "Ревизия v1.5" §3: marker's own dwell config, not shared with
// LINER_DWELL — same reasoning MARKER_BULLET_DAB_SHAPING's own comment
// gives for not just aliasing liner's constant (a future divergence
// shouldn't need touching call sites), but here the numbers *also* differ
// already: a felt/alcohol tip pools less aggressively at rest than a
// fineliner's fiber nib, so a longer minDwellMs/tau and a lower maxFlow
// ceiling than LINER_DWELL's. First-pass, uncalibrated (same "verify by eye
// and retune" status every other first-pass constant here carries).
// linerPresets.ts's dwellConfigForTool imports this — a second, separate
// circular-import edge between these two files (this one, `linerPresets.ts
// -> markerPresets.ts`, at the *value* level this time) alongside the
// dabShaping.ts one at the top of this file; safe for the identical reason:
// dwellConfigForTool is a function declaration (hoisted before either
// module's top-level body runs), and this file's own import of
// `DwellConfig` from linerPresets.ts is type-only (erased entirely).
export const MARKER_DWELL: DwellConfig = {
  stillThresholdPx: 2,
  intervalMs: 70,
  minDwellMs: 220,
  tau: 320,
  maxFlow: 1.25,
}
