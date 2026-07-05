import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import { clamp } from 'lodash-es'

export interface Viewport { cx: number; cy: number; zoom: number; angle: number }

interface CanvasSize { width: number; height: number }

export interface UseViewportResult {
  vp: Viewport
  setVp: Dispatch<SetStateAction<Viewport>>
  vpRef: RefObject<HTMLDivElement | null>
  fitCanvas: () => void
  angleDeg: number
  canvasTransform: string
}

/** `toolActive`: true while a one-shot canvas tool (eyedropper, measure — see
 *  Room's `toolActiveRef`) wants the *first* touch that lands on the canvas
 *  for itself, not panning. Checked directly in the native `onDown` handler
 *  below rather than relying on `e.stopPropagation()` from the tool's own
 *  React handler: this hook's pointer listeners are raw `addEventListener`
 *  calls on `.viewport`, an *ancestor* of the tool's overlay div in the real
 *  DOM, so they fire during native bubbling *before* React ever dispatches
 *  to the overlay's onPointerDown — by the time the tool's handler could
 *  call stopPropagation, panning has already started. Only the touch that
 *  arrives while nothing else is down gets reserved (and never enters
 *  `touchPtrs`, so pan/pinch logic never sees it) — a *second* finger
 *  landing while the first is reserved is treated as an ordinary single
 *  touch, i.e. it pans normally. This is what gives "first finger drives
 *  the tool, second finger pans" instead of one blocking the other. */
export function useViewport(canvas: CanvasSize | null, toolActive: RefObject<boolean>): UseViewportResult {
  const [vp, setVp] = useState<Viewport>({ cx: 0, cy: 0, zoom: 1, angle: 0 })

  const vpRef     = useRef<HTMLDivElement>(null)
  const vpState   = useRef<Viewport>(vp)
  const canvasRef = useRef<CanvasSize | null>(canvas)
  const touchPtrs = useRef(new Map<number, { x: number; y: number }>())
  const midPanRef = useRef<{ sx: number; sy: number; ocx: number; ocy: number } | null>(null)
  const reservedTouchId = useRef<number | null>(null)

  vpState.current   = vp
  canvasRef.current = canvas

  // Initial fit when canvas config loads
  useLayoutEffect(() => {
    if (!canvas || !vpRef.current) return
    const el   = vpRef.current
    const zoom = Math.min(el.clientWidth / canvas.width, el.clientHeight / canvas.height) * 0.88
    setVp({ cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom, angle: 0 })
  }, [canvas])

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = vpRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const d  = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY
      const f  = Math.pow(0.999, d)
      setVp(v => {
        const newZoom = clamp(v.zoom * f, 0.04, 20)
        const s = newZoom / v.zoom
        return { ...v, cx: mx + (v.cx - mx) * s, cy: my + (v.cy - my) * s, zoom: newZoom }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [canvas])

  // Touch pinch/pan/rotate + middle-click pan
  useEffect(() => {
    const el = vpRef.current; if (!el) return

    const toVp = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (toolActive.current && reservedTouchId.current === null && touchPtrs.current.size === 0) {
          reservedTouchId.current = e.pointerId
          return
        }
        try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
        touchPtrs.current.set(e.pointerId, toVp(e))
      } else if (e.button === 1) {
        try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
        const v = vpState.current
        midPanRef.current = { sx: e.clientX, sy: e.clientY, ocx: v.cx, ocy: v.cy }
        e.preventDefault()
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        const ptrs = touchPtrs.current
        if (!ptrs.has(e.pointerId)) return
        const prev = ptrs.get(e.pointerId)!
        const curr = toVp(e)

        if (ptrs.size === 1) {
          ptrs.set(e.pointerId, curr)
          setVp(v => ({ ...v, cx: v.cx + curr.x - prev.x, cy: v.cy + curr.y - prev.y }))
        } else {
          const otherId = [...ptrs.keys()].find(id => id !== e.pointerId)
          if (otherId === undefined) { ptrs.set(e.pointerId, curr); return }
          const other = ptrs.get(otherId)!

          const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 }
          const currMid = { x: (curr.x + other.x) / 2, y: (curr.y + other.y) / 2 }
          const d1     = Math.hypot(other.x - prev.x, other.y - prev.y)
          const d2     = Math.hypot(other.x - curr.x, other.y - curr.y)
          const scale  = d2 / (d1 || 1)
          const dAngle = Math.atan2(other.y - curr.y, other.x - curr.x)
                       - Math.atan2(other.y - prev.y, other.x - prev.x)

          ptrs.set(e.pointerId, curr)
          setVp(v => {
            const newZoom = clamp(v.zoom * scale, 0.04, 20)
            const newCx   = prevMid.x + (v.cx - prevMid.x) * scale + (currMid.x - prevMid.x)
            const newCy   = prevMid.y + (v.cy - prevMid.y) * scale + (currMid.y - prevMid.y)
            return { cx: newCx, cy: newCy, zoom: newZoom, angle: v.angle + dAngle }
          })
        }
      } else if (midPanRef.current) {
        const { sx, sy, ocx, ocy } = midPanRef.current
        setVp(v => ({ ...v, cx: ocx + e.clientX - sx, cy: ocy + e.clientY - sy }))
      }
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (reservedTouchId.current === e.pointerId) { reservedTouchId.current = null; return }
        touchPtrs.current.delete(e.pointerId)
        try { el.releasePointerCapture(e.pointerId) } catch { /* context loss */ }
      } else {
        midPanRef.current = null
      }
    }

    el.addEventListener('pointerdown',   onDown)
    el.addEventListener('pointermove',   onMove)
    el.addEventListener('pointerup',     onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown',   onDown)
      el.removeEventListener('pointermove',   onMove)
      el.removeEventListener('pointerup',     onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [canvas, toolActive])

  const fitCanvas = useCallback(() => {
    const el = vpRef.current
    const c  = canvasRef.current
    if (!el || !c) return
    const zoom = Math.min(el.clientWidth / c.width, el.clientHeight / c.height) * 0.88
    setVp({ cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom, angle: 0 })
  }, [])

  const angleDeg        = Math.round(vp.angle * 180 / Math.PI)
  const canvasTransform = canvas
    ? `translate(${vp.cx}px,${vp.cy}px) rotate(${vp.angle}rad) scale(${vp.zoom}) translate(${-canvas.width / 2}px,${-canvas.height / 2}px)`
    : ''

  return { vp, setVp, vpRef, fitCanvas, angleDeg, canvasTransform }
}
