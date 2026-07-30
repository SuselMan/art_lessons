/** How far a two-finger gesture has to move zoom or angle before it counts as
 *  a pinch/rotate rather than a two-finger pan. Both are well under what anyone
 *  can hold still — two fingers dragging in parallel wobble by a fraction of a
 *  percent — and both are below the point where a rounded readout would show a
 *  changed number, so nothing ever appears announcing "100% · 0°". */
export const PINCH_ZOOM_EPSILON = 0.01
export const PINCH_ANGLE_EPSILON = 1 * Math.PI / 180

/** Pure state machine behind #362's zoom/rotation readout: decides when a
 *  two-finger gesture has become a pinch/rotate, as opposed to a two-finger pan
 *  that happens to run through the same code path. Framework/DOM-free by design
 *  so it's directly unit-testable (see pinchTracker.test.ts) — useViewport's
 *  touch handlers are the thin real-pointer-event wiring around this, exactly
 *  as useTapToggle is around TapTracker.
 *
 *  Why a threshold at all: `useViewport`'s two-finger branch serves pan, zoom
 *  and rotation at once, because that is how the gesture actually works — a
 *  pinch always drags a little and a two-finger drag always pinches a little.
 *  "Two fingers are down" therefore cannot mean "the user is zooming", and
 *  using it as if it did would flash a zoom/rotation readout over every
 *  two-finger pan.
 *
 *  Why against the gesture's own origin rather than the previous frame: a
 *  deliberate slow pinch moves by far less than the threshold on any single
 *  frame, so a per-frame comparison would never fire for the careful user and
 *  always fire for the fast one. Measuring cumulative movement from where the
 *  gesture started is scale-free in that sense. */
export class PinchTracker {
  private origin: { zoom: number; angle: number } | null = null
  private significant = false

  /** Whether the current gesture has been recognized as a pinch/rotate. */
  get isActive(): boolean {
    return this.significant
  }

  /** Feed every frame of a two-finger gesture: where zoom/angle stood before
   *  this frame, and where they are being moved to. Pass the *clamped* target
   *  values — a pinch held against the 0.04/20 zoom limit is no longer moving
   *  anything, and reporting the unclamped intent would keep claiming it is.
   *
   *  Returns true on the single frame the gesture crosses into significance, so
   *  the caller announces the start once rather than every frame. */
  move(from: { zoom: number; angle: number }, toZoom: number, toAngle: number): boolean {
    this.origin ??= { zoom: from.zoom, angle: from.angle }
    if (this.significant) return false

    const { zoom, angle } = this.origin
    // Ratio for zoom, difference for angle: zoom is multiplicative (a pinch
    // scales it), so a fixed absolute epsilon would be nearly impossible to
    // cross at 0.04 and instant at 20.
    const zoomed = Math.abs(toZoom / zoom - 1) > PINCH_ZOOM_EPSILON
    const rotated = Math.abs(toAngle - angle) > PINCH_ANGLE_EPSILON
    if (!zoomed && !rotated) return false

    this.significant = true
    return true
  }

  /** Fingers dropped below two, or the pointer stream was reset as no longer
   *  trustworthy. Always forgets the origin — a second pinch inside the same
   *  touch sequence measures itself afresh instead of against where the first
   *  one started, which otherwise leaves it permanently "already significant".
   *
   *  Returns true if a recognized gesture was in flight, i.e. the caller has an
   *  end to announce. False when nothing was announced in the first place, so
   *  ending a plain two-finger pan is silent. */
  end(): boolean {
    this.origin = null
    if (!this.significant) return false
    this.significant = false
    return true
  }
}
