import { CLICK_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'

/** Pure state machine behind the click-past-the-gizmo gesture (#405/#408):
 *  recognizes a press-and-release that stayed put as a click, and a press that
 *  wandered as a drag. Framework/DOM-free by design so it is directly
 *  unit-testable (see clickTracker.test.ts) — Room's own effect is the thin
 *  real-pointer-event wrapper around this, and it is also what decides which
 *  presses are offered here at all (not the hand tool's, not the gizmo's own,
 *  primary button only).
 *
 *  Sibling of TapTracker rather than a mode of it, because the two disagree on
 *  the two things that matter (#408):
 *
 *  - **How many pointers may be down.** A tap that hides the chrome must be
 *    the only finger on the glass, or a pinch would toggle it. A click that
 *    ends a transform has no such rival: it is made with a stylus on a tablet,
 *    where a palm or a steadying hand is on the glass most of the time, and
 *    every pointer down there is at best an unrelated touch and at worst the
 *    palm of the very hand making the click. So each pointer is judged alone,
 *    and whichever one lifts still is the click.
 *  - **How far it may wander.** See CLICK_MOVE_THRESHOLD_PX. */
export class ClickTracker {
  private candidates = new Map<number, { x: number; y: number }>()

  down(id: number, x: number, y: number): void {
    this.candidates.set(id, { x, y })
  }

  move(id: number, x: number, y: number): void {
    const start = this.candidates.get(id)
    if (!start) return
    if (Math.hypot(x - start.x, y - start.y) > CLICK_MOVE_THRESHOLD_PX) this.candidates.delete(id)
  }

  /** Returns true iff this pointer's up completes a click: its down was
   *  offered here, and it never moved past the threshold since. */
  up(id: number): boolean {
    return this.candidates.delete(id)
  }

  cancel(id: number): void {
    this.candidates.delete(id)
  }
}
