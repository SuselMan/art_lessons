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
}

/** Press-and-drag-vertically gesture to adjust a numeric value — up
 *  increases, down decreases. Returns a pointerdown handler to spread onto
 *  any element; a plain click/tap on that same element still fires normally
 *  (the synthetic click that follows an actual drag is suppressed, but only
 *  once real movement past `threshold` happened). */
export function useDragToAdjust(
  value: number,
  onChange: (value: number) => void,
  { min, max, sensitivity, threshold = TAP_MOVE_THRESHOLD_PX }: DragToAdjustOptions,
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
      onChange(clamp(startValue + dy * sensitivity, min, max))
    }
    const handleUp = () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }

    el.setPointerCapture(e.pointerId)
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
  }, [min, max, sensitivity, threshold, onChange])

  return { onPointerDown }
}
