// (#400) One answer to "would reloading this tab right now cost the user
// something?", for the two places that have to agree on it.
//
// The knowledge already existed, but only as a condition inside one effect in
// Room: `beforeunload` is armed for the whole life of a joined room (#313).
// The service worker updater needs the same answer — it decides whether a new
// build may be applied silently — and deriving it a second time from the route
// or the store would be a copy that drifts. So the room states it once, here,
// and both readers ask this module.
//
// A counter rather than a boolean: holders are independent, and React's
// StrictMode mounts an effect twice on purpose. With a boolean the second
// cleanup would clear a hold the first mount still wants.
let holds = 0

/** Declares that a reload right now would disturb work in progress. Returns
 *  the release, which is what an effect cleanup calls.
 *
 *  Releasing runs the listeners: "the room was left" is the moment a deferred
 *  update has been waiting for, and polling for it would mean a timer whose
 *  only job is to notice something that already happened. */
export function holdReload(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    if (holds === 0) notifyReleased()
  }
}

export function isReloadUnsafe(): boolean {
  return holds > 0
}

const releaseListeners = new Set<() => void>()

/** Called when the last hold goes away — i.e. when a reload becomes free
 *  again. Never called on acquiring a hold: nothing needs that edge. */
export function onReloadSafe(listener: () => void): () => void {
  releaseListeners.add(listener)
  return () => releaseListeners.delete(listener)
}

function notifyReleased(): void {
  // Copied before iterating: a listener that unsubscribes itself while it runs
  // would otherwise mutate the set mid-iteration.
  for (const listener of [...releaseListeners]) listener()
}

/** Tests only. Module-level state outlives a test file's cases, and a leaked
 *  hold from one case silently changes the answer in the next. */
export function resetReloadSafety(): void {
  holds = 0
  releaseListeners.clear()
}
