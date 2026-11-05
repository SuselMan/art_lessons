/** Scheduling notification only. Readiness/ownership must be rechecked by the
 * original preparation after waking; this cell never carries a prepared result. */
export interface CanonicalPreparationProgress {
  readonly promise: Promise<void>
  settled: boolean
  references: number
  resolve(): void
}
export class CanonicalWorkspaceBusyError extends Error {
  constructor() { super('Canonical workspace busy; finish and confirm the current gesture before changing brush'); this.name = 'CanonicalWorkspaceBusyError' }
}
export function createCanonicalPreparationProgress(): CanonicalPreparationProgress {
  let wake!: () => void
  const promise = new Promise<void>(resolve => wake = resolve)
  const cell: CanonicalPreparationProgress = { promise, settled: false, references: 0, resolve() { if (!cell.settled) { cell.settled = true; wake() } } }
  return cell
}
/** Promise reactions retain no engine or owner after a caller aborts. */
export function waitCanonicalPreparationProgress(promise: Promise<void>, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    let active = true
    const finish = (ready: boolean) => { if (active) { active = false; signal?.removeEventListener('abort', abort); resolve(ready) } }
    const abort = () => finish(false)
    signal?.addEventListener('abort', abort, { once: true })
    void promise.then(() => finish(!signal?.aborted), error => { if (active) { active = false; signal?.removeEventListener('abort', abort); reject(error) } })
    if (signal?.aborted) abort()
  })
}
