import { useCallback, useEffect, useRef, useState } from 'react'

import type { PinchPhaseListener } from './useViewport'

/** How long the readout stays up after the fingers leave. Counted from the end
 *  of the gesture, never from its start: a slow two-finger rotation can easily
 *  run longer than this, and a readout that vanished mid-gesture would be
 *  useless exactly while it is being read. */
export const VIEWPORT_TOAST_MS = 2000

export interface UseViewportToastResult {
  /** Whether the readout should be on screen. Only ever consulted in minimal
   *  UI — see the note in the hook body on why the state is kept regardless. */
  toastVisible: boolean
  /** Hand to `useViewport`'s `onPinchPhase`. `[]`-stable, which that hook's
   *  listener-attaching effect depends on. */
  onPinchPhase: PinchPhaseListener
  /** Drop the readout and any pending dismissal immediately. Called when the
   *  chrome is toggled: a pinch, then a tap into minimal UI within the two
   *  seconds, would otherwise make a readout appear as a result of the *tap* —
   *  which reads as a glitch, since nothing about the view changed. Also stable. */
  hide: () => void
}

/** The 2-second life of #362's zoom/rotation readout: visible while a
 *  pinch/rotate gesture is running, then for `VIEWPORT_TOAST_MS` after it ends.
 *
 *  One instance, shown and hidden — not a queue. A second gesture arriving
 *  while the readout is still up cancels the pending dismissal and keeps the
 *  same strip on screen showing the new numbers, which is what "it updates in
 *  place instead of stacking" reduces to once the values themselves are read
 *  live from the store rather than captured per gesture.
 *
 *  Not in `roomStore` despite the project's one-store rule: this is the same
 *  category as `uiHidden` next door in Room — a purely local, sub-second view
 *  concern with no reader outside this one strip, and nothing to reflect from
 *  the engine or the network. It also must not be wiped by `resetRoomStore()`
 *  mid-gesture, which is exactly what the store guarantees on Room mount. */
export function useViewportToast(): UseViewportToastResult {
  const [toastVisible, setToastVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Deliberately unconditional — it does not know or ask whether minimal UI is
  // on. Gating it would mean reading `uiHidden` from inside a callback that has
  // to stay `[]`-stable (useViewport re-attaches every gesture listener when
  // this identity changes), i.e. a ref and a second source of truth, to save
  // two state updates per gesture in a component that already re-renders every
  // frame of that same gesture off `viewport`. Room renders the strip only
  // while the chrome is hidden; that check belongs at the render site, where it
  // is one boolean and cannot go stale.
  const onPinchPhase = useCallback<PinchPhaseListener>((active) => {
    clearTimer()
    if (active) {
      setToastVisible(true)
      return
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setToastVisible(false)
    }, VIEWPORT_TOAST_MS)
  }, [clearTimer])

  const hide = useCallback(() => {
    clearTimer()
    setToastVisible(false)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return { toastVisible, onPinchPhase, hide }
}
