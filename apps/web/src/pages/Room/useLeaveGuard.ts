import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import { useT } from '../../i18n'
import { setBackNavigationGuard } from '../../lib/browser/backNavigationGuard'
import { holdReload } from '../../lib/browser/reloadSafety'
import { useRoomStore } from '../../stores/roomStore'

/** (#313, #377, #400, #493) Every way out of the room, on the Room side:
 *  leaving asks first; a close or reload while the editor is up raises the
 *  browser's own prompt and holds off an automatic update; and Back does
 *  nothing, because the edge-swipe that sends it fires by accident while
 *  drawing. All three only while the editor itself is on screen — the join
 *  gate has no session to keep and nothing unsent.
 *
 *  Out of Room. Returns the one exit the page offers on purpose. */
export function useLeaveGuard(): () => Promise<void> {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { confirm } = useConfirmDialog()
  // Whether the editor is on screen rather than the join gate — see the back
  // guard below for why a boolean and not the room.
  const editorOnScreen = useRoomStore(s => s.room !== null)

  // The unload half of "confirm before leaving a room": closing the tab or
  // reloading can't be intercepted by the app's own dialog (see leaveRoom),
  // only by the browser's, so this is what covers those paths. Armed for the
  // whole life of the room rather than only when work is unsent — the two
  // reasons to ask are different in weight but the prompt is the same one:
  //
  //  - ordinary case: an accidental close mid-lesson drops the user out of a
  //    live session, and the way back in is a room link they may not have.
  //  - (#313) unconfirmed work lives in IndexedDB and survives a reload, but
  //    it only leaves this device if the tab eventually gets back online.
  //    Closing it while the queue is full turns a recoverable situation into a
  //    permanent loss — and it's usually done by someone who has already
  //    concluded the work is gone.
  //
  // Same `config` gate as the back guard below: at the join gate there is no
  // session and nothing unsent, so a prompt would be pure friction.
  //
  // (#400) The same gate now also states the fact out loud, via holdReload():
  // "a reload right now would cost something". The service worker updater
  // reads it to decide whether a new build may be applied without asking, and
  // it has to be the *same* condition — a second one derived from the route
  // would be a copy free to drift from this one. Note that the hold is the
  // half that actually protects a room from an automatic reload: a
  // programmatic reload carries no user activation, and browsers do not raise
  // the beforeunload dialog for those at all.
  useEffect(() => {
    if (!editorOnScreen) return
    const releaseHold = holdReload()
    // (#536) Production only. In a dev build every dev-server reload (a saved
    // file) raised the browser's "Reload site?" on any device someone had
    // touched, and a test tablet or iPad across the room then sat frozen on
    // it until somebody walked over - it hung a four-device test twice.
    if (import.meta.env.DEV) return releaseHold
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Browsers ignore custom text here and show their own wording; the
      // preventDefault is what actually triggers the prompt.
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      releaseHold()
    }
  }, [editorOnScreen])

  // Every way out of the editor asks first. Leaving a room is not destructive
  // — the drawing is in the room, not in this tab — but it is disorienting
  // mid-lesson, and the exit sits in the same header strip as controls that
  // get tapped constantly, so an accidental one is easy.
  const leavePendingRef = useRef(false)
  const leaveRoom = useCallback(async () => {
    // A second tap while the dialog is already up would otherwise pre-empt the
    // first dialog, which resolves it as `false` — a cancel the user never
    // asked for. (Back can no longer be one of those callers — see the guard
    // effect below — but the header wordmark and the menu item still can.)
    if (leavePendingRef.current) return
    leavePendingRef.current = true
    try {
      const leaving = await confirm({
        title: t('room.confirmLeaveTitle'),
        message: t('room.confirmLeaveMessage'),
        confirmLabel: t('room.confirmLeave'),
        cancelLabel: t('room.confirmLeaveStay'),
      })
      if (leaving) navigate('/')
    } finally {
      leavePendingRef.current = false
    }
  }, [confirm, navigate, t])

  // (#377) Back does nothing while the editor is on screen — Chrome's
  // edge-swipe-back gesture fires by accident often enough while drawing that
  // even asking about it is an interruption. The whole mechanism (reverting
  // the URL, and keeping a spare history entry so there is something to
  // revert) lives in backNavigationGuard; see its comment. Armed only while
  // this room is actually mounted, so back navigation elsewhere in the app
  // (/create, /my-lessons) is unaffected, and leaving stays available through
  // the header wordmark and the room menu's "Leave".
  //
  // `config` is what says the editor itself is on screen rather than the join
  // gate. Nothing at the gate can trigger the accidental edge-swipe this guard
  // exists for (the draggable controls are all in the editor), and there is no
  // room to be kept in yet — trapping back there would only strand someone who
  // opened a link they've decided not to follow. Depended on as a boolean, not
  // as the room object: the object's identity changes on every rename and
  // room_state, and re-running this effect is not free now that arming pushes
  // a history entry.
  useEffect(() => {
    if (!editorOnScreen) return
    setBackNavigationGuard(location.pathname + location.search + location.hash)
    return () => setBackNavigationGuard(null)
  }, [editorOnScreen, location.pathname, location.search, location.hash])

  return leaveRoom
}
