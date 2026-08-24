import type { DabShapingProfile, TipBendProfile } from './dabShaping'
import { tiltMagnitudeDeg } from './tiltMath'

// #482, ADR 012 — the one place the contact patch of a drawing tool is worked
// out. Before this it was worked out in three:
//
//  - DabSystem._makeDab, the real one;
//  - PencilEngine.previewDabShape, a hand-maintained mirror of it whose own
//    doc comment said it "mirrors DabSystem._makeDab's own geometry formula
//    exactly" — a claim nothing enforced, and which had already drifted (it
//    knew nothing about tipBend);
//  - PencilEngine._paintDwellDab, which assembled a Dab by hand and hardcoded
//    `angle: 0` for every tool but the marker.
//
// Three copies of one formula is not a tidiness complaint. The cursor is how a
// tool's settings are *seen* before a mark exists, and the dwell tick is a real
// dab that goes into the operation log — so a copy that drifts does not fail,
// it quietly draws something else.
//
// What is deliberately NOT here (ADR 012 §7): dab spacing and curvature, which
// consume a footprint but are a property of the path rather than of the tip;
// opacity and deposit, which branch per tool along a different axis entirely;
// and `preset.sizeMultiplier`, which the renderer still applies on top (see
// §7's note on why it cannot be baked in without moving every stroke already
// recorded).

/**
 * The stroke state a flexible nib carries between dabs (ADR 012 §4).
 *
 * Deliberately a plain record rather than fields on DabSystem: the same state
 * has to be forked for #92's prediction preview, saved/restored around a
 * speculative peek, and left untouched by the dwell tick — all of which are
 * one-line operations on an object and were three parallel lists of fields
 * before.
 *
 * The contract that makes this replay-safe: whatever lives here must be
 * reconstructible by replaying this stroke's own dabs in order. `tipDir` and
 * `trailPx` are, because both are one-pole filters driven by the dabs
 * themselves.
 */
export interface TipState {
  /** Arc length travelled since the stroke began, world px — what the head
   *  taper ramps against (ADR 012 §8). Accumulated here rather than in
   *  PencilEngine because every consumer of the tip already carries this
   *  record: the #92 prediction fork, the speculative peek's save/restore and
   *  the per-stroke reset each copy one object instead of a growing list of
   *  parallel fields. */
  arcFromStart: number
  /** The eased speed-contact multiplier (SpeedContactProfile), 1 = the nib
   *  fully in contact. Seeded at 1 rather than 0: the first batch of a stroke
   *  is one sample old and has no meaningful speed yet, so starting anywhere
   *  else would narrow the head of every stroke on top of the taper that is
   *  there on purpose. */
  contactFactor: number
  /** Where the nib is currently lying, as a vector whose *direction* is the
   *  nib's own and whose *length* is how far the drag has bent it (0 = still
   *  straight, 1 = fully trailed). One quantity, two meanings, on purpose —
   *  see tipFootprint's own use of it. */
  tipDirX: number
  tipDirY: number
  /** How far behind the pointer the contact patch is currently sitting. */
  trailPx: number
  /** The point the pen drags behind it, world px — what the stroke direction is
   *  measured against (see strokeDirection). `hasLead` is false only before the
   *  first sample of a stroke, since the seed is a position and TipState is
   *  built without one. */
  leadX: number
  leadY: number
  hasLead: boolean
  /** The direction the nib is currently anchored to for a `stroke`-anchored
   *  tip, world radians — held rather than recomputed whenever the pen has not
   *  actually gone anywhere. 0 until the stroke commits to a direction, which
   *  makes a tap land at the tool's own angle. */
  strokeAngle: number
}

export function createTipState(): TipState {
  return {
    arcFromStart: 0, contactFactor: 1, tipDirX: 0, tipDirY: 0, trailPx: 0,
    leadX: 0, leadY: 0, hasLead: false, strokeAngle: 0,
  }
}

export function copyTipState(src: TipState): TipState {
  return { ...src }
}

export function assignTipState(dst: TipState, src: TipState): void {
  dst.arcFromStart = src.arcFromStart
  dst.contactFactor = src.contactFactor
  dst.tipDirX = src.tipDirX
  dst.tipDirY = src.tipDirY
  dst.trailPx = src.trailPx
  dst.leadX = src.leadX
  dst.leadY = src.leadY
  dst.hasLead = src.hasLead
  dst.strokeAngle = src.strokeAngle
}

/** Everything the footprint is allowed to depend on. Pressure and tilt arrive
 *  already filtered — the low-passes are the caller's, because they are stroke
 *  state of a different kind (they smooth the *input*, not the tip) and the
 *  hover cursor deliberately runs without them. */
export interface TipInput {
  /** Position on the spline, world px. The returned footprint may sit behind
   *  it — see TipFootprint.x. */
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  /** Nominal brush size, world px. */
  baseSize: number
  /** The spline's tangent at this dab, world radians. */
  pathAngle: number
  /** Arc length since the previous dab, world px. 0 for a resting tip or a
   *  hover, which is exactly right: a nib that has not travelled does not
   *  bend further. */
  ds: number
  /** Pointer speed, canvas px/ms. Only a trailing nib reads it. */
  speed: number
  /** The viewport's rotation, radians — see ADR 012 §3 and
   *  dabShaping.ts's tiltOrPathAngle. */
  cameraAngle: number
}

/** A pose, not a shape (ADR 012 §1): a nib that is being dragged also sits
 *  *behind* the point on the path, so position is part of the answer. */
export interface TipFootprint {
  /** Where the contact patch actually is — `input.x/y` for every rigid tip,
   *  displaced backwards along the nib for a trailing one. */
  x: number
  y: number
  /** Short diameter, world px, before `preset.sizeMultiplier`. Named `size`
   *  rather than ADR 012 §1's `halfWidth` only because `Dab.size` already means
   *  this and renaming the wire field is not this step's business. */
  size: number
  aspectRatio: number
  /** World radians. */
  angle: number
  /** The true lean from vertical, in degrees — returned rather than recomputed
   *  by callers, three of which need it for something other than geometry
   *  (grain direction, deposit). */
  tiltMag: number
}

// #472: below this the nib is bent so little that its direction carries no
// information — at touchdown, or as a hairpin passes through straight. The
// footprint is round there anyway, so the angle falls back to the ordinary rule
// and atan2 is never asked about a near-zero vector.
const MIN_TIP_DIR_LEN = 0.05

// #482: how far the pen drags its lead point behind it, as a multiple of the
// nib's own long axis, and how far behind it must fall before the stroke counts
// as going somewhere.
//
// Scaled by the nib rather than fixed in px, and that is the substantive choice
// here. The first attempt at this used a hand-tremor constant, which rejected
// tremor and nothing else: rocking the stylus in a 3px circle is not tremor, it
// is a real stroke that really does go round in a circle, and a nib anchored to
// the stroke followed it round — 313deg of nib angle over a 4px wobble.
//
// A broad nib cannot do that, and the reason is geometric rather than a matter
// of taste: a nib physically cannot trace an arc much tighter than its own
// length without pivoting on the spot. So the question "is this stroke going
// anywhere" is asked in units of the nib that is drawing it — 20px of travel
// means something quite different to a 40px chisel than to a 3px liner.
const LEAD_LAG_NIBS = 0.75
const MIN_LEAD_NIBS = 0.45
// Floors, world px, for a nib small enough that its own length stops being the
// binding constraint — below roughly this the hand's tremor is, and a 2px liner
// should no more chase a shake than a chisel should.
const LEAD_LAG_FLOOR_PX = 8
const MIN_LEAD_FLOOR_PX = 2.5

/**
 * Drags the nib one dab further and reports how bent it now is, in [0, 1] — 0
 * straight, 1 fully trailed. Where it points is left in `state`, since a
 * straight nib has no direction worth asking for.
 *
 * `ds` is arc length since the previous dab and `nibWidth` the nib's current
 * width in canvas px — together they set the one-pole weight, so the nib bends
 * and swings over a fixed *distance* that scales with how wide it is, rather
 * than over a fixed number of dabs. Dab spacing is not constant along a stroke
 * (curvature tightens it on turns, which is exactly where this is visible), so
 * a per-dab weight would make the tool's plasticity a function of its own
 * sampling.
 *
 * ds = 0 needs no case of its own: the weight is 0, nothing moves, and a nib
 * that has not travelled stays exactly as bent as it was. That is what lets the
 * dwell tick and the hover cursor share this path unchanged.
 */
function bendTip(
  bend: TipBendProfile, state: TipState, pathAngle: number, ds: number, nibWidth: number, speed: number,
): number {
  const lagPx = Math.max(bend.minLagPx, bend.lagWidths * nibWidth)
  const k = 1 - Math.exp(-ds / lagPx)
  state.tipDirX += (Math.cos(pathAngle) - state.tipDirX) * k
  state.tipDirY += (Math.sin(pathAngle) - state.tipDirY) * k
  const bendness = Math.min(1, Math.hypot(state.tipDirX, state.tipDirY))
  // How far behind the pen the ink should be landing by now, eased in over the
  // same distance and with the same weight as the bend that causes it.
  const trail = bend.trailWidths(speed) * nibWidth * bendness
  state.trailPx += (trail - state.trailPx) * k
  return bendness
}

/**
 * Which way this stroke is actually going, world radians.
 *
 * Not `input.pathAngle`, which is the spline's tangent at this dab and is only
 * as steady as the samples under it. Held still, a stylus still reports motion
 * — the hand shakes, and the tangent of that shake sweeps the full circle. Fed
 * straight to a 5:1 chisel anchored to the stroke, that stamps the same nib at
 * every angle in place: the rosette Ilya reported on 24.08. (Pre-existing —
 * main's own offsetAngleShaping was `pathAngle + offset` with nothing in
 * between — but this is the layer that owes an answer.)
 *
 * Smoothing the tangent does not fix it, and the reason is worth stating
 * because it is the same trap the rest of this file's filters avoid by being
 * distance-keyed: tremor has plenty of arc length, it simply never arrives
 * anywhere. A filter keyed on distance travelled sees an honest `ds` and
 * faithfully tracks the noise.
 *
 * What separates the two is displacement, not path — so the direction is taken
 * from a point dragged behind the pen instead. Tremor leaves it sitting in the
 * middle of the shake, a hand's breadth from nothing; real travel pulls it out
 * to a steady LEAD_LAG_PX behind. Below MIN_LEAD_PX the last committed
 * direction stands, which is also what makes a dwelling tip (ds = 0) hold the
 * angle the stroke left it at rather than snapping to a placeholder.
 */
function strokeDirection(
  state: TipState, x: number, y: number, ds: number, nibLengthPx: number,
): number {
  if (!state.hasLead) {
    state.leadX = x
    state.leadY = y
    state.hasLead = true
    return state.strokeAngle
  }
  const lag = Math.max(LEAD_LAG_FLOOR_PX, LEAD_LAG_NIBS * nibLengthPx)
  const k = 1 - Math.exp(-ds / lag)
  state.leadX += (x - state.leadX) * k
  state.leadY += (y - state.leadY) * k
  const dx = x - state.leadX
  const dy = y - state.leadY
  const minLead = Math.max(MIN_LEAD_FLOOR_PX, MIN_LEAD_NIBS * nibLengthPx)
  if (Math.hypot(dx, dy) >= minLead) state.strokeAngle = Math.atan2(dy, dx)
  return state.strokeAngle
}

/**
 * The footprint this tool leaves for this sample.
 *
 * `state` is null for a caller with no stroke behind it — the hover cursor, and
 * any tool whose profile declares no `tipBend`. A flexible nib asked for its
 * footprint with no state returns its *rest* pose: round, unbent, undisplaced.
 * That is not a degraded answer, it is the right one — a nib that is not being
 * dragged is not bent, which is why a hover preview and the first dab of a real
 * stroke agree.
 */
export function tipFootprint(
  shaping: DabShapingProfile, input: TipInput, state: TipState | null,
): TipFootprint {
  const { tiltX, tiltY, pressure, pathAngle, cameraAngle } = input
  // #388: the true angle from vertical, not hypot(tiltX, tiltY) — see
  // tiltMath.ts.
  const tiltMag  = tiltMagnitudeDeg(tiltX, tiltY)
  const tiltNorm = tiltMag / 90
  let size       = input.baseSize * shaping.size(pressure, tiltNorm)

  // #482, ADR 012 §8: both of these used to run *after* the footprint was
  // worked out, as post-passes over `dab.size` in PencilEngine. That was not
  // only untidy — a flexible nib's lag distance and trail are proportional to
  // its current width, so they were being computed from a width the head of the
  // stroke never actually had.
  //
  // A caller with no stroke behind it (the hover cursor) gets neither, which is
  // right: it is not at the start of anything and has no speed.
  if (state) {
    state.arcFromStart += input.ds
    const contact = shaping.speedContact
    if (contact) {
      const k = 1 - Math.exp(-input.ds / contact.smoothingPx)
      state.contactFactor += (contact.factor(input.speed) - state.contactFactor) * k
      size *= state.contactFactor
    }
    const head = shaping.headTaper
    if (head && state.arcFromStart < head.lengthPx) {
      size *= head.startScale + (1 - head.startScale) * (state.arcFromStart / head.lengthPx)
    }
  }

  // #472: a flexible nib's footprint is the pose's own ovality *times* how far
  // the drag has splayed and trailed it, pointing where the nib points rather
  // than where the stylus leans.
  //
  // Both the amount and the direction come from `bendness`, and that they are
  // one quantity is the point: pressure says how elongated a *fully* trailed
  // nib would be, and the drag says how much of that has actually happened yet.
  // A nib pressed straight down and nudged has a direction of travel but no
  // bend, so it stays round — which is what stopped this stamping a full
  // ellipse and spinning it in place.
  const bend = shaping.tipBend
  let aspectRatio = shaping.aspect(tiltNorm)
  let x = input.x
  let y = input.y
  let angle: number

  // The direction the *nib* is anchored to, as opposed to the spline's tangent
  // at this dab. Measured in units of the nib's own long axis — `size` is the
  // short one, so this is what the toolbar number means for a chisel and plain
  // diameter for anything round. Taken before the bend below stretches it: how
  // far a stroke has to go to count as going somewhere is a property of the
  // tool, not of how far the drag has splayed it this instant.
  //
  // A caller with no stroke behind it (the hover cursor) has no travel to
  // measure and takes the tangent as given — which for a hover is 0, i.e. the
  // tool's own angle, and that is what should be previewed.
  //
  // bendTip below deliberately keeps reading the *raw* tangent: its own weight
  // is `1 - exp(-ds / lagPx)` over a lag proportional to the nib's width, so it
  // is already a filter, and feeding it a pre-filtered direction would quietly
  // lengthen every flexible nib's tuned lag by cascading two of them.
  const nibPathAngle = state
    ? strokeDirection(state, input.x, input.y, input.ds, size * aspectRatio)
    : pathAngle

  if (bend && state) {
    const bendness = bendTip(bend, state, pathAngle, input.ds, size, input.speed)
    aspectRatio *= 1 + (bend.elongation(pressure) - 1) * bendness
    if (bendness >= MIN_TIP_DIR_LEN) {
      angle = Math.atan2(state.tipDirY, state.tipDirX)
      // The ink lands where the pen *came from*: a bent nib's contact patch
      // sits behind the shaft, and the faster it is dragged the further behind.
      // Along the nib's own smoothed direction rather than the raw tangent — an
      // offset that swung with every sample's direction would put a kink in the
      // path at every corner, which is the one thing this must not do, since it
      // is displacing geometry rather than shading it.
      x -= (state.tipDirX / bendness) * state.trailPx
      y -= (state.tipDirY / bendness) * state.trailPx
    } else {
      angle = shaping.angle(tiltMag, tiltX, tiltY, nibPathAngle, cameraAngle)
    }
  } else {
    angle = shaping.angle(tiltMag, tiltX, tiltY, nibPathAngle, cameraAngle)
  }

  return { x, y, size, aspectRatio, angle, tiltMag }
}

/**
 * How far this nib can extend from its own centre for this sample, world px —
 * the long semi-axis for an elongated one, which is what makes a small turn
 * move the far edge a long way.
 *
 * A different question from `tipFootprint`, and deliberately kept as one:
 * spacing and curvature are properties of the path, not of the tip (ADR 012
 * §7), and this one is answered at **full bend** rather than at the nib's
 * actual current bend. That over-estimates the reach of a part-way trailed nib,
 * which errs toward sampling a little denser than strictly needed — the safe
 * direction — and, more importantly, keeps it a pure function of the sample.
 * Letting sampling density decide itself from filter state that the sampling
 * then feeds back into is a loop worth not building.
 *
 * It lives here anyway, next to the footprint it is an upper bound on, because
 * it is built out of the same three profile calls: a copy of that expression in
 * DabSystem is exactly the kind of drift #482 exists to end.
 */
export function maxNibReach(
  shaping: DabShapingProfile, pressure: number, tiltNorm: number, baseSize: number,
): number {
  const elongation = shaping.tipBend ? shaping.tipBend.elongation(pressure) : 1
  return baseSize * 0.5 * shaping.size(pressure, tiltNorm)
    * Math.max(shaping.aspect(tiltNorm) * elongation, 1)
}
