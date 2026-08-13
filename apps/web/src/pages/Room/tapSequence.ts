import { DOUBLE_TAP_MAX_DELAY_MS, DOUBLE_TAP_MAX_DIST_PX } from '../../lib/tapThreshold'

export interface TapSequenceResult {
  /** How long the current run is, counting the tap just fed in. Always ≥ 1. */
  count: number
  /** True when this tap completed a full run of `required` taps. The run is
   *  cleared on completion, so the next tap starts counting from 1 again —
   *  three taps in a row are one double tap plus the start of another, never
   *  two toggles. */
  completed: boolean
}

/** Counts consecutive taps that belong to the same gesture (#189), on top of
 *  TapTracker's per-touch "was that one touch a tap" answer.
 *
 *  Exists because a single tap turned out to be too cheap a gesture to toggle
 *  minimal UI with: the drawing hand rests on the tablet, a knuckle or the
 *  heel of the palm lands stationary for a moment, and the whole chrome
 *  vanishes mid-lesson. A double tap costs the same effort to make on purpose
 *  and is very hard to make by accident, so it is the default — `required` is
 *  1 for anyone who prefers the old feel (`minimalUiTapMode`).
 *
 *  Framework/DOM/clock-free like TapTracker next door (time is a parameter,
 *  not something this reads), so the timing rules are directly unit-testable —
 *  useTapToggle is the thin real-pointer-event wrapper around both. */
export class TapSequence {
  private count = 0
  private last: { x: number; y: number; time: number } | null = null
  private readonly required: number

  /** @param required how many taps make the gesture: 1 = every tap fires. */
  constructor(required: number) {
    this.required = required
  }

  /** Feeds in one tap that TapTracker already accepted. `time` is any
   *  monotonic millisecond clock (the pointer event's own `timeStamp`). */
  tap(x: number, y: number, time: number): TapSequenceResult {
    const continues =
      this.last !== null &&
      time - this.last.time <= DOUBLE_TAP_MAX_DELAY_MS &&
      Math.hypot(x - this.last.x, y - this.last.y) <= DOUBLE_TAP_MAX_DIST_PX

    this.count = continues ? this.count + 1 : 1
    this.last = { x, y, time }

    if (this.count < this.required) return { count: this.count, completed: false }
    const count = this.count
    this.reset()
    return { count, completed: true }
  }

  /** Breaks the run. Called for anything that says the person moved on to
   *  something else between the two taps — a drag, a second finger, a stylus
   *  coming down to draw, the app losing the pointer stream entirely. Without
   *  it, a stray tap could sit around waiting to pair with a deliberate one
   *  minutes later; the time window makes that unlikely, this makes it
   *  impossible. */
  reset(): void {
    this.count = 0
    this.last = null
  }
}
