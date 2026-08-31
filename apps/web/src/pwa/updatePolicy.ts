// (#400) What to do the moment a newer build is sitting in `waiting`.
//
// #48 answered this with one rule — always offer, never apply — because the
// thing it was protecting against is real: reloading a room mid-lesson throws
// away whatever the tab caught in flight, and #313 cares enough about that to
// put a `beforeunload` in the way. But one rule for every situation made the
// two situations that aren't a room pay for it:
//
//  - In a browser tab the offer is noise. Nobody has seen an update prompt in
//    a web page, because the platform already handles it: a waiting worker
//    activates on its own as soon as the last tab of the app closes. The
//    prompt asks the user to decide something the browser was going to decide
//    correctly a few hours later anyway.
//  - Outside a room there is nothing to protect. On My Lessons or the create
//    form no operation is in flight and no socket session exists, so the
//    reload costs a page load and nothing else — and asking permission for
//    that trains people to dismiss the strip on the one screen where it means
//    something.
//
// The one case that genuinely needs a human is an installed app sitting in a
// room: it cannot be applied silently, and unlike a tab it may never be closed
// — a teacher's tablet keeps the app alive for weeks. That is what the strip
// from #343 is now reserved for.
//
// Kept pure and separate from the registration so it can be asserted without a
// DOM: the interesting part is the three-way decision, not the plumbing.

export type UpdateAction =
  /** Take the new worker and reload. */
  | 'apply'
  /** Offer it and let the user pick the moment. */
  | 'prompt'
  /** Neither — leave it waiting and ask again later. */
  | 'wait'

export interface UpdateContext {
  /** From lib/reloadSafety: a joined room is holding the tab. */
  reloadUnsafe: boolean
  /** Launched from the home screen / as an installed app rather than in a
   *  browser tab — i.e. "closing the last tab" may never happen. */
  installed: boolean
}

export function decideUpdateAction({ reloadUnsafe, installed }: UpdateContext): UpdateAction {
  if (!reloadUnsafe) return 'apply'
  return installed ? 'prompt' : 'wait'
}

/** Display modes a launcher can start us in. `standalone` is the common one;
 *  the rest are the same installation with different chrome, and all of them
 *  share the property that matters here — there is no tab to close. */
const INSTALLED_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']

export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  if (INSTALLED_DISPLAY_MODES.some(mode => window.matchMedia(`(display-mode: ${mode})`).matches)) {
    return true
  }
  // iOS Safari predates `display-mode` and reports an installed app here
  // instead. Widening the type rather than casting: the property is genuinely
  // optional, and every other browser simply doesn't have it.
  const nav: Navigator & { standalone?: boolean } = window.navigator
  return nav.standalone === true
}

/** (#515) How long the app has to have been out of sight before coming back
 *  counts as a *resume* — and so checks for a new build regardless of the
 *  anti-thrash floor between checks (registerServiceWorker's own
 *  MIN_CHECK_GAP_MS).
 *
 *  The floor was written for a tab, where it costs nothing: the browser
 *  re-fetches sw.js on navigation anyway, and a waiting worker activates by
 *  itself once the last tab closes. An installed app has neither. It is
 *  resumed rather than navigated, and it is never closed — a teacher's tablet
 *  keeps it alive for weeks — so being brought back to the screen is the only
 *  moment it can learn a deploy happened at all. A floor there is a window in
 *  which the app knowingly runs a build it could have replaced, and that
 *  window is what #515 reported: between a deploy landing and the tablet being
 *  picked up it made not one request, and the person holding it concluded the
 *  fix had not shipped.
 *
 *  A minute keeps the case the floor exists for — a tablet picked up and put
 *  down, firing `visibilitychange` seconds apart — and excludes nothing real:
 *  "put it down, a deploy lands, pick it up" is never inside a minute. */
export const RESUME_HIDDEN_MS = 60 * 1000

export function isResumeFromBackground(hiddenMs: number): boolean {
  return hiddenMs >= RESUME_HIDDEN_MS
}
