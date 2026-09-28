// Traps browser back/forward navigation (a popstate event) while a room is
// mounted. Touch tablets (Chrome/Android confirmed) reserve a strip along the
// screen edge for the swipe-back gesture that neither touch-action: none nor
// overscroll-behavior-x: none can suppress — a hand resting near the edge, or
// a drag on a control that sits there (e.g. the Tool settings panel's
// sliders), triggers it mid-drawing and kicks the user out of the room. Since
// the gesture itself can't be blocked, this blocks its effect instead: revert
// the URL before react-router ever sees the "wrong" one.
//
// (#377) In the editor, back does nothing at all — no navigation, and no
// prompt either. It used to ask "leave this room?", on the theory that
// swallowing an intentional back press makes the button look broken; that
// theory lost to a real drawing session. The gesture fires by accident far
// more often than the button is pressed on purpose, and the "was this
// accidental?" test the prompt was gated on — is a stroke in progress? — could
// never be true: Chrome takes the pointer for itself the instant it claims the
// gesture, which sends pointercancel, which ends the stroke, and popstate only
// arrives once the gesture completes. The flag was always already down by the
// time anything looked at it. Leaving a room stays available where it can't be
// hit by accident: the wordmark in the header and "Leave" in the room menu.
//
// Registered here, at module load — imported from main.tsx before
// <BrowserRouter> mounts — so this listener is added to `window` before
// react-router's own popstate listener. Same-target listeners for the same
// event fire in registration order, so this handler's synchronous
// history.pushState() runs first and reverts window.location before
// react-router's listener reads it, meaning react-router never observes the
// unwanted navigation at all.
let guardedUrl: string | null = null

/** Arms the guard for `url` (the room's own address), or disarms it with
 *  `null`. While armed, back and forward are inert.
 *
 *  Arming also pushes one spare history entry, because reverting only works if
 *  the gesture has an entry to consume in the first place — and the person most
 *  exposed to this bug has none. A student opening a room link from a messenger
 *  has a history exactly one entry deep: the join gate and the editor are the
 *  same component at the same URL (Room renders <JoinGate/> until `config`
 *  arrives — becoming the editor is a state change, not a navigation), so
 *  nothing ever pushed a second entry. Back there leaves the site without
 *  firing popstate at all, and a popstate listener cannot save you from a
 *  navigation that never becomes one. With the spare in place there is always
 *  something to go back *to*, and the handler below pushes it straight back, so
 *  the depth never runs out however many times the gesture fires. */
export function setBackNavigationGuard(url: string | null): void {
  // Skipped when the URL is already the guarded one: React re-runs the arming
  // effect whenever the room object's identity changes (a rename, a fresh
  // room_state), and re-pushing a spare on every one of those would grow the
  // history entry by entry for as long as the room stays open.
  if (url !== null && url !== guardedUrl) history.pushState(null, '', url)
  guardedUrl = url
}

window.addEventListener('popstate', () => {
  if (guardedUrl === null) return
  // Unconditional, rather than only when the URL actually changed. Once a
  // spare is in place the entry sitting behind the room is *itself* the room's
  // URL, so "did the URL change?" answers no every time — and skipping the
  // push on that answer would spend the spare without replacing it, letting
  // the second gesture walk off the end of the history. Pushing regardless
  // both tops the spare back up and restores the URL in the case the original
  // guard was written for. pushState does not itself fire popstate, so this
  // cannot loop.
  history.pushState(null, '', guardedUrl)
})
