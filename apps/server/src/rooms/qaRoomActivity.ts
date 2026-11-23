/** QA-only retention clock. This module never deletes rooms.
 * A future collector must fail closed unless `readyForCollection()` succeeds,
 * then coordinate all HTTP/socket access and recheck room presence atomically.
 */
export interface QaRoomActivityStore {
  /** Reset *every* existing lesson's clock on every start, including after a crash. */
  resetAll(): Promise<void>
  touch(lessonId: string): Promise<void>
}

export class QaRoomActivity {
  private started = false
  private failed = false
  private pending: Promise<void> = Promise.resolve()
  constructor(private readonly store: QaRoomActivityStore) {}

  async start(): Promise<void> {
    try {
      await this.store.resetAll()
      this.started = true
    } catch (error) {
      this.failed = true
      throw error
    }
  }

  touch(lessonId: string): void {
    if (!this.started || this.failed) return
    // Serialize the clock writes so a slow old departure cannot overtake a
    // newer join. SQL also uses GREATEST as protection across connections.
    this.pending = this.pending.then(() => this.store.touch(lessonId)).catch(error => {
      this.failed = true
      console.error('QA room activity write failed; retention must stay disabled', error)
    })
  }

  async readyForCollection(): Promise<boolean> {
    // A touch can arrive while the previous promise is settling. Drain the
    // newest promise too; the caller still needs an exclusive activity gate.
    for (;;) {
      const pending = this.pending
      await pending
      if (pending === this.pending) return this.started && !this.failed
    }
  }
}
