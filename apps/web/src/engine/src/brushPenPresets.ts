import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import {
  tiltOrPathAngle,
  type DabShapingProfile, type HeadTaperProfile, type SpeedContactProfile, type TipBendProfile,
} from './dabShaping'
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
 *  problem).
 *
 *  #472: 0.10, down from v1's 0.15. The spec this tool is built to asks for
 *  8-15%, and the low end is where the hairline lives — the thing the pen is
 *  bought for. The absolute floor is elsewhere and unchanged
 *  (RibbonProfile.minHalfWidthPx = 0.5 canvas px), so on a small pen this
 *  never actually reaches: 0.10 x 3px is 0.3px, and the ribbon widens it back
 *  to 0.5px rather than dropping it. On a 40px pen it is a real 4px hairline
 *  against v1's 6px. */
const BRUSH_PEN_WIDTH_FLOOR = 0.10

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
//
// #472: expressed as a *distance*, not as a per-sample weight. v1's 0.35 per
// admitted sample made the filter's cutoff the tablet's report rate: on a
// 240 Hz stylus the same gesture arrived roughly three times less smoothed
// than on a 60 Hz one, i.e. how firm the pen felt was a property of the
// hardware. 10 canvas px is the distance over which a change in pressure
// reaches ~63% of its new value; see DabSystem._filterPressure.
//
// Picked so the *middle* of the range is unchanged rather than by taste: at a
// moderate 500 px/s on a 120 Hz stylus, samples land ~4.2px apart, and
// 1 - exp(-4.2/10) = 0.34 — v1's 0.35, near enough. What changes is everything
// either side of that: the same gesture on a 240 Hz tablet no longer arrives
// half-filtered, and slow careful movement (where hairlines get drawn) is
// smoothed considerably harder than v1 managed. Uncalibrated first pass, same
// as every other constant in this file.
export const BRUSH_PEN_PRESSURE_SMOOTHING_PX = 10

// ─── Tip bend (#472, ADR 009 §13) ───────────────────────────────────────────
// The single reason v1 read as "another digital pressure brush": its contact
// patch was a *circle*. `aspect` came from tilt alone and never left
// 1.0-1.12 in practice, oriented by the stylus's tilt azimuth — so what the
// ribbon swept along the spline was a disc of varying diameter, which is
// exactly the thing the tool exists not to be.
//
// A real brush nib does two things instead, and both of them are about being
// dragged rather than about being held:
//
//  - it **splays**: pushed into the paper it flattens *and* lengthens, so the
//    footprint becomes an oval rather than a bigger circle;
//  - it **trails**: the fibres bend backwards, so the oval's long axis lags
//    the direction of travel and only catches up over some distance.
//
// The second one is where the tool's plasticity comes from, and it is why
// this is not a shape function. On a turn the nib is still pointing where the
// hand *was*, so its far end sweeps wide on the outside of the corner — the
// mark records the hand's history, not its instantaneous state. That is the
// difference between dragging a bent nib and stamping circles, and no amount
// of noise substitutes for it.

/** Elongation of the footprint at full pressure — long axis / short axis, on
 *  top of the pose's own mild ovality.
 *
 *  Note what this does *not* do: the long axis lies along the direction of
 *  travel, so a straight line's width is still the short axis, i.e. still
 *  pressure alone (ADR 009 §9's rule that pressure drives width and nothing
 *  else drives it stands untouched). It shows at the two places a nib's length
 *  is visible at all — the ends of a stroke, and turns. Uncalibrated. */
const BRUSH_PEN_ELONGATION = 0.85

/** How far the nib takes to bend and swing round to the direction of travel,
 *  as a multiple of its own current width: a wide nib has further to bend and
 *  lags longer, which is why this is a ratio rather than a distance.
 *
 *  Too small and the nib is welded to the tangent — the elongation then only
 *  shows at stroke ends and the tool is back to a swept disc in the middle.
 *  Too large and the mark stops following the hand at all.
 *
 *  1.5 rather than the 0.6 this shipped with first (#472 review, Ilya). Dab
 *  spacing is 0.22 of the nib's width, so at 0.6 a *single* dab of travel bent
 *  the nib by 1 - exp(-0.22/0.6) = 31% — a nudge across a third of a pixel of
 *  the hand's intent already stamped a visible ellipse, and wiggling swung it
 *  about. The ratio that matters is lag against spacing, and it has to be
 *  large enough that "moved a little" reads as "bent a little": at 1.5 the
 *  same single dab bends it 14%, which is inside the round-looking range.
 *
 *  It is also the more physical number. Fibres bend over a distance of the
 *  order of the nib's *length*, and a brush nib is several times longer than
 *  it is wide — a nib that fully reorients within two-thirds of its own width
 *  of travel is stiffer than any brush. */
const BRUSH_PEN_TIP_LAG_WIDTHS = 1.5

/** Floor under that distance so a hairline nib still has inertia: even 1.5 x a
 *  3px pen is 4.5px, which at that pen's own dab spacing is only a couple of
 *  dabs of lag. */
const BRUSH_PEN_TIP_MIN_LAG_PX = 6

// ─── Trail (#472, MyPaint's offset_by_speed) ────────────────────────────────
// The mark lands where the pen *came from*, not where it is. A bent nib's
// contact patch sits behind the shaft, and the harder it is dragged the
// further behind — which is the whole of why a loaded brush feels like it has
// mass and a fineliner does not.
//
// Borrowed from MyPaint, which has exactly this as `offset_by_speed` (see
// docs.krita.org's MyPaint engine page — Krita embeds the engine). One thing
// added that MyPaint cannot express: the offset is scaled by how bent the nib
// currently is, not by speed alone. A nib pressed straight down has nothing to
// trail, so slow careful work is displaced by *nothing at all* — which is also
// what keeps this from reading as input lag. Displacing the mark behind the
// cursor is exactly the sensation #104 spent its effort removing, so it has to
// be reachable only by a gesture that would look wrong without it.

/** At/below this pointer speed (canvas px/ms) the mark sits under the pen. */
const TRAIL_SPEED_SLOW = 0.5
/** At/above it, the full trail below. */
const TRAIL_SPEED_FAST = 2.5
/** Trail at full speed and full bend, as a multiple of the nib's own width.
 *
 *  Bounded well under BRUSH_PEN_TIP_LAG_WIDTHS on purpose, and not for taste:
 *  the trail is eased in over the lag distance, so a trail deeper than that
 *  distance would grow faster than the dabs advance and hand the ribbon a pair
 *  of consecutive dabs in reverse order along the path. 0.18 against 1.5 is
 *  nowhere near it. Uncalibrated. */
const BRUSH_PEN_TRAIL_WIDTHS = 0.18

function brushPenTipBend(response: PressureResponse): TipBendProfile {
  return {
    // The same S-curve as the width, on purpose and with the same `k`. One
    // deformation is happening — the nib bending — and width and length are
    // two views of it, so a nib that is described as "firm" should be equally
    // reluctant to lengthen as it is to widen. Two curves here would let the
    // footprint's *proportions* change with the setting, which is a property
    // of the nib rather than of the hand.
    elongation: pressure =>
      1 + BRUSH_PEN_ELONGATION * gain(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), PRESSURE_RESPONSE_K[response]),
    lagWidths: BRUSH_PEN_TIP_LAG_WIDTHS,
    minLagPx: BRUSH_PEN_TIP_MIN_LAG_PX,
    trailWidths: speed =>
      BRUSH_PEN_TRAIL_WIDTHS * clamp01((speed - TRAIL_SPEED_SLOW) / (TRAIL_SPEED_FAST - TRAIL_SPEED_SLOW)),
  }
}

/** #482: two numbers on the profile instead of a post-pass over `dab.size`.
 *  Short on purpose: ADR 009 rejects a long decorative taper. */
export const BRUSH_PEN_HEAD_TAPER: HeadTaperProfile = { startScale: 0.35, lengthPx: 10 }

const CONTACT_SPEED_SLOW = 0.4   // canvas px/ms and below: nib fully in contact
const CONTACT_SPEED_FAST = 2.5   // and above: as lean as speed alone makes it
const CONTACT_AT_SPEED   = 0.9   // width multiplier at CONTACT_SPEED_FAST

/** #482: the same easing, expressed as a distance rather than a per-dab weight.
 *  0.25 per dab at a 40 px pen (spacing 0.22 x width = 8.8 px) is
 *  -8.8 / ln(0.75) = 30.6 px, so a mid-sized brush is unchanged and the two
 *  ends stop depending on how big the brush happens to be. */
const CONTACT_SMOOTHING_PX = 30

export const BRUSH_PEN_SPEED_CONTACT: SpeedContactProfile = {
  factor: speed => lerp(1, CONTACT_AT_SPEED, (speed - CONTACT_SPEED_SLOW) / (CONTACT_SPEED_FAST - CONTACT_SPEED_SLOW)),
  smoothingPx: CONTACT_SMOOTHING_PX,
}

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
    // Kept as the fallback for the two moments the nib has no direction of its
    // own — the first dab of a stroke, and the instant a hairpin straightens
    // the fibres out — but for every dab in between, `tipBend` below overrides
    // it outright. Tilt decides how large the contact patch is (§6); which way
    // a *bent* nib points is a fact about the drag, and a stylus's lean has no
    // business rotating it (#472).
    angle:  tiltOrPathAngle,
    // #305's low-pass, applied to pressure instead of tilt (DabSystem's own
    // _filterPressure). Opt-in per profile exactly as tiltSmoothing is, so no
    // other tool pays for it.
    pressureSmoothingPx: BRUSH_PEN_PRESSURE_SMOOTHING_PX,
    // #472: the whole of the nib's flexibility, and the reason this tool needs
    // a profile that other tools' pure shape functions cannot express.
    tipBend: brushPenTipBend(response),
    // #482, ADR 012 §8: declared, not post-processed — so the nib's lag and
    // trail are computed from the width actually being drawn.
    headTaper: BRUSH_PEN_HEAD_TAPER,
    speedContact: BRUSH_PEN_SPEED_CONTACT,
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

// ─── Speed → contact (#472, revising ADR 009 §5) ────────────────────────────
// v1 said "speed does not affect width", and gave a reason that was about cost
// rather than about the tool: routing speed into the geometry of every tool
// meant a new wire for an effect the spec itself calls slight. #472 sidestepped
// it by applying the factor as a post-pass in PencilEngine instead.
//
// #482 took the wire after all, and the sidestep turned out to cost more than
// it saved: a post-pass over `dab.size` runs *after* the nib's lag and trail
// have been derived from that width, so the head of every stroke bent as though
// the nib were the untapered one. The input is one field on TipInput, shared by
// every tool and read by the two that declare a speedContact.
//
// What it buys, in the spec's own terms: a fast pen presses less of its nib
// into the paper, so a quick stroke comes out a little leaner than the same
// pressure drawn slowly. That is also what makes a run of "identical" strokes
// differ slightly from each other without a single random number — the
// difference is the hand's, which is the whole thesis of the tool.
//
// Deliberately small. A speed term strong enough to notice on its own would be
// competing with pressure for control of the width, and the tool is defined by
// pressure winning that.


