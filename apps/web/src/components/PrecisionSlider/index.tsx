import { useCallback, useRef, useState } from 'react'
import { clamp } from 'lodash-es'
import clsx from 'clsx'
import styles from './PrecisionSlider.module.css'

// Beyond the initial tap-to-position jump, dragging the full track height
// again only covers 1/OVERDRAG_FACTOR of the range — the rest requires
// dragging further than the visible track, trading travel distance for
// precision (same idea as Photoshop/Blender numeric drag fields).
const OVERDRAG_FACTOR = 3

interface PrecisionSliderProps {
  value: number
  min: number
  max: number
  step?: number
  /** Height of the track in px — vertical orientation only (matches the
   *  toolbar's existing vertical-slider layout). */
  trackHeight: number
  onChange: (value: number) => void
  /** Formats the value shown in the touch-drag bubble; defaults to String(value). */
  formatValue?: (value: number) => string
  title?: string
  className?: string
}

export function PrecisionSlider({
  value, min, max, step = 1, trackHeight, onChange, formatValue, title, className,
}: PrecisionSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef  = useRef<{ startY: number; startValue: number } | null>(null)
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null)

  const roundToStep = useCallback((v: number) => Math.round(v / step) * step, [step])

  const valueFromClientY = useCallback((clientY: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    const proportion = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
    return roundToStep(min + proportion * (max - min))
  }, [min, max, roundToStep])

  const showBubble = useCallback((clientX: number, clientY: number, v: number) => {
    setBubble({ x: clientX, y: clientY, text: formatValue ? formatValue(v) : String(v) })
  }, [formatValue])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    const startValue = valueFromClientY(e.clientY)
    dragRef.current = { startY: e.clientY, startValue }
    onChange(startValue)
    if (e.pointerType === 'touch') showBubble(e.clientX, e.clientY, startValue)

    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dy = drag.startY - ev.clientY
      const next = roundToStep(clamp(
        drag.startValue + dy * (max - min) / (trackHeight * OVERDRAG_FACTOR),
        min, max,
      ))
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
  }, [valueFromClientY, onChange, min, max, trackHeight, roundToStep, showBubble])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const big = e.key === 'PageUp' || e.key === 'PageDown'
    if (e.key === 'ArrowUp' || e.key === 'PageUp')     { onChange(clamp(value + step * (big ? 10 : 1), min, max)); e.preventDefault() }
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') { onChange(clamp(value - step * (big ? 10 : 1), min, max)); e.preventDefault() }
    else if (e.key === 'Home') { onChange(min); e.preventDefault() }
    else if (e.key === 'End')  { onChange(max); e.preventDefault() }
  }, [value, min, max, step, onChange])

  const proportion = clamp((value - min) / (max - min || 1), 0, 1)

  return (
    <div
      ref={trackRef}
      className={clsx(styles.track, className)}
      style={{ height: trackHeight }}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      title={title}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <div className={styles.fill} style={{ height: `${proportion * 100}%` }} />
      <div className={styles.thumb} style={{ bottom: `${proportion * 100}%` }} />
      {bubble && (
        <div className={styles.bubble} style={{ left: bubble.x, top: bubble.y }}>
          {bubble.text}
        </div>
      )}
    </div>
  )
}
