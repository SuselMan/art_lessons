import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { OperationDraft, ShapeFrame } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint } from './cameraMath'
import {
  frameFromDrag, frameFromHandleDrag, isDrawableFrame, shapeGeometryFrom, shapePaintFrom,
  type ShapeHandle,
} from './shapeTool'
import { shapeKindOf } from './toolSchemas'

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
  /** The viewport element presses are watched on while the tool is in hand. */
  vpEl: HTMLElement | null
  /** True while the shape tool is in hand. Which shape it draws is read from
   *  its settings at the moment it is needed — changing the kind mid-session
   *  changes the open shape, like every other setting does. */
  active: boolean
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
  /** Gizmo handler: the same handle kinds the transform gizmo reports. */
  onHandleDown: (handle: ShapeHandle, e: React.PointerEvent<SVGElement>) => void
  setFrame: (frame: ShapeFrame) => void
  commit: () => void
  cancel: () => void
}

export function useShapeTool({
  active, config, vpEl, vpRef, engineRef, paintTargetIdRef, paintTargetLockedRef, handActiveRef, dispatchOp,
}: ShapeToolArgs): ShapeToolApi {
  const frame = useRoomStore(s => s.shapeFrame)
  const setShapeFrame = useRoomStore(s => s.setShapeFrame)

  // The frame is read inside pointer handlers that are installed once per
  // gesture, so it also lives in a ref — the same split the transform session
  // keeps for the same reason.
  const frameRef = useRef<ShapeFrame | null>(frame)
  frameRef.current = frame
  const activeRef = useRef(active)
  activeRef.current = active

  const toPoint = useCallback((clientX: number, clientY: number) => {
    const el = vpRef.current
    if (!el || !config) return null
    return clientToRoomPoint(clientX, clientY, el.getBoundingClientRect(), useRoomStore.getState().viewport, config)
  }, [config, vpRef])

  /** Draws the shape as it currently stands, without writing to the layer. */
  const paintPreview = useCallback((next: ShapeFrame | null) => {
    const engine = engineRef.current
    const layerId = paintTargetIdRef.current
    if (!engine || !layerId || !activeRef.current) return
    if (!next) { engine.clearLayerTransformPreview(); return }
    const settings = useRoomStore.getState().toolSettings
    const paint = shapePaintFrom(settings.shape)
    engine.previewShape(
      layerId, shapeGeometryFrom(shapeKindOf(settings), settings.shape), next, paint.stroke, paint.fill,
    )
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
    const wasActive = activeRef.current
    // Cleared before the dispatch, not after: appending the operation makes
    // the engine paint it for real, and a preview still standing at that
    // moment would show the shape twice for a frame.
    frameRef.current = null
    setShapeFrame(null)
    engineRef.current?.clearLayerTransformPreview()
    if (!open || !wasActive || !isDrawableFrame(open)) return
    const layerId = paintTargetIdRef.current
    if (!layerId || paintTargetLockedRef.current) return
    const settings = useRoomStore.getState().toolSettings
    const paint = shapePaintFrom(settings.shape)
    // A shape with neither stroke nor fill provably paints nothing, and the
    // log is permanent — see ShapeOperation.
    if (!paint.stroke && !paint.fill) return
    dispatchOp({
      type: 'shape',
      layerId,
      geometry: shapeGeometryFrom(shapeKindOf(settings), settings.shape),
      frame: open,
      stroke: paint.stroke,
      fill: paint.fill,
    })
  }, [dispatchOp, engineRef, paintTargetIdRef, paintTargetLockedRef, setShapeFrame])

  const commitRef = useRef(commit)
  commitRef.current = commit

  /** Runs one pointer drag, resolving each move from the drag's own origin. */
  const runDrag = useCallback((
    pointerId: number,
    resolve: (current: { x: number; y: number }, ev: PointerEvent) => ShapeFrame,
  ) => {

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

  const onPointerDown = useCallback((e: PointerEvent) => {
    // Pen and mouse only, like every other canvas tool here: on a tablet a
    // finger pans and zooms, so a touch that reaches this is almost always the
    // first half of a two-finger gesture.
    if (e.pointerType === 'touch') return
    if (handActiveRef.current) return
    if (e.button !== 0) return
    if (!activeRef.current) return
    // A press on the open shape's own handles belongs to the gizmo, and this
    // listener sees it *first*: a native listener on an ancestor runs before
    // React's delegated one at the root, so `stopPropagation` in the gizmo's
    // handler comes too late to help. Hit-testing the target is what tells
    // "resize this shape" from "start the next one".
    if ((e.target as Element | null)?.closest('[data-transform-gizmo]')) return
    const start = toPoint(e.clientX, e.clientY)
    if (!start) return
    e.preventDefault()
    // Starting a second shape applies the first: a drag that begins away from
    // the open shape means "that one is done, here is the next".
    if (frameRef.current) commitRef.current()

    const settings = useRoomStore.getState().toolSettings
    const shapeKind = shapeKindOf(settings)
    // The line's toggle asks a different question (snap the angle) but answers
    // the same modifier, so the two share one flag from here down.
    const keepProportions = shapeKind === 'line'
      ? settings.shape.snapAngle === true
      : settings.shape.keepProportions === true
    const kind = shapeKind === 'line' ? 'line' : 'boxed'
    setFrame(frameFromDrag(kind, start, start, { keepProportions, shift: e.shiftKey, fromCenter: e.altKey }))
    runDrag(e.pointerId, (current, ev) => frameFromDrag(kind, start, current, {
      keepProportions, shift: ev.shiftKey, fromCenter: ev.altKey,
    }))
  }, [handActiveRef, runDrag, setFrame, toPoint])

  const onPointerDownRef = useRef(onPointerDown)
  onPointerDownRef.current = onPointerDown

  // (#530) On the viewport, natively, exactly as the transform tool's own
  // click-past listener is — and for a reason that cost a debugging session:
  // a full-viewport catcher div (the pattern the ruler, the fill and the
  // selection all use) sits *above* the gizmo, because the gizmo lives inside
  // `.canvasWrap`, which carries the viewport transform and therefore its own
  // stacking context. No z-index inside that context can lift a handle above a
  // catcher outside it, so with a catcher the handles were unreachable: every
  // press on a corner started another shape instead of resizing this one.
  //
  // The canvas below is made inert while a shape tool is in hand (see its
  // `pointerEvents`), which is the other half of what the catcher was doing.
  useEffect(() => {
    if (!active || !vpEl) return
    const onDown = (e: PointerEvent): void => { onPointerDownRef.current(e) }
    vpEl.addEventListener('pointerdown', onDown)
    return () => { vpEl.removeEventListener('pointerdown', onDown) }
  }, [active, vpEl])

  const onHandleDown = useCallback((handle: ShapeHandle, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    if (handActiveRef.current) return
    if (e.button !== 0) return
    const open = frameRef.current
    if (!open || !activeRef.current) return
    const start = toPoint(e.clientX, e.clientY)
    if (!start) return
    e.preventDefault()
    e.stopPropagation()
    const keepProportions = useRoomStore.getState().toolSettings.shape.keepProportions === true
    runDrag(e.pointerId, (current, ev) => frameFromHandleDrag(open, handle, start, current, {
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
    if (!active) return
    return () => { commitRef.current() }
  }, [active])

  return { frame, onHandleDown, setFrame, commit, cancel }
}
