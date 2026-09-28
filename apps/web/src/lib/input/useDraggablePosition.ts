import { useCallback, useEffect, useRef } from 'react'

import { BUTTON_DRAG_THRESHOLD_PX, TAP_MOVE_THRESHOLD_PX } from './tapThreshold'

interface Point { x: number; y: number }

interface DraggablePositionOptions {
  onChange: (position: Point) => void
  /** Applied to every candidate position before onChange fires — e.g.
   *  clampPanelPosition, to keep the dragged element inside its container. */
  clamp?: (position: Point) => Point
  /** Pixels of movement before a pointerdown counts as a drag rather than a
   *  click reaching whatever's under the pointer (e.g. a tool button). Either
   *  one number for every press, or a rule that decides per press — the
   *  default is the latter, see dragThresholdForPress below. */
  threshold?: number | ((e: React.PointerEvent<HTMLElement>) => number)
}

/** The controls a press can land on *inside* a draggable container and mean
 *  as itself rather than as a grab of the container. Deliberately wider than
 *  the plain `button` the only current caller has: what matters is "was this
 *  aimed at something", and the next such element to be dropped into a
 *  draggable panel should not have to remember to come back here. */
const CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

/** Just the one method of Element this rule needs, so it can be exercised in
 *  the node test environment this repo runs vitest in (see vitest.config.ts —
 *  there is no DOM there, and `instanceof Element` would be unanswerable). */
interface HasClosest { closest(selector: string): unknown }
function hasClosest(target: EventTarget | null): target is EventTarget & HasClosest {
  return typeof (target as Partial<HasClosest> | null)?.closest === 'function'
}

/** How far this particular press may drift before it is taken away from
 *  whatever it landed on and becomes a drag.
 *
 *  A press on the container's own body has nothing else it could possibly
 *  mean, so it gets the tight tap budget and the drag starts as good as
 *  immediately. A press that landed on a control gets BUTTON_DRAG_THRESHOLD_PX
 *  instead: it was aimed at that control, and stealing it four pixels later
 *  both moved the panel and — because a started drag arms the click
 *  suppressor below — ate the tap it was aimed as. On a stylus that was not a
 *  rare accident; see BUTTON_DRAG_THRESHOLD_PX's own comment. */
export function dragThresholdForPress({ target }: { target: EventTarget | null }): number {
  return hasClosest(target) && target.closest(CONTROL_SELECTOR)
    ? BUTTON_DRAG_THRESHOLD_PX
    : TAP_MOVE_THRESHOLD_PX
}

/** Free 2D press-and-drag gesture — same threshold-based tap-vs-drag
 *  disambiguation as useDragToAdjust (1D, value-based), generalized to an
 *  (x, y) position. Returns a pointerdown handler to spread onto the
 *  draggable element's root; a plain click/tap on any descendant (e.g. a
 *  button inside the dragged panel) still fires normally.
 *
 *  Deliberately does NOT call setPointerCapture eagerly on every
 *  pointerdown the way useDragToAdjust does — that hook is only ever used
 *  on an element that IS the whole interactive target (a slider, a zoom
 *  label), where "drag" and "click" are two outcomes of the *same*
 *  element, already disambiguated by its own click-suppression. This hook
 *  targets a *container with independently-clickable children* (the
 *  panel's own tool buttons) — empirically (real Chrome, not just per a
 *  spec reading), once an ancestor holds pointer capture, the `click`
 *  event synthesized at pointerup is dispatched to the *capturing*
 *  element instead of whatever the pointer is actually over, silently
 *  swallowing every child button's click before it ever reaches React.
 *  Capturing only once real movement past `threshold` confirms this is a
 *  genuine drag (not a click) avoids that entirely: a plain tap on a
 *  child button never captures anything, so its click reaches it
 *  normally, same as if this handler weren't here at all.
 *
 *  How much movement counts depends on what the press landed on, and by
 *  default this hook decides that itself — see dragThresholdForPress. */
export function useDraggablePosition(
  position: Point,
  { onChange, clamp, threshold = dragThresholdForPress }: DraggablePositionOptions,
) {
  const posRef = useRef(position)
  posRef.current = position

  // Ends whatever drag is in flight, held in a ref for the same reason
  // useLongPress holds one: now that move/up are watched on `window` (see
  // below), an unmount mid-drag would leave those listeners behind to fire
  // onChange into a component that is gone.
  const endDragRef = useRef<(() => void) | null>(null)
  useEffect(() => () => endDragRef.current?.(), [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    endDragRef.current?.()
    const el = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX, startY = e.clientY
    const startPos = posRef.current
    // Resolved once, here, rather than per pointermove: the rule reads the
    // press's own target, which pointermove no longer carries once the pointer
    // has left the button it started on — which is precisely the movement this
    // threshold exists to allow.
    const limit = typeof threshold === 'function' ? threshold(e) : threshold
    let dragging = false

    const suppressClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation() }

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < limit) return
        dragging = true
        // Only now — confirmed a real drag, not a click — take pointer
        // capture (so it keeps tracking smoothly even if the pointer
        // leaves the panel's own bounds) and arm the click-suppressor
        // (so the synthetic click this same gesture ends with doesn't
        // also register as a tap on whatever's under the pointer). Real-
        // device pen/touch input can reject capture (same "context loss"
        // class PointerInput.ts/useViewport.ts's own setPointerCapture calls
        // already guard against) — an unguarded throw here used to abort
        // before onChange below ever ran, silently breaking the drag.
        try { el.setPointerCapture(pointerId) } catch { /* context loss */ }
        el.addEventListener('click', suppressClick, { capture: true, once: true })
      }
      const next = { x: startPos.x + dx, y: startPos.y + dy }
      onChange(clamp ? clamp(next) : next)
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      endDragRef.current = null
      if (dragging) {
        try { el.releasePointerCapture(pointerId) } catch { /* already released */ }
        // Belt-and-suspenders cleanup for suppressClick, rather than relying
        // solely on its own `once: true` removal: a real trailing click
        // doesn't always follow a drag's pointerup the way it reliably does
        // with a desktop mouse — plenty of touch browsers never synthesize
        // one at all once a gesture moved far enough to count as a drag
        // (same "no click ever comes" gap pointercancel already has, just
        // hit here via an ordinary pointerup instead — this was the actual
        // cause of "drag the panel, first tap after does nothing" reported
        // on a real tablet; #159 already hit this same class of bug on
        // ColorPicker's own slider). Deferred via setTimeout rather than
        // removed immediately so a click that *does* arrive (synchronously,
        // as part of the same input dispatch, same as a mouse drag) still
        // gets suppressed first — this fallback only ever matters for the
        // gestures where no click was coming anyway.
        setTimeout(() => el.removeEventListener('click', suppressClick, { capture: true }), 0)
      }
    }

    // On `window`, not on the element, for the reason useLongPress's own doc
    // comment spells out: until capture is taken, a pointer that wanders off
    // the element stops delivering events to it entirely. Watching the element
    // was survivable only while the threshold was 4 px — the pointer was still
    // over the panel by the time it crossed. It is not survivable at 24: a
    // press on the Undo button, which sits 2 px from the panel's own left
    // edge, leaves the panel before it has travelled far enough to count, so
    // the drag never started *and* the pointerup that should have torn all
    // this down was never delivered either.
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    endDragRef.current = handleUp
  }, [onChange, clamp, threshold])

  return { onPointerDown }
}
