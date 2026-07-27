// Traps browser back/forward navigation (a popstate event) while a room is
// mounted. Touch tablets (Chrome/Android confirmed) reserve a strip along the
// screen edge for the swipe-back gesture that neither touch-action: none nor
// overscroll-behavior-x: none can suppress — dragging a control that sits
// near the edge (e.g. the Tool settings panel's sliders) can trigger it
// mid-drag and kick the user out of the room. Since the gesture itself can't
// be blocked, this blocks its effect instead: revert the URL before
// react-router ever sees the "wrong" one.
//
// Registered here, at module load — imported from main.tsx before
// <BrowserRouter> mounts — so this listener is added to `window` before
// react-router's own popstate listener. Same-target listeners for the same
// event fire in registration order, so this handler's synchronous
// history.pushState() runs first and reverts window.location before
// react-router's listener reads it, meaning react-router never observes the
// unwanted navigation at all.
//
// Reverting is only half the story: an intentional back press is a request to
// leave, and swallowing it silently makes the button look broken. The optional
// `onBlocked` callback hands that decision back to the guarded page, which is
// the only place that can tell an intentional gesture from a stray one — see
// the leave confirmation in pages/Room.
let guardedUrl: string | null = null
let onBlocked: (() => void) | null = null

export function setBackNavigationGuard(url: string | null, blocked?: () => void): void {
  guardedUrl = url
  onBlocked = url === null ? null : blocked ?? null
}

window.addEventListener('popstate', () => {
  if (guardedUrl === null) return
  const current = window.location.pathname + window.location.search + window.location.hash
  if (current !== guardedUrl) {
    history.pushState(null, '', guardedUrl)
    onBlocked?.()
  }
})
