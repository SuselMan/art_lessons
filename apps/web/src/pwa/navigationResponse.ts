// (#502) Which of the two possible answers to a navigation the worker gives.
//
// Kept pure and separate from sw.ts for the same reason updatePolicy.ts is kept
// out of registerServiceWorker.ts: the interesting part is the decision, not
// the plumbing, and the plumbing here needs a `ServiceWorkerGlobalScope` to
// exist. Generic over the response type rather than typed to `Response` so a
// test can drive it with stand-ins in any environment — the ordering is the
// whole content, not what is being ordered.
//
// The rule it encodes: **the network answers a navigation whenever it can, and
// the cached shell only when it cannot.** The other way round — which is what
// `generateSW` does and what #502 is about — means a tab opened right after a
// deploy loads the previous build, because the precached index.html names the
// previous build's hashed chunks.

const TIMED_OUT = Symbol('navigation-timeout')

export interface NavigationSources<T> {
  /** The network attempt for the document. Must never reject: it is raced
   *  below, and a rejection the race does not win is an unhandled rejection
   *  (#383). `null` means the attempt failed. */
  network: Promise<T | null>
  /** The precached shell, or `null` when there is none or this URL must not be
   *  answered with it. Called only when the network did not deliver, so a
   *  cache lookup costs nothing on the normal path. */
  shell: () => Promise<T | null>
  /** Resolves when the wait for the network is over — the point at which a
   *  connection that is up but not delivering stops being worth waiting for. */
  expiry: Promise<unknown>
}

/** The response to serve, or `null` if there is nothing to serve at all. */
export async function resolveNavigation<T>({ network, shell, expiry }: NavigationSources<T>): Promise<T | null> {
  // The explicit type argument is load-bearing: left to inference `Promise.race`
  // widens the sentinel to `symbol`, which no longer narrows against TIMED_OUT.
  const first = await Promise.race<T | null | typeof TIMED_OUT>([
    network,
    expiry.then(() => TIMED_OUT),
  ])
  if (first !== TIMED_OUT && first !== null) return first

  const fallback = await shell()
  if (fallback !== null) return fallback

  // Nothing cached to fall back to — a first visit that went offline mid-
  // install, or a URL the shell is not allowed to answer. Waiting the network
  // out beats inventing a failure it may not have produced: the timeout above
  // is a limit on how long the *user* waits before seeing something, and with
  // nothing to show them there is nothing to cut short.
  return await network
}
