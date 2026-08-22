// Converts a pointer path into a series of brush dabs spaced along the stroke.
// Uses a centripetal Catmull-Rom spline (see #91) with 1-event lag for true
// C1 continuity (no kinks at sample points).
//
// Why 1-event lag:
//   To render segment P1→P2 smoothly we need actual P3 (not extrapolated).
//   With extrapolated P3 the tangent at P2 doesn't match the next segment → visible kinks.
//   The lag is one pointer event (~5-16ms) which is imperceptible.

import type { Dab } from '@grafetto/shared'
import { clamp } from 'lodash-es'

import { PENCIL_DAB_SHAPING, type DabShapingProfile } from './dabShaping'
import { MIN_DAB_SPACING_PX, footprintDabSpacing, nominalDabSpacing } from './dabSpacing'
import {
  assignTipState, copyTipState, createTipState, maxNibReach, tipFootprint,
  type TipFootprint, type TipState,
} from './tipFootprint'
import { tiltNormFrom } from './tiltMath'

interface ControlPoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
}

// --- Centripetal Catmull-Rom parameterization (see #91) --------------------
// Plain/uniform Catmull-Rom gives every segment the same unit knot interval
// regardless of how far apart its control points actually are in space.
// Pointer input is sampled at a fixed time-rate, so a fast stroke (e.g. a
// quick round spiral) produces widely, *unevenly* spaced points relative to
// slower parts of the same stroke. Uniform parameterization handles uneven
// spacing poorly: the fitted curve under-curves across the wide gaps between
// sparse fast-stroke samples, so a genuinely smooth, continuously-curving
// path ends up looking like a faceted polyline with rounded-off corners —
// not because any point is a real corner, but because the tangent estimate
// at each point is a poor fit when neighboring segment lengths differ a lot.
//
// Centripetal parameterization (knot spacing proportional to |ΔP|^alpha,
// alpha = 0.5) is the standard, well-established fix for exactly this
// problem (Yuksel, Schaefer & Keyser 2011, "On the Parameterization of
// Catmull-Rom Curves"): centripetal curves provably never form cusps or
// self-intersections for any control-point configuration, and — because the
// tangent formula below is invariant to uniform rescaling of the knot
// values — this reduces to *exactly* today's fixed-tangent behavior whenever
// the four points happen to already be evenly spaced. alpha = 0 would be
// today's uniform parameterization; alpha = 1 ("chordal") overcorrects and
// re-introduces its own overshoot on some configurations — 0.5 is the
// standard middle ground.
const CENTRIPETAL_ALPHA = 0.5
const MIN_KNOT_DELTA = 1e-6 // guards divide-by-zero if two control points coincide

// --- Corner-preserving tangent reduction (#91 follow-up) --------------------
// Centripetal parameterization (above) fixes *smooth* curves that were
// under-fit because of uneven sample spacing, but it still assumes every
// point is part of one continuous curve — the Catmull-Rom tangent at a
// point is, by construction, always some blend of the segments on both
// sides of it. That's wrong at a genuinely sharp corner: pointer samples
// arrive at a fixed time-rate, not a fixed distance-rate, so a fast, sharp
// direction change (e.g. the tip of a quick spiral) produces few, widely
// spaced points, and smoothing them uniformly rounds the real corner into
// an arc. Confirmed on a Samsung Galaxy Tab S7+ (less visible on Surface
// Pro, which samples the pen at a much higher rate) — see #91.
//
// Standard fix: measure the direction change between the two segments
// meeting at a control point (e.g. p0->p1 vs p1->p2 for the point at p1)
// and, when it's sharp, shrink that point's tangent toward zero rather
// than using the full smooth Catmull-Rom value. With a zeroed tangent the
// Hermite basis degenerates to its two positional terms (h00, h01), which
// stay monotonically between the endpoints with no overshoot — so the
// curve approaches/leaves the corner close to the straight chord instead
// of swinging through it. This is the same idea as reducing spline
// "tension" at a point, or the tangent-limiting used by monotone Hermite
// interpolants (e.g. Fritsch-Carlson/PCHIP) to prevent overshoot near a
// local extremum — here the "extremum" is a sharp corner instead.
//
// Thresholds are a first-pass default (see #91's "important about tuning"
// section) — not yet calibrated against a real device. They were chosen
// to sit comfortably outside the direction-change range produced by an
// actually smooth curve: even the intentionally sparse/uneven gap in
// DabSystem.test.ts's fast-spiral simulation only turns ~45 degrees
// between consecutive chords, so 60 degrees leaves real curvature alone
// while still catching a fast pointer's abrupt reversals; 150 degrees is
// a near-hairpin turn, comfortably inside "reverses direction abruptly".
const CORNER_ANGLE_START = (60 * Math.PI) / 180 // below this: full smoothing, untouched
const CORNER_ANGLE_FULL = (150 * Math.PI) / 180 // at/above this: tangent fully zeroed
const MIN_TURN_VEC_LEN = 1e-6 // guards near-zero-length segment vectors

// --- Control-point deadband -------------------------------------------------
// A pointer sample closer than this (world px) to the last admitted control
// point is not a new point — it's the same point re-reported by a digitizer
// sampling faster than the pen is moving. Such a sample is dropped rather
// than buffered (its pressure/tilt still refresh the point it collapses
// into), so every buffered segment is at least this long.
//
// This used to be a *segment* check instead: the sample was always buffered,
// and then the segment about to be rendered was skipped whenever it came out
// shorter than half a pixel — which threw that segment's arc length away
// entirely (`_remainder` untouched, the buffer moves on regardless), so the
// stroke silently lost path. Measured on a Galaxy Tab S7+ (S Pen, 360Hz
// whenever coalesced samples flow, median step 0.94 world px): 3.3% of a slow
// ruler-guided stroke's path was lost this way, 14% on a slower one, 69% with
// the pen held still — while the same gestures sampled at 60Hz lost 0.0-0.4%.
// Same hand, same stroke, a different amount of ink depending on how fast the
// tablet happens to report. Admitting-or-dropping the *sample* keeps all of
// the real path instead (the deadband only ever defers a point until the pen
// has genuinely moved half a pixel; only the final sub-threshold tail, at
// most this distance, goes undrawn) and, as a bonus, guarantees the spline
// never sees two near-coincident control points — the degenerate knot
// spacing MIN_KNOT_DELTA above exists to paper over.
//
// Deliberately in world px, not client px: the quantity being protected is
// "never emit a spline segment shorter than half an output pixel", which is a
// property of the rendered result, not of the input device. Zooming in
// therefore admits finer real pen movement (correctly — it resolves to more
// output pixels), not less.
const MIN_CONTROL_POINT_DISTANCE = 0.5

// Arc-length lookup table resolution for _splineDabs (see below). Hoisted so
// the scratch buffers sized off it can be allocated once per instance rather
// than once per call.
const STEPS = 16

// #472, see _filterPressure. Distance credited to a sample that didn't move,
// so a stationary press still converges; deliberately equal to the deadband
// (MIN_CONTROL_POINT_DISTANCE), which is the largest travel a collapsed sample
// can have had — so a held pen filters at most as fast as a barely-moving one.
const STATIONARY_PX = 0.5
// Ceiling on that filter's per-sample weight: a dropped frame or a pen
// re-entering the canvas produces one very long gap, and without this the
// filter would throw its state away in a single dab and step the width.
//
// High on purpose. This is an outlier guard, not a second smoothing knob —
// set it low enough to bind at ordinary sample spacings and the filter is
// per-sample again, which is the exact thing the length-based weight exists to
// stop being. At the shipped 10px length it starts binding past ~23px of
// travel in one sample, i.e. around 2800 px/s on a 120Hz stylus.
const MAX_PRESSURE_FILTER_STEP = 0.9

export class DabSystem {
  spacingFactor: number
  /**
   * #330 stage 3 — marker only, null for every other tool (which keeps plain
   * `baseSize * spacingFactor` spacing, unchanged).
   *
   * The marker's silhouette is no longer the union of these samples' own
   * stamps: markerRibbon.ts connects consecutive samples with a band, and for a
   * convex nib that band is the *exact* swept figure. What the band cannot
   * represent is the path's curvature — it is a straight chord between two
   * samples, so a curve is rendered as a polygon whose error is the chord's
   * sagitta, s²κ/8.
   *
   * There are *two* such errors, and the second one is the one that matters —
   * missing it first time round left visible scalloping on turns:
   *
   *  - the path's own sagitta, s²κ/8, independent of the nib. Sub-pixel almost
   *    everywhere (0.87px for a 120px brush on a 100px-radius curve).
   *  - the nib's *reach* amplifying the turn. A fixed-orientation nib swept
   *    along a curve has an outer boundary offset by its support value in the
   *    local normal direction, and for a 5:1 chisel that offset swings by up to
   *    the long semi-axis as the travel direction rotates. Approximating the
   *    path by chords therefore pulls the far edge in by roughly
   *    reach·(κs)²/8 — measured 1.36px at a 120px brush on an 80px-radius arc,
   *    against 0.34px for the path term alone. Small in absolute terms, but it
   *    repeats at the sample interval and the edge is now a 1px ramp with
   *    nothing left to hide it.
   *
   * So the limit is the tighter of the two, and the tolerance is deliberately a
   * fraction of the edge ramp's own width rather than a fraction of a pixel-ish
   * "close enough".
   */
  curvatureTolerancePx: number | null = null
  /**
   * #478 — how this tool's dab is actually drawn, or null to keep the pre-#478
   * rule of spacing off the nominal brush size alone.
   *
   * `sizeScale` is the renderer's own size multiplier (`preset.sizeMultiplier`,
   * 1 for a tool that paints Dab.size at face value); `hardness` is the edge
   * softness the fragment shader will use for it. Both are needed because the
   * step tracks the *mark*: how wide it is, and — since #483 — whether its
   * edge is hard enough for a gap in it to show at all.
   *
   * Set once per stroke by the engine, from the same place it sets
   * `curvatureTolerancePx` and calls `setShaping` — it is a property of the
   * tool, not of the gesture. Null for every tool whose mark is a swept ribbon
   * rather than a row of stamps; see dabSpacing.ts's isFootprintSpacedTool for
   * the full argument about which tools want this and which would be harmed by
   * it.
   *
   * Only ever *tightens* the step (footprintDabSpacing takes a min against the
   * nominal rule), so switching it on cannot make any existing mark sparser.
   */
  footprint: { sizeScale: number; hardness: number } | null = null
  /**
   * #482, ADR 012 §3 — the viewport's own rotation, radians, kept current by
   * the engine (both `setViewport` and `setInfiniteCamera` assign it).
   *
   * Needed because the two things a dab's angle can be derived from are not in
   * the same frame: the spline's tangent is world-space, the stylus's tilt is
   * the device's reading against the screen. `Dab.angle` is world, so a profile
   * reading tilt has to convert, and this is what it converts with. See
   * dabShaping.ts's tiltOrPathAngle.
   *
   * Live rather than per-stroke (unlike `footprint` above): the canvas
   * can be rotated with the pen still down, and the compensation has to track
   * the frame the device is actually reporting against, not the one that
   * happened to be current at touchdown.
   *
   * 0 on an unrotated canvas, which makes every profile that reads it a no-op
   * there — the conversion cannot alter a mark that was not already wrong.
   */
  cameraAngle = 0
  private _buf: ControlPoint[]
  private _remainder: number
  /**
   * #478 — the step owed from the last dab emitted, or 0 before a stroke has
   * emitted one.
   *
   * Under the footprint rule the step is a property of the dab it follows (its
   * own size decides how far the next one may sit), so unlike the old
   * segment-constant spacing it has to survive the segment boundary the same
   * way `_remainder` does: a dab emitted at the very end of one segment is
   * still what decides where the first dab of the next one lands. Carried, not
   * recomputed, for exactly the reason _remainder is.
   */
  private _pendingSpacing = 0
  private _shaping: DabShapingProfile

  // Reusable arc-length lookup table scratch storage for _splineDabs, sized
  // STEPS + 1 (index 0 is the segment start p1). Parallel Float64Arrays
  // instead of an array of {t, len, x, y} objects, so a hot stroke doesn't
  // allocate STEPS+1 small objects on every continueStroke/peekTipDabs call.
  // Overwritten in place on every call; forkForPreview() below gives the
  // fork its own independent copies for the same reason it clones _buf.
  private _sampleT: Float64Array
  private _sampleLen: Float64Array
  private _sampleX: Float64Array
  private _sampleY: Float64Array

  // Low-passed tilt (#305), or null while no stroke is in flight / for a
  // profile that doesn't ask for filtering. See _filterTilt for why this is a
  // *vector* rather than a smoothed magnitude plus a smoothed azimuth.
  private _tiltFilterX: number | null = null
  private _tiltFilterY: number | null = null

  // Low-passed pressure (#454), same lifecycle as the tilt filter above and
  // null for every profile that doesn't ask for it. See _filterPressure.
  private _pressureFilter: number | null = null

  // How the bent nib is currently lying (#472), as a vector whose *direction*
  // is where it points and whose *length*, in [0, 1], is how far it is bent.
  // Zero at the start of every stroke: fibres that have not been dragged yet
  // are straight. Only a profile with a `tipBend` ever moves it.
  //
  // One vector carrying both facts is not a trick to save a field — the two
  // are the same fact. The nib is bent *because* it has been dragged in a
  // consistent direction, so the coherence of the recent directions of travel
  // is the bend, and the mean of unit vectors measures exactly that. Three
  // things follow without a branch for any of them:
  //
  //  - **Straight down, no drag** — length 0, so the mark is round. This is
  //    what the model got wrong first time round (#472 review, Ilya): it bent
  //    the nib fully on the first dab that had any direction at all, so a
  //    press-and-nudge stamped a full ellipse and then spun it on the spot as
  //    the nudge's direction — which is noise, the pen having moved a pixel —
  //    changed. A real nib pressed straight down leaves a round blob.
  //  - **A hairpin** passes through zero length rather than jumping half a
  //    turn: the bundle straightens out and re-bends the other way, and while
  //    it is straight the mark is round.
  //  - **A tight curve** settles at a length below 1, i.e. a nib dragged
  //    sideways the whole time is less coherently bent than one dragged
  //    straight. That is a consequence of the representation and it reads
  //    correctly, but it is a modelling choice rather than a measurement.
  //
  // A vector rather than an angle also means there is no ±π wrap to damp — the
  // same reason _filterTilt's own comment gives at length.
  // ...together with how far behind the pointer the mark is currently landing
  // (#472, TipBendProfile.trailWidths), smoothed over arc length rather than
  // taken straight from the profile, for a reason that is about geometry and
  // not about looks: it is subtracted from every dab's position, so if it grew
  // by more than the dab spacing from one dab to the next, consecutive dabs
  // would come out in reverse order along the path and the ribbon would build a
  // band backwards. Easing it over the same distance the bend itself takes
  // bounds the growth by the trail's own depth over that distance, which is
  // well under the spacing at any sane trail setting.
  //
  // #482: one record rather than three fields, because all three are copied
  // together in four places (fork, speculative peek save/restore, stroke reset)
  // and the tip model that reads them now lives in tipFootprint.ts.
  private _tip: TipState = createTipState()

  // Pointer speed for the batch being converted, canvas px/ms. Latched by the
  // public entry points rather than threaded through _splineDabs/_makeDab: it
  // is a property of the whole batch, one measurement per pointer event, and
  // every profile without a tipBend ignores it entirely.
  private _speed = 0

  constructor({ spacingFactor = 0.22, shaping = PENCIL_DAB_SHAPING }: { spacingFactor?: number; shaping?: DabShapingProfile } = {}) {
    this.spacingFactor = spacingFactor
    this._buf = []
    this._remainder = 0
    this._shaping = shaping
    this._sampleT = new Float64Array(STEPS + 1)
    this._sampleLen = new Float64Array(STEPS + 1)
    this._sampleX = new Float64Array(STEPS + 1)
    this._sampleY = new Float64Array(STEPS + 1)
  }

  // Switches the pressure/tilt→geometry response for subsequent dabs (#240).
  // Engine calls this once per stroke start, from the same place it latches
  // _strokeTool — never expected mid-stroke, so no special handling for a
  // profile change partway through an in-progress _buf.
  setShaping(shaping: DabShapingProfile): void {
    this._shaping = shaping
  }

  private _reset(): void {
    this._buf = []
    this._remainder = 0
    // #478: zeroed alongside _remainder, and read as "no dab has been emitted
    // yet", so the stroke's first dab is placed off the nominal step. There is
    // no dab to take a footprint from at that point, and the very first dab of
    // a stroke lands at arc length 0 regardless.
    this._pendingSpacing = 0
    // Cleared, not zeroed: _filterTilt seeds itself from the stroke's first
    // real sample. Zeroing would instead start every stroke at "perfectly
    // upright" and let the shape swing up to the true tilt over the first
    // several dabs, which reads as the stroke's head being the wrong shape.
    this._tiltFilterX = null
    this._tiltFilterY = null
    // Cleared for the same reason, and it matters more here: seeding at 0
    // would start every brush-pen stroke at zero pressure and let it climb to
    // the real value over the first samples, which is a taper nobody asked for
    // sitting on top of the one §4 of ADR 009 does ask for.
    this._pressureFilter = null
    // #472: zeroed, and here that genuinely means "straight", not "unknown" —
    // a nib that has just touched down has not been dragged yet. Length 0 is
    // an unbent nib, so the head of a stroke is round by construction and
    // there is no seeding rule to get wrong.
    //
    // The trail is zeroed with it: a stroke starts with the mark exactly under
    // the pen, and the lag builds up as the nib bends. Carrying a trail across
    // strokes would displace the very first dab of the next one.
    assignTipState(this._tip, createTipState())
  }

  /**
   * One-pole low-pass over reported pressure (#454, ADR 009 §3). Stylus
   * pressure is noisy, and the brush pen is the first tool whose width tracks
   * it closely enough for that noise to be visible as a rippling outline.
   *
   * Applied where a sample is *admitted*, not where a dab is made, and that
   * placement is load-bearing: continueStroke's deadband lets a sample that
   * hasn't travelled half a pixel overwrite the last control point's pressure
   * without becoming a point of its own. Filtering later would leave exactly
   * the slow, careful movement — where the deadband fires most — running on
   * raw values.
   *
   * Returns pressure untouched when the active profile declares no smoothing,
   * which is every tool but the brush pen.
   *
   * #472: the weight is derived from how far the pen has *travelled* since the
   * previous admitted sample, not spent once per sample. A per-sample one-pole
   * is a filter whose corner frequency is the tablet's report rate — the same
   * gesture drawn on a 240 Hz stylus arrived three times less smoothed than on
   * a 60 Hz one, which made "how firm this pen feels" a property of the device
   * rather than of the tool. `1 - exp(-d/L)` is the same one-pole re-expressed
   * against distance, so the smoothing is a fixed number of canvas px either
   * way.
   *
   * Two deliberate deviations from pure distance:
   *
   *  - `STATIONARY_PX` is added to the travelled distance, so a pen held still
   *    and pressed harder still converges. Distance alone would freeze the
   *    filter exactly there, and continueStroke's deadband (which is the whole
   *    reason this runs at sample admission — see above) is precisely the path
   *    where that happens. It is per-sample, i.e. rate-dependent, but nothing
   *    about a stationary press has a shape for that to distort.
   *  - the weight is capped, so a single long jump — a dropped frame, a pen
   *    re-entering the canvas — cannot discard the filter's state wholesale
   *    and step the width in one dab.
   */
  private _filterPressure(pressure: number, travelPx: number): number {
    const lengthPx = this._shaping.pressureSmoothingPx
    if (lengthPx === undefined) return pressure
    if (this._pressureFilter === null) {
      this._pressureFilter = pressure
      return this._pressureFilter
    }
    const k = Math.min(1 - Math.exp(-(travelPx + STATIONARY_PX) / lengthPx), MAX_PRESSURE_FILTER_STEP)
    this._pressureFilter += (pressure - this._pressureFilter) * k
    return this._pressureFilter
  }

  /**
   * One-pole low-pass over the tilt *vector* (#305, ADR 005). Stylus tilt is
   * markedly noisier than position, and charcoal's shape depends on it far
   * more than any other tool's, so unfiltered tilt makes the dab visibly
   * flutter between round/edge/broad.
   *
   * Filtering the vector rather than the two values actually used downstream
   * (magnitude and azimuth) is the whole trick, and it buys three things at
   * once:
   *  - No ±π wrap to handle: there's no angle being averaged, so no need for
   *    an angular-difference damper at all.
   *  - Azimuth is *ill-defined* near vertical — it's atan2 of two near-zero
   *    numbers, i.e. mostly noise, and it thrashes hardest exactly when the
   *    pen is most upright. Here a near-vertical sample simply contributes a
   *    short vector, so it barely moves the filtered direction. The weighting
   *    falls out of the geometry instead of needing a special case.
   *  - One piece of state instead of two that can drift apart.
   *
   * Returns raw tilt untouched when the active profile declares no smoothing,
   * which is every tool but graphite and charcoal.
   *
   * #482: the weight comes from `ds`, the arc length this dab sits from the
   * previous one, rather than being spent once per dab. Same defect #472 cured
   * for pressure and the same cure: a per-dab one-pole has its corner frequency
   * set by the dab rate, which is a function of brush size, zoom, curvature and
   * the tablet's own report rate — so how steady a leaned pencil felt depended
   * on all four. Over distance it is a fixed number of world px, which is a
   * thing the hand can feel.
   *
   * The `MAX_PRESSURE_FILTER_STEP` ceiling its pressure twin carries is not
   * needed here: a very long `ds` means the spline genuinely covered that much
   * ground, and unlike a dropped pressure sample there is no state worth
   * defending — tilt is a pose, and a pose that far along should be believed.
   */
  private _filterTilt(tiltX: number, tiltY: number, ds: number): { tiltX: number; tiltY: number } {
    const lengthPx = this._shaping.tiltSmoothingPx
    if (lengthPx === undefined) return { tiltX, tiltY }
    if (this._tiltFilterX === null || this._tiltFilterY === null) {
      this._tiltFilterX = tiltX
      this._tiltFilterY = tiltY
    } else {
      const k = 1 - Math.exp(-ds / lengthPx)
      this._tiltFilterX += (tiltX - this._tiltFilterX) * k
      this._tiltFilterY += (tiltY - this._tiltFilterY) * k
    }
    return { tiltX: this._tiltFilterX, tiltY: this._tiltFilterY }
  }

  // Non-mutating fork for speculative pointer prediction (#92): clones the
  // current control-point buffer and arc-length remainder into a fresh
  // DabSystem so predicted points can be fed through the exact same spline/
  // spacing math (for visual consistency with real dabs) without ever
  // touching this instance's `_buf`/`_remainder`. A wrong prediction must
  // never corrupt the curve fit used for the next *real* segment — the
  // caller is expected to discard the fork after use (typically once per
  // pointermove, re-forking fresh from the real, now-updated state each
  // time) rather than keep feeding it more real points.
  /**
   * #482, ADR 012 §5 — the footprint of a tip that is in contact but has not
   * travelled, for the engine's dwell tick (#245).
   *
   * A resting stylus produces no dabs here at all: spacing is arc length, and
   * there is none, so the engine paints dwell dabs on a timer instead. Before
   * this that path built its `Dab` by hand — its own size/aspect call, its own
   * `angle: 0` for every tool but the marker, no knowledge of the tip's state.
   * It is the same footprint as any other, taken at `ds = 0`.
   *
   * `ds = 0` is load-bearing rather than merely convenient: the bend filter's
   * weight is `1 - exp(-ds / lag)`, so a resting nib keeps exactly the bend it
   * arrived with and the tip state comes back unchanged. A dwelling brush pen
   * therefore pools ink under a nib still lying the way the stroke left it,
   * which is what a real one does.
   *
   * Deliberately does *not* run the tilt/pressure low-passes: they advance on
   * admitted samples, and a timer tick is not one. The caller passes whatever
   * the last real sample reported, exactly as the dwell path always has.
   */
  restingFootprint(
    x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number,
  ): TipFootprint {
    return tipFootprint(this._shaping, {
      x, y, pressure, tiltX, tiltY, baseSize, pathAngle: 0, ds: 0,
      speed: 0, cameraAngle: this.cameraAngle,
    }, this._tip)
  }

  forkForPreview(): DabSystem {
    const fork = new DabSystem({ spacingFactor: this.spacingFactor, shaping: this._shaping })
    fork.curvatureTolerancePx = this.curvatureTolerancePx
    fork.footprint = this.footprint
    fork.cameraAngle = this.cameraAngle
    fork._buf = this._buf.map(p => ({ ...p }))
    fork._remainder = this._remainder
    // #478: and the step owed from the last real dab, for the same reason the
    // remainder is inherited — a preview that restarted from the nominal step
    // would place its first dab somewhere the real one won't.
    fork._pendingSpacing = this._pendingSpacing
    // #305: the fork continues *this* stroke speculatively, so it must inherit
    // the tilt filter's current position — starting it at null would re-seed
    // from the predicted sample and give the preview a different shape than
    // the real dabs that land a moment later.
    fork._tiltFilterX = this._tiltFilterX
    fork._tiltFilterY = this._tiltFilterY
    // #454: and the pressure filter, for the identical reason — a preview that
    // re-seeded from the predicted sample would render the tip at a different
    // width than the real dabs landing a moment later.
    fork._pressureFilter = this._pressureFilter
    // #472: and where the nib is currently bent, for the third time over the
    // same reason — a preview that started the nib straight would draw the
    // leading edge as a round stamp under a stroke whose nib is fully trailed.
    assignTipState(fork._tip, this._tip)
    fork._speed = this._speed
    // fork already got its own fresh scratch Float64Arrays from its own
    // constructor call above — do not share this instance's arrays with it.
    return fork
  }

  // Returns first dab; subsequent segment rendering is deferred by 1 event.
  startStroke(x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number, speed = 0): Dab[] {
    this._reset()
    this._speed = speed
    // Seeds the filter (a no-op for every profile without one) — the first
    // sample of a stroke is taken at face value, exactly as the tilt filter
    // seeds itself from its own first sample.
    const p = this._filterPressure(pressure, 0)
    this._buf = [{ x, y, pressure: p, tiltX, tiltY }]
    // ds = 0: nothing has been dragged yet, so a bent-nib profile leaves this
    // dab round rather than pointing it along the placeholder angle below.
    const first = this._makeDab(x, y, p, tiltX, tiltY, baseSize, 0, 0)
    // #478: the touch-down dab is emitted here rather than through
    // _splineDabs, and it is still a dab — so it owes the next one a step just
    // like any other. Without this the stroke's first *gap* would be a full
    // nominal step while the rest of the mark is spaced off its footprint,
    // i.e. a hole at the head of every stroke on exactly the tools this
    // change exists to close holes in. Capped by the nominal step and not by
    // a segment's curvature limit, because there is no segment yet; the first
    // _splineDabs call re-caps it against its own.
    this._pendingSpacing = this._spacingAfter(first, baseSize, nominalDabSpacing(baseSize, this.spacingFactor))
    return [first]
  }

  // Returns dabs for the segment one step behind the current point.
  // Segment [n-3]→[n-2] is rendered once [n-1] (=P3) is known.
  continueStroke(x: number, y: number, pressure: number, tiltX: number, tiltY: number, baseSize: number, speed = 0): Dab[] {
    this._speed = speed
    // #454: every admitted sample's pressure passes the low-pass first,
    // including the one that only refreshes the last control point below —
    // see _filterPressure on why that case is the whole reason this sits here.
    // #472 moved the distance measurement above it, because the filter is now
    // weighted by that distance rather than spent once per sample.
    const prev = this._buf[this._buf.length - 1]
    const travel = prev ? Math.hypot(x - prev.x, y - prev.y) : 0
    pressure = this._filterPressure(pressure, travel)
    // Deadband (see MIN_CONTROL_POINT_DISTANCE): a sample that hasn't cleared
    // half a pixel since the last control point collapses *into* that point
    // rather than becoming one of its own. Its pressure/tilt still count —
    // they're the freshest reading available at that position — so pressing
    // harder without moving is not lost, it just doesn't manufacture
    // geometry. A stationary stylus still produces no dabs from here at all
    // (that's what the engine's dwell tick is for, see _paintDwellDab).
    if (prev && travel < MIN_CONTROL_POINT_DISTANCE) {
      prev.pressure = pressure
      prev.tiltX = tiltX
      prev.tiltY = tiltY
      return []
    }

    this._buf.push({ x, y, pressure, tiltX, tiltY })
    const n = this._buf.length

    if (n < 3) return [] // need at least 3 pts to define a segment

    const p0 = n >= 4 ? this._buf[n - 4] : mirrorBefore(this._buf[n - 3], this._buf[n - 2])
    const p1 = this._buf[n - 3]
    const p2 = this._buf[n - 2]
    const p3 = this._buf[n - 1]

    if (n > 4) this._buf.shift() // keep buffer at max 4

    return this._splineDabs(p0, p1, p2, p3, baseSize)
  }

  // Must be called on pointerup to flush the last pending segment.
  endStroke(baseSize: number, speed = 0): Dab[] {
    this._speed = speed
    const n = this._buf.length
    if (n < 2) return []

    const p1 = this._buf[n - 2]
    const p2 = this._buf[n - 1]
    const p0 = n >= 3 ? this._buf[n - 3] : mirrorBefore(p1, p2)
    // Extrapolate P3 only at end — no alternative here
    const p3: ControlPoint = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y, pressure: p2.pressure, tiltX: p2.tiltX, tiltY: p2.tiltY }

    // Defensive only: continueStroke's own deadband already guarantees any two
    // consecutive buffered points are at least this far apart, so this can no
    // longer discard a real segment the way it used to (see
    // MIN_CONTROL_POINT_DISTANCE). _splineDabs guards degenerate length too.
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    if (Math.hypot(dx, dy) < MIN_CONTROL_POINT_DISTANCE) return []

    return this._splineDabs(p0, p1, p2, p3, baseSize)
  }

  // Non-mutating "live tip" preview (#104 latency investigation): same math
  // as endStroke() — the segment ending at the newest known real point, with
  // its far tangent extrapolated the same way endStroke extrapolates a ghost
  // P3 — but restores `_remainder` afterward instead of consuming it, so a
  // subsequent *real* continueStroke() still sees this exact segment through
  // to a genuine tangent, completely unaffected by any peekTipDabs() calls
  // in between (see DabSystem.test.ts's non-mutation tests).
  //
  // Exists to let a caller render the stroke's leading edge immediately,
  // using only real, already-sampled positions (unlike #92's
  // getPredictedEvents()-based preview, which guesses a *future*, not-yet-
  // sampled position) — only the tangent/curvature at the tip is a guess,
  // and it is fully superseded within one more real event, never left
  // behind. Intended to be called after every continueStroke() and its
  // output discarded/repainted (not accumulated) on every subsequent call —
  // see PencilEngine's _tipBuf/_refreshTip.
  peekTipDabs(baseSize: number, speed = 0): Dab[] {
    this._speed = speed
    const n = this._buf.length
    if (n < 2) return []

    const p1 = this._buf[n - 2]
    const p2 = this._buf[n - 1]
    const p0 = n >= 3 ? this._buf[n - 3] : mirrorBefore(p1, p2)
    const p3: ControlPoint = { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y, pressure: p2.pressure, tiltX: p2.tiltX, tiltY: p2.tiltY }

    // Defensive only — same reasoning as endStroke's own copy of this check.
    const dx = p2.x - p1.x, dy = p2.y - p1.y
    if (Math.hypot(dx, dy) < MIN_CONTROL_POINT_DISTANCE) return []

    const savedRemainder = this._remainder
    // #478: stroke state for the same reason, and restored on the same line —
    // a peeked tip must not leave the real stroke owing a step measured off a
    // dab that was only ever speculative.
    const savedPending = this._pendingSpacing
    // #472: the bent nib's orientation is stroke state too, and this method is
    // defined to leave stroke state alone — advancing it here would bend the
    // nib along a *guessed* tangent, and the real segment arriving a moment
    // later would then start from a nib that had already turned toward a
    // direction the hand never went.
    const savedTip = copyTipState(this._tip)
    const dabs = this._splineDabs(p0, p1, p2, p3, baseSize)
    this._remainder = savedRemainder
    this._pendingSpacing = savedPending
    assignTipState(this._tip, savedTip)
    return dabs
  }

  private _splineDabs(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint, baseSize: number): Dab[] {
    // Centripetal tangents at the segment's two endpoints (see #91 constants
    // above). These reduce algebraically to the standard fixed Catmull-Rom
    // tangents (P2-P0)/2 and (P3-P1)/2 whenever p0..p3 are evenly spaced.
    const { m1, m2 } = centripetalTangents(p0, p1, p2, p3)

    // Corner-preserving reduction (see #91 above): shrink each endpoint's
    // tangent toward zero in proportion to how sharp the real direction
    // change is there, so a genuine sharp corner at p1 or p2 stays sharp
    // instead of being smoothed into an arc. Left as full smoothing (no-op)
    // whenever the turn is shallow — in particular this is always a no-op
    // for the mirrored ghost points used at the very start/end of a stroke,
    // since a mirrored segment is defined to exactly match its neighbor's
    // direction (turn angle 0).
    const turnAtP1 = turnAngle(p1.x - p0.x, p1.y - p0.y, p2.x - p1.x, p2.y - p1.y)
    const turnAtP2 = turnAngle(p2.x - p1.x, p2.y - p1.y, p3.x - p2.x, p3.y - p2.y)
    const f1 = cornerFactor(turnAtP1)
    const f2 = cornerFactor(turnAtP2)
    if (f1 > 0) { m1.x *= 1 - f1; m1.y *= 1 - f1 }
    if (f2 > 0) { m2.x *= 1 - f2; m2.y *= 1 - f2 }

    // Arc-length lookup table for uniform dab spacing along the curve.
    // Written into reusable scratch Float64Arrays (index 0 = segment start
    // p1) instead of allocating a fresh array of sample objects every call.
    const sampleT = this._sampleT
    const sampleLen = this._sampleLen
    const sampleX = this._sampleX
    const sampleY = this._sampleY

    sampleT[0] = 0
    sampleLen[0] = 0
    sampleX[0] = p1.x
    sampleY[0] = p1.y
    let totalLen = 0

    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS
      const pos = hermitePos(p1, p2, m1, m2, t)
      totalLen += Math.hypot(pos.x - sampleX[i - 1], pos.y - sampleY[i - 1])
      sampleT[i] = t
      sampleLen[i] = totalLen
      sampleX[i] = pos.x
      sampleY[i] = pos.y
    }

    if (totalLen < 0.001) return []

    // The loosest step this segment allows: the nominal size-proportional rule
    // and, for a ribbon tool, its curvature limit. #478's footprint rule can
    // only tighten it further, per dab — see _spacingAfter.
    const maxSpacing = Math.max(MIN_DAB_SPACING_PX, Math.min(
      baseSize * this.spacingFactor,
      this._curvatureSpacingLimit(p1, p2, m1, m2, totalLen, baseSize),
    ))
    const dabs: Dab[] = []
    // The step this segment starts out owing, which belongs to the *previous*
    // dab and not to this segment: under #478's footprint rule how far the
    // next dab may sit is decided by the size of the one before it, and that
    // dab may well have been emitted on an earlier segment. `maxSpacing` still
    // caps it, because this segment's curvature limit is this segment's to
    // impose. Falls back to the nominal step before a stroke has emitted
    // anything at all.
    let step = Math.min(this._pendingSpacing || maxSpacing, maxSpacing)
    // Clamped at 0, and that clamp is load-bearing for any tool whose spacing
    // is not constant across a stroke — the marker via _curvatureSpacingLimit,
    // and since #478 every footprint-spaced tool, whose step changes with
    // pressure within a single segment.
    //
    // `_remainder` is arc length already travelled past the last emitted dab,
    // and it is bounded by whatever `step` was on the segment that produced
    // it — not by this segment's. A fast straight run sets a coarse spacing
    // (0.22 * 120px brush = 26.4px) and can leave almost all of it in the
    // remainder; the very next segment's curvature limit can then legitimately
    // cut spacing to the 1px floor. Unclamped, `step - _remainder` is
    // strongly negative there, and a negative arcPos means a negative `t` —
    // where hermitePos no longer interpolates but *extrapolates the cubic
    // backwards out of the segment*, planting dabs behind p1 and off the path
    // entirely. Measured on a straight run into a decelerating hook: a spur of
    // dabs reaching 15px back from the segment start and 2.6px off the curve,
    // which the marker's ribbon then connects up as a visible spike at the end
    // of the stroke (the reported "random extra point").
    //
    // Clamping to 0 says the right thing instead: the dab is overdue, so place
    // it at the segment start and carry on from there.
    let arcPos = Math.max(0, step - this._remainder)
    let si = 0
    // #472: arc length from the *previous emitted dab* to this one, which for
    // the first dab of a segment is not `step` — it is whatever was left
    // over from the previous segment plus however far into this one the dab
    // lands. Only a bent-nib profile reads it, and it must be the real gap:
    // that is the whole difference between "the nib catches up over 12px" and
    // "the nib catches up over three dabs, whatever those happen to be".
    let gap = this._remainder + arcPos

    while (arcPos <= totalLen + 1e-6) {
      while (si < STEPS - 1 && sampleLen[si + 1] < arcPos) si++

      const s0Len = sampleLen[si]
      const s1Len = sampleLen[si + 1]
      const s0T = sampleT[si]
      const s1T = sampleT[si + 1]
      const frac = s1Len > s0Len ? (arcPos - s0Len) / (s1Len - s0Len) : 0
      const t = s0T + frac * (s1T - s0T)

      const pos      = hermitePos(p1, p2, m1, m2, t)
      const pressure = clamp(crScalar(p0.pressure, p1.pressure, p2.pressure, p3.pressure, t), 0, 1)
      const tiltX    = crScalar(p0.tiltX, p1.tiltX, p2.tiltX, p3.tiltX, t)
      const tiltY    = crScalar(p0.tiltY, p1.tiltY, p2.tiltY, p3.tiltY, t)
      const tan      = hermiteTangent(p1, p2, m1, m2, t)

      const dab = this._makeDab(pos.x, pos.y, pressure, tiltX, tiltY, baseSize, Math.atan2(tan.y, tan.x), gap)
      dabs.push(dab)
      // #478: this dab decides how far the next one may sit, so the step is
      // read back off the dab that was just made rather than fixed for the
      // whole segment. That also makes it recomputable downstream from
      // `Dab.size` alone, which is what lets the engine hold the mark's tone
      // (dabSpacing.ts's dabDepositScale) without threading spacing through
      // the dab or the wire format.
      step = this._spacingAfter(dab, baseSize, maxSpacing)
      this._pendingSpacing = step
      arcPos += step
      gap = step
    }

    // `arcPos - step` is where the last dab actually landed: the loop always
    // leaves `step` holding the one it advanced by last, which under #478 is
    // no longer the same on every iteration. When the loop never ran at all it
    // is still the step this segment started out owing, which is exactly what
    // the pre-#478 expression used there too.
    this._remainder = Math.max(0, totalLen - (arcPos - step))
    return dabs
  }

  /** The step after `dab`, capped by whatever this segment already allows.
   *
   *  Plain `maxSpacing` for a tool that hasn't opted into the footprint rule,
   *  which is the entire pre-#478 behaviour — see dabSpacing.ts for why the
   *  nominal brush size is the wrong thing to space off, and which tools want
   *  this and which are already normalized some other way. */
  private _spacingAfter(dab: Dab, baseSize: number, maxSpacing: number): number {
    const fp = this.footprint
    if (fp === null) return maxSpacing
    return Math.min(maxSpacing, footprintDabSpacing(
      { size: dab.size, aspectRatio: dab.aspectRatio, sizeScale: fp.sizeScale, hardness: fp.hardness },
      baseSize, this.spacingFactor))
  }

  /**
   * Largest step that keeps both chord errors within `curvatureTolerancePx` on
   * this segment (see that field). Infinity — no limit at all — whenever the
   * caller hasn't opted in or the segment is straight.
   *
   * Curvature is estimated from the turn the tangent actually makes across the
   * segment (κ ≈ Δangle / arc length) rather than from the analytic second
   * derivative: two tangent evaluations we can afford, it degrades gracefully
   * on a near-degenerate segment, and it is exactly the quantity both sagitta
   * formulas are about.
   */
  private _curvatureSpacingLimit(
    p1: ControlPoint, p2: ControlPoint, m1: { x: number; y: number }, m2: { x: number; y: number },
    totalLen: number, baseSize: number,
  ): number {
    const tol = this.curvatureTolerancePx
    if (tol === null || totalLen < 1e-6) return Infinity
    const t0 = hermiteTangent(p1, p2, m1, m2, 0)
    const t1 = hermiteTangent(p1, p2, m1, m2, 1)
    const turn = turnAngle(t0.x, t0.y, t1.x, t1.y)
    if (turn < 1e-6) return Infinity
    const curvature = turn / totalLen

    // Path term: sagitta = s²κ/8 <= tol  ->  s <= sqrt(8·tol/κ)
    const pathLimit = Math.sqrt((8 * tol) / curvature)

    // Nib term: reach·(κs)²/8 <= tol  ->  s <= sqrt(8·tol/reach)/κ. `reach` is
    // how far this nib extends from its own centre — the long semi-axis for an
    // elongated one, which is what makes a small turn move the far edge a long
    // way. Taken from the active shaping profile so it follows whatever the tool
    // actually is, at this segment's own tilt.
    // #472: a bent nib's elongation counts toward its reach exactly as the
    // chisel's fixed aspect does — this is the term that keeps a turn from
    // scalloping, and leaving the brush pen's own elongation out of it would
    // sample the one tool whose nib length varies as though it never did.
    // #482: the expression itself lives with the footprint it bounds; see
    // maxNibReach for why it is taken at full bend rather than at this nib's
    // actual current one.
    const reach = maxNibReach(this._shaping, p1.pressure, tiltNormFrom(p1.tiltX, p1.tiltY), baseSize)
    const nibLimit = reach > 1e-6 ? Math.sqrt((8 * tol) / reach) / curvature : Infinity

    return Math.min(pathLimit, nibLimit)
  }

  private _makeDab(
    x: number, y: number, pressure: number, rawTiltX: number, rawTiltY: number,
    baseSize: number, pathAngle: number, ds: number,
  ): Dab {
    // #305: the *filtered* tilt is what gets stored on the Dab, not just what
    // feeds the shaping below. Everything downstream that reads Dab.tiltX/Y —
    // the shader's own grain direction (charcoal's default variant is
    // tilt-aligned "Streaky", so an unfiltered direction there would make the
    // texture shimmer while the outline sat still) and opacity baking — has to
    // agree with the geometry, or the mark and its texture disagree about
    // which way the stick is lying. A no-op for every profile that declares no
    // smoothing.
    const { tiltX, tiltY } = this._filterTilt(rawTiltX, rawTiltY, ds)
    // #482: the footprint itself is worked out in exactly one place now
    // (tipFootprint.ts) — this method's job is the two things that are *not*
    // geometry: running the input filters, and assembling the wire record.
    const fp = tipFootprint(this._shaping, {
      x, y, pressure, tiltX, tiltY, baseSize, pathAngle, ds,
      speed: this._speed, cameraAngle: this.cameraAngle,
    }, this._tip)
    // `pressure` is stored as the real, unmapped value for every tool (see
    // dabShaping.ts's own #245 comment on why a per-tool remap used to live
    // here and was reverted) — DAB_FRAG derives whatever deposit-gate floor
    // it needs straight from this true value.
    // opacity is geometric-neutral here; the engine bakes the final value
    // (preset × user opacity × speed) before rendering and recording. `t` is
    // likewise stamped by the engine (PencilEngine._paintStrokeDabs), which
    // is the only place that knows elapsed wall-clock time.
    return {
      x: fp.x, y: fp.y, pressure, tiltX, tiltY,
      size: fp.size, aspectRatio: fp.aspectRatio, angle: fp.angle, opacity: 1, t: 0,
    }
  }
}

// Ghost point mirrored before p1 (used when no real predecessor exists)
function mirrorBefore(p1: ControlPoint, p2: ControlPoint): ControlPoint {
  return { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y, pressure: p1.pressure, tiltX: p1.tiltX, tiltY: p1.tiltY }
}

function crScalar(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * ((2*b) + (-a+c)*t + (2*a-5*b+4*c-d)*t2 + (-a+3*b-3*c+d)*t3)
}

// Angle in [0, PI] between two vectors: 0 = same direction (no turn), PI =
// fully reversed (hairpin). Returns 0 (treated as "no turn", i.e. leave
// smoothing alone) instead of dividing by zero when either vector is
// ~zero-length, which is exactly what happens for the mirrored ghost point
// at the very start/end of a stroke (see the file-level comment above).
function turnAngle(v1x: number, v1y: number, v2x: number, v2y: number): number {
  const len1 = Math.hypot(v1x, v1y)
  const len2 = Math.hypot(v2x, v2y)
  if (len1 < MIN_TURN_VEC_LEN || len2 < MIN_TURN_VEC_LEN) return 0
  const cos = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1)
  return Math.acos(cos)
}

// Maps a direction-change angle to a corner-reduction factor in [0, 1]:
// 0 = leave the tangent alone (full smoothing), 1 = zero it out entirely
// (hard corner). Linear ramp between CORNER_ANGLE_START/_FULL — a first
// pass; see the constants' comment above for why these values were picked
// and that final calibration is deliberately deferred.
function cornerFactor(angle: number): number {
  return clamp((angle - CORNER_ANGLE_START) / (CORNER_ANGLE_FULL - CORNER_ANGLE_START), 0, 1)
}

// Knot interval between two consecutive control points, per CENTRIPETAL_ALPHA.
function knotDelta(a: ControlPoint, b: ControlPoint): number {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  return Math.max(MIN_KNOT_DELTA, dist ** CENTRIPETAL_ALPHA)
}

// Non-uniform (centripetal) Catmull-Rom tangents at p1 and p2, derived from
// the actual knot spacing t0..t3 rather than assuming t = 0,1,2,3. Standard
// formula (Yuksel et al. 2011):
//   m1 = (t2-t1) * [ (p1-p0)/(t1-t0) - (p2-p0)/(t2-t0) + (p2-p1)/(t2-t1) ]
//   m2 = (t2-t1) * [ (p2-p1)/(t2-t1) - (p3-p1)/(t3-t1) + (p3-p2)/(t3-t2) ]
// This is scale-invariant under uniform rescaling of the knot values, so
// when p0..p3 are evenly spaced (t_i = i * k for any k) it reduces exactly
// to the fixed Catmull-Rom tangents (p2-p0)/2 and (p3-p1)/2.
function centripetalTangents(p0: ControlPoint, p1: ControlPoint, p2: ControlPoint, p3: ControlPoint): { m1: { x: number; y: number }; m2: { x: number; y: number } } {
  const t1 = knotDelta(p0, p1)
  const t2 = t1 + knotDelta(p1, p2)
  const t3 = t2 + knotDelta(p2, p3)
  // t0 = 0
  const d10 = t1, d20 = t2, d21 = t2 - t1, d31 = t3 - t1, d32 = t3 - t2

  const m1 = {
    x: d21 * ((p1.x - p0.x) / d10 - (p2.x - p0.x) / d20 + (p2.x - p1.x) / d21),
    y: d21 * ((p1.y - p0.y) / d10 - (p2.y - p0.y) / d20 + (p2.y - p1.y) / d21),
  }
  const m2 = {
    x: d21 * ((p2.x - p1.x) / d21 - (p3.x - p1.x) / d31 + (p3.x - p2.x) / d32),
    y: d21 * ((p2.y - p1.y) / d21 - (p3.y - p1.y) / d31 + (p3.y - p2.y) / d32),
  }
  return { m1, m2 }
}

// Cubic Hermite basis, parameterized by endpoint positions p1/p2 and their
// tangents m1/m2 (parameterization-agnostic: works for both the plain fixed
// Catmull-Rom tangent and the centripetal one computed above).
function hermitePos(p1: ControlPoint, p2: ControlPoint, m1: { x: number; y: number }, m2: { x: number; y: number }, t: number): { x: number; y: number } {
  const t2 = t * t, t3 = t2 * t
  const h00 = 2*t3 - 3*t2 + 1
  const h10 = t3 - 2*t2 + t
  const h01 = -2*t3 + 3*t2
  const h11 = t3 - t2
  return {
    x: h00*p1.x + h10*m1.x + h01*p2.x + h11*m2.x,
    y: h00*p1.y + h10*m1.y + h01*p2.y + h11*m2.y,
  }
}

function hermiteTangent(p1: ControlPoint, p2: ControlPoint, m1: { x: number; y: number }, m2: { x: number; y: number }, t: number): { x: number; y: number } {
  const t2 = t * t
  const dh00 = 6*t2 - 6*t
  const dh10 = 3*t2 - 4*t + 1
  const dh01 = -6*t2 + 6*t
  const dh11 = 3*t2 - 2*t
  return {
    x: dh00*p1.x + dh10*m1.x + dh01*p2.x + dh11*m2.x,
    y: dh00*p1.y + dh10*m1.y + dh01*p2.y + dh11*m2.y,
  }
}
