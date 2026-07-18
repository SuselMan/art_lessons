import { TAP_MOVE_THRESHOLD_PX } from '../../lib/tapThreshold'

/** Pure state machine behind useTapToggle (#99): recognizes a short,
 *  stationary single-finger touch as a tap, as opposed to a drag or a
 *  multi-touch pinch/pan gesture. Framework/DOM-free by design so it's
 *  directly unit-testable (see tapTracker.test.ts) — useTapToggle.ts is the
 *  thin real-pointer-event wrapper around this. */
export class TapTracker {
  private active = new Map<number, { x: number; y: number }>()
  private candidateId: number | null = null
  private candidateStart = { x: 0, y: 0 }

  down(id: number, x: number, y: number): void {
    this.active.set(id, { x, y })
    this.candidateId = this.active.size === 1 ? id : null
    this.candidateStart = { x, y }
  }

  move(id: number, x: number, y: number): void {
    if (!this.active.has(id)) return
    this.active.set(id, { x, y })
    if (this.candidateId === id) {
      const dist = Math.hypot(x - this.candidateStart.x, y - this.candidateStart.y)
      if (dist > TAP_MOVE_THRESHOLD_PX) this.candidateId = null
    }
  }

  /** Returns true iff this pointer's up completes a valid tap: it was the
   *  only finger down for the whole gesture and never moved past the
   *  threshold. Always clears the candidate, tap or not. */
  up(id: number): boolean {
    const isTap = this.active.size === 1 && this.candidateId === id
    this.active.delete(id)
    this.candidateId = null
    return isTap
  }

  cancel(id: number): void {
    this.active.delete(id)
    this.candidateId = null
  }

  /** Forced full reset, independent of any specific pointer id — for when
   *  the caller can no longer trust the pointer event stream to reliably
   *  deliver an up/cancel for whatever's currently down (see useTapToggle's
   *  visibilitychange/blur handler). Without this, a single missed up/
   *  cancel leaves `active` with a stale entry forever: `up()`'s tap check
   *  requires `active.size === 1`, so a leaked extra entry permanently
   *  disqualifies every future single-finger tap, with nothing short of a
   *  reload able to recover — and per #185-adjacent reports, not even that
   *  reliably did, hence a defensive reset here rather than relying solely
   *  on every up/cancel arriving. */
  reset(): void {
    this.active.clear()
    this.candidateId = null
  }
}
