import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { ToolType } from '@art-lessons/shared'

import { previewDabShape } from '../../engine'
import { clientToRoomPoint } from './cameraMath'
import type { ViewportTransform, CanvasSize } from './pointerTransform'
import styles from './Room.module.css'

// Dab-based tools only — the tools whose stroke is actually made of sized,
// oriented dabs (see engine's DabSystem). Every other current tool (grid/
// ruler/transform/eyedropper etc. aren't drawing tools at all, and fill-style
// tools don't exist yet) has no dab shape to preview.
const DAB_TOOLS: ReadonlySet<ToolType> = new Set(['pencil', 'eraser', 'smudge', 'liner', 'marker'])

// Below this aspect ratio the dab is close enough to circular that a
// rotation line would show for a barely-there tilt with nothing meaningful
// to communicate — every dab-tool's own shaping curve keeps aspect near 1.0
// except at extreme tilt (bullet/liner) or never at all (chisel, always 5).
const MIN_ASPECT_FOR_LINE = 1.15

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
}

/** A brush-size/rotation preview that follows the pointer: a circle sized to
 *  the current tool's dab footprint, plus a line through it at the dab's
 *  angle when the shape is elongated enough for that to mean anything (a
 *  chisel marker, a heavily tilted pencil/liner). Both are rendered as solid
 *  white with `mix-blend-mode: difference`, so whatever's underneath gets
 *  visually inverted rather than occluded — the classic
 *  Photoshop/Procreate-style brush-cursor trick, not a flat color swatch.
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
}: BrushCursorProps) {
  const circleRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const touchActiveRef = useRef(false)

  // Read via a ref inside the listener rather than in the effect's own
  // dependency array — vp changes on every pan/zoom/rotate frame, and
  // config/tool/presetName/baseSize each change independently too; tearing
  // the native listener down and rebuilding it on every one of those would
  // also throw away the cached bounding-rect below. Same reasoning as
  // Room's own #37 cursor-broadcast effect.
  const stateRef = useRef({ tool, presetName, baseSize, vp, config, markerAngleRadians, markerFollowStroke })
  stateRef.current = { tool, presetName, baseSize, vp, config, markerAngleRadians, markerFollowStroke }

  useEffect(() => {
    if (!DAB_TOOLS.has(tool)) {
      if (circleRef.current) circleRef.current.style.display = 'none'
      if (lineRef.current) lineRef.current.style.display = 'none'
    }
  }, [tool])

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
      if (lineRef.current) lineRef.current.style.display = 'none'
    }

    const applyAt = (clientX: number, clientY: number, pressure: number, tiltX: number, tiltY: number) => {
      const circle = circleRef.current
      const line = lineRef.current
      if (!circle || !line) return
      const {
        tool: curTool, presetName: curPreset, baseSize: curBaseSize, vp: curVp, config: curConfig,
        markerAngleRadians: curMarkerAngle, markerFollowStroke: curMarkerFollow,
      } = stateRef.current
      if (!DAB_TOOLS.has(curTool)) { hide(); return }

      const rect = rectCache ??= el.getBoundingClientRect()
      const { x, y } = clientToRoomPoint(clientX, clientY, rect, curVp, curConfig)
      const { size, aspectRatio, angle } = previewDabShape(
        curTool, curPreset, curBaseSize, pressure, tiltX, tiltY, 0,
        { angle: curMarkerAngle, followStrokeDirection: curMarkerFollow },
      )
      const diameter = Math.max(size, 2)

      circle.style.display = 'block'
      circle.style.width = `${diameter}px`
      circle.style.height = `${diameter}px`
      circle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`

      if (aspectRatio >= MIN_ASPECT_FOR_LINE) {
        // Full long-axis length of the dab ellipse — DAB_VERT scales the
        // quad's local X axis by aspectRatio before rotating by `angle`
        // (shaders.ts), so the actual painted footprint's long axis is
        // exactly `size * aspectRatio`, not just `size`.
        const lineLen = size * aspectRatio
        line.style.display = 'block'
        line.style.width = `${lineLen}px`
        line.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad)`
      } else {
        line.style.display = 'none'
      }
    }

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !touchActiveRef.current) return
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
    el.addEventListener('pointerleave', hide)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerdown', handleDown)
      el.removeEventListener('pointerup', handleTouchEnd)
      el.removeEventListener('pointercancel', handleTouchEnd)
      el.removeEventListener('pointerleave', hide)
      observer.disconnect()
    }
  }, [vpRef])

  return (
    <div className={styles.brushCursorLayer}>
      <div ref={circleRef} className={styles.brushCursorCircle} />
      <div ref={lineRef} className={styles.brushCursorLine} />
    </div>
  )
}
