import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from 'lodash-es'
import { rgbToHsv, hsvToRgb, rgbToHex, hexToRgb, type Hsv } from '../../lib/color'
import styles from './ColorPicker.module.css'

interface ColorPickerProps {
  value: [number, number, number]
  onChange: (rgb: [number, number, number]) => void
}

// Saturation/value square + hue strip, the standard shape for an inline
// (non-native-popup) picker. HSV is kept as this component's own local
// state rather than re-derived from `value` on every render: RGB→HSV is
// lossy at s=0 or v=0 (hue is undefined there), which would otherwise snap
// hue back to 0 mid-drag whenever the color passes through gray or black.
// `lastEmitted` distinguishes "value changed because we just called
// onChange" (ignore, our hsv is already current) from "value changed for
// some other reason, e.g. eyedropper or hex input" (resync hsv from it).
// Wrapped in memo (#127): Room re-renders far more often than `value`/
// `onChange` actually change (e.g. every pointermove while panning, #126).
// Safe because Room passes its `color` state and setColor (a setState
// setter, stable by React's own guarantee) — see Room/index.tsx.
export const ColorPicker = memo(function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(value))
  // Own local text buffer rather than a fully controlled `rgbToHex(value)`:
  // otherwise every keystroke on an incomplete hex (e.g. "#12") would get
  // immediately overwritten back to the last valid color, since an invalid
  // partial never reaches onChange/value.
  const [hexText, setHexText] = useState(() => rgbToHex(value))
  const lastEmitted = useRef<[number, number, number]>(value)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setHsv(rgbToHsv(value))
      setHexText(rgbToHex(value))
    }
  }, [value])

  const emit = useCallback((next: Hsv) => {
    setHsv(next)
    const rgb = hsvToRgb(next)
    lastEmitted.current = rgb
    setHexText(rgbToHex(rgb))
    onChange(rgb)
  }, [onChange])

  const svRef  = useRef<HTMLDivElement>(null)
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
  // captured `hsv`/`emit` closure, so held state fights the current drag).
  // pointercancel now runs the exact same cleanup as pointerup.
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
      emit({ h: hsv.h, s, v })
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
      emit({ h, s: hsv.s, v: hsv.v })
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
    <div className={styles.picker}>
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

      <div className={styles.swatchRow}>
        <div className={styles.currentSwatch} style={{ background: rgbToHex(value) }} />
        <input
          className={styles.hexInput}
          value={hexText}
          onChange={e => {
            const text = e.target.value
            setHexText(text)
            if (/^#[0-9a-fA-F]{6}$/.test(text)) {
              const rgb = hexToRgb(text)
              lastEmitted.current = rgb
              setHsv(rgbToHsv(rgb))
              onChange(rgb)
            }
          }}
        />
      </div>
    </div>
  )
})
