import { useCallback, useRef, useState } from 'react'
import { clamp } from 'lodash-es'
import clsx from 'clsx'
import styles from './PrecisionSlider.module.css'

// Dragging the full track height only covers 1/sensitivityFactor() of the
// range — the rest requires dragging further than the visible track,
// trading travel distance for precision (same idea as Photoshop/Blender
// numeric drag fields). The factor itself scales with the finger's
// instantaneous speed (#105): a slow,
// deliberate drag stays at PRECISE_FACTOR (the old fixed behavior); a fast
// flick relaxes toward FAST_FACTOR (≈1:1 — the track covers the full range)
// so the thumb doesn't visibly lag behind the finger, trading precision for
// responsiveness exactly when the user isn't trying to be precise anyway.
const PRECISE_FACTOR = 3
const FAST_FACTOR = 1
// Smoothed speed (px/ms) at/above which sensitivity is fully relaxed to
// FAST_FACTOR. ~1200px/s — comfortably above a deliberate slow drag, well
// below a fast flick.
const SPEED_FAST_PX_MS = 1.2
// EMA smoothing for the per-move speed sample — a single pointermove's
// instantaneous px/dt is noisy (coalesced-event timing jitter), so sensitivity
// reacts to a smoothed trend instead of snapping per-event (see handleMove).
const SPEED_SMOOTHING = 0.35

function sensitivityFactor(speedPxMs: number): number {
  const t = clamp(speedPxMs / SPEED_FAST_PX_MS, 0, 1)
  return PRECISE_FACTOR + t * (FAST_FACTOR - PRECISE_FACTOR)
}

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
  // `value`/`lastY`/`lastT` drive the incremental (per-move-delta) accumulation
  // that lets sensitivity vary mid-drag (#105) — unlike a pure function of
  // total displacement from drag start, this has to carry state forward move
  // by move. `value` is the unrounded running total (roundToStep only applied
  // when calling onChange/showBubble) so per-step rounding never accumulates
  // drift. `speed` is the EMA-smoothed px/ms driving sensitivityFactor().
  const dragRef = useRef<{ lastY: number; lastT: number; value: number; speed: number } | null>(null)
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null)

  const roundToStep = useCallback((v: number) => Math.round(v / step) * step, [step])

  const showBubble = useCallback((clientX: number, clientY: number, v: number) => {
    setBubble({ x: clientX, y: clientY, text: formatValue ? formatValue(v) : String(v) })
  }, [formatValue])

  // No tap-to-position jump (deliberately removed — see #105 follow-up):
  // a bare touch-down with no real movement must never change the value, so
  // a stray palm/hand brush against the toolbar while drawing (reported on
  // real hardware — left-handed drawing puts the drawing hand right next to
  // it) can't do anything. The drag baseline is the slider's *current* value,
  // not the tapped position — only real movement (handleMove below) ever
  // changes anything.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)

    dragRef.current = { lastY: e.clientY, lastT: performance.now(), value, speed: 0 }
    if (e.pointerType === 'touch') showBubble(e.clientX, e.clientY, roundToStep(value))

    const handleMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const now = performance.now()
      const dt = Math.max(1, now - drag.lastT) // guard div-by-zero on same-ms coalesced events
      const dy = drag.lastY - ev.clientY
      const instantSpeed = Math.abs(dy) / dt
      const speed = drag.speed + (instantSpeed - drag.speed) * SPEED_SMOOTHING
      const factor = sensitivityFactor(speed)

      const rawValue = clamp(drag.value + dy * (max - min) / (trackHeight * factor), min, max)
      drag.lastY = ev.clientY
      drag.lastT = now
      drag.value = rawValue
      drag.speed = speed

      const next = roundToStep(rawValue)
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
  }, [value, onChange, min, max, trackHeight, roundToStep, showBubble])

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
