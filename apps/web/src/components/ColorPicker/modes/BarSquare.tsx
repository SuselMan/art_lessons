import { useRef } from 'react'
import { clamp } from 'lodash-es'

import { SvSquare } from './SvSquare'
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
  const hueRef = useRef<HTMLDivElement>(null)

  // See SvSquare's own handler for why pointercancel is cleaned up alongside
  // pointerup (#159), and why setPointerCapture is guarded — same reasoning,
  // same failure mode.
  const onHueDown = (e: React.PointerEvent) => {
    const el = hueRef.current
    if (!el) return
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

  return (
    <>
      <SvSquare hsv={hsv} onChange={onChange} style={{ width: '100%', height: 140 }} />

      <div ref={hueRef} className={styles.hueStrip} onPointerDown={onHueDown}>
        <div className={styles.hueThumb} style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
    </>
  )
}
