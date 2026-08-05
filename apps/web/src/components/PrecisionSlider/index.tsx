import { useCallback, useRef, useState } from 'react'
import { clamp } from 'lodash-es'
import clsx from 'clsx'
import { advancePosition, distanceOutside, roundToStep } from './precisionSlider'
import { linearScale, type SliderScale } from './sliderScale'
import styles from './PrecisionSlider.module.css'

interface PrecisionSliderProps {
  value: number
  min: number
  max: number
  step?: number
  /** 'vertical' (default): drag up increases — matches the toolbar's narrow
   *  quick-access column. 'horizontal': drag right increases — matches the
   *  wider "Tool settings" panel rows. */
  orientation?: 'vertical' | 'horizontal'
  /** (#390) How value maps onto track position; linear unless the field says
   *  otherwise (px sizes are exponential — see sliderScale.ts). The component
   *  never inspects which one it got. */
  scale?: SliderScale
  /** Track length in px along its sliding axis (height for vertical, width
   *  for horizontal) — sets the element's CSS size. Optional: omit to let
   *  CSS/flex layout size it (e.g. a panel row filling available width).
   *  The drag math always measures the actual rendered size at drag start,
   *  so this is a styling hint only, never a correctness requirement. */
  trackSize?: number
  onChange: (value: number) => void
  /** Formats the value shown in the touch-drag bubble; defaults to String(value). */
  formatValue?: (value: number) => string
  title?: string
  className?: string
}

export function PrecisionSlider({
  value, min, max, step = 1, orientation = 'vertical', scale = linearScale,
  trackSize, onChange, formatValue, title, className,
}: PrecisionSliderProps) {
  // `position` is the unrounded normalized (0..1) running total the drag
  // accumulates into — see advancePosition for why the drag has to carry
  // state forward move by move instead of being a pure function of total
  // displacement. `last` is the previous pointer coordinate along the track.
  // `length` and the `across*` bounds are the track's actual rendered
  // geometry, measured once at drag start (the element cannot move mid-drag,
  // and the pointer is captured to it).
  const dragRef = useRef<{
    last: number; position: number; length: number; acrossLo: number; acrossHi: number
  } | null>(null)
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null)

  const showBubble = useCallback((clientX: number, clientY: number, v: number) => {
    setBubble({ x: clientX, y: clientY, text: formatValue ? formatValue(v) : String(v) })
  }, [formatValue])

  // No tap-to-position jump (deliberately removed — see #105 follow-up, and
  // reaffirmed as a hard constraint on #390's new mechanic): a bare touch-down
  // with no real movement must never change the value, so a stray palm/hand
  // brush against the toolbar while drawing (reported on real hardware —
  // left-handed drawing puts the drawing hand right next to it) can't do
  // anything. The drag baseline is the slider's *current* value, not the
  // tapped position — only real movement (handleMove below) ever changes
  // anything.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    // Real-device pen/touch input can reject capture (same "context loss"
    // class PointerInput.ts/useViewport.ts's own setPointerCapture calls
    // already guard against) — an unguarded throw here used to abort this
    // whole handler before dragRef/the listeners below were ever set up,
    // silently breaking every drag on whatever device threw. Capture also
    // carries the perpendicular half of the new gesture: the pointer is meant
    // to leave the element entirely and must keep reporting once it does.
    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }

    const rect = el.getBoundingClientRect()
    const vertical = orientation === 'vertical'
    dragRef.current = {
      last: vertical ? e.clientY : e.clientX,
      position: clamp(scale.toPosition(value, min, max), 0, 1),
      length: vertical ? rect.height : rect.width,
      acrossLo: vertical ? rect.left : rect.top,
      acrossHi: vertical ? rect.right : rect.bottom,
    }
    if (e.pointerType === 'touch') showBubble(e.clientX, e.clientY, roundToStep(value, step, min, max))

    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const along = vertical ? ev.clientY : ev.clientX
      const across = vertical ? ev.clientX : ev.clientY
      // Vertical: drag up (smaller clientY) increases value. Horizontal:
      // drag right (larger clientX) increases value.
      const delta = vertical ? drag.last - along : along - drag.last
      const offset = distanceOutside(across, drag.acrossLo, drag.acrossHi)

      drag.position = advancePosition(drag.position, delta, offset, drag.length)
      drag.last = along

      // The bubble reports the value and nothing else — deliberately no "×4"
      // precision readout (#390, decided). Precision is felt through the
      // thumb, and a second number in a bubble already floating over the
      // drawing costs more attention than it returns.
      const next = roundToStep(scale.fromPosition(drag.position, min, max), step, min, max)
      onChange(next)
      if (ev.pointerType === 'touch') showBubble(ev.clientX, ev.clientY, next)
    }
    const handleUp = () => {
      dragRef.current = null
      setBubble(null)
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
  }, [value, onChange, min, max, step, orientation, scale, showBubble])

  // Keyboard stays additive in the field's own units on every scale: an arrow
  // key is a numeric increment ("one more px"), not a fixed slice of track
  // travel, and making it scale-aware would leave Arrow-Up's effect depending
  // on where the value already sits.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const big = e.key === 'PageUp' || e.key === 'PageDown'
    const incKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowRight'
    const decKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowLeft'
    if (e.key === incKey || e.key === 'PageUp')     { onChange(clamp(value + step * (big ? 10 : 1), min, max)); e.preventDefault() }
    else if (e.key === decKey || e.key === 'PageDown') { onChange(clamp(value - step * (big ? 10 : 1), min, max)); e.preventDefault() }
    else if (e.key === 'Home') { onChange(min); e.preventDefault() }
    else if (e.key === 'End')  { onChange(max); e.preventDefault() }
  }, [value, min, max, step, onChange, orientation])

  const proportion = clamp(scale.toPosition(value, min, max), 0, 1)
  const orientationClass = orientation === 'horizontal' ? styles.trackHorizontal : styles.trackVertical
  const sizeStyle = trackSize == null ? undefined : (orientation === 'vertical' ? { height: trackSize } : { width: trackSize })

  return (
    <div
      className={clsx(styles.track, orientationClass, className)}
      style={sizeStyle}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-orientation={orientation}
      title={title}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div
        className={styles.fill}
        style={orientation === 'vertical' ? { height: `${proportion * 100}%` } : { width: `${proportion * 100}%` }}
      />
      <div
        className={styles.thumb}
        style={orientation === 'vertical' ? { bottom: `${proportion * 100}%` } : { left: `${proportion * 100}%` }}
      />
      {bubble && (
        <div className={styles.bubble} style={{ left: bubble.x, top: bubble.y }}>
          {bubble.text}
        </div>
      )}
    </div>
  )
}
