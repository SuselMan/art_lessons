import { useCallback, useRef } from 'react'
import { clamp } from 'lodash-es'

import { TAP_MOVE_THRESHOLD_PX } from './tapThreshold'

interface DragToAdjustOptions {
  min: number
  max: number
  /** Value change per pixel of vertical drag. */
  sensitivity: number
  /** Pixels of movement before a pointerdown counts as a drag rather than a click. */
  threshold?: number
  /** (#329) For cyclic values: instead of stopping at the ends, walk past
   *  `max` and come back in at `min`. Canvas rotation is the case this exists
   *  for — clamping it would wall the drag at half a turn, which is exactly
   *  where someone rotating a sheet of paper does *not* expect to be stopped.
   *  Half-open range: `max` itself is never produced, it *is* `min`. */
  wrap?: boolean
}

/** Press-and-drag-vertically gesture to adjust a numeric value — up
 *  increases, down decreases. Returns a pointerdown handler to spread onto
 *  any element; a plain click/tap on that same element still fires normally
 *  (the synthetic click that follows an actual drag is suppressed, but only
 *  once real movement past `threshold` happened). */
export function useDragToAdjust(
  value: number,
  onChange: (value: number) => void,
  { min, max, sensitivity, threshold = TAP_MOVE_THRESHOLD_PX, wrap = false }: DragToAdjustOptions,
) {
  const valueRef = useRef(value)
  valueRef.current = value

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    const startY = e.clientY
    const startValue = valueRef.current
    let dragging = false

    const suppressClick = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation() }

    const handleMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY
      if (!dragging) {
        if (Math.abs(dy) < threshold) return
        dragging = true
        el.addEventListener('click', suppressClick, { capture: true, once: true })
      }
      const next = startValue + dy * sensitivity
      onChange(wrap ? wrapInto(next, min, max) : clamp(next, min, max))
    }
    const handleUp = () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }

    // Real-device pen/touch input can reject capture (same "context loss"
    // class PointerInput.ts/useViewport.ts's own setPointerCapture calls
    // already guard against) — an unguarded throw here used to abort before
    // the listeners below were ever attached, silently breaking the drag.
    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
  }, [min, max, sensitivity, threshold, wrap, onChange])

  return { onPointerDown }
}

/** Folds `v` into the half-open range [min, max). Written with a double
 *  modulo because JS `%` keeps the sign of the dividend, so a single one
 *  returns a negative result for a value below `min` — which is precisely the
 *  case here (dragging down past zero). */
export function wrapInto(v: number, min: number, max: number): number {
  const span = max - min
  if (span <= 0) return min
  return min + (((v - min) % span) + span) % span
}
