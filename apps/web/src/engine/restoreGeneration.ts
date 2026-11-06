/** One current restore per engine; cancellation is local, never a wire verdict. */
const current = new WeakMap<object, AbortController>()
export function beginRestoreGeneration(owner: object): AbortController {
  cancelRestoreGeneration(owner)
  const controller = new AbortController()
  current.set(owner, controller)
  return controller
}
export function cancelRestoreGeneration(owner: object): void {
  const previous = current.get(owner)
  current.delete(owner)
  previous?.abort()
}
export function finishRestoreGeneration(owner: object, controller: AbortController): void {
  if (current.get(owner) === controller) current.delete(owner)
}
export function isRestoreCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Stop awaiting a retired transport even if an adapter cannot abort its I/O. */
export function awaitRestore<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
    if (signal.aborted) abort()
  })
}
