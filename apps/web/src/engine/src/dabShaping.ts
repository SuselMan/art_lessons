import type { ToolType } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { shapingForMarkerPreset, type MarkerAngleConfig } from './markerPresets'
import { CHARCOAL_FEEL, charcoalAspect, charcoalWidthFactor } from './charcoalFeel'
import { PENCIL_TILT, pencilTiltAspect, pencilTiltWidthFactor } from './pencilTilt'

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
   *  regime could be *narrower* than its end face, and #389 put it to the
   *  opposite use for graphite (a leaned lead draws *wider*). Liner and both
   *  marker nibs still ignore it — a one-parameter implementation satisfies
   *  this signature, so their geometry is unchanged. */
  size(pressure: number, tiltNorm: number): number
  /** Aspect ratio (1 = circular), given tiltNorm = tiltMag/90. Since #388
   *  tiltMag is the true angle from vertical (tiltMath.ts), which is in
   *  [0, 90) by construction — so tiltNorm is in [0, 1) and this no longer
   *  needs the "unclamped, may exceed 1" caveat it used to carry. */
  aspect(tiltNorm: number): number
  /** Per-sample weight for DabSystem's tilt low-pass, or omitted for no
   *  filtering at all (see #305 and DabSystem's own _filterTilt). Set by
   *  charcoal and, since #389, by graphite — the two profiles whose shape
   *  actually tracks tilt, and therefore the two where the reported angle's
   *  noise is visible in the mark. Still opt-in rather than on-by-default:
   *  liner and both marker nibs barely respond to tilt, so filtering it would
   *  cost them a little work to change nothing. */
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

// Graphite (#240's carried-over original formulas, replaced in #389). The
// pressure→width part is untouched — 0.3..1.0 of base size is graphite's
// several-fold swing and nothing about tilt argues with it — but it is now
// scaled by the tilt curve's own width factor, and `aspect` comes from that
// same curve instead of the old `1 + tiltNorm³·6`. See pencilTilt.ts for why
// the exponent was the lesser of that formula's two problems.
//
// Still the default profile, so eraser and smudge ride it too (Ilya, 06.08:
// the same response for everything that runs on a graphite-shaped tip). They
// keep their own opacity branches in _bakeDabOpacity — only geometry is
// shared.
//
// The ×90 undoes DabShapingProfile's own tiltNorm normalization, because the
// curve is defined against real degrees. Same shape as CHARCOAL_DAB_SHAPING's
// call into charcoalAspect right below; the profile interface keeps its 0..1
// argument rather than both files converting, since liner/marker genuinely
// want the normalized form.
export const PENCIL_DAB_SHAPING: DabShapingProfile = {
  size:   (pressure, tiltNorm) => (0.3 + 0.7 * pressure) * pencilTiltWidthFactor(tiltNorm * 90),
  aspect: tiltNorm => pencilTiltAspect(tiltNorm * 90),
  angle:  tiltOrPathAngle,
  // A getter for the same reason charcoal's is: the debug overlay mutates
  // PENCIL_TILT in place, and a captured value would freeze whatever smoothing
  // happened to be set when this module was first evaluated.
  get tiltSmoothing() { return PENCIL_TILT.smoothing },
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

// Charcoal (#304 §2, reshaped into a ladder in #305, and from a ladder into a
// smooth curve in #403): a blunt stick, not a sharpened cone, worked on its
// end / edge / broad side depending on tilt.
//  - size: higher floor than graphite's 0.3 (even a light touch from a blunt
//    stick leaves a broad mark) and a smaller swing (there's no point to
//    sharpen, so pressure can't concentrate the contact the way it does for a
//    pencil) — then scaled by the tilt curve's own width factor, so the edge
//    regime is genuinely thinner than the end face.
//  - aspect: the curve from charcoalFeel.ts, replacing #304's single
//    `1 + tiltNorm² * 7` curve. That curve only reached its maximum at 90°,
//    which a stylus on a tablet physically cannot do — the broad side was
//    unreachable in practice, which is the whole reason for the rewrite.
//  - angle: the shared tiltOrPathAngle, same as every other tool. #305's
//    follow-up had charcoal alone elongate *across* the lean — physically the
//    better reading of a cylinder's rim, since the arc it stands on runs
//    perpendicular to the tilt — but #404 gave that up for predictability
//    (Ilya, 06.08): two tools that otherwise behave alike pointed their
//    ellipses in opposite directions, and nothing but cylinder geometry
//    explained why. Elongating along the lean has no 90° flip of its own
//    (the direction is single-valued across the whole range), so dropping
//    the quarter turn costs none of the continuity it was also buying.
const CHARCOAL_WIDTH_FLOOR = 0.45
const CHARCOAL_WIDTH_SWING = 0.6

export const CHARCOAL_DAB_SHAPING: DabShapingProfile = {
  size: (pressure, tiltNorm) =>
    (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01(pressure)) * charcoalWidthFactor(tiltNorm * 90),
  aspect: tiltNorm => charcoalAspect(tiltNorm * 90),
  angle:  tiltOrPathAngle,
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
