import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import { clamp } from 'lodash-es'

import { deviceNativeZoom, rotateViewportAround } from './cameraMath'
import { PinchTracker } from './pinchTracker'
import { diagLog } from '../../lib/diagLog'
import { useRoomStore } from '../../stores/roomStore'
import { isHandActive } from '../../stores/slices/viewportSlice'

export interface Viewport { cx: number; cy: number; zoom: number; angle: number }

interface CanvasSize { width: number; height: number }

/** One in-progress mouse/pen drag of the *view* (#319) — the middle button,
 *  or the left button while the hand tool is on. `mode` is decided once, at
 *  pointerdown, from whether Shift was down: a drag that silently changed
 *  meaning halfway through because a finger slipped onto Shift would be far
 *  worse than having to release and start again. */
interface PointerDrag {
  mode: 'pan' | 'rotate'
  /** Client coords where the drag began — pan is measured against these. */
  sx: number
  sy: number
  /** The same point in viewport coords: the pivot rotation turns around, so
   *  whatever was under the cursor when the drag started stays under it. */
  ax: number
  ay: number
  ocx: number
  ocy: number
  oangle: number
}

/** Horizontal drag distance → rotation. Displacement-based rather than
 *  "angle of the cursor around a pivot": the latter has a singularity at the
 *  pivot itself, where a one-pixel wobble spins the canvas through a right
 *  angle. Krita's canvas rotation reads displacement for the same reason.
 *  ~0.3°/px puts a full 180° turn at roughly 600 px of travel. */
const ROTATE_RADIANS_PER_PX = 0.3 * Math.PI / 180

export interface UseViewportResult {
  vp: Viewport
  setVp: Dispatch<SetStateAction<Viewport>>
  vpRef: RefObject<HTMLDivElement | null>
  /** Attach to the `.viewport` element (`ref={setVpNode}`) instead of `vpRef`
   *  — a callback ref, so every listener-attaching effect here (and
   *  useTapToggle's) can key off `vpEl` and run exactly when the element
   *  mounts/unmounts, rather than off a RefObject whose `.current` an effect
   *  can legitimately observe as null. `vpRef` is kept in sync by it and stays
   *  the read path for imperative `.current` consumers. */
  setVpNode: (el: HTMLDivElement | null) => void
  /** The `.viewport` element as *state* — non-null exactly while it's mounted,
   *  so it can be an effect dependency. */
  vpEl: HTMLDivElement | null
  /** Attach to the `.canvasWrap` element — see the docstring above `updateVp`
   *  below for why its `transform` is also written imperatively here rather
   *  than solely through the `canvasTransform` style string. */
  canvasWrapRef: RefObject<HTMLDivElement | null>
  fitCanvas: () => void
  angleDeg: number
  canvasTransform: string
}

/** Reports the *edges* of a two-finger pinch/rotate gesture — `true` on the
 *  first frame two fingers start changing zoom/angle, `false` when the gesture
 *  ends (a finger lifts, or the pointer stream is reset as untrustworthy).
 *  Transitions only, never per frame: the one consumer (#362's viewport toast)
 *  reads the live values out of the store anyway, so all it needs from here is
 *  "a gesture is/isn't happening", and a per-frame callback would hand it a
 *  60-per-second reason to re-render on top of that. */
export type PinchPhaseListener = (active: boolean) => void

/** `toolActive`: true while a one-shot canvas tool (currently just the
 *  eyedropper — see Room's `toolActiveRef`; ruler placement is pen-only and
 *  never sets this, see handleRulerPlaceDown) wants the *first* touch that
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
  onPinchPhase?: PinchPhaseListener,
): UseViewportResult {
  // (#22) Backed by the store now — internal architecture (rAF-throttled
  // updates, vpState ref for hot gesture math, direct DOM transform writes
  // bypassing React) is unchanged; only the target of the already-
  // throttled flush moved from a local useState setter to the store.
  const vp = useRoomStore(s => s.viewport)

  const vpRef        = useRef<HTMLDivElement>(null)
  // `.viewport` mirrored as state as well as a ref: Room mounts it only once
  // `config` is known (it renders the join gate before that), so every effect
  // below runs at least once with nothing to attach to. Keying those effects
  // off `vpEl` makes them re-run for real the moment the element appears —
  // which is what the previous rAF "retry next frame" loops were emulating,
  // except those never terminated (and logged a diag line every frame,
  // forever) while the join gate was up.
  const [vpEl, setVpEl] = useState<HTMLDivElement | null>(null)
  const setVpNode = useCallback((el: HTMLDivElement | null) => {
    vpRef.current = el
    setVpEl(el)
  }, [])
  const canvasWrapRef = useRef<HTMLDivElement>(null)
  const vpState      = useRef<Viewport>(vp)
  const canvasRef    = useRef<CanvasSize | null>(canvas)
  const touchPtrs = useRef(new Map<number, { x: number; y: number }>())
  const dragRef = useRef<PointerDrag | null>(null)
  const reservedTouchId = useRef<number | null>(null)
  // Recognizes when the two-finger branch below is actually pinching/rotating
  // rather than panning, so `onPinchPhase` fires once per gesture edge instead
  // of once per move event — see PinchTracker for why that distinction can't be
  // read off the pointer count. Stateful across events, hence a ref; built
  // lazily rather than as `useRef(new PinchTracker())`, whose argument is
  // evaluated on every render and thrown away, and Room re-renders every frame
  // of every gesture (see updateVp's comment above).
  const pinchRef = useRef<PinchTracker | null>(null)
  pinchRef.current ??= new PinchTracker()
  const pinch = pinchRef.current

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
  // PeerCursors, RulerOverlay, TransformGizmo, the viewport→engine sync
  // effect) still update every frame, just not every single raw event.
  const updateVp = useCallback((v: Viewport) => {
    vpState.current = v
    const wrap = canvasWrapRef.current
    if (wrap) wrap.style.transform = transformFor(v, canvasRef.current)
    if (!rafScheduled.current) {
      rafScheduled.current = true
      requestAnimationFrame(() => {
        rafScheduled.current = false
        useRoomStore.getState().setViewport(vpState.current)
      })
    }
  }, [transformFor])

  // Initial fit when canvas config loads. Infinite canvas (#133 Phase 1)
  // has no fixed extent to fit — "reset to origin" instead: camera centered
  // on world (0,0) at the device-native zoom (1 world unit = 1 physical
  // pixel — the zoom the UI presents as 100%, see deviceNativeZoom's doc
  // comment); see fitCanvas's same branch below.
  useLayoutEffect(() => {
    const el = vpEl
    if (!canvas || !el) return
    const v = infinite
      ? { cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom: deviceNativeZoom(), angle: 0 }
      : {
          cx: el.clientWidth / 2, cy: el.clientHeight / 2, angle: 0,
          zoom: Math.min(el.clientWidth / canvas.width, el.clientHeight / canvas.height) * 0.88,
        }
    vpState.current = v
    useRoomStore.getState().setViewport(v)
  }, [canvas, infinite, vpEl])

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = vpEl; if (!el) return
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
  }, [canvas, updateVp, vpEl])

  // Touch pinch/pan/rotate + middle-click pan
  useEffect(() => {
    // This effect re-runs freely (deps include `updateVp`/`toolActive`, not
    // guaranteed referentially stable across every Room re-render), and used
    // to read `vpRef.current` — which an effect can legitimately observe as
    // null (confirmed live on Android for useTapToggle's identical pattern,
    // see its own comment), and always does while Room is still showing the
    // join gate. A one-shot `if (!el) return` there permanently gave up,
    // breaking every gesture for the rest of the session even though
    // `.viewport` itself never actually unmounted. `vpEl` is state, so this
    // effect simply re-runs when the element really does appear.
    if (!vpEl) return

    const attach = (el: HTMLDivElement) => {
      const toVp = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
      }

      const onDown = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          diagLog('vp: down', { id: e.pointerId, ptrsBefore: [...touchPtrs.current.keys()], reserved: reservedTouchId.current, toolActive: toolActive.current })
          if (toolActive.current && reservedTouchId.current === null && touchPtrs.current.size === 0) {
            reservedTouchId.current = e.pointerId
            return
          }
          try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
          touchPtrs.current.set(e.pointerId, toVp(e))
          return
        }

        // Mouse/pen. Two ways in (#319, ADR 007 §4): the middle button, which
        // a pen doesn't have at all, and the left button while the hand tool
        // is on, which is the only route available to someone holding nothing
        // but a stylus. Read from the store at event time rather than closed
        // over: this effect must not re-attach its listeners every time the
        // hand tool toggles, and a stale closure here would mean the mode
        // silently stops working after the first toggle.
        const handActive = isHandActive(useRoomStore.getState())
        if (e.button !== 1 && !(handActive && e.button === 0)) return

        try { el.setPointerCapture(e.pointerId) } catch { /* context loss */ }
        const v = vpState.current
        const anchor = toVp(e)
        dragRef.current = {
          mode: e.shiftKey ? 'rotate' : 'pan',
          sx: e.clientX, sy: e.clientY,
          ax: anchor.x, ay: anchor.y,
          ocx: v.cx, ocy: v.cy, oangle: v.angle,
        }
        e.preventDefault()
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
            const newAngle = v.angle + dAngle
            // Infinite canvas (#134): the tile compositor now applies camera
            // angle too (via the assembly-buffer + final rotate blit in
            // _finishInfiniteComposite), matching setInfiniteCamera's pointer
            // mapping — so the rotation component of this gesture no longer
            // needs to be dropped for infinite rooms.
            updateVp({ cx: newCx, cy: newCy, zoom: newZoom, angle: newAngle })

            // (#362) Fed both fingers, announces at most once per gesture —
            // see PinchTracker on why it reads the fingers rather than the zoom
            // and angle computed just above. Ordered by pointer id, not by
            // which one this event belongs to: the pair's angle flips by π if
            // the two arguments swap, and `curr`/`other` alternate every event.
            const [pa, pb] = e.pointerId < otherId ? [curr, other] : [other, curr]
            if (pinch.move(pa, pb)) onPinchPhase?.(true)
          }
        } else if (dragRef.current) {
          const d = dragRef.current
          const v = vpState.current
          if (d.mode === 'pan') {
            updateVp({ ...v, cx: d.ocx + e.clientX - d.sx, cy: d.ocy + e.clientY - d.sy })
            return
          }
          // The canvas element rotates about (cx, cy) — its own centre's
          // screen position, not the screen's centre (see transformFor). So
          // turning the angle alone would swing the view away whenever the
          // canvas centre is off-screen, which is most of the time at working
          // zoom. Rotating (cx, cy) about the grab point by the same delta
          // cancels that: the pixel under the cursor holds still and the rest
          // of the drawing turns around it, which is what the two-finger
          // gesture does on a tablet.
          const dAngle = (e.clientX - d.sx) * ROTATE_RADIANS_PER_PX
          // Applied to the viewport as it was when the drag began, not to the
          // live one: accumulating a delta per move event would compound
          // rounding every frame, and a drag returned to where it started
          // would not land back on the angle it started from.
          const rotated = rotateViewportAround(
            { ...v, cx: d.ocx, cy: d.ocy, angle: d.oangle }, d.ax, d.ay, dAngle,
          )
          updateVp(rotated)
        }
      }

      const endPinch = () => {
        if (pinch.end()) onPinchPhase?.(false)
      }

      const onUp = (e: PointerEvent) => {
        if (e.pointerType === 'touch') {
          diagLog('vp: up/cancel', { id: e.pointerId, type: e.type, ptrsBefore: [...touchPtrs.current.keys()], reserved: reservedTouchId.current })
          if (reservedTouchId.current === e.pointerId) { reservedTouchId.current = null; return }
          touchPtrs.current.delete(e.pointerId)
          try { el.releasePointerCapture(e.pointerId) } catch { /* context loss */ }
          // (#362) Below two fingers there is no pinch left to be in, whether
          // one was announced or not — the origin resets either way, so a
          // second pinch inside the same touch sequence measures itself afresh
          // rather than against where the first one started.
          if (touchPtrs.current.size < 2) endPinch()
        } else {
          dragRef.current = null
        }
      }

      // A pointerup/pointercancel can be lost entirely (app backgrounded
      // mid-gesture, an OS-level gesture stealing the touch sequence, a
      // permission prompt, etc.) — when that happens, `touchPtrs` keeps a
      // stale entry forever with no real finger behind it. A later genuine
      // 2-finger gesture would then see that phantom entry as "the other
      // finger" (pinch/rotate math computed against a position from long ago,
      // reading as broken/stuck), and a genuine lone finger would be treated
      // as a 2-finger gesture instead of triggering the plain single-finger
      // pan branch — matching reports of "pinch-zoom" and "single-finger pan"
      // both randomly breaking, not clearing even on reload if the same
      // device/OS state repro's it again immediately. visibilitychange/blur
      // are the most reliable generic "can't trust this pointer's own
      // up/cancel anymore" signals available — full reset on either.
      const resetTouchState = () => {
        diagLog('vp: resetTouchState fired', { hadPtrs: [...touchPtrs.current.keys()], hadReserved: reservedTouchId.current })
        touchPtrs.current.clear()
        reservedTouchId.current = null
        dragRef.current = null
        // (#362) Same reasoning as the rest of this reset: the fingers that
        // were pinching may never deliver an up, and a pinch left "active"
        // forever would leave the toast pinned on screen with its dismiss
        // timer never started.
        endPinch()
      }
      document.addEventListener('visibilitychange', resetTouchState)
      window.addEventListener('blur', resetTouchState)

      el.addEventListener('pointerdown',   onDown)
      el.addEventListener('pointermove',   onMove)
      el.addEventListener('pointerup',     onUp)
      el.addEventListener('pointercancel', onUp)

      return () => {
        el.removeEventListener('pointerdown',   onDown)
        el.removeEventListener('pointermove',   onMove)
        el.removeEventListener('pointerup',     onUp)
        el.removeEventListener('pointercancel', onUp)
        document.removeEventListener('visibilitychange', resetTouchState)
        window.removeEventListener('blur', resetTouchState)
      }
    }

    diagLog('vp: attaching gesture listeners on', vpEl.className || vpEl.tagName)
    return attach(vpEl)
  }, [canvas, toolActive, updateVp, infinite, vpEl, onPinchPhase, pinch])

  // "Fit canvas" for infinite mode has no fixed extent to fit against — see
  // the initial-fit effect's same reasoning — so this resets to origin
  // instead (camera centered on world (0,0), device-native zoom). The
  // button/hotkey that calls this is unchanged either way; only what it
  // resets to differs.
  const fitCanvas = useCallback(() => {
    const el = vpRef.current
    const c  = canvasRef.current
    if (!el || !c) return
    const v = infinite
      ? { cx: el.clientWidth / 2, cy: el.clientHeight / 2, zoom: deviceNativeZoom(), angle: 0 }
      : {
          cx: el.clientWidth / 2, cy: el.clientHeight / 2, angle: 0,
          zoom: Math.min(el.clientWidth / c.width, el.clientHeight / c.height) * 0.88,
        }
    vpState.current = v
    useRoomStore.getState().setViewport(v)
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
    const prev = vpState.current
    const next = typeof action === 'function' ? (action as (v: Viewport) => Viewport)(prev) : action
    vpState.current = next
    useRoomStore.getState().setViewport(next)
  }, [])

  // Normalized into 0–359 (#329): the readout is a control now — dragged and
  // clicked — so it has to stay readable whatever `vp.angle` accumulated to,
  // rather than growing into "-412°" after a few two-finger rotations.
  const angleDeg        = ((Math.round(vp.angle * 180 / Math.PI) % 360) + 360) % 360
  const canvasTransform = transformFor(vp, canvas)

  return { vp, setVp: setVpTracked, vpRef, setVpNode, vpEl, canvasWrapRef, fitCanvas, angleDeg, canvasTransform }
}
