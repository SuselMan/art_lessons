import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ToolType } from '@grafetto/shared'

import { previewDabShape, type TiltResponse } from '../../engine'
import { diagLog } from '../../lib/diagLog'
import { clientToRoomPoint } from './cameraMath'
import type { ViewportTransform, CanvasSize } from './pointerTransform'
import styles from './Room.module.css'

// Never let the outline collapse to nothing at a 1px brush (or, for a chisel
// nib, on its short axis — that one is a fifth of the picked size).
const MIN_CURSOR_EXTENT_PX = 2

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
  markerFollowStroke?: boolean
  /** #409: the active tool's tilt-response setting, the same value Room feeds
   *  engine.setTiltResponse — the outline is the only place the choice can be
   *  seen before a mark exists, so it has to be drawn under it too. */
  tiltResponse?: TiltResponse
}

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
  vpRef, tool, presetName, baseSize, vp, config, markerAngleRadians = 0, markerFollowStroke = false,
  tiltResponse,
}: BrushCursorProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const touchActiveRef = useRef(false)

  // Read via a ref inside the listener rather than in the effect's own
  // dependency array — vp changes on every pan/zoom/rotate frame, and
  // config/tool/presetName/baseSize each change independently too; tearing
  // the native listener down and rebuilding it on every one of those would
  // also throw away the cached bounding-rect below. Same reasoning as
  // Room's own #37 cursor-broadcast effect.
  const stateRef = useRef({
    tool, presetName, baseSize, vp, config, markerAngleRadians, markerFollowStroke, tiltResponse,
  })
  stateRef.current = {
    tool, presetName, baseSize, vp, config, markerAngleRadians, markerFollowStroke, tiltResponse,
  }

  useEffect(() => {
    const el = vpRef.current
    if (!el) return

    // (#155-style) cached rect, invalidated only by a real resize of the
    // viewport container — same pattern as Room's own #37 effect.
    let rectCache: DOMRect | null = null
    const observer = new ResizeObserver(() => { rectCache = null })
    observer.observe(el)

    const hide = () => {
      if (circleRef.current) circleRef.current.style.display = 'none'
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
        markerAngleRadians: curMarkerAngle, markerFollowStroke: curMarkerFollow,
        tiltResponse: curTiltResponse,
      } = stateRef.current

      const rect = rectCache ??= el.getBoundingClientRect()
      const { x, y } = clientToRoomPoint(clientX, clientY, rect, curVp, curConfig)
      const { size, aspectRatio, angle } = previewDabShape(
        curTool, curPreset, curBaseSize, pressure, tiltX, tiltY, 0,
        { angle: curMarkerAngle, followStrokeDirection: curMarkerFollow },
        curTiltResponse,
      )
      // DAB_VERT scales the quad's local X axis by aspectRatio before rotating
      // by `angle` (shaders.ts), so the painted footprint's long axis is
      // exactly `size * aspectRatio` and its short one is `size`.
      const longAxis = Math.max(size * Math.max(aspectRatio, 1), MIN_CURSOR_EXTENT_PX)
      const shortAxis = Math.max(size, MIN_CURSOR_EXTENT_PX)

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
    <div className={styles.brushCursorLayer}>
      <div ref={circleRef} className={styles.brushCursorOutline} />
    </div>
  )
}
