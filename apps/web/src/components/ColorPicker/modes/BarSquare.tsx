import { useRef } from 'react'
import { clamp } from 'lodash-es'

import { hsvToRgb, rgbToHex } from '../../../lib/color'
import type { ColorPickerModeProps } from './types'
import styles from './BarSquare.module.css'

/** Saturation/value square under a horizontal hue strip — the shape this
 *  picker has always had, and the default (#337).
 *
 *  Holds no color state of its own: HSV comes down from the picker shell,
 *  which owns it for a reason worth not rediscovering (RGB→HSV is lossy at
 *  s=0/v=0, so hue must survive a drag through gray). This file is only the
 *  geometry — where a pointer lands maps to which H/S/V. */
export function BarSquare({ hsv, onChange }: ColorPickerModeProps) {
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  // (#159) Both drag handlers below only ever cleaned up their own
  // pointermove/pointerup listeners on a real pointerup — never on
  // pointercancel, which a touch digitizer can send instead (palm
  // rejection, an OS gesture stealing the pointer mid-drag — the same class
  // of thing the tap-to-hide investigation already flagged as
  // device-dependent, "works on Samsung, not on a Surface"). Missing that
  // leaked the listener pair forever; the *next* pointerdown on the same
  // control then added a second pair on top of it, permanently accumulating
  // one more per interrupted gesture — plausible match for "the slider
  // stopped responding" (each stale pair still fires update() with the old
  // captured `hsv`/`onChange` closure, so held state fights the current
  // drag). pointercancel now runs the exact same cleanup as pointerup.
  const onSvDown = (e: React.PointerEvent) => {
    const el = svRef.current
    if (!el) return
    // Real-device pen/touch input can reject capture (same "context loss"
    // class PointerInput.ts/useViewport.ts's own setPointerCapture calls
    // already guard against, and the exact device-dependent flavor this
    // handler's own comment above already documents) — an unguarded throw
    // here used to abort before the listeners below were ever attached.
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

  const onHueDown = (e: React.PointerEvent) => {
    const el = hueRef.current
    if (!el) return
    // See onSvDown's own comment above — same guard, same reasoning.
    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    const update = (clientX: number) => {
      const rect = el.getBoundingClientRect()
      const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360
      onChange({ h, s: hsv.s, v: hsv.v })
    }
    update(e.clientX)
    const onMove = (ev: PointerEvent) => update(ev.clientX)
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }

  const pureHue = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }))

  return (
    <>
      <div
        ref={svRef}
        className={styles.svSquare}
        style={{ backgroundColor: pureHue }}
        onPointerDown={onSvDown}
      >
        <div
          className={styles.svThumb}
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div ref={hueRef} className={styles.hueStrip} onPointerDown={onHueDown}>
        <div className={styles.hueThumb} style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
    </>
  )
}
