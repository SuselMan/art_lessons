// (#351) The Room route's code-split chunk, and a way to start fetching it
// before anyone navigates.
//
// Room is lazy for a good reason (#130): it alone pulls in the WebGL engine,
// socket.io-client and @dnd-kit, none of which /login, /create or /my-lessons
// need. The cost lands on the click that enters a room — and lands badly,
// because react-router v7 wraps navigation in `startTransition` and
// deliberately keeps the *old* page on screen until the new one is ready. So
// the URL changes, the create form stays put for seconds, and the button reads
// as broken. The Suspense fallback never even gets a chance to appear.
//
// Same answer as the paper texture's (#345): start the download while the user
// is still deciding, from the pages that lead into a room. A chunk already in
// the module registry makes the transition instant.

/** The one import specifier for the Room page. App.tsx's `lazy()` and every
 *  preload below go through it, so the bundler sees a single chunk and the ESM
 *  registry dedupes repeat calls to one fetch. */
export const importRoomPage = () => import('../pages/Room')

/** Starts fetching the Room chunk, off any critical path.
 *
 *  Fire-and-forget, and the rejection is swallowed on purpose: a preload that
 *  fails is a guess that did not pay off, not the user's problem. The real
 *  navigation re-enters the same import and has somewhere to report failure
 *  (the route's own Suspense/error boundary) — swallowing here only stops an
 *  unhandled rejection from a fetch nobody is waiting on yet. */
export function preloadRoomPage(): void {
  void importRoomPage().catch(() => {})
}
