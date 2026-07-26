import type { ToolType } from '@art-lessons/shared'
import { clamp } from 'lodash-es'

import { shapingForMarkerPreset, type MarkerAngleConfig } from './markerPresets'
import { CHARCOAL_FEEL, charcoalAspect, charcoalWidthFactor } from './charcoalFeel'

// Per-tool pressure→size and tilt→aspect response curves for DabSystem's
// dab geometry (#240). Previously hardcoded directly in DabSystem._makeDab
// as graphite-pencil curves shared by every tool — only per-dab *opacity*
// branched by tool (see engine/index.ts's _bakeDabOpacity). The fineliner
// (#238) needs a fundamentally different response (±7-15%, not the
// pencil's several-fold swing), so the curves themselves must be
// selectable per tool instead.

export interface DabShapingProfile {
  /** Multiplier on baseSize, given 0..1 smoothed pressure and tiltNorm =
   *  tiltMag/90. #305 widened this with the tilt argument so charcoal's edge
   *  regime can be *narrower* than its end face; every other profile ignores
   *  it (a one-parameter implementation still satisfies this signature), so
   *  their geometry is unchanged. */
  size(pressure: number, tiltNorm: number): number
  /** Aspect ratio (1 = circular), given tiltNorm = tiltMag/90 (unclamped). */
  aspect(tiltNorm: number): number
  /** Per-sample weight for DabSystem's tilt low-pass, or omitted for no
   *  filtering at all (every tool but charcoal — see #305 and DabSystem's own
   *  _filterTilt). Opt-in rather than on-by-default specifically so this
   *  changes nothing for pencil/eraser/smudge/liner/marker: their dabs stay
   *  bit-for-bit what they were. */
  tiltSmoothing?: number
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
// exact formula; it is the default angle mode, not just pencil's. Exported
// (#251) so markerPresets.ts's bullet nib profile can reuse it verbatim —
// bullet is round enough that per-dab angle barely shows, but there's no
// reason to give it a different default than every other non-chisel tool.
export function tiltOrPathAngle(tiltMag: number, tiltX: number, tiltY: number, pathAngle: number): number {
  return tiltMag > 15 ? Math.atan2(tiltY, tiltX) : pathAngle
}

// #305 follow-up (Ilya, from actually drawing with it): charcoal's elongation
// runs *across* the tilt direction, not along it — rotate tiltOrPathAngle's
// result a quarter turn.
//
// This is the physically right answer for the regime that matters most. A
// tilted flat-ended cylinder touches the paper along an arc of its rim, and
// that arc runs perpendicular to the tilt — it's the "edge" of the stick, the
// thing you turn the charcoal onto precisely when you want a thin line.
//
// It was originally built along-tilt to keep the ladder continuous: the
// literal broad-side contact (a cylinder lying on its flank) runs *along* the
// tilt, so honouring both geometries exactly would swing the dab 90° somewhere
// mid-ladder. Perpendicular everywhere resolves that instead of trading it
// off — the broad regime was never literal geometry anyway (a stylus can't be
// laid flat on a tablet; 62° stands in for regripping the stick), so it's free
// to follow the edge regime's orientation. The result is both continuous *and*
// correct where the physics is real, plus it reads naturally in the hand: lean
// along the stroke for a broad band, lean across it for a thin edge line.
//
// Applied to the whole result, including the low-tilt pathAngle fallback.
// That branch only runs while the dab is still round (charcoal's ladder holds
// aspect at 1 below roundMaxDeg), so the rotation is invisible there — but if
// a dev slider drags roundMaxDeg below tiltOrPathAngle's own 15° cutoff,
// staying perpendicular keeps it consistent with the tilt branch instead of
// flipping.
export function perpendicularToTiltAngle(tiltMag: number, tiltX: number, tiltY: number, pathAngle: number): number {
  return tiltOrPathAngle(tiltMag, tiltX, tiltY, pathAngle) + Math.PI / 2
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

// Charcoal (#304 §2, reshaped into a ladder in #305): a blunt stick, not a
// sharpened cone, worked on its end / edge / broad side depending on tilt.
//  - size: higher floor than graphite's 0.3 (even a light touch from a blunt
//    stick leaves a broad mark) and a smaller swing (there's no point to
//    sharpen, so pressure can't concentrate the contact the way it does for a
//    pencil) — then scaled by the tilt ladder's own width factor, so the edge
//    regime is genuinely thinner than the end face.
//  - aspect: the ladder from charcoalFeel.ts, replacing #304's single
//    `1 + tiltNorm² * 7` curve. That curve only reached its maximum at 90°,
//    which a stylus on a tablet physically cannot do — the broad side was
//    unreachable in practice, which is the whole reason for the rewrite.
//  - angle: perpendicularToTiltAngle — the one tool that doesn't use the shared
//    tilt-or-path default, because a stick's contact runs *across* the way it
//    leans (see that function's own comment).
const CHARCOAL_WIDTH_FLOOR = 0.45
const CHARCOAL_WIDTH_SWING = 0.6

export const CHARCOAL_DAB_SHAPING: DabShapingProfile = {
  size: (pressure, tiltNorm) =>
    (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01(pressure)) * charcoalWidthFactor(tiltNorm * 90),
  aspect: tiltNorm => charcoalAspect(tiltNorm * 90),
  angle:  perpendicularToTiltAngle,
  // A getter, not a captured value: CHARCOAL_FEEL is mutated in place by the
  // debug overlay's sliders, and a plain property would freeze whatever
  // smoothing happened to be set at module-eval time.
  get tiltSmoothing() { return CHARCOAL_FEEL.smoothing },
}

// #249: fixed-angle mode — ignores tilt and path direction entirely, always
// returning the same angle. This is the hook a chisel-nib marker profile
// needs (ADR 004 §1): a flat, elongated dab stamped at a constant angle
// produces a calligraphy-pen-like variable stroke width purely from
// overlapping dab geometry along the spline, with no new pointer-input
// model. Wired into shapingForTool via markerPresets.ts's
// MARKER_CHISEL_DAB_SHAPING (#251).
export function fixedAngleShaping(angleRadians: number): DabShapingProfile['angle'] {
  return () => angleRadians
}

// #278: the chisel nib's "follow stroke direction" mode — angleRadians is an
// offset added to the spline's own path-tangent angle (same pathAngle
// fixedAngleShaping's sibling ignores entirely) rather than replacing it.
// Lets a chisel-style nib keep the calligraphy-pen taper fixedAngleShaping
// gives while still turning with the stroke, the same way a bullet nib's
// tiltOrPathAngle already does when tilt is absent — just with a
// user-configured offset baked in rather than assuming 0.
export function offsetAngleShaping(angleRadians: number): DabShapingProfile['angle'] {
  return (_tiltMag, _tiltX, _tiltY, pathAngle) => pathAngle + angleRadians
}

// pencil/eraser/smudge never had their own geometry (only opacity branched
// per-tool, see engine/index.ts's _bakeDabOpacity) — they all keep riding
// PENCIL_DAB_SHAPING.
//
// #251: widened to also take the raw preset/presetName string so a 'marker'
// stroke can pick between its two nib shapes (bullet/chisel) — every other
// tool ignores the second argument entirely (it's optional, and neither
// pencil/eraser/smudge/liner ever look at it), so this is a purely additive
// change for them: same return value regardless of what (if anything) gets
// passed as presetName. The actual bullet/chisel dispatch lives in
// markerPresets.ts (shapingForMarkerPreset), not here, so this file and
// markerPresets.ts can import small helpers from each other (tiltOrPathAngle/
// fixedAngleShaping one way, shapingForMarkerPreset the other) without a
// real circular-const problem — see markerPresets.ts's own comment on why
// only functions/types cross that boundary, never a top-level const.
export function shapingForTool(tool: ToolType, presetName?: string, markerAngle?: MarkerAngleConfig): DabShapingProfile {
  if (tool === 'liner') return LINER_DAB_SHAPING
  if (tool === 'marker') return shapingForMarkerPreset(presetName, markerAngle)
  // #304: charcoal's geometry is the same for all three types (vine/willow/
  // compressed differ in how the material *deposits*, not in the shape of the
  // stick's contact patch) — so it ignores presetName, same as liner does.
  if (tool === 'charcoal') return CHARCOAL_DAB_SHAPING
  return PENCIL_DAB_SHAPING
}
