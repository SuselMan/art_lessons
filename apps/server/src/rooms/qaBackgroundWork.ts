import { QaActivityGate } from './qaActivityGate.js'

/** QA-only detached work tracker. Call `start` synchronously BEFORE its parent
 * handler returns, so collection cannot slip between parent and child. The
 * rejected admission must be handled by the producer; it never starts work.
 * Until every producer is instrumented this tracker cannot make collection safe. */
export class QaBackgroundWork {
  private failed = false
  private pending = new Set<Promise<unknown>>()

  constructor(private readonly gate: QaActivityGate) {}

  start<T>(run: () => Promise<T>): Promise<T> {
    const release = this.gate.tryEnter()
    if (!release) {
      this.failed = true
      return Promise.reject(new Error('QA collection is in progress'))
    }
    let operation: Promise<T>
    try { operation = Promise.resolve(run()) }
    catch (error) { operation = Promise.reject(error) }
    const tracked = operation.catch(error => { this.failed = true; throw error }).finally(() => {
      release()
      this.pending.delete(tracked)
    })
    this.pending.add(tracked)
    return tracked
  }

  noteFailure(): void { this.failed = true }

  async readyForCollection(): Promise<boolean> {
    // Caller must hold the exclusive gate, so no producer can add new work.
    await Promise.allSettled([...this.pending])
    return !this.failed && this.pending.size === 0
  }
}
