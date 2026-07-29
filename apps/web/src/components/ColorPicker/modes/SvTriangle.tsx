import { useEffect, useMemo, useRef } from 'react'

import { hsvToRgb } from '../../../lib/color'
import {
  barycentric,
  clampToTriangle,
  pointForSv,
  svFromWeights,
  triangleCorners,
} from './triangleGeometry'
import type { ColorPickerModeProps } from './types'
import styles from './SvTriangle.module.css'

interface SvTriangleProps extends ColorPickerModeProps {
  /** Radius of the circle the triangle's corners sit on. */
  radius: number
}

/** The saturation/value triangle that goes inside the hue ring (#341).
 *
 *  Painted pixel by pixel, because a barycentric blend of three corners is not
 *  something CSS has a primitive for. The two corner weights that decide the
 *  color depend only on the geometry, so they are computed once per size and
 *  reused — a hue change is then three multiply-adds per pixel, which keeps a
 *  drag around the ring smooth instead of recomputing the whole barycentric
 *  solve sixty times a second. The finished bitmap is masked by an actual
 *  triangle path so the edges come out antialiased rather than stair-stepped.
 *
 *  (An SVG version with three gradients and `mix-blend-mode: screen` is
 *  mathematically the same picture, but it rests on blend behaviour in mobile
 *  browsers, which is not something to bet a 140px widget on.) */
export function SvTriangle({ hsv, onChange, radius }: SvTriangleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = radius * 2
  const corners = useMemo(
    () => triangleCorners({ x: radius, y: radius }, radius),
    [radius],
  )

  // Per-pixel corner weights, in device pixels. Independent of hue — only the
  // shape moves them — so they survive every repaint that a drag causes.
  const weights = useMemo(() => {
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(size * dpr))
    const hueW = new Float32Array(w * w)
    const whiteW = new Float32Array(w * w)
    for (let py = 0; py < w; py++) {
      for (let px = 0; px < w; px++) {
        // +0.5 samples the middle of the pixel, not its corner.
        const p = { x: (px + 0.5) / dpr, y: (py + 0.5) / dpr }
        const [wHue, wWhite] = barycentric(p, corners)
        const i = py * w + px
        hueW[i] = wHue
        whiteW[i] = wWhite
      }
    }
    return { dpr, w, hueW, whiteW }
  }, [size, corners])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size <= 0) return
    const { dpr, w, hueW, whiteW } = weights
    canvas.width = w
    canvas.height = w
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const [hr, hg, hb] = hsvToRgb({ h: hsv.h, s: 1, v: 1 })
    const image = ctx.createImageData(w, w)
    const data = image.data
    for (let i = 0; i < w * w; i++) {
      const a = hueW[i]
      const b = whiteW[i]
      const o = i * 4
      data[o] = (a * hr + b) * 255
      data[o + 1] = (a * hg + b) * 255
      data[o + 2] = (a * hb + b) * 255
      data[o + 3] = 255
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.putImageData(image, 0, 0)

    // Keep only what is inside the triangle. Done as a mask rather than by
    // leaving outside pixels transparent in the loop above, because a path
    // gives an antialiased edge and a per-pixel test gives a jagged one.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.moveTo(corners.hue.x, corners.hue.y)
    ctx.lineTo(corners.white.x, corners.white.y)
    ctx.lineTo(corners.black.x, corners.black.y)
    ctx.closePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }, [hsv.h, size, corners, weights])

  // See SvSquare's own handler for why pointercancel is cleaned up alongside
  // pointerup (#159) and why setPointerCapture is guarded.
  const onDown = (e: React.PointerEvent) => {
    const el = canvasRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const inside = barycentric(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      corners,
    ).every(v => v >= 0)
    // Outside the shape but inside its bounding box is dead space, and the
    // ring behind it is not what was aimed at either — let the press do
    // nothing rather than pull the thumb to a corner nobody pointed at.
    if (!inside) return

    try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    const update = (clientX: number, clientY: number) => {
      const box = el.getBoundingClientRect()
      const p = clampToTriangle({ x: clientX - box.left, y: clientY - box.top }, corners)
      const { s, v } = svFromWeights(barycentric(p, corners))
      onChange({ h: hsv.h, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) })
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

  const thumb = pointForSv(hsv.s, hsv.v, corners)

  return (
    <div className={styles.box} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: size, height: size }}
        onPointerDown={onDown}
      />
      <div className={styles.thumb} style={{ left: thumb.x, top: thumb.y }} />
    </div>
  )
}
