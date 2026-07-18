import { useCallback, useRef } from 'react'

import { TAP_MOVE_THRESHOLD_PX } from './tapThreshold'

interface Point { x: number; y: number }

interface DraggablePositionOptions {
  onChange: (position: Point) => void
  /** Applied to every candidate position before onChange fires — e.g.
   *  clampPanelPosition, to keep the dragged element inside its container. */
  clamp?: (position: Point) => Point
  /** Pixels of movement before a pointerdown counts as a drag rather than a
   *  click reaching whatever's under the pointer (e.g. a tool button). */
  threshold?: number
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
 *  normally, same as if this handler weren't here at all. */
export function useDraggablePosition(
  position: Point,
  { onChange, clamp, threshold = TAP_MOVE_THRESHOLD_PX }: DraggablePositionOptions,
) {
  const posRef = useRef(position)
  posRef.current = position

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    const pointerId = e.pointerId
    const startX = e.clientX, startY = e.clientY
    const startPos = posRef.current
    let dragging = false

    const suppressClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation() }

    const handleMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < threshold) return
        dragging = true
        // Only now — confirmed a real drag, not a click — take pointer
        // capture (so it keeps tracking smoothly even if the pointer
        // leaves the panel's own bounds) and arm the click-suppressor
        // (so the synthetic click this same gesture ends with doesn't
        // also register as a tap on whatever's under the pointer).
        el.setPointerCapture(pointerId)
        el.addEventListener('click', suppressClick, { capture: true, once: true })
      }
      const next = { x: startPos.x + dx, y: startPos.y + dy }
      onChange(clamp ? clamp(next) : next)
    }
    const handleUp = () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
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

    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
  }, [onChange, clamp, threshold])

  return { onPointerDown }
}
