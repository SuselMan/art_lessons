import { useRef, type CSSProperties } from 'react'
import { clamp } from 'lodash-es'

import { hsvToRgb, rgbToHex } from '../../../lib/color'
import type { ColorPickerModeProps } from './types'
import styles from './SvSquare.module.css'

interface SvSquareProps extends ColorPickerModeProps {
  /** Layout only — every mode places this square differently (a wide block
   *  under a strip, a small one inside a ring), but what happens inside it is
   *  the same everywhere. */
  style?: CSSProperties
}

/** Saturation across, value up: the one surface every picker mode has in
 *  common (#340), so it lives on its own rather than being copied per mode.
 *  Hue is not its business — it only paints itself in whatever hue it is
 *  given, and reports back the S/V a pointer lands on. */
export function SvSquare({ hsv, onChange, style }: SvSquareProps) {
  const ref = useRef<HTMLDivElement>(null)

  // (#159) The drag handler cleans up on pointercancel as well as pointerup:
  // a touch digitizer can send cancel instead (palm rejection, an OS gesture
  // stealing the pointer mid-drag — device-dependent, "works on Samsung, not
  // on a Surface"). Missing that leaked the listener pair forever, and the
  // *next* pointerdown added a second pair on top, permanently accumulating
  // one per interrupted gesture — a plausible match for "the slider stopped
  // responding", since every stale pair keeps firing with its own captured
  // hsv/onChange closure and fights the current drag.
  const onDown = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    // Real-device pen/touch input can reject capture (the same "context loss"
    // class PointerInput.ts and useViewport.ts already guard their own
    // setPointerCapture calls against) — an unguarded throw here used to abort
    // before the listeners below were ever attached.
    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    const update = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
      onChange({ h: hsv.h, s, v })
    }
    update(e.clientX, e.clientY)
    const onMove = (ev: PointerEvent) => update(ev.clientX, ev.clientY)
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      ref={ref}
      className={styles.square}
      style={{ ...style, backgroundColor: rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 })) }}
      onPointerDown={onDown}
    >
      <div
        className={styles.thumb}
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  )
}
