export interface FingerPoint { x: number; y: number }

/** The noise floor for a pair of fingers resting on glass: below this much
 *  change there is no gesture, only tremor and digitizer rounding. Absolute
 *  rather than relative because tremor is absolute — a pixel of jitter is a
 *  pixel whether the fingers are 60 px or 600 px apart. */
export const PINCH_DISTANCE_FLOOR_PX = 6
export const PINCH_ANGLE_FLOOR = 2 * Math.PI / 180

/** How far past the interleaving artefact (see the class comment) a change has
 *  to reach. The artefact is bounded by exactly one finger-step, so any factor
 *  above 1 separates a pinch from a pan; 2 leaves room for a step that grows
 *  between one event and the next, as it does whenever a pan accelerates. */
export const PINCH_STEP_MARGIN = 2

/** Pure state machine behind #362's zoom/rotation readout: decides when a
 *  two-finger gesture has become a pinch/rotate, as opposed to a two-finger pan
 *  that happens to run through the same code path. Framework/DOM-free by design
 *  so it's directly unit-testable (see pinchTracker.test.ts) — useViewport's
 *  touch handlers are the thin real-pointer-event wiring around this, exactly
 *  as useTapToggle is around TapTracker.
 *
 *  Why a threshold at all: useViewport's two-finger branch serves pan, zoom and
 *  rotation at once, because that is how the gesture actually works — a pinch
 *  always drags a little and a two-finger drag always pinches a little. "Two
 *  fingers are down" therefore cannot mean "the user is zooming", and using it
 *  as if it did would flash a readout over every two-finger pan.
 *
 *  Why it watches the fingers and not the zoom useViewport derives from them:
 *  that zoom is recomputed per event from one finger's new position against the
 *  other's stored one, so it oscillates throughout a perfectly parallel pan.
 *  Measured at ±3% for an 8 px step at 240 px separation — more than a gentle
 *  pinch produces in total.
 *
 *  Why the threshold is measured rather than chosen: `pointermove` arrives for
 *  one finger at a time, so at any instant one of the two positions is up to one
 *  step stale. During a pan that skew is *bounded* by a single step — the
 *  fingers travel together, so the lag never compounds. During a pinch the
 *  fingers travel in opposite directions, so the same figure grows every event
 *  without bound. "Bounded by one step" versus "grows past it" is the real
 *  distinction, and it cannot be written as a constant: one step is 2 px in a
 *  slow pan and 12 px in a fast one, so any fixed value is either deaf to gentle
 *  pinches or fooled by quick pans. The tracker therefore watches how far the
 *  fingers move per event and requires the separation (or rotation) to exceed
 *  that by `PINCH_STEP_MARGIN` — the noise floor is taken from the gesture in
 *  progress instead of guessed in advance.
 *
 *  Compared against where the gesture began rather than the previous frame,
 *  because a deliberate slow pinch moves by far less than any threshold in a
 *  single frame — a per-frame comparison would never fire for the careful user
 *  and always fire for the fast one. */
export class PinchTracker {
  private origin: { distance: number; angle: number } | null = null
  private previous: readonly [FingerPoint, FingerPoint] | null = null
  /** Largest single-event travel by either finger so far this gesture — the
   *  measured size of the interleaving artefact described above. */
  private maxStep = 0
  private significant = false

  /** Whether the current gesture has been recognized as a pinch/rotate. */
  get isActive(): boolean {
    return this.significant
  }

  /** Feed both fingers' current positions on every frame of a two-finger
   *  gesture. **Order them consistently** — by pointer id, as useViewport does:
   *  the pair's `atan2` angle flips by π if the two swap places, and which
   *  finger a given pointermove belongs to alternates from event to event.
   *
   *  Returns true on the single frame the gesture crosses into significance, so
   *  the caller announces the start once rather than every frame. */
  move(a: FingerPoint, b: FingerPoint): boolean {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const distance = Math.hypot(dx, dy)
    // Two fingers reported at the same point carry no separation and no
    // meaningful angle. Nothing to measure, and taking an origin from it would
    // make every later frame look infinitely significant.
    if (distance === 0) return false

    if (this.previous) {
      const [pa, pb] = this.previous
      this.maxStep = Math.max(
        this.maxStep,
        Math.hypot(a.x - pa.x, a.y - pa.y),
        Math.hypot(b.x - pb.x, b.y - pb.y),
      )
    }
    this.previous = [a, b]

    const angle = Math.atan2(dy, dx)
    this.origin ??= { distance, angle }
    if (this.significant) return false

    const artefact = PINCH_STEP_MARGIN * this.maxStep
    const spread = Math.abs(distance - this.origin.distance)
      > Math.max(PINCH_DISTANCE_FLOOR_PX, artefact)
    // One finger lagging by `maxStep` also swings the pair's angle, by up to
    // that step over the current separation — the small-angle form of the same
    // artefact, in radians. Wide fingers are correspondingly less susceptible,
    // which is why the separation belongs in this threshold.
    const turned = Math.abs(signedAngleDelta(this.origin.angle, angle))
      > Math.max(PINCH_ANGLE_FLOOR, artefact / distance)
    if (!spread && !turned) return false

    this.significant = true
    return true
  }

  /** Fingers dropped below two, or the pointer stream was reset as no longer
   *  trustworthy. Always forgets the gesture — a second pinch inside the same
   *  touch sequence measures itself afresh instead of against where the first
   *  one started, which otherwise leaves it permanently "already significant".
   *
   *  Returns true if a recognized gesture was in flight, i.e. the caller has an
   *  end to announce. False when nothing was announced in the first place, so
   *  ending a plain two-finger pan is silent. */
  end(): boolean {
    this.origin = null
    this.previous = null
    this.maxStep = 0
    if (!this.significant) return false
    this.significant = false
    return true
  }
}

/** Shortest signed rotation from `from` to `to`, in (-π, π]. Both come from
 *  `atan2`, so a pair rotating through the ±π seam would otherwise read as most
 *  of a full turn the other way. Only the threshold crossing is ever tested,
 *  and that happens within a few degrees of the start, so the shortest-path
 *  reading is never the ambiguous one. */
function signedAngleDelta(from: number, to: number): number {
  const TWO_PI = Math.PI * 2
  return ((to - from + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
}
