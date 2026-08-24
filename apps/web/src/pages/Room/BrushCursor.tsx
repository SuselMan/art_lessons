import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ToolType } from '@grafetto/shared'

import { DEFAULT_NIB_ANCHOR, previewDabShape, type NibAnchor, type TiltResponse } from '../../engine'
import { diagLog } from '../../lib/diagLog'
import { clientToRoomPoint } from './cameraMath'
import type { ViewportTransform, CanvasSize } from './pointerTransform'
import styles from './Room.module.css'

interface BrushCursorProps {
  /** Same viewport container ref Room's own #37 cursor-broadcast effect
   *  listens on — pointermove there already covers hover, not just drawing. */
  vpRef: RefObject<HTMLDivElement | null>
  tool: ToolType
  /** Same string engine.setPencil records (`${nib}:${size}` for marker, the
   *  liner size label, or the pencil grade) — only marker's own bullet/
   *  chisel dispatch actually reads it. */
  presetName: string
  /** Physical px, same value fed to engine.setSize (Room's own `sizePx`). */
  baseSize: number
  vp: ViewportTransform
  config: { infinite: boolean } & CanvasSize
  /** #278: marker chisel-nib angle setting, already resolved to canvas-space
   *  radians (same value fed to engine.setMarkerAngle — see Room's own
   *  markerCanvasAngleRadians) — only marker's chisel dispatch actually
   *  reads either of these two. */
  markerAngleRadians?: number
  /** #482, ADR 012 §3 — which frame that angle is measured in. */
  markerAnchor?: NibAnchor
  /** #409: the active tool's tilt-response setting, the same value Room feeds
   *  engine.setTiltResponse — the outline is the only place the choice can be
   *  seen before a mark exists, so it has to be drawn under it too. */
  tiltResponse?: TiltResponse
}

/** Per-sample weight of the outline's tilt low-pass — see smoothTilt below for
 *  why per-sample is the right unit here and a distance is not.
 *
 *  Larger follows the stylus faster, smaller is steadier (the filter is
 *  `y += (u - y) * k`). At a 120 Hz hover this settles a deliberate change of
 *  grip within ~40 ms, which reads as immediate, while averaging away the
 *  degree-scale wobble of a hand trying to hold still. */
const TILT_SMOOTHING = 0.2

/** A brush-footprint preview that follows the pointer: an outline of the dab
 *  the current tool would lay down right now — a circle for a round nib, an
 *  ellipse at the dab's own angle for an elongated one (a chisel marker, a
 *  heavily tilted pencil/liner). It is drawn as a light stroke fenced by dark
 *  halos (see .brushCursorOutline) so it stays legible over blank paper and
 *  dark graphite alike. That used to be a solid white fill with
 *  `mix-blend-mode: difference` instead; it flickered on every stroke on
 *  Android because the blend has to re-read a WebGL backdrop that is actively
 *  repainting — see the CSS rule's own comment for the measurement.
 *
 *  Whether it shows at all is not this component's call (#393): Room mounts
 *  it exactly while `useCursor()` says `dabPreview`, so once it is on screen
 *  it simply follows the pointer. It used to gate itself on a `DAB_TOOLS`
 *  set, which could only ever see the *tool* — and an overlay mode (a
 *  transform session, the eyedropper, a ruler being placed) leaves the tool
 *  exactly where it was, which is how this ring ended up drawn on top of the
 *  transform gizmo. See cursorController.ts.
 *
 *  #336: it used to be a circle of `size` *plus* a separate line of
 *  `size * aspectRatio` laid across it, which for a 5:1 chisel drew a mark
 *  five times longer than the circle it went through and read as the cursor
 *  contradicting itself. One ellipse states the same two numbers (both axes)
 *  and the angle at once, and — unlike a circle — is what the tool actually
 *  paints.
 *
 *  Rendered as a sibling of `<canvas>`/`<PeerCursors>` inside whichever
 *  ancestor already carries the viewport's CSS transform (`canvasWrap` for
 *  bounded rooms, `.worldOverlayWrap` for infinite ones — see Room's own
 *  render section) — deliberately the OPPOSITE of PeerCursors' own
 *  counter-scale/counter-rotate: this cursor's whole point is to preview the
 *  dab's actual on-canvas footprint, so it should scale/rotate WITH the
 *  viewport, not cancel it out. That means position/size/angle below are
 *  plain canvas-pixel/world values (same space Dab.x/y and `baseSize`
 *  already use) with no zoom/viewport-angle math applied here at all — the
 *  ancestor transform supplies that for free, exactly like PeerCursors'
 *  positions do.
 *
 *  Imperative DOM updates (not React state) inside the raw pointermove
 *  listener: this fires at native pointer-event rate, and only two elements'
 *  inline styles ever need to change per event — routing that through React
 *  state would re-render this component (and re-run its own effect deps)
 *  every single move for no benefit.
 *
 *  Touch is a special case: `PointerInput` never treats a touch as a draw
 *  input in the first place (touch drives pan/pinch/rotate — see
 *  useViewport), and Ilya confirmed (2026-07-22) the cursor should only
 *  show while a finger is actually down, not just resting near the glass —
 *  so touch gets its own pointerdown/pointerup pair gating visibility,
 *  instead of showing continuously the way mouse/pen hover does. */
export function BrushCursor({
  vpRef, tool, presetName, baseSize, vp, config, markerAngleRadians = 0, markerAnchor = DEFAULT_NIB_ANCHOR,
  tiltResponse,
}: BrushCursorProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const touchActiveRef = useRef(false)

  // One screen pixel, said in the world units this layer is drawn in — the
  // unit `.brushCursorOutline` builds its whole ring out of. See that rule for
  // why the ring must not ride the viewport transform the footprint does.
  //
  // Imperative like everything else here, but driven by `vp` rather than by a
  // pointer event: zoom changes with the pointer standing still (wheel, pinch,
  // the zoom keys, fit-to-screen), and useViewport already flushes `vp` to
  // React once per frame, so this lands on the same frame the transform does.
  useEffect(() => {
    layerRef.current?.style.setProperty('--screen-px', `${1 / vp.zoom}px`)
  }, [vp.zoom])

  // Read via a ref inside the listener rather than in the effect's own
  // dependency array — vp changes on every pan/zoom/rotate frame, and
  // config/tool/presetName/baseSize each change independently too; tearing
  // the native listener down and rebuilding it on every one of those would
  // also throw away the cached bounding-rect below. Same reasoning as
  // Room's own #37 cursor-broadcast effect.
  const stateRef = useRef({
    tool, presetName, baseSize, vp, config, markerAngleRadians, markerAnchor, tiltResponse,
  })
  stateRef.current = {
    tool, presetName, baseSize, vp, config, markerAngleRadians, markerAnchor, tiltResponse,
  }

  useEffect(() => {
    const el = vpRef.current
    if (!el) return

    // (#155-style) cached rect, invalidated only by a real resize of the
    // viewport container — same pattern as Room's own #37 effect.
    let rectCache: DOMRect | null = null
    const observer = new ResizeObserver(() => { rectCache = null })
    observer.observe(el)

    // Declared before `hide`, which reseeds it — see smoothTilt below.
    let tilt: { x: number; y: number } | null = null

    const hide = () => {
      if (circleRef.current) circleRef.current.style.display = 'none'
      // Next time the pen appears it is a new pose, not a continuation of the
      // one that left — reseed rather than easing across the gap.
      tilt = null
    }

    // #482 — the outline's own tilt low-pass, and the reason it needs one is
    // #305's: a stylus reports tilt far more noisily than position, and the
    // angle derived from it is an *azimuth*, which amplifies that noise the
    // more upright the pen is (atan2 of two near-zeroes at the limit). Holding
    // the pen still over the canvas therefore made the preview ellipse rotate
    // on the hand's own micro-movement.
    //
    // #305 fixed exactly this for the mark. The outline never had it: the
    // engine's filter lives in DabSystem, which a hover never reaches, and
    // previewDabShape has always been handed the raw event values.
    //
    // Two things it deliberately does differently from DabSystem's:
    //
    //  - it is per *sample*, not per world px of travel. The engine's is a
    //    distance now (#482) because a mark that smooths differently on a
    //    240 Hz tablet than on a 60 Hz one is a tool whose feel depends on
    //    hardware. A hover travels no distance at all — a distance-keyed filter
    //    would simply freeze — and nothing here is recorded, so the report rate
    //    deciding how quickly an outline settles costs nothing.
    //  - it filters the tilt *vector* rather than a magnitude and an angle.
    //    Straight from #305's own reasoning: there is no ±π wrap to damp, and a
    //    near-vertical sample contributes a short vector, so it moves the
    //    filtered direction hardly at all — which is precisely when its own
    //    azimuth is least trustworthy. The weighting falls out of the geometry
    //    instead of needing a special case.
    const smoothTilt = (tiltX: number, tiltY: number) => {
      if (tilt === null) tilt = { x: tiltX, y: tiltY }
      else {
        tilt.x += (tiltX - tilt.x) * TILT_SMOOTHING
        tilt.y += (tiltY - tilt.y) * TILT_SMOOTHING
      }
      return tilt
    }

    // Diagnostic-only (chasing the "pen cursor flickers mid-stroke" report):
    // a genuine pointerleave firing while the pen is still physically down
    // (buttons !== 0) would mean the browser/OS is reporting spurious
    // boundary events during capture rather than the cursor logic itself
    // being at fault — pairs with a matching "re-entered" line on the next
    // move so the gap between them (and whether it lines up with dab
    // timing) shows up in an on-device "copy logs" capture.
    let leftBoundsWhileDown = false
    const onLeave = (e: PointerEvent) => {
      leftBoundsWhileDown = e.buttons !== 0
      diagLog('[BrushCursor] pointerleave', { pointerType: e.pointerType, pointerId: e.pointerId, buttons: e.buttons })
      hide()
    }

    const applyAt = (clientX: number, clientY: number, pressure: number, tiltX: number, tiltY: number) => {
      const circle = circleRef.current
      if (!circle) return
      const {
        tool: curTool, presetName: curPreset, baseSize: curBaseSize, vp: curVp, config: curConfig,
        markerAngleRadians: curMarkerAngle, markerAnchor: curMarkerAnchor,
        tiltResponse: curTiltResponse,
      } = stateRef.current

      const rect = rectCache ??= el.getBoundingClientRect()
      const { x, y } = clientToRoomPoint(clientX, clientY, rect, curVp, curConfig)
      const smoothed = smoothTilt(tiltX, tiltY)
      const { size, aspectRatio, angle } = previewDabShape(
        curTool, curPreset, curBaseSize, pressure, smoothed.x, smoothed.y, 0,
        { angle: curMarkerAngle, anchor: curMarkerAnchor },
        curTiltResponse,
        // #482: the cursor is drawn inside an element that already carries the
        // viewport transform, so its angle is world-space — same conversion the
        // mark itself gets, or the outline and the dab disagree on a rotated canvas.
        curVp.angle,
      )
      // DAB_VERT scales the quad's local X axis by aspectRatio before rotating
      // by `angle` (shaders.ts), so the painted footprint's long axis is
      // exactly `size * aspectRatio` and its short one is `size`. Written
      // unclamped: the floor that keeps a tiny brush visible is a min-width/
      // min-height in the stylesheet now, because it has to be a floor on
      // *screen* size and only CSS sees the zoom on every frame.
      const longAxis = size * Math.max(aspectRatio, 1)
      const shortAxis = size

      circle.style.display = 'block'
      circle.style.width = `${longAxis}px`
      circle.style.height = `${shortAxis}px`
      // transform-origin stays at the element's own centre, so rotate() spins
      // the ellipse about that centre while the translates put that centre on
      // the pointer.
      circle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad)`
    }

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !touchActiveRef.current) return
      if (leftBoundsWhileDown) {
        leftBoundsWhileDown = false
        diagLog('[BrushCursor] re-entered after leave-while-down', { pointerType: e.pointerType, pointerId: e.pointerId, buttons: e.buttons })
      }
      const pressure = e.pointerType === 'mouse' && e.pressure === 0 ? 0.5 : (e.pressure || 0.5)
      applyAt(e.clientX, e.clientY, pressure, e.tiltX ?? 0, e.tiltY ?? 0)
    }
    const handleDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touchActiveRef.current = true
      applyAt(e.clientX, e.clientY, e.pressure || 0.5, e.tiltX ?? 0, e.tiltY ?? 0)
    }
    const handleTouchEnd = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      touchActiveRef.current = false
      hide()
    }

    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerdown', handleDown)
    el.addEventListener('pointerup', handleTouchEnd)
    el.addEventListener('pointercancel', handleTouchEnd)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerdown', handleDown)
      el.removeEventListener('pointerup', handleTouchEnd)
      el.removeEventListener('pointercancel', handleTouchEnd)
      el.removeEventListener('pointerleave', onLeave)
      observer.disconnect()
    }
  }, [vpRef])

  return (
    <div ref={layerRef} className={styles.brushCursorLayer}>
      <div ref={circleRef} className={styles.brushCursorOutline} />
    </div>
  )
}
