import { useCallback, useRef, useState, type RefObject } from 'react'

import { BACKGROUND_LAYER_ID, type OperationDraft } from '@grafetto/shared'

import type { AreaImage, PencilEngineAPI } from '../../engine'
import { isLayerLocked } from '../../lib/layers/layers'
import { readClipboard, writeClipboard } from '../../stores/clipboardStore'
import { useRoomStore } from '../../stores/roomStore'
import { clientToRoomPoint, viewCentreWorld } from './viewport/cameraMath'
import { ClickTracker } from './gestures/clickTracker'
import { pastePlacement } from './editing/pastePlacement'
import {
  appendFreehandPoint, closeAfterDoubleClick, closesPolygon, rectangleFromDrag,
  selectionFromPoints, POLYGON_CLOSE_RADIUS, type SelectionShapeKind,
} from './gestures/selectionGesture'
import { useCanvasTap } from './gestures/useCanvasTap'
import type { DispatchedOp } from './useTransformSession'

export interface SelectionDeps {
  roomId: string | undefined
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  /** The same element as state, for the finger tap's listener to attach to. */
  vpEl: HTMLDivElement | null
  handActive: boolean
  handActiveRef: RefObject<boolean>
  engineRef: RefObject<PencilEngineAPI | null>
  dispatchOp: (draft: OperationDraft) => DispatchedOp | null
  /** The layer a pixel action lands on, and whether it refuses paint — Room's
   *  own, because the shape tool and the fill read the same two. */
  paintTargetIdRef: RefObject<string | null>
  paintTargetLockedRef: RefObject<boolean>
  isOwnerRef: RefObject<boolean>
  /** Where a paste parks its pixels for the transform session to place. */
  pendingPasteRef: RefObject<AreaImage | null>
}

/** (#493) The selection on the Room side (#446): the three gestures that draw
 *  an outline, the finger tap that puts one down (#519), and the four things
 *  that can be done with it — copy, delete, cut, paste.
 *
 *  The selection itself lives in the store (selectionSlice.ts); this is what
 *  makes and uses it. Store-owned inputs are read here directly; what Room
 *  derives itself comes in.
 *
 *  The refs that come in are named in the callbacks' dependency lists: as
 *  parameters the lint rule no longer recognises them as refs, and a ref
 *  object never changes identity, so naming it costs nothing. Their
 *  `.current` is read at call time, on purpose, and never listed. */
export function useSelection({
  roomId, vpRef, vpEl, handActive, handActiveRef, engineRef, dispatchOp,
  paintTargetIdRef, paintTargetLockedRef, isOwnerRef, pendingPasteRef,
}: SelectionDeps) {
  const config = useRoomStore(s => s.room)
  const enginePageW = config?.width
  const enginePageH = config?.height
  const selectionActive = useRoomStore(s => s.tool) === 'selection'
  const setSelection = useRoomStore(s => s.setSelection)
  const setPendingSelection = useRoomStore(s => s.setPendingSelection)
  const setTool = useRoomStore(s => s.setTool)

  // ── Selection gestures (#446) ──────────────────────────────────────────
  //
  // One catcher, three gestures, told apart by the tool's own `shape` setting
  // — the same "the tool decides what a press means" shape Room's handleRulerDown
  // has. Pen and mouse only, like every other canvas gesture in this editor
  // (see handleRulerDown's own touch guard): on a tablet a finger moves the
  // view, and a lasso that fought the pan would make both unusable. The one
  // thing a finger does get is the tap that clears a finished selection —
  // see clearSelectionOnTap below, which is a different gesture on a different
  // element and never competes with a pan.
  const selectionShapeKind = useRoomStore(s => s.toolSettings.selection.shape) as SelectionShapeKind
  // Where the pointer is, for the point-by-point lasso's rubber band. State
  // rather than a ref because the overlay draws it; only written while a
  // polygon is actually open, so it costs nothing the rest of the time.
  const [selectionCursor, setSelectionCursor] = useState<{ x: number; y: number } | null>(null)
  const selectionRectRef = useRef<DOMRect | null>(null)

  const finishSelection = useCallback((points: number[]) => {
    setPendingSelection(null)
    setSelectionCursor(null)
    // A shape with no inside clears the selection rather than leaving an
    // invisible sliver behind — see selectionFromPoints on why a tap and a
    // twitch must both land here.
    setSelection(selectionFromPoints(points))
  }, [setPendingSelection, setSelection])

  const handleSelectionDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Drawing an outline is pen and mouse only (see the block comment above);
    // a finger falls through to the pan, and is read for a tap separately.
    if (e.pointerType === 'touch') return
    // Same precedence as the ruler's: while the hand is up (or Space is held),
    // a drag on the canvas moves the view.
    if (handActive) return
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    const rect = selectionRectRef.current = el.getBoundingClientRect()
    const vpNow = useRoomStore.getState().viewport
    const toPoint = (clientX: number, clientY: number) => clientToRoomPoint(clientX, clientY, rect, vpNow, config)
    const start = toPoint(e.clientX, e.clientY)

    // The point-by-point lasso is the one gesture that is not a drag: each
    // press places a vertex, and the selection closes when a press lands back
    // on the first one (or on Enter — see Room's key handler).
    if (selectionShapeKind === 'polygon') {
      const open = useRoomStore.getState().pendingSelection
      if (open && open.length >= 2) {
        if (closesPolygon(open, start.x, start.y, POLYGON_CLOSE_RADIUS / vpNow.zoom)) {
          finishSelection(open)
          return
        }
        setPendingSelection([...open, start.x, start.y])
        return
      }
      setPendingSelection([start.x, start.y])
      return
    }

    const overlay = e.currentTarget
    const pointerId = e.pointerId
    try { overlay.setPointerCapture(pointerId) } catch { /* context loss */ }
    // (#484) Did this press ever become a drag? Same recognizer and the same
    // slop as the click that ends a transform (useCommittableSession), because it is the same
    // question asked of the same hand — and the answer decides whether the
    // release *replaces* the selection or *clears* it.
    const clicks = new ClickTracker()
    clicks.down(pointerId, e.clientX, e.clientY)
    let points: number[] = [start.x, start.y]
    setPendingSelection(selectionShapeKind === 'rectangle'
      ? rectangleFromDrag(start.x, start.y, start.x, start.y).points
      : points)

    const detach = () => {
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      overlay.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      clicks.move(pointerId, ev.clientX, ev.clientY)
      const p = toPoint(ev.clientX, ev.clientY)
      if (selectionShapeKind === 'rectangle') {
        points = rectangleFromDrag(start.x, start.y, p.x, p.y).points
        setPendingSelection(points)
        return
      }
      const next = appendFreehandPoint(points, p.x, p.y)
      if (next === points) return
      points = next
      setPendingSelection(points)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      // A press that never left the slop is a tap, and a tap on the canvas
      // with the selection tool in hand means "clear it" — the same thing a
      // tap past the gizmo means for a transform, which is the point: the
      // gesture reads the same to the hand, so it must mean the same thing.
      //
      // Handing finishSelection no points rather than the collected ones is
      // the whole of it. selectionFromPoints already drops a shape with no
      // inside, and with a mouse that was enough — a click with no pointermove
      // never got past two points. A pen never manages that: on a digitiser a
      // still hand is not a still pointer, so a tap arrives with a pixel or
      // two of travel and draws a rectangle that genuinely has an area. What
      // it leaves behind is invisible at any sane zoom and silently scopes the
      // next fill, transform or delete to nothing (Ilya, 22.08). Raising the
      // area test instead would be the wrong knob: it answers "is this shape a
      // region", in layer pixels, and how big a wobble is on screen is not its
      // question.
      finishSelection(clicks.up(pointerId) ? [] : points)
    }
    // A pointer the browser takes over (a system gesture, a palm the digitiser
    // changes its mind about) never releases here. Drop the half-drawn outline
    // and leave the existing selection alone: nothing was decided, so neither
    // replacing nor clearing it is right.
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      clicks.cancel(pointerId)
      setPendingSelection(null)
      setSelectionCursor(null)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
    overlay.addEventListener('pointercancel', onCancel)
  }, [vpRef, config, handActive, selectionShapeKind, setPendingSelection, finishSelection])

  // The other way to end a point-by-point lasso, and the one people reach for
  // first: a double-click anywhere, rather than having to hit the first vertex
  // again. Clicking that vertex still works (closesPolygon above), and so does
  // Enter — three ways out of the same gesture, because a lasso you cannot
  // finish is a tool that has taken the canvas hostage.
  const handleSelectionDoubleClick = useCallback(() => {
    const open = useRoomStore.getState().pendingSelection
    if (!open) return
    setPendingSelection(null)
    setSelectionCursor(null)
    setSelection(closeAfterDoubleClick(open))
  }, [setPendingSelection, setSelection])

  // Rubber band for the open point-by-point lasso — the only gesture with
  // something to show between presses.
  const handleSelectionHover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (selectionShapeKind !== 'polygon') return
    if (!useRoomStore.getState().pendingSelection) return
    const el = vpRef.current
    if (!el || !config) return
    const rect = selectionRectRef.current ??= el.getBoundingClientRect()
    setSelectionCursor(clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config))
  }, [vpRef, config, selectionShapeKind])

  // (#519) The one thing a finger may do with the selection tool: put the
  // selection down. Drawing an outline stays pen-and-mouse (see the guard at
  // the top of handleSelectionDown — on a tablet a finger pans and pinches the
  // view, and a lasso that fought that would make both unusable), but
  // *clearing* one is not drawing, and the tap that means it is the same tap
  // that ends a transform session past the gizmo. Until this, the only way to
  // drop a selection on a tablet was to poke the canvas with the pen — the
  // drawing hand doing a piece of UI work, and a poke that reads as the start
  // of a stroke right up until it isn't (Ilya, 31.08).
  //
  // A TapTracker gesture (useCanvasTap) rather than the ClickTracker the
  // transform's own effect uses, and the difference is why the two are not one
  // shared handler: that gesture is made with a stylus, where a palm on the
  // glass is normal and every pointer has to be judged alone; this one is made
  // with a finger, on a tool whose other touch gestures are pan and pinch. A
  // per-pointer recognizer would read the anchored thumb of a pinch as a tap
  // and clear the selection every time someone zoomed.
  //
  // An open lasso is left alone: it belongs to the pen that is drawing it, and
  // Esc (or the pen itself) is what abandons it. Nothing to clear, nothing
  // happens — which is also what keeps the chrome toggle armed, see
  // canvasTapClaimed in Room.
  const clearSelectionOnTap = useCallback(() => {
    // Same precedence as every other canvas gesture: while the hand is up, a
    // touch belongs to the view.
    if (handActiveRef.current) return
    const state = useRoomStore.getState()
    if (state.pendingSelection || !state.selection) return
    setSelection(null)
  }, [setSelection, handActiveRef])
  useCanvasTap(vpEl, clearSelectionOnTap, selectionActive)

  // ── What can be done with a selection (#446) ───────────────────────────
  //
  // Copy is the only one that is not an operation: it reads pixels into this
  // participant's own clipboard and changes nothing anyone else can see. The
  // other three go through dispatchOp, so they queue, retry and undo exactly
  // like a stroke.

  // (#521) The copy stamps the room onto the record, because from here the
  // pixels can outlive this room: the rect is world coordinates, and world
  // coordinates only mean something against the room they were measured in
  // (see pastePlacement.ts).
  //
  // Still returns whether it worked, and now it has a second way not to —
  // storage. `writeClipboard` answers false when the raster could not be
  // persisted (quota, a browser refusing storage), and `cutSelection` below
  // depends on that answer being honest.
  const copySelection = useCallback(async (): Promise<boolean> => {
    const engine = engineRef.current
    const current = useRoomStore.getState().selection
    const layerId = paintTargetIdRef.current
    if (!engine || !current || !layerId || !roomId) return false
    const copied = await engine.readAreaImage(layerId, current)
    if (!copied) return false
    return writeClipboard({ ...copied, roomId, updatedAt: Date.now() })
  }, [roomId, engineRef, paintTargetIdRef])

  const deleteSelectionContents = useCallback(() => {
    const current = useRoomStore.getState().selection
    const layerId = paintTargetIdRef.current
    if (!current || !layerId || paintTargetLockedRef.current) return
    dispatchOp({ type: 'area_clear', layerId, selection: current })
  }, [dispatchOp, paintTargetIdRef, paintTargetLockedRef])

  const cutSelection = useCallback(async () => {
    // (#518) Checked here as well as inside the erase half, and not only for
    // symmetry: without it a cut on a locked layer would fill the clipboard
    // and then quietly fail to erase, i.e. behave as a copy while reporting
    // itself as a cut. Refusing the whole gesture is the honest answer.
    if (paintTargetLockedRef.current) return
    // Erases only if the pixels were genuinely captured: a cut that emptied
    // the region and then failed to fill the clipboard would destroy work with
    // nothing left to paste back.
    if (await copySelection()) deleteSelectionContents()
  }, [copySelection, deleteSelectionContents, paintTargetLockedRef])

  // (#446) Paste puts the pixels *above* the active layer, not into it, and
  // hands them to the transform tool to place — a floating selection. Nothing
  // is written until the float is dropped (see commitTransformSession), which
  // is what makes "paste, then move it" move the pasted piece alone instead of
  // it plus whatever it landed on.
  //
  // Selecting the transform tool is part of the paste, not a convenience: the
  // float is held by the transform session, and the gizmo is how a person
  // places it. Same thing every editor does when it drops you into Move after
  // a paste.
  //
  // (#521) The pixels are fetched here rather than held in the store, because
  // the clipboard now outlives this room and this tab — see clipboardStore.ts.
  // That makes the whole thing async, which it effectively already was: the
  // float could never appear before `preloadImage` had decoded the raster
  // anyway.
  const pasteClipboard = useCallback(async () => {
    const record = await readClipboard()
    const state = useRoomStore.getState()
    // Onto the *active* layer, not the layer the pixels came from — pasting
    // onto another layer is the case this whole feature was asked for.
    const targetId = state.layerState.activeId
    if (!record || !targetId || targetId === BACKGROUND_LAYER_ID) return
    // (#518) A float is placed by the transform session, and a locked layer is
    // not among its targets — so without this the pasted piece would open a
    // session holding nothing: no preview on screen, and a commit with an
    // empty transform list. Refusing the paste says the same thing in one
    // step.
    if (isLayerLocked(state.layerState, targetId, isOwnerRef.current)) return
    // (#521) Where it lands: in place within the room it was copied from, on
    // the middle of the view when it came from another one. pastePlacement.ts
    // carries the reasoning; the viewport centre is measured here because only
    // this component can see the element.
    const el = vpRef.current
    const { x, y } = pastePlacement(
      record, roomId,
      el ? viewCentreWorld(el.clientWidth, el.clientHeight, state.viewport, enginePageW, enginePageH) : null,
    )
    const entry: AreaImage = { image: record.image, x, y, width: record.width, height: record.height }
    const engine = engineRef.current
    await engine?.preloadImage(entry.image)
    pendingPasteRef.current = entry
    // The float occupies exactly the rect it is placed at, so the region is
    // known — selecting it is what gives the gizmo its frame, and what the
    // next cut/copy would act on once the float is down.
    setSelection(rectangleFromDrag(entry.x, entry.y, entry.x + entry.width, entry.y + entry.height))
    setTool('transform')
  }, [setSelection, setTool, roomId, vpRef, enginePageW, enginePageH, engineRef, isOwnerRef, pendingPasteRef])

  return {
    selectionShapeKind, selectionCursor, setSelectionCursor, selectionRectRef, finishSelection,
    handleSelectionDown, handleSelectionDoubleClick, handleSelectionHover,
    copySelection, deleteSelectionContents, cutSelection, pasteClipboard,
  }
}
