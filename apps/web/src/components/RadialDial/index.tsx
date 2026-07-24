import { useCallback, useRef, useState } from 'react'
import clsx from 'clsx'

import { getFeatureFlag } from '../../lib/featureFlags'
import { InterfaceClick } from '../../lib/InterfaceClick'
import { angleToCompassDegrees, roundToStep, wholeUnitsCrossed, wrapDegrees, wrapValue, type Point } from './radialDialMath'
import styles from './RadialDial.module.css'

export interface RadialDialProps {
  /** The anchor this dial orbits (e.g. FloatingToolPanel's own measured
   *  center) — same coordinate space as the container both are rendered
   *  in. */
  center: Point
  /** Radius (px from center) the visible handle dot sits at while idle. */
  handleRadius: number
  /** Outer edge of the pointer hit-region, px from center — the hit region
   *  itself is a plain filled disc out to this radius (RadialDial.module.css's
   *  .hitRing), not an annulus this component carves out itself. The
   *  exclusion of the anchor's own footprint (so its buttons/drag stay
   *  reachable) comes entirely from stacking order: the anchor is expected
   *  to render at a *higher* z-index than .hitRing (z-index 4), so its own
   *  opaque body naturally "shadows" that inner area from ever receiving a
   *  pointerdown here — the same z-index-shadowing trick FloatingToolPanel
   *  itself already uses for its color-flyout backdrop. This component
   *  never needs to know the anchor's own radius as a value. */
  hitOuterRadius: number
  /** Current value, in the same units as min/max (degrees for an angle). */
  value: number
  /** Circular domain bounds — wraps at max back to min. Default 0/360 (a
   *  full-circle angle). */
  min?: number
  max?: number
  /** Minimum step the value snaps to. Default 1/60 (one arc-minute) — #276's
   *  own spec for the brush-angle use case; pass a coarser step for a
   *  future non-angle reuse. */
  step?: number
  onChange: (value: number) => void
  /** Formats the value shown in the center readout while dragging. Defaults
   *  to one decimal place. */
  formatValue?: (value: number) => string
  /** Size (px, square) of the center readout overlay shown during a drag —
   *  should roughly match the anchor's own footprint (e.g.
   *  FloatingToolPanel's PANEL_SIZE) so it visually replaces the anchor's
   *  normal content rather than looking like an unrelated popup. */
  readoutSize: number
  /** One real-world degree, in this dial's own value units — e.g. 1 for a
   *  plain 0-360 angle. Drives the per-degree click callback below; pass
   *  Infinity (or omit onWholeUnitCrossed) to disable clicking entirely for
   *  a future reuse where "one per degree" doesn't make sense. */
  wholeUnit?: number
  title?: string
  className?: string
}

const DEFAULT_MIN = 0
const DEFAULT_MAX = 360
const DEFAULT_STEP = 1 / 60
const DEFAULT_WHOLE_UNIT = 1

/** Reusable radial value picker orbiting a floating anchor (#277) — first
 *  built for the marker's chisel-nib angle (#278), but generic: any
 *  circular quantity (rotation, hue, a compass bearing) can reuse it later
 *  (#276 point 7) by supplying different min/max/step/formatValue.
 *
 *  Interaction (per #276's spec): a pointerdown anywhere in the hit
 *  annulus — not just on the visible handle dot — jumps the value straight
 *  to that point's angle, then continuing to move the same pointer keeps
 *  rotating it; no separate "grab the handle first" step. This is the
 *  opposite of PrecisionSlider's own deliberate no-tap-jump rule (#105
 *  follow-up, guarding against an accidental palm brush while drawing) —
 *  a real tradeoff, not an oversight: PrecisionSlider lives inline in the
 *  toolbar's drawing-adjacent quick-access column, while this dial's hit
 *  region is a ring *outside* the anchor's own footprint that only exists
 *  at all while a tool with an angle control is active, and only accepts
 *  pointers landing in that specific annulus — different enough real
 *  estate that the same guard didn't make sense to copy here. */
export function RadialDial({
  center, handleRadius, hitOuterRadius, value, min = DEFAULT_MIN, max = DEFAULT_MAX,
  step = DEFAULT_STEP, onChange, formatValue, readoutSize, wholeUnit = DEFAULT_WHOLE_UNIT, title, className,
}: RadialDialProps) {
  const [dragging, setDragging] = useState(false)
  const range = max - min
  const clickRef = useRef<InterfaceClick | null>(null)

  const valueToCompass = useCallback((v: number) => wrapDegrees(((v - min) / range) * 360), [min, range])
  const compassToValue = useCallback((deg: number) => min + (wrapDegrees(deg) / 360) * range, [min, range])

  const applyPointer = useCallback((clientX: number, clientY: number, prevValue: number): number => {
    const compass = angleToCompassDegrees(center, { x: clientX, y: clientY })
    const rawValue = compassToValue(compass) // already within [min, min+range) — compass is 0..360
    const next = wrapValue(min + roundToStep(rawValue - min, step), min, range)

    if (getFeatureFlag('interfaceSound')) {
      const prevCompass = valueToCompass(prevValue)
      const nextCompass = valueToCompass(next)
      const crossed = wholeUnitsCrossed(prevCompass, nextCompass, wholeUnit * (360 / range))
      // One play() per pointer *event* that crossed at least one boundary,
      // not one per boundary crossed — a fast drag can cross a dozen+
      // degrees in a single event, and firing that many clicks all at the
      // same instant is exactly what reads as a buzz rather than discrete
      // ticks (Ilya: "гудит как счётчик Гейгера"). InterfaceClick.play()
      // itself also rate-limits (see its own doc comment), so a fast
      // continuous spin still can't fire faster than that cap regardless of
      // how many pointermove events arrive.
      if (Math.abs(crossed) > 0) {
        if (!clickRef.current) clickRef.current = new InterfaceClick()
        clickRef.current.play()
      }
    }
    return next
  }, [center, compassToValue, min, range, step, valueToCompass, wholeUnit])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget
    // Real-device pen/touch input can reject capture (same "context loss"
    // class of failure PointerInput.ts/useViewport.ts's own setPointerCapture
    // calls already guard against) — capture is a nice-to-have (keeps
    // tracking if the pointer strays outside the ring mid-drag), not a
    // precondition for the interaction itself. An unguarded throw here used
    // to abort this whole handler before the tap-jump/listeners below ever
    // ran, silently breaking the dial entirely on whatever device threw.
    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    setDragging(true)

    let currentValue = applyPointer(e.clientX, e.clientY, value)
    onChange(currentValue)

    const handleMove = (ev: PointerEvent) => {
      const next = applyPointer(ev.clientX, ev.clientY, currentValue)
      currentValue = next
      onChange(next)
    }
    const handleUp = () => {
      setDragging(false)
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleUp)
      el.removeEventListener('pointercancel', handleUp)
      try { el.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    }
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleUp)
    el.addEventListener('pointercancel', handleUp)
  }, [applyPointer, onChange, value])

  const handleCompass = valueToCompass(value)
  const handleRad = ((handleCompass - 90) * Math.PI) / 180
  const handleX = center.x + Math.cos(handleRad) * handleRadius
  const handleY = center.y + Math.sin(handleRad) * handleRadius

  const displayValue = formatValue ? formatValue(value) : value.toFixed(1)

  return (
    <>
      <div
        className={clsx(styles.hitRing, className)}
        style={{
          left: center.x - hitOuterRadius, top: center.y - hitOuterRadius,
          width: hitOuterRadius * 2, height: hitOuterRadius * 2,
        }}
        onPointerDown={onPointerDown}
        title={title}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
      <div
        className={styles.handle}
        style={{ left: handleX, top: handleY }}
      />
      {dragging && (
        <div
          className={styles.readout}
          style={{
            left: center.x - readoutSize / 2, top: center.y - readoutSize / 2,
            width: readoutSize, height: readoutSize,
          }}
        >
          {displayValue}
        </div>
      )}
    </>
  )
}
