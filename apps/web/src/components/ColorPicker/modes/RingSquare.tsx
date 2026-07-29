import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { SvSquare } from './SvSquare'
import { hueFromPoint, inscribedSquareSide, isInRing, pointForHue } from './ringGeometry'
import type { ColorPickerModeProps } from './types'
import styles from './RingSquare.module.css'

/** Thickness of the hue band and the gap between it and the square, in CSS
 *  pixels. Small enough that the square keeps most of the width — the square
 *  is where the slow, precise work happens; the ring is a coarse throw. */
const BAND = 16
const GAP = 6

/** Hue ring with the saturation/value square inside it (#340) — the shape
 *  Krita, Clip Studio, Blender and Procreate all use, and the most common
 *  thing to miss coming from any of them.
 *
 *  The ring is drawn on a canvas rather than with `conic-gradient` + a mask,
 *  even though CSS would manage this one: the triangle mode (#341) cannot be
 *  drawn in CSS at all, and one drawing path for both round modes beats two.
 *  It is repainted only when its size changes — hue moves the thumb, not the
 *  picture. */
export function RingSquare({ hsv, onChange }: ColorPickerModeProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)

  // Measured rather than hard-coded to match a width in the stylesheet: the
  // panel is going to be laid out differently on a tablet and on a PC (#173),
  // and a number duplicated across a .ts and a .css file is the kind that
  // silently stops matching.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setSize(el.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const outer = size / 2
  const inner = Math.max(0, outer - BAND)
  const squareSide = inscribedSquareSide(Math.max(0, inner - GAP))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return
    // Real pixels, not CSS pixels: a ring drawn at 1x and scaled up by the
    // browser is visibly soft on a tablet — the same devicePixelRatio blind
    // spot #154 describes for the infinite canvas.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    const mid = (outer + inner) / 2
    ctx.lineWidth = BAND
    // One wedge per degree, each drawn a little wider than its slice so the
    // seams between them close up.
    for (let deg = 0; deg < 360; deg++) {
      const start = ((deg - 90) * Math.PI) / 180
      const end = ((deg - 90 + 1.5) * Math.PI) / 180
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`
      ctx.beginPath()
      ctx.arc(outer, outer, mid, start, end)
      ctx.stroke()
    }
  }, [size, outer, inner])

  // See SvSquare's own handler for why pointercancel is cleaned up alongside
  // pointerup (#159) and why setPointerCapture is guarded.
  const onRingDown = (e: React.PointerEvent) => {
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const center = { x: rect.width / 2, y: rect.height / 2 }
    const local = (clientX: number, clientY: number) => ({
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
    // The canvas covers the corners too, and a corner is not the ring —
    // without this, a tap on dead space next to the band would throw the hue
    // somewhere the person never pointed at.
    if (!isInRing(center, local(e.clientX, e.clientY), inner, outer)) return

    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    const update = (clientX: number, clientY: number) => {
      onChange({ h: hueFromPoint(center, local(clientX, clientY)), s: hsv.s, v: hsv.v })
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

  const thumb = pointForHue({ x: outer, y: outer }, (outer + inner) / 2, hsv.h)

  return (
    <div ref={boxRef} className={styles.box} onPointerDown={onRingDown}>
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: size, height: size }} />

      {size > 0 && (
        <div className={styles.ringThumb} style={{ left: thumb.x, top: thumb.y }} />
      )}

      <SvSquare
        hsv={hsv}
        onChange={onChange}
        style={{
          position: 'absolute',
          width: squareSide,
          height: squareSide,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
