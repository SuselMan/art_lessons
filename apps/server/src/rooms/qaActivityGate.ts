/** Process-local QA activity barrier, disabled until explicitly installed.
 * Every HTTP, socket and background task that can touch rooms must hold an
 * activity lease for its *entire* lifetime. A collector may start only when
 * none exist; while it runs, new work is rejected for a later retry.
 *
 * This barrier alone cannot guard another process or a direct DB client.
 * Do not enable a collector without a separately verified exclusive DB lease.
 */
export type ReleaseQaActivity = () => void

export class QaActivityGate {
  private active = 0
  private exclusive = false

  tryEnter(): ReleaseQaActivity | undefined {
    if (this.exclusive) return undefined
    this.active++
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
    }
  }

  /** Synchronous check-and-close: no await exists between check and lock. */
  tryStartCollection(): ReleaseQaActivity | undefined {
    if (this.exclusive || this.active !== 0) return undefined
    this.exclusive = true
    let released = false
    return () => {
      if (released) return
      released = true
      this.exclusive = false
    }
  }
}

/** Retain a lease through the promise returned by a handler or background job.
 * Detached work must acquire its own lease before its parent lease is released.
 * A false admission is the caller's signal to retry; work has not started. */
export function tryRunQaActivity<T>(
  gate: QaActivityGate, run: () => T | Promise<T>,
): { admitted: false } | { admitted: true; result: Promise<T> } {
  const release = gate.tryEnter()
  if (!release) return { admitted: false }
  try {
    const result = Promise.resolve(run()).finally(release)
    return { admitted: true, result }
  } catch (error) {
    release()
    return { admitted: true, result: Promise.reject(error) }
  }
}
