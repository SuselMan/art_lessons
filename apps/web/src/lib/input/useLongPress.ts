import { useCallback, useEffect, useRef } from 'react'

import { CLICK_MOVE_THRESHOLD_PX } from './tapThreshold'

/** How long the pointer must stay down before the press counts as a long one.
 *  Same 500 ms the layer panel's own long-press (multi-select mode, #414)
 *  uses — a gesture that means the same thing in two places should not feel
 *  like two different gestures. */
const LONG_PRESS_MS = 500

interface LongPressOptions {
  onLongPress: () => void
  /** Overrides LONG_PRESS_MS for a press that should arm faster/slower. */
  delay?: number
  /** Movement past this cancels the pending press. Defaults to
   *  CLICK_MOVE_THRESHOLD_PX rather than the tighter TAP_MOVE_THRESHOLD_PX
   *  for exactly the reason that constant's own doc comment gives: this is a
   *  gesture held for half a second, mostly with a stylus on a tablet, and a
   *  still hand is not the same thing as a still pointer. Judged against 4 px
   *  a deliberate hold would routinely drift out of its own budget. */
  tolerance?: number
}

/** Press-and-hold on a single element, as a companion to useDraggablePosition
 *  (free 2D drag) and useDragToAdjust (1D value drag). Returns a pointerdown
 *  handler to spread onto the element; a plain tap still reaches its own
 *  onClick untouched, and only a press that actually goes the distance is
 *  taken away from it.
 *
 *  Two things this has to get right, both of which are why it is a hook and
 *  not four lines inlined at the call site:
 *
 *  Move/up are watched on `window`, not on the element. Without pointer
 *  capture — which this deliberately never takes, for the same reason
 *  useDraggablePosition puts off taking it (a capturing ancestor swallows its
 *  children's clicks) — a pointer that wanders off a 44 px button stops
 *  delivering events to it entirely. Listening on the element would therefore
 *  miss both the movement that should cancel the press and the release that
 *  should end it, and the press would fire from wherever the finger had got
 *  to, or never clean up at all.
 *
 *  A fired press eats the click that follows it. Otherwise the release at the
 *  end of the hold also lands as an ordinary tap on the same element, so
 *  "hold the tool button to choose another tool" would open the chooser *and*
 *  select the tool underneath in one motion. Suppression is armed in the
 *  capture phase, and torn down on a deferred timeout as well as by `once`,
 *  because plenty of touch browsers never synthesize the trailing click at
 *  all — the same gap useDraggablePosition documents at length, hit here via
 *  a hold rather than a drag. */
export function useLongPress({
  onLongPress, delay = LONG_PRESS_MS, tolerance = CLICK_MOVE_THRESHOLD_PX,
}: LongPressOptions) {
  // Ends whatever press is currently in flight. Held in a ref so an unmount
  // mid-hold (the panel can be hidden while a finger is still down) takes the
  // timer and the window listeners with it rather than leaving them to fire
  // into a dead component.
  const endPressRef = useRef<(() => void) | null>(null)
  useEffect(() => () => endPressRef.current?.(), [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    endPressRef.current?.()

    const el = e.currentTarget
    const startX = e.clientX, startY = e.clientY
    let fired = false

    const suppressClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation() }

    const timer = window.setTimeout(() => {
      fired = true
      el.addEventListener('click', suppressClick, { capture: true, once: true })
      onLongPress()
    }, delay)

    const endPress = () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', endPress)
      window.removeEventListener('pointercancel', endPress)
      endPressRef.current = null
      // Deferred, not immediate, so a click that really is coming (dispatched
      // synchronously with this same pointerup, as a mouse does) still gets
      // suppressed first; this only matters for the gestures where no click
      // was ever going to arrive.
      if (fired) setTimeout(() => el.removeEventListener('click', suppressClick, { capture: true }), 0)
    }

    // Once the press has fired there is nothing left to cancel — the pointer
    // is free to go on and mean something else (dragging the panel this
    // button sits on, say) without retracting the chooser it just opened.
    const handleMove = (ev: PointerEvent) => {
      if (fired) return
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < tolerance) return
      endPress()
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', endPress)
    window.addEventListener('pointercancel', endPress)
    endPressRef.current = endPress
  }, [onLongPress, delay, tolerance])

  return { onPointerDown }
}
