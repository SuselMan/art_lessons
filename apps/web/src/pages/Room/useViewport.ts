import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import { clamp } from 'lodash-es'

export interface Viewport { cx: number; cy: number; zoom: number; angle: number }

interface CanvasSize { width: number; height: number }

export interface UseViewportResult {
  vp: Viewport
  setVp: Dispatch<SetStateAction<Viewport>>
  vpRef: RefObject<HTMLDivElement | null>
  /** Attach to the `.canvasWrap` element — see the docstring above `updateVp`
   *  below for why its `transform` is also written imperatively here rather
   *  than solely through the `canvasTransform` style string. */
  canvasWrapRef: RefObject<HTMLDivElement | null>
  fitCanvas: () => void
  angleDeg: number
  canvasTransform: string
}

/** `toolActive`: true while a one-shot canvas tool (currently just the
 *  eyedropper — see Room's `toolActiveRef`; the measure tool is pen-only and
 *  never sets this, see handleMeasureDown) wants the *first* touch that
 *  lands on the canvas for itself, not panning. Checked directly in the
 *  native `onDown` handler
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
export function useViewport(
  canvas: CanvasSize | null, toolActive: RefObject<boolean>, infinite = false,
): UseViewportResult {
  const [vp, setVp] = useState<Viewport>({ cx: 0, cy: 0, zoom: 1, angle: 0 })

  const vpRef        = useRef<HTMLDivElement>(null)
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const vpState      = useRef<Viewport>(vp)
  const canvasRef    = useRef<CanvasSize | null>(canvas)
  const touchPtrs = useRef(new Map<number, { x: number; y: number }>())
  const midPanRef = useRef<{ sx: number; sy: number; ocx: number; ocy: number } | null>(null)
  const reservedTouchId = useRef<number | null>(null)

  // rAF-flush bookkeeping for updateVp below.
  const rafScheduled = useRef(false)

  canvasRef.current = canvas

  // Infinite canvas (#133 Phase 1): the canvas element has no CSS pan
  // transform of its own — it's sized to fill the viewport (see Room's
  // ResizeObserver → engine.resizeCanvas), and "moving the camera" instead
  // means redrawing its contents (engine.setInfiniteCamera), driven by a
  // separate effect in Room off this same `vp` state. So there's nothing to
  // write into canvasWrap's style here for that mode.
  const transformFor = useCallback((v: Viewport, c: CanvasSize | null) => (
    infinite || !c ? '' : `translate(${v.cx}px,${v.cy}px) rotate(${v.angle}rad) scale(${v.zoom}) translate(${-c.width / 2}px,${-c.height / 2}px)`
  ), [infinite])

  // #126: pan/pinch/rotate/wheel fire on every native pointermove/wheel event
  // (on some touch digitizers >120Hz), far faster than Room (a ~1200-line
  // component) needs to re-render. `updateVp` is the single write path for
  // every gesture below: it (1) updates `vpState.current` synchronously so
  // any handler reading "the current live viewport" this tick (e.g. the next
  // pointermove, or a mousedown starting a fresh mid-pan) never sees a stale
  // value, (2) writes `canvasWrap`'s CSS transform directly via
  // `canvasWrapRef` so panning/zooming/rotating stays exactly as smooth as
  // before — decoupled entirely from React, and (3) throttles the actual
  // `setVp` (React state) flush to at most once per animation frame, so
  // consumers that legitimately need a re-render (zoom%/angle° labels,
  // PeerCursors, MeasureOverlay, TransformGizmo, the viewport→engine sync
  // effect) still update every frame, just not every single raw event.
  const updateVp = useCallback((v: Viewport) => {
    vpState.current = v
    const wrap = canvasWrapRef.current
    if (wrap) wrap.style.transform = transformFor(v, canvasRef.current)
    if (!rafScheduled.current) {
      rafScheduled.current = true
      requestAnimationFrame(() => {
        rafScheduled.current = false
        setVp(vpState.current)
      })
    }
  }, [transformFor])

  // Initial fit when canvas config loads. Infinite canvas (#133 Phase 1)
  // has no fixed extent to fit — "reset to origin" (camera centered on
  // world (0,0), zoom 1) instead; see fitCanvas's same branch below.
  useLayoutEffect(() => {
    if (!canvas || !vpRef.current) return
    const el = vpRef.current
    const v = infinite
      ? { cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom: 1, angle: 0 }
      : {
          cx: el.clientWidth / 2, cy: el.clientHeight / 2, angle: 0,
          zoom: Math.min(el.clientWidth / canvas.width, el.clientHeight / canvas.height) * 0.88,
        }
    vpState.current = v
    setVp(v)
  }, [canvas, infinite])

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
      const v  = vpState.current
      const newZoom = clamp(v.zoom * f, 0.04, 20)
      const s = newZoom / v.zoom
      updateVp({ ...v, cx: mx + (v.cx - mx) * s, cy: my + (v.cy - my) * s, zoom: newZoom })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [canvas, updateVp])

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
          const v = vpState.current
          updateVp({ ...v, cx: v.cx + curr.x - prev.x, cy: v.cy + curr.y - prev.y })
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
          const v = vpState.current
          const newZoom = clamp(v.zoom * scale, 0.04, 20)
          const newCx   = prevMid.x + (v.cx - prevMid.x) * scale + (currMid.x - prevMid.x)
          const newCy   = prevMid.y + (v.cy - prevMid.y) * scale + (currMid.y - prevMid.y)
          // Infinite canvas (#134): the tile compositor now applies camera
          // angle too (via the assembly-buffer + final rotate blit in
          // _finishInfiniteComposite), matching setInfiniteCamera's pointer
          // mapping — so the rotation component of this gesture no longer
          // needs to be dropped for infinite rooms.
          updateVp({ cx: newCx, cy: newCy, zoom: newZoom, angle: v.angle + dAngle })
        }
      } else if (midPanRef.current) {
        const { sx, sy, ocx, ocy } = midPanRef.current
        const v = vpState.current
        updateVp({ ...v, cx: ocx + e.clientX - sx, cy: ocy + e.clientY - sy })
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
  }, [canvas, toolActive, updateVp, infinite])

  // "Fit canvas" for infinite mode has no fixed extent to fit against — see
  // the initial-fit effect's same reasoning — so this resets to origin
  // instead (camera centered on world (0,0), zoom 1). The button/hotkey
  // that calls this is unchanged either way; only what it resets to differs.
  const fitCanvas = useCallback(() => {
    const el = vpRef.current
    const c  = canvasRef.current
    if (!el || !c) return
    const v = infinite
      ? { cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom: 1, angle: 0 }
      : {
          cx: el.clientWidth / 2, cy: el.clientHeight / 2, angle: 0,
          zoom: Math.min(el.clientWidth / c.width, el.clientHeight / c.height) * 0.88,
        }
    vpState.current = v
    setVp(v)
  }, [infinite])

  // Room also calls `setVp` directly for one-off, non-gesture updates (zoom%
  // reset click, angle +/-15° buttons, 'r' key, useDragToAdjust on the zoom
  // label — see Room/index.tsx). Those are low-frequency (one state update
  // each), so there's no need to route them through `updateVp`'s rAF
  // throttling — but they still must keep `vpState.current` in sync, since
  // gesture handlers above (e.g. onDown's mid-pan capturing `ocx`/`ocy`, or
  // the wheel handler's zoom-toward-cursor math) read `vpState.current` as
  // "the current live viewport," not React's `vp`. Wrapping here (rather
  // than syncing in a render-body assignment like the old code did) avoids a
  // stale render clobbering an in-flight gesture's `vpState.current` between
  // rAF flushes.
  const setVpTracked = useCallback<Dispatch<SetStateAction<Viewport>>>((action) => {
    setVp(prev => {
      const next = typeof action === 'function' ? (action as (v: Viewport) => Viewport)(prev) : action
      vpState.current = next
      return next
    })
  }, [])

  const angleDeg        = Math.round(vp.angle * 180 / Math.PI)
  const canvasTransform = transformFor(vp, canvas)

  return { vp, setVp: setVpTracked, vpRef, canvasWrapRef, fitCanvas, angleDeg, canvasTransform }
}
