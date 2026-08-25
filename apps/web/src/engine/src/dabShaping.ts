import type { ToolType } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { shapingForBrushPenPreset } from './brushPenPresets'
import { shapingForWatercolorPreset } from './watercolorPresets'
import { shapingForMarkerPreset, type NibAngleConfig } from './markerPresets'
import { CHARCOAL_FEEL, charcoalAspect, charcoalWidthFactor } from './charcoalFeel'
import { charcoalNibFromPreset } from './charcoalPresets'
import { PENCIL_TILT, pencilTiltAspect, pencilTiltWidthFactor } from './pencilTilt'
import { DEFAULT_TILT_RESPONSE, type TiltResponse } from './tiltCurve'
import { tiltAzimuthRad } from './tiltMath'

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
  /** Aspect ratio (1 = circular), given tiltNorm = tiltMag/90 and the same
   *  pressure `size` is given. Since #388 tiltMag is the true angle from
   *  vertical (tiltMath.ts), which is in [0, 90) by construction — so tiltNorm
   *  is in [0, 1) and this no longer needs the "unclamped, may exceed 1" caveat
   *  it used to carry.
   *
   *  #489: pressure was added, and it was an omission rather than a decision
   *  that it was missing — ADR 012 §2 lists pressure as an input to the
   *  footprint, and `size` has always had it. It went unnoticed because no nib
   *  needed it: for every tool here so far, leaning changes the shape and
   *  pressing changes only the scale. A flat brush is the first that does not —
   *  its width is set by the ferrule and does not move, while pressure splays
   *  the hairs and lengthens the contact patch, so its *proportions* are what
   *  pressure drives.
   *
   *  #472's `tipBend.elongation(pressure)` is the same need answered narrowly:
   *  it multiplies this by a pressure curve, but only for a nib that is also
   *  bending. A one-parameter implementation still satisfies this signature, so
   *  every profile that does not care is unchanged. */
  aspect(tiltNorm: number, pressure: number): number
  /** Distance, in world px of travel, over which DabSystem's tilt low-pass
   *  reaches ~63% of a new reading — or omitted for no filtering at all (see
   *  #305 and DabSystem's own _filterTilt). Set by charcoal and, since #389, by
   *  graphite — the two profiles whose shape actually tracks tilt, and
   *  therefore the two where the reported angle's noise is visible in the mark.
   *  Still opt-in rather than on-by-default: liner and both marker nibs barely
   *  respond to tilt, so filtering it would cost them a little work to change
   *  nothing.
   *
   *  #482: a distance, not the per-sample weight this used to be. #472 made
   *  that fix for pressure and left tilt behind — same defect, so the same
   *  cure: a per-sample one-pole has its corner frequency set by the tablet's
   *  report rate, so the identical hand movement came out several times less
   *  smoothed on a fast digitiser than on a slow one. Filtered per dab rather
   *  than per sample (that is where the tilt filter has always run), weighted
   *  by that dab's own arc length. */
  tiltSmoothingPx?: number
  /** The same idea one signal over (#454): per-sample weight for DabSystem's
   *  *pressure* low-pass, omitted for no filtering. Set only by the brush pen,
   *  the first tool whose width tracks pressure closely enough for the
   *  device's own noise to show in the mark — every other tool's pressure
   *  response is either mild (liner, marker) or already smoothed by being
   *  spread over a large soft dab (graphite, charcoal).
   *
   *  Deliberately a separate knob from tiltSmoothing rather than one shared
   *  "input smoothing": they filter different signals for different reasons,
   *  and ADR 009 §3 requires pressure smoothing to be independent of the
   *  smoothing applied to coordinates (which is the spline's job, not this).
   *
   *  #472: the unit is **canvas px of travel**, not a per-sample weight, and
   *  the rename is the whole point of the change. A per-sample one-pole is a
   *  filter whose cutoff is the device's report rate: the same hand gesture
   *  came out three times less smoothed on a 240 Hz stylus than on a 60 Hz
   *  one, so "how firm the pen feels" silently depended on the tablet. Over
   *  distance it is the same filter with a cutoff the hand can actually feel
   *  — see DabSystem._filterPressure for the conversion and for the one case
   *  (a stationary press) where distance alone cannot carry it.
   *
   *  #482: the per-sample twin this replaced is gone. It survived #472 only
   *  because watercolor had landed on it independently, carrying a comment and
   *  a test that both read its direction backwards (the filter is
   *  `y += (u - y) * k`, so a larger k smooths *less*). Watercolor is on this
   *  one now and there is no second form left to pick the wrong one of. */
  pressureSmoothingPx?: number
  /**
   * Per-dab angle (radians). Given the raw tilt magnitude/components and the
   * spline's path-tangent angle at this dab, so a profile can derive angle
   * from either — or ignore both entirely and return a fixed angle (#249,
   * for a chisel-style nib whose edge orientation is a property of the tool,
   * not of tilt or stroke direction).
   *
   * Overridden entirely when `tipBend` is set — a bent nib's orientation is
   * stroke state, which a pure function of one sample cannot express. See
   * TipBendProfile.
   *
   * #482, ADR 012 §3: the return value is a **world** angle — it is baked into
   * `Dab.angle` and rasterized in world space. The two inputs it can be
   * derived from do not agree on a frame: `pathAngle` is already world, while
   * `tiltX/tiltY` are reported by the device relative to the **screen**. So a
   * profile that reads tilt must convert, and `cameraAngle` (the viewport's
   * own rotation, `_infiniteCamera.angle`) is what it converts with. A profile
   * anchored to the canvas (a chisel's fixed angle) or to the stroke ignores it
   * — those frames need no conversion, which is the whole reason the anchor has
   * to be named rather than assumed.
   */
  angle(tiltMag: number, tiltX: number, tiltY: number, pathAngle: number, cameraAngle: number): number
  /** #472, ADR 009 §13: a flexible nib that bends under the hand, as opposed
   *  to a rigid shape whose footprint is fully determined by the current
   *  sample. Omitted by every tool but the brush pen; see TipBendProfile. */
  tipBend?: TipBendProfile
  /** #482, ADR 012 §8 — how the very start of a stroke narrows. Declared as
   *  two numbers rather than implemented per profile on purpose: the brush pen
   *  and watercolor differ only in the numbers, and data cannot let a third
   *  tool quietly invent a different shape for the same idea. */
  headTaper?: HeadTaperProfile
  /** #482 — how much less of the nib is pressed into the paper at speed. */
  speedContact?: SpeedContactProfile
}

/**
 * #472, ADR 009 §13 — the contact patch of a nib that is being *dragged*.
 *
 * Every other tool here derives its footprint from the current sample alone:
 * pressure and tilt in, size/aspect/angle out, no memory. That is right for a
 * pencil lead or a felt tip, whose shape is a property of the object. A brush
 * pen's nib is a bundle of fibres that deforms — it splays under pressure and,
 * because it is dragged rather than pushed, it also *trails*: its long axis
 * lags the direction of travel and only catches up over some distance of
 * dragging.
 *
 * Both halves of that are what makes the tool read as physical rather than as
 * a circle of varying diameter swept along a spline, which is what v1 was
 * (aspect never left 1.0-1.12, oriented by the stylus's tilt azimuth). Neither
 * half can live in `aspect()`/`angle()`: one needs pressure, the other needs
 * state that persists across dabs. So they live here, and DabSystem owns the
 * state exactly as it already owns the tilt and pressure filters.
 *
 * Nothing new reaches the payload: the result is baked into the recorded
 * `Dab.aspectRatio`/`Dab.angle`, which the ribbon rasterizer already reads per
 * endpoint (markerRibbon.ts's two nibSupport calls) — so every participant
 * replays the same bent nib without recomputing anything.
 */
/**
 * #482, ADR 012 §8 — the head of a stroke, moved out of PencilEngine's
 * post-processing and into the tip model.
 *
 * It was a post-pass over `dab.size` running after the footprint had already
 * been worked out, which had a real consequence and not only a structural one:
 * a flexible nib's lag distance and trail are both proportional to its *current
 * width*, so they were being computed from the untapered value. The head of
 * every brush-pen stroke bent as though the nib were three times wider than the
 * one actually being drawn.
 *
 * Only the head. The tail cannot come here and that is a property of drawing,
 * not of this interface: "how far until the stroke ends" does not exist until
 * the pen is lifted, and holding dabs back to find out would put latency on the
 * tip — the one thing #104 spent its effort removing. So the rule the model
 * keeps is that **it only ever sees what is known at the moment the dab is laid
 * down**, and the tail stays a post-pass over the final batch.
 */
export interface HeadTaperProfile {
  /** Width multiplier at the very first dab. */
  startScale: number
  /** Arc length, world px, over which it ramps back to full width. */
  lengthPx: number
}

/**
 * #482 — a fast pen presses less of its nib into the paper, so a quick stroke
 * comes out a little leaner than the same pressure drawn slowly (ADR 009 §5 as
 * revised by #472).
 */
export interface SpeedContactProfile {
  /** Width multiplier at this pointer speed, canvas px/ms. */
  factor(speed: number): number
  /** Distance, world px, over which the factor eases toward that target.
   *  Speed is measured per pointer event and a batch is often a single dab, so
   *  the raw value steps between batches; against a ribbon that interpolates
   *  width continuously between dabs, an unsmoothed 10% step is a visible notch
   *  in the silhouette rather than a change in weight.
   *
   *  A distance for the same reason every other filter here became one: this
   *  shipped as a per-dab weight, and dab spacing is proportional to brush size,
   *  so the same gesture settled over four times the distance on a 160 px brush
   *  as on a 40 px one. */
  smoothingPx: number
}

export interface TipBendProfile {
  /**
   * Contact-patch elongation (long axis / short axis) at this pressure, on top
   * of whatever `aspect()` returns for the pose. 1 = round.
   *
   * Elongation is deliberately *not* a second width control: the long axis
   * runs along the direction of travel, so on a straight line the swept band's
   * half-width is still the short axis alone, i.e. still pressure and nothing
   * else. What it changes is the two places a nib's length is visible — the
   * ends of a stroke, and turns, where a trailing long axis sweeps wider on
   * the outside than a circle would.
   */
  elongation(pressure: number): number
  /**
   * Distance over which the nib's orientation catches up with the direction of
   * travel, as a multiple of the nib's own current width — a wider nib has
   * further to bend, so it lags for longer. Converted to a one-pole weight per
   * dab as `1 - exp(-ds / lag)`, i.e. per unit *arc length*, so the plasticity
   * of a corner does not depend on how densely the stroke happened to be
   * sampled there (dab spacing is not constant — _curvatureSpacingLimit
   * tightens it on exactly the turns where this matters most).
   */
  lagWidths: number
  /** Floor under that distance, canvas px, so a hairline nib still has some
   *  inertia rather than snapping to every sample's direction. */
  minLagPx: number
  /**
   * How far the mark trails *behind* the pointer at this speed, as a multiple
   * of the nib's own width — MyPaint's `offset_by_speed` (see ADR 009 §13),
   * with the sign that says the ink lands where the pen came from rather than
   * where it is going.
   *
   * The returned amount is further scaled by how bent the nib currently is,
   * which is the part MyPaint has no way to express: a nib pressed straight
   * down has nothing to trail, and it is the bending backwards that puts the
   * contact patch behind the shaft in the first place. So a slow, careful line
   * is displaced by nothing at all, and only a fast dragged one lags — which
   * is also what keeps this from reading as input latency.
   */
  trailWidths(speed: number): number
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
//
// #482, ADR 012 §3: in the vocabulary that ADR introduces this is the anchor
// `barrel` — the nib points where the stylus's own body points — degrading to
// `stroke` below the 15deg threshold, because the azimuth of a near-upright pen
// is atan2 of two near-zero numbers and carries no direction worth having.
// That much was always the intent; what was missing is that the two branches
// answer in *different frames*. `pathAngle` is derived from world-space spline
// positions, while the azimuth is the device's own reading against the screen,
// and the result of both goes into a world-space `Dab.angle`. So the azimuth
// branch was short by exactly the viewport's rotation: on a canvas turned 30deg
// a leaning pencil laid its ellipse 30deg off the direction the pen was
// actually leaning, and crossing the 15deg threshold mid-stroke swapped frames
// underneath the same gesture.
//
// Subtracting `cameraAngle` converts screen -> world (the forward transform is
// `screen = centre + R(angle)·(world - camera)·zoom`, see PencilEngine's own
// worldToScreen comment). It is identically zero on an unrotated canvas, which
// is every stroke ever recorded before the rotate tool existed and most since —
// so this fix cannot change a mark that was not already wrong.
//
// #482 part two: the azimuth itself comes from tiltAzimuthRad, not from
// `atan2(tiltY, tiltX)`. tiltX/tiltY are not the components of a vector — each
// is the angle of the stylus's projection onto one plane — so the azimuth is
// atan2 of their *tangents*, exactly as #388 established for the magnitude. The
// old expression was off by up to ~8 degrees on a diagonal grip and exact only
// on an axis-aligned or exactly-diagonal one. See tiltMath.ts.
export function tiltOrPathAngle(
  tiltMag: number, tiltX: number, tiltY: number, pathAngle: number, cameraAngle = 0,
): number {
  return tiltMag > 15 ? tiltAzimuthRad(tiltX, tiltY) - cameraAngle : pathAngle
}

// ─── Nib anchor (#482, ADR 012 §3) ──────────────────────────────────────────
//
// A nib's angle is only meaningful relative to *something*, and until #482 the
// engine never said what. Four frames are possible, theta is the viewport's own
// rotation and phi the direction of travel on screen:
//
//   canvas  nib_world = offset                 pinned to the paper. Turn the
//                                              canvas and the nib turns with it,
//                                              so the grip you found moves.
//   screen  nib_world = offset - theta         pinned to the screen. Assumes the
//                                              person sits square to it — an
//                                              assumption, not a measurement.
//   barrel  nib_world = azimuth - theta + off  pinned to the pen's own body —
//                                              the only physically true one.
//                                              Degenerate near vertical, where
//                                              the azimuth is atan2 of two
//                                              near-zeroes, so it always needs a
//                                              fallback.
//
// A fourth was shipped briefly and withdrawn: `stroke`, pinned to the direction
// of travel (`pathAngle + offset`). It reads well on paper — canvas rotation
// cancels itself, and it *switches calligraphy off*, since width stops
// depending on direction — but on the tablet it was wrong twice over. It
// rosetted under a held pen, and once that was fixed it still swung under any
// rocking of the wrist, because rocking in a small circle genuinely *is* a
// stroke going round in a circle. Ilya, 24.08: "убери, работает странно и
// криво". The lead-point machinery it forced into tipFootprint.ts stays, and is
// still load-bearing: `barrel` falls back to the same path direction below 15deg
// of lean, so a chisel held upright would rosette in exactly the same way.
export const NIB_ANCHORS = ['canvas', 'screen', 'barrel'] as const
export type NibAnchor = (typeof NIB_ANCHORS)[number]

/** ADR 004's original behaviour, and still what a chisel marker starts on. */
export const DEFAULT_NIB_ANCHOR: NibAnchor = 'canvas'

export function isNibAnchor(v: string): v is NibAnchor {
  return (NIB_ANCHORS as readonly string[]).includes(v)
}

/**
 * `offset` radians in the named frame. The tools that never had an angle
 * setting are not on this: they ride `tiltOrPathAngle`, which is exactly
 * `barrel` with a zero offset, and giving them a selector would be a control
 * for something nobody asked to choose (ADR 012 §11 leaves that open
 * deliberately).
 */
export function anchoredAngleShaping(offset: number, anchor: NibAnchor): DabShapingProfile['angle'] {
  if (anchor === 'canvas') return () => offset
  if (anchor === 'screen') return (_m, _x, _y, _p, cameraAngle) => offset - cameraAngle
  // barrel: the shared tilt-or-path rule, offset by the user's own angle. Its
  // 15deg threshold is the fallback this frame cannot do without.
  return (tiltMag, tiltX, tiltY, pathAngle, cameraAngle) =>
    tiltOrPathAngle(tiltMag, tiltX, tiltY, pathAngle, cameraAngle) + offset
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
function pencilShapingFor(response: TiltResponse): DabShapingProfile {
  return {
    size:   (pressure, tiltNorm) => (0.3 + 0.7 * pressure) * pencilTiltWidthFactor(tiltNorm * 90, PENCIL_TILT, response),
    aspect: tiltNorm => pencilTiltAspect(tiltNorm * 90, PENCIL_TILT, response),
    angle:  tiltOrPathAngle,
    // A getter for the same reason charcoal's is: the debug overlay mutates
    // PENCIL_TILT in place, and a captured value would freeze whatever smoothing
    // happened to be set when this module was first evaluated.
    get tiltSmoothingPx() { return PENCIL_TILT.smoothingPx },
  }
}

// #409: one profile per response shape, built once at module load rather than
// per stroke. Three tiny objects, and in exchange shapingForTool stays a lookup
// that allocates nothing — it is called on every _onStart and on every hover
// frame of the brush cursor, and a fresh closure per call would put garbage on
// exactly the path #309 spent its effort clearing.
const PENCIL_SHAPING_BY_RESPONSE: Record<TiltResponse, DabShapingProfile> = {
  restrained: pencilShapingFor('restrained'),
  smooth:     pencilShapingFor('smooth'),
  linear:     pencilShapingFor('linear'),
}

/** The shipped shape, and still the thing DabSystem defaults to when nobody
 *  sets a profile at all — a caller that never heard of #409 gets exactly the
 *  pre-#409 pencil. */
export const PENCIL_DAB_SHAPING: DabShapingProfile = PENCIL_SHAPING_BY_RESPONSE[DEFAULT_TILT_RESPONSE]

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

function charcoalShapingFor(response: TiltResponse): DabShapingProfile {
  return {
    size: (pressure, tiltNorm) =>
      (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01(pressure))
        * charcoalWidthFactor(tiltNorm * 90, CHARCOAL_FEEL, response),
    aspect: tiltNorm => charcoalAspect(tiltNorm * 90, CHARCOAL_FEEL, response),
    angle:  tiltOrPathAngle,
    // A getter, not a captured value: CHARCOAL_FEEL is mutated in place by the
    // debug overlay's sliders, and a plain property would freeze whatever
    // smoothing happened to be set at module-eval time.
    get tiltSmoothingPx() { return CHARCOAL_FEEL.smoothingPx },
  }
}

// #501 — the cut stick. A flat edge held at the angle the user set, in the
// frame they picked: fixed elongation, no tilt anywhere in the geometry.
//
// 4:1 rather than the marker's 5:1, and the number is an argument rather than a
// preference: a felt wedge is cut thin because it is felt, while a stick of
// compressed charcoal is snapped off a square section and its edge is a real
// several millimetres thick. It is also uncalibrated first-pass, the same
// status every other constant in this tool carries — the thing to check on a
// device is whether the edge reads as an edge and not as a blade.
const CHARCOAL_CHISEL_ASPECT_RATIO = 4

/** Fallback for a caller that passes no angle config at all. Shouldn't happen
 *  once the engine is wired (it always passes one), kept so the dispatch below
 *  stays total — exactly the role MARKER_CHISEL_ANGLE_RADIANS_DEFAULT plays. */
const CHARCOAL_CHISEL_ANGLE_DEFAULT = Math.PI / 4

function charcoalChiselShaping(angleRadians: number, anchor: NibAnchor): DabShapingProfile {
  return {
    // Same pressure swing as the round stick (the material is the same friable
    // carbon either way), divided by the elongation for the reason #336 gives
    // for the marker: `size` is the dab's *short* axis, while the number in the
    // slider is the width of the mark the flat side lays down. Without the
    // division the chisel would paint four times the requested width.
    //
    // The tilt term the bullet carries (charcoalWidthFactor) is gone, not set
    // to 1: the edge's width is the nib's own, and there is no lean-dependent
    // contact patch left for it to describe.
    size:   pressure => (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01(pressure)) / CHARCOAL_CHISEL_ASPECT_RATIO,
    aspect: () => CHARCOAL_CHISEL_ASPECT_RATIO,
    angle:  anchoredAngleShaping(angleRadians, anchor),
    // Still a getter, and still load-bearing even though the geometry ignores
    // tilt: the `barrel` anchor reads the stylus's own azimuth (via
    // tiltOrPathAngle), so an unfiltered tilt would make the edge flutter in
    // exactly the frame that is meant to be the truthful one.
    get tiltSmoothingPx() { return CHARCOAL_FEEL.smoothingPx },
  }
}

const CHARCOAL_SHAPING_BY_RESPONSE: Record<TiltResponse, DabShapingProfile> = {
  restrained: charcoalShapingFor('restrained'),
  smooth:     charcoalShapingFor('smooth'),
  linear:     charcoalShapingFor('linear'),
}

export const CHARCOAL_DAB_SHAPING: DabShapingProfile = CHARCOAL_SHAPING_BY_RESPONSE[DEFAULT_TILT_RESPONSE]

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
//
// #409: `tiltResponse` is the user's chosen ramp shape for the *active tool*,
// resolved by the caller (Room reads it from that tool's own settings) — the
// engine never looks up which tool owns which response. Liner and marker ignore
// it exactly as they ignore the tilt curve itself: neither reads tiltCurve.ts
// at all (liner's aspect is a flat `1 + 0.15·tiltNorm`, a chisel's is fixed),
// so offering the setting for them would be a control that provably does
// nothing — the same reason marker's angle is hidden for the bullet nib (#278).
export function shapingForTool(
  tool: ToolType, presetName?: string, nibAngle?: NibAngleConfig,
  tiltResponse: TiltResponse = DEFAULT_TILT_RESPONSE,
): DabShapingProfile {
  if (tool === 'liner') return LINER_DAB_SHAPING
  if (tool === 'marker') return shapingForMarkerPreset(presetName, nibAngle)
  // #454: like marker, the brush pen dispatches on presetName — but it carries
  // the pressure response there rather than a nib, since the tool has no nib
  // list and no size ladder to spend that slot on (brushPenPresets.ts's own
  // comment on why the setting rides this existing channel). It ignores
  // tiltResponse for the same reason liner and marker do: its shape barely
  // tracks tilt, so the setting would provably do nothing.
  if (tool === 'brushPen') return shapingForBrushPenPreset(presetName)
  // #468 — same slot, same dispatch shape: a wet round brush whose contact
  // patch opens under pressure, with its own higher width floor and heavier
  // pressure smoothing (watercolorPresets.ts).
  // #489 — and the angle config goes with it now: the flat nib reads the same
  // per-tool angle/anchor the marker's chisel does, because it is the same
  // shape wearing the same setting.
  if (tool === 'watercolor') return shapingForWatercolorPreset(presetName, nibAngle)
  // #304: charcoal's three types (vine/willow/compressed) differ in how the
  // material *deposits*, not in the shape of the stick's contact patch, so they
  // share one geometry — but since #501 the same string also carries which nib
  // the stick is cut to, and that does change the shape. The type half is read
  // by _resolvePreset; only the nib half reaches here.
  if (tool === 'charcoal') {
    if (charcoalNibFromPreset(presetName) !== 'chisel') return CHARCOAL_SHAPING_BY_RESPONSE[tiltResponse]
    return charcoalChiselShaping(
      nibAngle?.angle ?? CHARCOAL_CHISEL_ANGLE_DEFAULT,
      nibAngle?.anchor ?? DEFAULT_NIB_ANCHOR,
    )
  }
  return PENCIL_SHAPING_BY_RESPONSE[tiltResponse]
}
