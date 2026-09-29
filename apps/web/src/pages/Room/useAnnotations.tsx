import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nanoid } from 'nanoid'

import type { AnnotationShape, OperationDraft } from '@grafetto/shared'

import { rgbToHex } from '../../lib/browser/color'
import { isMeaningfulShape, prepareInkPoints } from '../../lib/annotations/annotations'
import { CLICK_MOVE_THRESHOLD_PX, TAP_MOVE_THRESHOLD_PX } from '../../lib/input/tapThreshold'
import { useRoomStore } from '../../stores/roomStore'
import type { EditorTool } from '../../stores/slices/toolSlice'
import { annotationAt } from './editing/annotationHitTest'
import { clientToRoomPoint } from './viewport/cameraMath'
import { getToolColor } from './tools/toolSchemas'
import { useCatcherHole } from './editing/useCatcherHole'
import type { DispatchedOp } from './useTransformSession'

/** (#510) How far apart two live ink samples must be, in world units, before
 *  the second is kept. Purely a bound on the array being built during the
 *  gesture — the payload that reaches the log is decided by prepareInkPoints
 *  on release, which measures against the mark's own width instead. World
 *  units rather than screen ones because that is what the array holds; at high
 *  zoom a screen-space threshold would throw away detail the user can see. */
const LIVE_INK_MIN_STEP = 0.75

/** (#511) How long a press on the hide button counts as "hold to peek" rather
 *  than as a tap that toggles. Past this, releasing brings the notes back. */
const HOLD_TO_PEEK_MS = 250

/** One shared empty set, so "nothing is being erased" is always the same
 *  reference and never re-renders the overlay by itself. */
const EMPTY_ERASING: ReadonlySet<string> = new Set()

/** Simplification tolerance as a fraction of the mark's own stroke width. A
 *  deviation smaller than a quarter of the line drawing it is inside the line,
 *  so no reader can tell it was dropped — which is the only argument that
 *  should decide a lossy simplification. */
const INK_SIMPLIFY_FACTOR = 0.25

/** (#509 v5) How long a new note waits, while minimal UI's double tap is armed,
 *  to see whether a second tap is coming.
 *
 *  Deliberately far below `DOUBLE_TAP_MAX_DELAY_MS` (400 ms), which is the
 *  *outer* bound of that gesture. Waiting the full window made every single
 *  note feel like the app was thinking about it (Ilya), and paying the worst
 *  case on the common action to protect the rare one is the wrong way round.
 *
 *  What makes the short value safe is that overshooting costs nothing: a double
 *  tap slower than this opens an empty note, and `toggleUI` closes it again the
 *  moment the gesture completes — an empty draft is local state and records no
 *  operation. So this only has to cover the *brisk* double tap, where the two
 *  taps come within a couple of frames of each other and an editor flashing
 *  open would be visible. */
const NOTE_DOUBLE_TAP_GRACE_MS = 160

export interface AnnotationsDeps {
  dispatchOp: (draft: OperationDraft) => DispatchedOp | null
  selectTool: (next: EditorTool) => void
  /** The viewport container — pointer positions are measured against it. */
  vpRef: RefObject<HTMLDivElement | null>
  handActive: boolean
  /** The phone-sized "annotations only" shell (#512). */
  compact: boolean
  /** Annotating in the compact shell, where a finger is the pen. */
  annotateWithFinger: boolean
  onPersonalBoard: boolean
  isOwner: boolean
  /** Minimal UI's double tap and a note's own tap share one gesture, and
   *  these two are how Room and this hook tell each other which it was. */
  doubleTapArmedRef: RefObject<boolean>
  pendingNoteRef: RefObject<{ timer: number } | null>
}

/** (#493) The whole of annotations on the Room side (#509/#510, epic #87):
 *  the text note's draft and its pin, the annotation pen with its live ink,
 *  the annotation eraser, hold-to-peek, and entering and leaving the mode.
 *
 *  What comes back is what the page's markup and keyboard handling read. That
 *  is a long list, and honestly so: this is a UI mode, and a mode's controller
 *  is its handlers. Store-owned inputs are read here directly; what Room
 *  derives itself comes in. */
export function useAnnotations({
  dispatchOp, selectTool, vpRef, handActive, compact, annotateWithFinger,
  onPersonalBoard, isOwner, doubleTapArmedRef, pendingNoteRef,
}: AnnotationsDeps) {
  const config = useRoomStore(s => s.room)
  const boardId = useRoomStore(s => s.boardId)
  const tool = useRoomStore(s => s.tool)
  const annotateTextActive = tool === 'annotateText'
  const annotationDraft = useRoomStore(s => s.annotationDraft)
  const setAnnotationMode = useRoomStore(s => s.setAnnotationMode)
  const setAnnotationsHidden = useRoomStore(s => s.setAnnotationsHidden)
  // ── Annotations (#509/#510, эпик #87) ───────────────────────────────────
  //
  // Both gestures live here rather than in AnnotationOverlay, and that split is
  // the same one the ruler and the selection already use: the overlay draws,
  // Room's own catcher catches. It is what keeps a note on screen under another
  // tool from being draggable under it.

  /** The ink gesture in progress, in world coordinates. State (not a ref) —
   *  the line has to appear under the finger as it is drawn, so every sample
   *  re-renders the overlay. */
  const [liveInk, setLiveInk] = useState<{ points: number[]; color: string; size: number } | null>(null)
  /** Annotations the eraser has swept over this gesture, faded but not yet
   *  gone — see handleAnnotationEraseDown. */
  const [erasingIds, setErasingIds] = useState<ReadonlySet<string>>(EMPTY_ERASING)
  /** Whether the pointer is over something an annotation tool can act on.
   *
   *  Has to be tracked here rather than left to `cursor: pointer` on the pin
   *  and the two buttons, because none of them ever sees the pointer: the
   *  catcher covers the whole viewport and the cursor is whatever *it* says.
   *  Same reason those elements are hit-tested instead of clicked. */
  const [annotationHover, setAnnotationHover] = useState(false)
  /** The pin being dragged, at its live position — see startPinDrag. */
  const [pinDrag, setPinDrag] = useState<{ annotationId: string; x: number; y: number } | null>(null)
  /** The rendered annotation layer, so the catcher can hit-test notes against
   *  their real laid-out boxes — see annotationTextAt. */
  const annotationLayerRef = useRef<HTMLDivElement | null>(null)
  /** The note tool's catcher and the open editor's text field: presses on the
   *  field pass through the catcher so the caret can be placed by hand. */
  const annotationTextCatcherRef = useRef<HTMLDivElement | null>(null)
  const annotationDraftInputRef = useRef<HTMLTextAreaElement | null>(null)
  useCatcherHole(annotationTextCatcherRef, annotationDraftInputRef, annotateTextActive && annotationDraft !== null)
  /** The annotation gesture in progress, so a second finger can cancel it.
   *
   *  One gesture at a time, and this is what enforces it. Without it every
   *  finger that landed started its own mark: two fingers meant two lines
   *  drawn at once instead of the pinch a second finger means everywhere else
   *  in this app (reported by Ilya). The viewport half of that fix is in
   *  useViewport — it hands the tool's reserved finger over to the pinch on
   *  the same pointerdown this cancels the mark on. */
  const annotationGestureRef = useRef<{ pointerId: number; cancel: () => void } | null>(null)
  /** Read inside the two gesture handlers rather than closed over, so they do
   *  not have to be rebuilt when the shell changes. */
  const annotateWithFingerRef = useRef(false)
  annotateWithFingerRef.current = annotateWithFinger

  const annotationStyle = useCallback((toolId: 'annotateText' | 'annotatePen') => {
    const settings = useRoomStore.getState().toolSettings
    // Two different keys, because the two sizes are two different quantities:
    // the pen's is a stroke width in canvas units, the note's is a font size in
    // screen pixels (see toolSchemas' `textSize` for why the key differs too).
    const size = toolId === 'annotateText'
      ? settings.annotateText.textSize as number
      : settings.annotatePen.size as number
    return { color: rgbToHex(getToolColor(settings, toolId)), size }
  }, [])

  /** Records whatever the open draft says, then closes it.
   *
   *  One path for all four outcomes — new note, edited note, unchanged note,
   *  emptied note — because they are told apart by the draft's own fields and
   *  not by which call site got here. Every way a draft can end (Enter, blur,
   *  switching tool, leaving the room) funnels through this, so none of them
   *  can silently lose what was typed.
   *
   *  Emptying an existing note deletes it. That is the whole delete affordance
   *  for text, deliberately: it needs no button, no confirm and no second
   *  gesture to learn, and it is what anyone would try first.
   */
  const commitAnnotationDraft = useCallback(() => {
    const draft = useRoomStore.getState().annotationDraft
    if (!draft) return
    useRoomStore.getState().closeAnnotationDraft()
    const text = draft.text.trim()

    if (draft.annotationId === null) {
      if (!text) return // opened and abandoned — never existed, nothing to record
      dispatchOp({
        type: 'annotation_add',
        annotationId: nanoid(10),
        shape: { kind: 'text', x: draft.x, y: draft.y, color: draft.color, size: draft.size, text },
      })
      return
    }

    const existing = useRoomStore.getState().annotations.items[draft.annotationId]
    if (!existing) return // deleted under us (a peer, or an undo) while it was open
    if (!text) {
      dispatchOp({ type: 'annotation_delete', annotationIds: [draft.annotationId] })
      return
    }
    // Nothing changed: recording it anyway would put an entry on the undo
    // stack for having looked at a note.
    if (existing.kind === 'text' && existing.text === text) return
    dispatchOp({ type: 'annotation_update', annotationId: draft.annotationId, patch: { text } })
  }, [dispatchOp])

  const cancelAnnotationDraft = useCallback(() => {
    useRoomStore.getState().closeAnnotationDraft()
  }, [])

  const handleAnnotationHover = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // React bails out of a re-render when the value is unchanged, so this is a
    // hit test per pointermove and nothing else for the overwhelming majority
    // of them.
    setAnnotationHover(annotationAt(e.clientX, e.clientY) !== null)
  }, [])

  /** A tap on an existing note with the note tool in hand — reopen it for
   *  editing, keeping its own colour and size rather than the toolbar's. */
  const deleteAnnotations = useCallback((annotationIds: string[]) => {
    if (!annotationIds.length) return
    dispatchOp({ type: 'annotation_delete', annotationIds })
  }, [dispatchOp])

  /** The rail's "remove all": whatever note is open is dropped rather than
   *  committed — committing it first would put an edit on the undo stack above
   *  the deletion, the same reason the editor's own bin skips it. */
  const clearAllAnnotations = useCallback(() => {
    const state = useRoomStore.getState()
    state.closeAnnotationDraft()
    deleteAnnotations([...state.annotations.order])
  }, [deleteAnnotations])

  /** A press on a pin is two gestures that start identically: a tap folds the
   *  note away or opens it back up, a drag moves it. Which one it was is only
   *  known on release, so both are prepared here and the slop threshold decides
   *  — the same recognizer, and the same threshold, the selection tool uses to
   *  tell a click from a lasso.
   *
   *  The move is recorded once, on release. Emitting an `annotation_update` per
   *  pointermove would put a hundred entries on the undo stack for one drag and
   *  put a hundred operations on the wire for every participant to fold. */
  const startPinDrag = useCallback((e: React.PointerEvent<HTMLDivElement>, annotationId: string) => {
    const el = vpRef.current
    if (!el || !config) return
    const rect = el.getBoundingClientRect()
    const vpNow = useRoomStore.getState().viewport
    const toPoint = (clientX: number, clientY: number) =>
      clientToRoomPoint(clientX, clientY, rect, vpNow, config)
    const grabbed = useRoomStore.getState().annotations.items[annotationId]
    if (!grabbed || grabbed.kind !== 'text') return

    const overlay = e.currentTarget
    const pointerId = e.pointerId
    try { overlay.setPointerCapture(pointerId) } catch { /* context loss */ }

    const startClient = { x: e.clientX, y: e.clientY }
    const start = toPoint(e.clientX, e.clientY)
    // The grab offset, so the pin does not jump its own radius to sit under the
    // finger the moment the drag is recognized.
    const offset = { x: grabbed.x - start.x, y: grabbed.y - start.y }
    let moved = false
    let at = { x: grabbed.x, y: grabbed.y }

    const detach = () => {
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      overlay.removeEventListener('pointercancel', onCancel)
      if (annotationGestureRef.current?.pointerId === pointerId) annotationGestureRef.current = null
      try { overlay.releasePointerCapture(pointerId) } catch { /* already gone */ }
      setPinDrag(null)
    }
    annotationGestureRef.current = { pointerId, cancel: detach }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (!moved && Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) < TAP_MOVE_THRESHOLD_PX) return
      if (!moved) {
        // Dragging a note that is open for editing takes it out of editing
        // first, keeping whatever was typed. Moving something and writing in it
        // are two different acts, and trying to do both at once is what put two
        // pins on screen before this: the editor drew its own.
        commitAnnotationDraft()
      }
      moved = true
      const p = toPoint(ev.clientX, ev.clientY)
      at = { x: p.x + offset.x, y: p.y + offset.y }
      setPinDrag({ annotationId, ...at })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const wasDrag = moved
      const landed = at
      detach()
      if (wasDrag) {
        dispatchOp({ type: 'annotation_update', annotationId, patch: { x: landed.x, y: landed.y } })
        return
      }
      // A tap on the pin of the note being written finishes it, rather than
      // folding away a note whose editor is still open — which is what
      // "collapse" would have meant here, and it means nothing.
      if (useRoomStore.getState().annotationDraft?.annotationId === annotationId) {
        commitAnnotationDraft()
        return
      }
      useRoomStore.getState().toggleAnnotationCollapsed(annotationId)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      // Decided nothing: the pin snaps back to where it was, and nothing is
      // folded either.
      detach()
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
    overlay.addEventListener('pointercancel', onCancel)
  }, [vpRef, config, dispatchOp, commitAnnotationDraft])

  const handleEditAnnotationText = useCallback((annotationId: string) => {
    const annotation = useRoomStore.getState().annotations.items[annotationId]
    if (!annotation || annotation.kind !== 'text') return
    commitAnnotationDraft()
    useRoomStore.getState().openAnnotationDraft({
      annotationId,
      x: annotation.x,
      y: annotation.y,
      text: annotation.text,
      color: annotation.color,
      size: annotation.size,
    })
  }, [commitAnnotationDraft])

  /** A tap with the note tool: commit whatever was open, then open a new note
   *  where the tap landed. */
  const handleAnnotationTextTap = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Touch is refused unless the compact shell has switched finger-drawing
    // on (#512). Where it has, the first finger was reserved for this tool by
    // useViewport and never panned, so a touch reaching here was aimed at a
    // note; where it has not, this returns and the finger pans as it always
    // did.
    if (e.pointerType === 'touch' && !annotateWithFingerRef.current) return
    if (handActive) return
    // A second finger is a pinch, not a second note — see annotationGestureRef.
    const open = annotationGestureRef.current
    if (open && open.pointerId !== e.pointerId) { open.cancel(); return }
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    // Without this the note opens and closes again in the same gesture, which
    // is worth spelling out because nothing about it is visible: the draft's
    // <textarea> focuses itself the moment it mounts, and mousedown's *default
    // action* — moving focus to whatever was pressed, i.e. this catcher —
    // runs after the handler that mounted it. The textarea blurs, `onBlur`
    // commits an empty note, and the tap appears to do nothing at all.
    e.preventDefault()
    // What the press landed on decides what it means. Hit-tested here rather
    // than by letting the note be the event target, because it cannot be one:
    // this catcher sits above the whole overlay (see AnnotationOverlay's own
    // comment). Same arrangement the ruler uses.
    const hit = annotationAt(e.clientX, e.clientY)
    if (hit?.part === 'delete') {
      // Committing first would be pointless — and worse, an edit committed on
      // the way out would land on the undo stack above the deletion.
      useRoomStore.getState().closeAnnotationDraft()
      deleteAnnotations([hit.annotationId])
      return
    }
    if (hit?.part === 'done') {
      commitAnnotationDraft()
      return
    }
    if (hit?.part === 'pin') {
      startPinDrag(e, hit.annotationId)
      return
    }
    if (hit?.part === 'bubble' && hit.annotationId !== useRoomStore.getState().annotationDraft?.annotationId) {
      handleEditAnnotationText(hit.annotationId)
      return
    }
    if (hit) return

    // A new note is placed on *release*, and only if the press turned out to be
    // a plain single tap. Placing it on pointerdown was wrong in three ways at
    // once, all reported from the phone: the first finger of a pinch left a
    // note behind before the second one arrived, so did the first tap of the
    // double tap that hides the chrome, and so did the start of any drag.
    //
    // Nothing is decided here, then — the press only becomes a candidate, and
    // any of the three cancels it: a second pointer (see annotationGestureRef,
    // which useViewport is handing the pinch at the same moment), travel past
    // the click slop, or the browser taking the pointer away.
    const rect = el.getBoundingClientRect()
    const at = clientToRoomPoint(e.clientX, e.clientY, rect, useRoomStore.getState().viewport, config)
    const overlay = e.currentTarget
    const pointerId = e.pointerId
    const startClient = { x: e.clientX, y: e.clientY }

    // The second tap of a double tap arrives as another press on this catcher,
    // and it must not leave a note behind either — so a candidate still waiting
    // out its window is cancelled by the next press rather than confirmed.
    if (pendingNoteRef.current) {
      window.clearTimeout(pendingNoteRef.current.timer)
      pendingNoteRef.current = null
      return
    }

    const place = () => {
      pendingNoteRef.current = null
      // A tap while a note is open *only* finishes it. It used to finish that
      // one and start another in the same gesture, which reads as the editor
      // refusing to close: you tap away to get out of it and land in a new one,
      // then tap away again and land in the next (Ilya). Writing a second
      // remark is a second intention, so it costs a second tap.
      if (useRoomStore.getState().annotationDraft) {
        commitAnnotationDraft()
        return
      }
      const style = annotationStyle('annotateText')
      useRoomStore.getState().openAnnotationDraft({
        annotationId: null,
        // Lifted by most of a line so the caret sits where the finger did,
        // instead of the note hanging by its top-left corner underneath it.
        x: at.x,
        y: at.y - style.size * 0.6,
        text: '',
        ...style,
      })
    }

    const detach = () => {
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      overlay.removeEventListener('pointercancel', onCancel)
      if (annotationGestureRef.current?.pointerId === pointerId) annotationGestureRef.current = null
    }
    const abandon = () => {
      detach()
      if (pendingNoteRef.current) {
        window.clearTimeout(pendingNoteRef.current.timer)
        pendingNoteRef.current = null
      }
    }
    annotationGestureRef.current = { pointerId, cancel: abandon }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      if (Math.hypot(ev.clientX - startClient.x, ev.clientY - startClient.y) > CLICK_MOVE_THRESHOLD_PX) abandon()
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      // Waiting out the double-tap window costs 400ms of latency, so it is only
      // paid where a second tap actually means something else — that is, while
      // minimal UI's tap-to-hide is armed. Everywhere else the note appears the
      // instant the finger lifts.
      if (!doubleTapArmedRef.current) { place(); return }
      pendingNoteRef.current = { timer: window.setTimeout(place, NOTE_DOUBLE_TAP_GRACE_MS) }
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      abandon()
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
    overlay.addEventListener('pointercancel', onCancel)
    // (#493) The two refs are parameters now, which is all it takes for the
    // lint rule to stop recognising them; they are ref objects and never
    // change identity, so naming them leaves this callback as stable as it
    // was in Room. Their `.current` is read at call time on purpose.
  }, [vpRef, config, handActive, commitAnnotationDraft, annotationStyle, handleEditAnnotationText,
      deleteAnnotations, startPinDrag, pendingNoteRef, doubleTapArmedRef])


  /** The annotation pen: one drag, one mark. Same capture-and-listen shape as
   *  the selection lasso above — and, unlike it, open to touch. */
  const handleAnnotationPenDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && !annotateWithFingerRef.current) return
    if (handActive) return
    // The second finger of a pinch. Drop the mark this hand was drawing rather
    // than start a second one beside it: useViewport has just handed the first
    // finger over to the gesture, so from here on both belong to the camera.
    // Dropping rather than committing is the same answer `pointercancel` gets
    // — the user changed their mind about what the hand was doing.
    const open = annotationGestureRef.current
    if (open && open.pointerId !== e.pointerId) { open.cancel(); return }
    const el = vpRef.current
    if (!el || !config) return
    e.stopPropagation()
    // Same reason as the note tap above, plus one of its own: without it a
    // drag across the canvas starts a text selection, which on a phone brings
    // up the selection handles mid-mark.
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const vpNow = useRoomStore.getState().viewport
    const toPoint = (clientX: number, clientY: number) =>
      clientToRoomPoint(clientX, clientY, rect, vpNow, config)
    const start = toPoint(e.clientX, e.clientY)
    const style = annotationStyle('annotatePen')

    const overlay = e.currentTarget
    const pointerId = e.pointerId
    try { overlay.setPointerCapture(pointerId) } catch { /* context loss */ }

    let points: number[] = [start.x, start.y]
    setLiveInk({ points, ...style })

    const detach = () => {
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      overlay.removeEventListener('pointercancel', onCancel)
      if (annotationGestureRef.current?.pointerId === pointerId) annotationGestureRef.current = null
      try { overlay.releasePointerCapture(pointerId) } catch { /* already gone */ }
    }
    annotationGestureRef.current = {
      pointerId,
      cancel: () => { detach(); setLiveInk(null) },
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const p = toPoint(ev.clientX, ev.clientY)
      // Sampled against the previous point in world units, so a slow hand at
      // high zoom does not pile up hundreds of coincident samples. The real
      // reduction happens at commit (prepareInkPoints); this only keeps the
      // live array from growing without bound during a long gesture.
      const lastX = points[points.length - 2], lastY = points[points.length - 1]
      if (Math.abs(p.x - lastX) < LIVE_INK_MIN_STEP && Math.abs(p.y - lastY) < LIVE_INK_MIN_STEP) return
      points = [...points, p.x, p.y]
      setLiveInk({ points, ...style })
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      setLiveInk(null)
      // Simplified in world units against the mark's own width: a wobble
      // narrower than the line drawing it cannot be seen, so keeping it costs
      // payload and buys nothing. See prepareInkPoints.
      const simplified = prepareInkPoints(points, style.size * INK_SIMPLIFY_FACTOR)
      const shape: AnnotationShape = { kind: 'ink', color: style.color, size: style.size, points: simplified }
      if (!isMeaningfulShape(shape)) return
      dispatchOp({ type: 'annotation_add', annotationId: nanoid(10), shape })
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      detach()
      // A pointer the browser took over decided nothing — drop the mark rather
      // than record half a gesture, the same answer the selection gives.
      setLiveInk(null)
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
    overlay.addEventListener('pointercancel', onCancel)
  }, [vpRef, config, handActive, dispatchOp, annotationStyle])

  /** (#510 v2) The annotation eraser: drag across remarks to remove them.
   *
   *  Whole annotations, never parts of one. An ink mark here is a path, not
   *  pixels, so "rub half of it away" would mean splitting a recorded operation
   *  into two — and the thing being erased is a remark, which is either still
   *  being made or withdrawn. Undo was the only way to take one back before
   *  this, which works exactly once and only for the person who made it.
   *
   *  One operation for the whole sweep, so one Ctrl+Z brings back everything a
   *  single gesture took — the same rule `layer_delete` follows for a group. */
  const handleAnnotationEraseDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && !annotateWithFingerRef.current) return
    if (handActive) return
    const open = annotationGestureRef.current
    if (open && open.pointerId !== e.pointerId) { open.cancel(); return }
    e.stopPropagation()
    e.preventDefault()

    const overlay = e.currentTarget
    const pointerId = e.pointerId
    try { overlay.setPointerCapture(pointerId) } catch { /* context loss */ }

    const doomed = new Set<string>()
    const eat = (clientX: number, clientY: number) => {
      const hit = annotationAt(clientX, clientY)
      if (!hit || doomed.has(hit.annotationId)) return
      doomed.add(hit.annotationId)
      // Faded the moment the eraser touches it, not when the gesture ends:
      // sweeping across five remarks and watching nothing happen until the
      // finger lifts reads as a tool that is not working.
      setErasingIds(new Set(doomed))
    }

    const detach = () => {
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup', onUp)
      overlay.removeEventListener('pointercancel', onCancel)
      if (annotationGestureRef.current?.pointerId === pointerId) annotationGestureRef.current = null
      try { overlay.releasePointerCapture(pointerId) } catch { /* already gone */ }
      setErasingIds(EMPTY_ERASING)
    }
    annotationGestureRef.current = { pointerId, cancel: detach }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      eat(ev.clientX, ev.clientY)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const ids = [...doomed]
      detach()
      deleteAnnotations(ids)
    }
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      // Decided nothing — the faded remarks come back rather than going.
      detach()
    }
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup', onUp)
    overlay.addEventListener('pointercancel', onCancel)
    eat(e.clientX, e.clientY)
  }, [handActive, deleteAnnotations])

  // (#511) Hide/show, plus hold-to-peek on the same button.
  //
  // Split across pointer and click rather than done in one handler, and the
  // split is what keeps the two gestures from fighting: the press hides
  // immediately (that is the peek), the release decides what the gesture
  // *was*, and `onClick` — which still fires afterwards, and is also the only
  // path a keyboard has to this button — is suppressed for a hold and left
  // alone for a tap. Restoring the pre-press value on a tap is what lets the
  // click toggle from the state the user thought they were in.
  const peekRef = useRef<{ downAt: number; wasHidden: boolean } | null>(null)
  const peekConsumedRef = useRef(false)

  const handleAnnotationPeekDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    peekRef.current = { downAt: Date.now(), wasHidden: useRoomStore.getState().annotationsHidden }
    peekConsumedRef.current = false
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* context loss */ }
    setAnnotationsHidden(true)
  }, [setAnnotationsHidden])

  const handleAnnotationPeekUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const peek = peekRef.current
    peekRef.current = null
    if (!peek) return
    if (e.type === 'pointercancel') {
      // Decided nothing — put it back exactly as it was, and swallow the click
      // that a cancelled press does not produce anyway on every browser.
      peekConsumedRef.current = true
      setAnnotationsHidden(peek.wasHidden)
      return
    }
    if (Date.now() - peek.downAt >= HOLD_TO_PEEK_MS) {
      // A hold is its own complete gesture: the notes come back on release,
      // and the click that follows must not toggle them away again.
      peekConsumedRef.current = true
      setAnnotationsHidden(false)
      return
    }
    // A tap: undo the peek so the click below toggles from where the user was.
    setAnnotationsHidden(peek.wasHidden)
  }, [setAnnotationsHidden])

  const handleAnnotationsToggle = useCallback(() => {
    if (peekConsumedRef.current) { peekConsumedRef.current = false; return }
    setAnnotationsHidden(!useRoomStore.getState().annotationsHidden)
  }, [setAnnotationsHidden])

  /** (#509 v4) Enter or leave annotation mode, carrying the tool with it.
   *
   *  Switching the rail without switching the tool would leave a pencil in hand
   *  under a toolbar that no longer shows one — the same trap the compact shell
   *  had to avoid (see below), where every tap would lay graphite the user can
   *  neither see a tool for nor switch away from.
   *
   *  Leaving restores whatever was in hand on the way in, rather than picking
   *  some default: annotating is an interruption of drawing, and an
   *  interruption should give back what it borrowed. */
  const toolBeforeAnnotationRef = useRef<EditorTool | null>(null)
  const toggleAnnotationMode = useCallback((next: boolean) => {
    const current = useRoomStore.getState().tool
    if (next) {
      if (current !== 'annotateText' && current !== 'annotatePen' && current !== 'annotateEraser') {
        toolBeforeAnnotationRef.current = current
      }
      setAnnotationMode(true)
      selectTool('annotateText')
      return
    }
    setAnnotationMode(false)
    // An open note would otherwise be left hanging with no way back to it.
    commitAnnotationDraft()
    selectTool(toolBeforeAnnotationRef.current ?? 'pencil')
    toolBeforeAnnotationRef.current = null
  }, [setAnnotationMode, selectTool, commitAnnotationDraft])

  // (#595, ADR 015 §6) The teacher arriving on a student's board picks up
  // the annotation pen: a remark over the work is the default, correcting in
  // the work itself a deliberate switch (ClassBar's "Править в работе"). The
  // tool in hand before is given back on leaving the students' boards — the
  // same memory the header toggle keeps. Only a mode this effect switched on
  // is switched off again; one the teacher had on already is theirs.
  const classAnnotateRef = useRef(false)
  useEffect(() => {
    if (!isOwner || compact) return
    if (onPersonalBoard) {
      if (classAnnotateRef.current || useRoomStore.getState().annotationMode) return
      classAnnotateRef.current = true
      toggleAnnotationMode(true)
      selectTool('annotatePen')
      return
    }
    if (!classAnnotateRef.current) return
    classAnnotateRef.current = false
    if (useRoomStore.getState().annotationMode) toggleAnnotationMode(false)
  }, [boardId, onPersonalBoard, isOwner, compact, toggleAnnotationMode, selectTool])

  // (#512) The compact shell has no drawing tools on screen, so it must not
  // leave one in hand: a phone opening with the pencil selected would react to
  // every tap by drawing graphite the user cannot see a tool for and cannot
  // switch away from. Only ever *into* an annotation tool, and never back —
  // leaving the shell is not a reason to take a tool out of someone's hand.
  useEffect(() => {
    if (!compact) return
    const current = useRoomStore.getState().tool
    if (current === 'annotateText' || current === 'annotatePen') return
    selectTool('annotateText')
  }, [compact, selectTool])

  // An open note must not survive the tool that opened it: switching away is a
  // decision about the note too, and the decision that loses least is to keep
  // what was typed.
  useEffect(() => {
    if (!annotateTextActive) commitAnnotationDraft()
  }, [annotateTextActive, commitAnnotationDraft])

  return {
    annotationDraftInputRef, annotationHover, annotationLayerRef, annotationTextCatcherRef, cancelAnnotationDraft, clearAllAnnotations, commitAnnotationDraft, erasingIds, handleAnnotationEraseDown, handleAnnotationHover, handleAnnotationPeekDown, handleAnnotationPeekUp, handleAnnotationPenDown, handleAnnotationsToggle, handleAnnotationTextTap, liveInk, pinDrag, setAnnotationHover, toggleAnnotationMode,
  }
}
