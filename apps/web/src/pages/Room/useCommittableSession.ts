import { useEffect, useRef, type RefObject } from 'react'

import { holdReload } from '../../lib/reloadSafety'
import { ClickTracker } from './clickTracker'

// (#528) An *uncommitted edit that outlives its own gesture*: the transform
// tool's open session, and — since #525 — a shape that is still being placed.
//
// The two are the same object, not merely similar. Both keep a preview on
// screen with nothing written to a layer, both are applied by Enter, by a click
// past them and by putting the tool down, and both are cancelled by Esc. That
// contract was written once, for the transform, and each clause of it below
// exists because something went wrong without it:
//
//  - **a click, not a press** (#405/#407/#408). Ending an edit on pointerdown
//    kills it whenever the user pans, and on a tablet a palm or a steadying
//    finger is on the glass most of the time. ClickTracker judges each pointer
//    alone, with its own wander budget — deliberately not the minimal-UI tap's,
//    see CLICK_MOVE_THRESHOLD_PX.
//  - **holdReload** (#405, on top of #313/#400). An open session is unsent
//    work: it has to arm the room's beforeunload prompt and stop the service
//    worker applying a new build under it. Its own hold rather than the
//    room-wide one, so narrowing that one later cannot silently unprotect a
//    session; nested holds are free.
//  - **pagehide/visibilitychange** (#401). The one exit React never reports.
//    Best-effort by nature — the operation goes out through the Outbox, whose
//    IndexedDB write is async — which is exactly why the hold above exists too.
//
// Copying those three into the shape tool would have meant re-earning all
// three bugs. What is deliberately *not* here is what each session's preview
// is and what its commit writes: this hook knows when an edit ends, never what
// the edit was.

export interface CommittableSessionOptions {
  /** Whether a session is currently open. Everything below is inert when it
   *  is false. */
  active: boolean
  /** Applies the session. Called when the page is going away; the click-past
   *  gesture calls `onClickPast` instead, which usually commits and then does
   *  whatever else finishing means for that tool. */
  commit: () => void
  /** The viewport element presses are watched on. Native listeners on it
   *  rather than React props: the gizmo, the ruler catcher and the canvas all
   *  live inside it with handlers of their own, and this has to see the
   *  presses none of them claimed. */
  vpEl: HTMLElement | null
  /** True while held Space owns the drag — that press is a pan, whatever it
   *  lands on. */
  handActiveRef: RefObject<boolean>
  /** Presses inside an element matching this selector belong to the session's
   *  own controls (the gizmo and its rotate zones, a shape's handles) and are
   *  never "past" it. */
  ownControlsSelector: string
  /** What a click past the session means. Called once, on pointerup, and
   *  expected to commit — it is the tool's "I'm done here" gesture, so it
   *  usually also puts the tool down. */
  onClickPast: () => void
}

export function useCommittableSession({
  active, commit, vpEl, handActiveRef, ownControlsSelector, onClickPast,
}: CommittableSessionOptions): void {
  // Refs so the listeners below are installed once per session rather than
  // re-installed on every render that hands over a new closure — a mid-gesture
  // teardown would drop the ClickTracker's state and with it the click.
  const commitRef = useRef(commit)
  commitRef.current = commit
  const clickPastRef = useRef(onClickPast)
  clickPastRef.current = onClickPast

  useEffect(() => {
    if (!active) return
    const save = (): void => commitRef.current()
    const onVisibility = (): void => { if (document.visibilityState === 'hidden') save() }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    return holdReload()
  }, [active])

  useEffect(() => {
    if (!active || !vpEl) return
    const clicks = new ClickTracker()

    const onDown = (e: PointerEvent): void => {
      if (handActiveRef.current) return
      // Primary button only: the middle one pans, and a pan that happens to
      // travel nowhere is still not "I'm done here".
      if (e.button !== 0) return
      if ((e.target as Element | null)?.closest(ownControlsSelector)) return
      clicks.down(e.pointerId, e.clientX, e.clientY)
    }
    const onMove = (e: PointerEvent): void => { clicks.move(e.pointerId, e.clientX, e.clientY) }
    const onUp = (e: PointerEvent): void => {
      if (!clicks.up(e.pointerId)) return
      clickPastRef.current()
    }
    // A cancelled pointer (the browser taking the gesture over for a scroll or
    // a system gesture) is not a click, and must not be treated as one.
    const onCancel = (e: PointerEvent): void => { clicks.cancel(e.pointerId) }

    vpEl.addEventListener('pointerdown', onDown)
    vpEl.addEventListener('pointermove', onMove)
    vpEl.addEventListener('pointerup', onUp)
    vpEl.addEventListener('pointercancel', onCancel)
    return () => {
      vpEl.removeEventListener('pointerdown', onDown)
      vpEl.removeEventListener('pointermove', onMove)
      vpEl.removeEventListener('pointerup', onUp)
      vpEl.removeEventListener('pointercancel', onCancel)
    }
  }, [active, vpEl, handActiveRef, ownControlsSelector])
}
