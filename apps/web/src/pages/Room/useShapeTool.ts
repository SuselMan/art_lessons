import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { OperationDraft, ShapeFrame } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './cameraMath'
import {
  frameFromDrag, frameFromHandleDrag, isDrawableFrame, shapeGeometryFrom, shapePaintFrom,
  type ShapeHandle,
} from './shapeTool'
import type { ShapeTool } from './toolSchemas'

// (#530) The shape tool's session: the drag that starts a shape, the handles
// that keep editing it, and the commit that finally writes one operation.
//
// A hook rather than another few hundred lines in Room/index.tsx, which is
// 7000 lines and the subject of its own decomposition task (#493). Everything
// with an opinion in it — what a modifier means, what a handle does to a frame
// — is in shapeTool.ts next door, where it is tested without a canvas; this
// file is the wiring: pointers in, preview and operations out.
//
// The lifecycle is the transform tool's, on purpose and through the same hook
// (#528): Enter and a click past the shape apply it, Esc drops it, switching
// tools applies it, and the page going away applies it. What is different is
// only what "apply" writes.

export interface ShapeToolArgs {
  /** The shape tool in hand, or null when the selected tool is not one. */
  tool: ShapeTool | null
  config: ({ infinite: boolean } & { width: number; height: number }) | null
  vpRef: RefObject<HTMLElement | null>
  engineRef: RefObject<PencilEngineAPI | null>
  paintTargetIdRef: RefObject<string | null>
  paintTargetLockedRef: RefObject<boolean>
  handActiveRef: RefObject<boolean>
  dispatchOp: (draft: OperationDraft) => unknown
}

export interface ShapeToolApi {
  /** The frame being edited, or null when no shape is open. */
  frame: ShapeFrame | null
  /** Canvas catcher handler — starts a new shape (applying any open one). */
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  /** Gizmo handler: the same handle kinds the transform gizmo reports. */
  onHandleDown: (handle: ShapeHandle, e: React.PointerEvent<SVGElement>) => void
  setFrame: (frame: ShapeFrame) => void
  commit: () => void
  cancel: () => void
}

export function useShapeTool({
  tool, config, vpRef, engineRef, paintTargetIdRef, paintTargetLockedRef, handActiveRef, dispatchOp,
}: ShapeToolArgs): ShapeToolApi {
  const frame = useRoomStore(s => s.shapeFrame)
  const setShapeFrame = useRoomStore(s => s.setShapeFrame)

  // The frame is read inside pointer handlers that are installed once per
  // gesture, so it also lives in a ref — the same split the transform session
  // keeps for the same reason.
  const frameRef = useRef<ShapeFrame | null>(frame)
  frameRef.current = frame
  const toolRef = useRef(tool)
  toolRef.current = tool

  const toPoint = useCallback((clientX: number, clientY: number) => {
    const el = vpRef.current
    if (!el || !config) return null
    return clientToRoomPoint(clientX, clientY, el.getBoundingClientRect(), useRoomStore.getState().viewport, config)
  }, [config, vpRef])

  /** Draws the shape as it currently stands, without writing to the layer. */
  const paintPreview = useCallback((next: ShapeFrame | null) => {
    const engine = engineRef.current
    const layerId = paintTargetIdRef.current
    const shapeTool = toolRef.current
    if (!engine || !layerId || !shapeTool) return
    if (!next) { engine.clearLayerTransformPreview(); return }
    const values = useRoomStore.getState().toolSettings[shapeTool]
    const paint = shapePaintFrom(values)
    engine.previewShape(layerId, shapeGeometryFrom(shapeTool, values), next, paint.stroke, paint.fill)
  }, [engineRef, paintTargetIdRef])

  const setFrame = useCallback((next: ShapeFrame) => {
    frameRef.current = next
    setShapeFrame(next)
    paintPreview(next)
  }, [paintPreview, setShapeFrame])

  const cancel = useCallback(() => {
    if (!frameRef.current) return
    frameRef.current = null
    setShapeFrame(null)
    engineRef.current?.clearLayerTransformPreview()
  }, [engineRef, setShapeFrame])

  const commit = useCallback(() => {
    const open = frameRef.current
    const shapeTool = toolRef.current
    // Cleared before the dispatch, not after: appending the operation makes
    // the engine paint it for real, and a preview still standing at that
    // moment would show the shape twice for a frame.
    frameRef.current = null
    setShapeFrame(null)
    engineRef.current?.clearLayerTransformPreview()
    if (!open || !shapeTool || !isDrawableFrame(open)) return
    const layerId = paintTargetIdRef.current
    if (!layerId || paintTargetLockedRef.current) return
    const values = useRoomStore.getState().toolSettings[shapeTool]
    const paint = shapePaintFrom(values)
    // A shape with neither stroke nor fill provably paints nothing, and the
    // log is permanent — see ShapeOperation.
    if (!paint.stroke && !paint.fill) return
    dispatchOp({
      type: 'shape',
      layerId,
      geometry: shapeGeometryFrom(shapeTool, values),
      frame: open,
      stroke: paint.stroke,
      fill: paint.fill,
    })
  }, [dispatchOp, engineRef, paintTargetIdRef, paintTargetLockedRef, setShapeFrame])

  const commitRef = useRef(commit)
  commitRef.current = commit

  /** Runs one pointer drag, resolving each move from the drag's own origin. */
  const runDrag = useCallback((
    target: HTMLElement | SVGElement, pointerId: number,
    resolve: (current: { x: number; y: number }, ev: PointerEvent) => ShapeFrame,
  ) => {
    try { target.setPointerCapture(pointerId) } catch { /* context loss */ }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const p = toPoint(ev.clientX, ev.clientY)
      if (p) setFrame(resolve(p, ev))
    }
    // On `window` rather than on the element the press landed on: a drag that
    // sizes a shape routinely leaves the catcher (a corner handle dragged past
    // the edge of the viewport, a frame pulled off the sheet), and pointer
    // capture alone does not survive the element being unmounted mid-drag —
    // which is exactly what happens when the shape's own gizmo appears.
    const detach = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      // A press that drew nothing leaves no shape and no operation — the whole
      // of what "a click draws nothing" means (#525).
      const open = frameRef.current
      if (open && !isDrawableFrame(open)) cancel()
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      cancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [cancel, setFrame, toPoint])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    // Pen and mouse only, like every other canvas tool here: on a tablet a
    // finger pans and zooms, so a touch that reaches this is almost always the
    // first half of a two-finger gesture.
    if (e.pointerType === 'touch') return
    if (handActiveRef.current) return
    if (e.button !== 0) return
    const shapeTool = toolRef.current
    if (!shapeTool) return
    const start = toPoint(e.clientX, e.clientY)
    if (!start) return
    e.preventDefault()
    e.stopPropagation()
    // Starting a second shape applies the first: a drag that begins away from
    // the open shape means "that one is done, here is the next".
    if (frameRef.current) commitRef.current()

    const keepProportions = useRoomStore.getState().toolSettings[shapeTool].keepProportions === true
      || useRoomStore.getState().toolSettings[shapeTool].snapAngle === true
    const kind = shapeTool === 'line' ? 'line' : 'boxed'
    setFrame(frameFromDrag(kind, start, start, { keepProportions, shift: e.shiftKey, fromCenter: e.altKey }))
    runDrag(e.currentTarget, e.pointerId, (current, ev) => frameFromDrag(kind, start, current, {
      keepProportions, shift: ev.shiftKey, fromCenter: ev.altKey,
    }))
  }, [handActiveRef, runDrag, setFrame, toPoint])

  const onHandleDown = useCallback((handle: ShapeHandle, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    if (handActiveRef.current) return
    if (e.button !== 0) return
    const open = frameRef.current
    const shapeTool = toolRef.current
    if (!open || !shapeTool) return
    const start = toPoint(e.clientX, e.clientY)
    if (!start) return
    e.preventDefault()
    e.stopPropagation()
    const keepProportions = useRoomStore.getState().toolSettings[shapeTool].keepProportions === true
    runDrag(e.currentTarget, e.pointerId, (current, ev) => frameFromHandleDrag(open, handle, start, current, {
      keepProportions, shift: ev.shiftKey,
    }))
  }, [handActiveRef, runDrag, toPoint])

  // Every setting a shape reads is live while it is open: change the corner
  // radius, the colours or the number of points and the shape on screen
  // follows. That is the whole promise of "editable until confirmed" — the
  // panel and the handles are two ways of editing the same unconfirmed thing.
  const toolSettings = useRoomStore(s => s.toolSettings)
  useEffect(() => {
    if (!frame) return
    paintPreview(frame)
  }, [frame, toolSettings, paintPreview])

  // Putting the tool down applies the shape, exactly as it applies a transform
  // (#528). The cleanup runs on tool change and on leaving the room.
  useEffect(() => {
    if (!tool) return
    return () => { commitRef.current() }
  }, [tool])

  return { frame, onPointerDown, onHandleDown, setFrame, commit, cancel }
}
