/** Durable QA retention clock. Does not delete rooms and is not enabled by itself.
 * A caller MUST hold the collector's activity gate around every call and hold
 * a verified exclusive QA database lease before starting this tracker.
 */
export interface QaRoomActivityStore {
  recoverInterrupted(): Promise<void>
  opened(lessonId: string): Promise<void>
  closed(lessonId: string): Promise<void>
  touched(lessonId: string): Promise<void>
}

export class QaRoomActivity {
  private ready = false
  private starting = false
  private failed = false
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly store: QaRoomActivityStore) {}

  async start(): Promise<void> {
    if (this.ready || this.starting || this.failed) throw new Error('QA activity tracker cannot be restarted')
    this.starting = true
    try {
      // Recovery must finish before accepting joins. Closed lessons retain
      // their old timestamps, even after repeated server restarts.
      await this.store.recoverInterrupted()
      this.ready = true
    } catch (error) {
      this.failed = true
      throw error
    } finally {
      this.starting = false
    }
  }

  private enqueue(run: () => Promise<void>): Promise<void> {
    if (!this.ready || this.failed) return Promise.reject(new Error('QA activity tracking unavailable'))
    const operation = this.tail.then(async () => {
      if (this.failed) throw new Error('QA activity tracking unavailable')
      await run()
    })
    this.tail = operation.catch(() => { this.failed = true })
    return operation
  }

  /** Must complete BEFORE admitting the first participant. */
  opened(lessonId: string): Promise<void> { return this.enqueue(() => this.store.opened(lessonId)) }
  /** Call only after the final participant leaves, under the same activity gate. */
  closed(lessonId: string): Promise<void> { return this.enqueue(() => this.store.closed(lessonId)) }
  /** Must complete before acknowledging HTTP activity. */
  touched(lessonId: string): Promise<void> { return this.enqueue(() => this.store.touched(lessonId)) }

  /** This alone does not provide exclusion; the caller MUST also hold the gate. */
  async readyForCollection(): Promise<boolean> {
    for (;;) {
      const tail = this.tail
      await tail
      if (tail === this.tail) return this.ready && !this.failed
    }
  }
}
