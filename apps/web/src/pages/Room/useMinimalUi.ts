import { useCallback, useEffect, useRef, useState } from 'react'

import { minimalUiActive, minimalUiTapsRequired } from '../../lib/browser/uiPreferences'
import { diagLog } from '../../lib/observability/diagLog'
import { useRoomStore } from '../../stores/roomStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTapToggle, type TapDebugInfo } from './gestures/useTapToggle'

export interface MinimalUiDeps {
  /** The `.viewport` element the tap is heard on — see useTapToggle. */
  vpEl: HTMLElement | null
  /** Whether the tool in hand claims a tap on the canvas for itself. */
  canvasTapClaimed: boolean
  /** The debug overlay flag, which also gates the tap diagnostics. */
  debugEnabled: boolean
  /** Drops the zoom/angle toast whenever the chrome comes or goes. */
  hideViewportToast: () => void
}

/** Minimal UI (#99): a short single-finger tap on the canvas hides the
 *  header/toolbar/layer panel via a CSS class (never unmounted — no lost
 *  focus/state), tap again to bring them back.
 *
 *  (#189) Two taps by default rather than one — see MinimalUiTapMode. The
 *  count is a setting because the cheaper gesture is genuinely nicer for
 *  anyone whose hand never trips it.
 *
 *  (#321) A real setting now rather than a feature flag, and touch-only:
 *  `minimalUiActive` folds in the device check, because a PC has neither the
 *  tap that turns this on nor anything that would turn it back off (#384).
 *
 *  (#493) Out of Room. The two refs that come back are the annotation
 *  gestures' side of the same tap — see useAnnotations. */
export function useMinimalUi({ vpEl, canvasTapClaimed, debugEnabled, hideViewportToast }: MinimalUiDeps) {
  const minimalUiSetting = useSettingsStore(s => s.minimalUi)
  const deviceType = useSettingsStore(s => s.deviceType)
  const tapToHideEnabled = minimalUiActive(minimalUiSetting, deviceType)
  const minimalUiTapMode = useSettingsStore(s => s.minimalUiTapMode)
  /** (#509 v3) Whether a second tap on the canvas means "hide the chrome" right
   *  now — the only case worth making a new note wait for. A ref so the
   *  annotation gesture handlers read it at event time instead of being rebuilt
   *  every time the setting changes. Assigned just below useTapToggle, against
   *  that hook's own arming condition, so the two cannot drift. */
  const doubleTapArmedRef = useRef(false)
  /** A tap that may yet become a note, waiting out the grace period above.
   *  Here, beside `toggleUI`, because that is what has to be able to call the
   *  whole thing off. */
  const pendingNoteRef = useRef<{ timer: number } | null>(null)
  useEffect(() => { diagLog('tapToHideEnabled is', tapToHideEnabled) }, [tapToHideEnabled])
  const [uiHidden, setUiHidden] = useState(false)
  // Read via a ref (not the setUiHidden updater's own `h` param) purely so
  // the diagLog call sits in toggleUI's own body, not inside the updater —
  // StrictMode double-invokes updater functions to check purity, which
  // would otherwise log every real toggle twice with a misleadingly
  // identical "before" value both times. toggleUI itself stays `[]`-stable
  // (useTapToggle's effect deps include `onTap`; a churning identity there
  // re-attaches its native listeners on every toggle — see its own doc
  // comment on exactly that class of bug).
  const uiHiddenRef = useRef(uiHidden)
  uiHiddenRef.current = uiHidden
  // Diagnostic (matches useTapToggle/useViewport's own tap:/vp: diagLog
  // calls) for the "floating panel flickers after a stroke" reports — logs
  // every actual flip plus the stack-free "why" (never which call site;
  // there's only one), so a real device's copy-logs output can be
  // correlated against the tap:/vp:/stroke: timeline.
  const toggleUI = useCallback(() => {
    diagLog('toggleUI: uiHidden', uiHiddenRef.current, '->', !uiHiddenRef.current)
    // (#509 v5) A double tap slower than NOTE_DOUBLE_TAP_GRACE_MS will already
    // have opened an empty note by the time it completes. Undoing that here is
    // what lets the grace period be short: a note has to survive only the
    // *brisk* double tap, and the slow one is tidied up after the fact instead
    // of being waited out. Nothing is lost either way — an empty draft is local
    // state and records no operation.
    //
    // Both halves matter. The open note is the first tap's; the *pending* one
    // is the second tap's, queued a moment ago by the very press that completed
    // this gesture — cancel only the first and the second lands 160ms later,
    // which is what "the double tap left a note behind" looked like.
    if (pendingNoteRef.current) {
      window.clearTimeout(pendingNoteRef.current.timer)
      pendingNoteRef.current = null
    }
    const draft = useRoomStore.getState().annotationDraft
    if (draft && draft.annotationId === null && !draft.text.trim()) {
      useRoomStore.getState().closeAnnotationDraft()
    }
    setUiHidden(h => !h)
  }, [])
  // (#321) Turning the setting off while the chrome is hidden has to give it
  // back: the tap that would restore it is the very thing being switched off,
  // so without this the room stays stripped with no way out short of a
  // reload — and the settings panel that was just used is itself part of the
  // hidden chrome.
  useEffect(() => {
    if (!tapToHideEnabled) setUiHidden(false)
  }, [tapToHideEnabled])

  // (#362) The readout belongs to a gesture made *in* minimal UI, so crossing
  // that boundary drops it either way: entering, so a pinch made moments before
  // the tap doesn't surface a readout as though the tap had caused it; leaving,
  // so the pending dismissal doesn't survive to fire against a later gesture.
  useEffect(() => { hideViewportToast() }, [uiHidden, hideViewportToast])

  // Diagnostic for "works on Samsung, not on a Surface" (see chat) — see
  // TapDebugInfo's docstring for what each field means.
  //
  // (#321) Gated on the debug flag as well as on the mode. It used to hang
  // off the mode alone, which was safe while the mode was itself a developer
  // feature flag — now that a teacher can turn minimal UI on, that would have
  // put an English stats overlay in the corner of their lesson.
  const [tapDebug, setTapDebug] = useState<TapDebugInfo | null>(null)
  const tapDebugEnabled = debugEnabled && tapToHideEnabled

  // #99: layered independently on top of useViewport's own touch pan/pinch
  // handling on the same `.viewport` element — see useTapToggle's docstring
  // for why the two never conflict, and why it takes the element (`vpEl`)
  // rather than the ref. Off while the tool in hand claims the tap — see
  // Room's `canvasTapClaimed` for which tools do and why.
  useTapToggle(vpEl, toggleUI, tapToHideEnabled && !canvasTapClaimed, minimalUiTapMode, tapDebugEnabled ? setTapDebug : undefined)
  // (#509 v3) Mirrors the exact condition above, so a note only ever waits for
  // the double-tap window when a double tap is really listening for one.
  doubleTapArmedRef.current = tapToHideEnabled && !canvasTapClaimed
    && minimalUiTapsRequired(minimalUiTapMode) > 1

  return { uiHidden, toggleUI, tapToHideEnabled, tapDebug, tapDebugEnabled, doubleTapArmedRef, pendingNoteRef }
}
