import { useCallback, useEffect, useRef, type RefObject } from 'react'

import { toWireMatrix, type OperationDraft, type SelectionShape } from '@grafetto/shared'

import type { AreaImage, PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import type { EditorTool } from '../../stores/slices/toolSlice'
import { selectionBoundsRect, transformSelection } from './selectionGesture'
import {
  IDENTITY_MATRIX, isIdentityMatrix, type TransformBounds, type TransformMatrix,
} from './transformMath'
import { useCommittableSession } from './useCommittableSession'

/** (#493) The gizmo's open session. Authoritative — the store's matrix copy
 *  exists to drive rendering — and held in a ref rather than state so the drag
 *  handlers don't have to list a value that changes on every animation frame
 *  among their dependencies. `matrix` accumulates gestures; `targetIds` is
 *  frozen for the session so a selection change ends it rather than silently
 *  re-aiming it mid-flight. */
export interface TransformSession {
  matrix: TransformMatrix
  targetIds: string[]
  // (#446) The selection this session is scoped to, frozen at the same
  // moment `targetIds` is and for the same reason. Null means the ordinary
  // whole-layer transform; non-null makes every part of the session — the
  // frame, the preview, the operation it commits — apply to the region
  // instead. The layer it applies to is `targetIds[0]`: the selection itself
  // names no layer (see selectionSlice), the session's target does.
  selection: SelectionShape | null
  // (#446) Set when this session is holding *pasted* pixels rather than a
  // region of the layer — a floating paste. The two differ in three places
  // and nowhere else: what the preview draws (a raster above the layer, not
  // the layer with a hole in it), what the commit writes (`area_paste`
  // carrying the accumulated matrix, not `area_transform`), and whether an
  // empty session is worth writing at all (a paste that was never dragged is
  // still a paste; a transform that never moved is nothing).
  //
  // Nothing of it reaches the layer until the session ends, which is the
  // whole point: dragging moves the pasted piece alone, never the drawing
  // underneath it (Ilya, 13.08).
  paste: AreaImage | null
}

/** What `dispatchOp` hands back — see useOperationDispatch. */
export interface DispatchedOp { op: { id: string }; applied: boolean }

export interface TransformSessionInput {
  engineRef: RefObject<PencilEngineAPI | null>
  /** Declared in Room rather than here: `handleUndo` sits above this hook's
   *  call and reads both at call time, and the gizmo's drag handlers write the
   *  matrix into the first on every frame. */
  transformSessionRef: RefObject<TransformSession | null>
  resetTransformSessionRef: RefObject<() => void>
  /** A paste waiting for the next session to adopt it (#446). */
  pendingPasteRef: RefObject<AreaImage | null>
  /** A commit whose operation has been sent but not yet confirmed — see
   *  resolveTransformCommit in Room, which finishes it. */
  pendingTransformCommitRef: RefObject<{ opId: string; finish: () => void } | null>
  drawingToolRef: RefObject<EditorTool>
  handActiveRef: RefObject<boolean>
  /** Which layers the session transforms. Room derives it from the layer
   *  selection and other parts of the page read it too, hence an argument. */
  transformTargetIds: string[]
  dispatchOp: (draft: OperationDraft) => DispatchedOp | null
  vpEl: HTMLDivElement | null
}

/** (#493) Start, commit and reset of the transform gizmo's session, and the
 *  two things that decide when each happens: the tool, and a click past the
 *  gizmo.
 *
 *  Out of Room as one piece because it is one piece: every function here
 *  either opens the session, closes it, or decides that it should be, and
 *  they call each other. What the rest of the page needs back is small — the
 *  region the gizmo frames, for the render, and the commit, for Enter.
 *
 *  Store-owned inputs (the selection, the tool, the frame's bounds and centre,
 *  the preview matrix) are read here directly, by the rule this whole
 *  decomposition follows; what Room derives or declares itself comes in. */
export function useTransformSession({
  engineRef, transformSessionRef, resetTransformSessionRef, pendingPasteRef,
  pendingTransformCommitRef, drawingToolRef, handActiveRef,
  transformTargetIds, dispatchOp, vpEl,
}: TransformSessionInput): {
  areaSelection: SelectionShape | null
  commitTransformSessionRef: RefObject<(reopen: boolean) => void>
} {
  const config = useRoomStore(s => s.room)
  const selection = useRoomStore(s => s.selection)
  const setSelection = useRoomStore(s => s.setSelection)
  const setTool = useRoomStore(s => s.setTool)
  const transformActive = useRoomStore(s => s.tool) === 'transform'
  const setTransformBounds = useRoomStore(s => s.setTransformBounds)
  const setTransformCenterOverride = useRoomStore(s => s.setTransformCenterOverride)
  const setTransformSessionMatrix = useRoomStore(s => s.setTransformSessionMatrix)

  // Ref objects in the arrays below are named because they are parameters now,
  // which is all it takes for the lint rule to stop recognising them as refs.
  // They never change identity, so naming them keeps every callback here
  // exactly as stable as it was in Room. `.current` is never listed: these
  // callbacks read the refs at call time on purpose.

  // (#399) `transformTargetIds` is a fresh array on every layerState change —
  // i.e. on any peer's stroke — so the session effect keys on this string
  // instead; restarting a session mid-drag because someone else drew would
  // commit half a gesture. The ref is what lets startTransformSession freeze
  // the ids without listing an every-render value among its deps.
  // (#446) The selection, but only when it genuinely applies to what the
  // gizmo is holding: exactly one target layer. With several layers selected
  // in the panel the gizmo falls back to moving them whole — `area_transform`
  // is single-layer by contract (ADR 008), and picking one of several layers
  // to apply the region to would be a guess.
  //
  // No layer comparison: the selection marks a region of the canvas, so it
  // applies to whichever layer is active now (see selectionSlice).
  const areaSelection = transformTargetIds.length === 1 ? selection : null
  const areaSelectionRef = useRef(areaSelection)
  areaSelectionRef.current = areaSelection

  const transformTargetKey = transformTargetIds.join(',')
  const transformTargetIdsRef = useRef(transformTargetIds)
  transformTargetIdsRef.current = transformTargetIds

  // Recomputes transformBounds from the current target(s)' actual painted
  // content (engine.getContentBounds), unioned across a multi-select — and
  // clears any custom rotation-center override (see its declaration above
  // for why). Called on activation/selection change and again after every
  // commit, never per drag frame: the tighten below is a real readPixels +
  // CPU scan per target (see ILayerBuffer.tightenContentRects on cost), and
  // those are exactly the two moments it may be paid.
  //
  // (#421) Tightened first, every time, rather than trusting the engine's
  // incremental tracker: it only ever grows, and a transform bake feeds it
  // the axis-aligned box of the *rotated* content, so without this the frame
  // came back visibly wider than the drawing after a rotation and wider
  // again after the next one. Doing it here also stops the compounding at
  // its source — the following bake reads the same tracked rects for its own
  // source bounds, so it starts from the tight ones.
  const refreshTransformBounds = useCallback(() => {
    const engine = engineRef.current
    if (!engine || transformTargetIds.length === 0) { setTransformBounds(null); setTransformCenterOverride(null); return }
    // (#446) With a selection, the frame is the selection's own box — not the
    // layer's painted content. Nothing is tightened or read back either: the
    // outline is exactly the region the user drew, whether or not there is ink
    // inside it, and a frame that snapped to the ink would contradict the
    // outline still on screen next to it.
    const area = areaSelectionRef.current
    if (area) {
      const rect = selectionBoundsRect(area)
      if (rect) { setTransformBounds(rect); setTransformCenterOverride(null); return }
    }
    let bounds: TransformBounds | null = null
    for (const layerId of transformTargetIds) {
      engine.tightenContentBounds(layerId)
      const b = engine.getContentBounds(layerId)
      bounds = b ? (bounds ? unionTransformBounds(bounds, b) : b) : bounds
    }
    // A fully transparent target (nothing drawn yet) falls back to the
    // whole canvas rather than making the gizmo just vanish.
    setTransformBounds(bounds ?? (config ? { x: 0, y: 0, width: config.width, height: config.height } : null))
    setTransformCenterOverride(null)
  }, [engineRef, transformTargetIds, config, setTransformBounds, setTransformCenterOverride])
  // (#395) A held commit's teardown can run a server round trip after the
  // drag that created it, and the selection may have moved on in between —
  // its captured closure would then write bounds for layers the gizmo no
  // longer targets, and nothing would correct that until the next selection
  // change. Read through a ref so the teardown always refreshes against
  // whatever the gizmo targets *now*.
  const refreshTransformBoundsRef = useRef(refreshTransformBounds)
  refreshTransformBoundsRef.current = refreshTransformBounds

  // (#405) There is no idle auto-commit any more. #401 added one — a two-second
  // countdown from the last gesture that baked the session and re-opened it —
  // because an open session lives only in this tab and a page teardown is not
  // something React reports, so a reload lost it. What it actually produced was
  // the complaint this issue starts from: the gizmo resetting itself a couple
  // of seconds after you stopped touching it, mid-edit, because baking re-derives
  // the frame as the content's axis-aligned box and throws the rotation away.
  //
  // A session now syncs when it *ends*, and nothing else ends it. What replaces
  // the lost protection is stated where each piece lives: the page-teardown
  // commit below (kept, still best-effort), and the reload hold next to it,
  // which puts an open session behind the same close-the-tab warning a non-empty
  // outbox already sits behind (#313).

  // (#399) Opens a session on the current target(s): fresh bounds from the
  // pixels, identity matrix, no custom pivot. Everything from here until the
  // matching commit is preview only — nothing touches the real layer buffer.
  const startTransformSession = useCallback(() => {
    refreshTransformBoundsRef.current()
    const paste = pendingPasteRef.current
    pendingPasteRef.current = null
    transformSessionRef.current = {
      matrix: IDENTITY_MATRIX,
      targetIds: transformTargetIdsRef.current,
      selection: areaSelectionRef.current,
      paste,
    }
    setTransformSessionMatrix(IDENTITY_MATRIX)
    // A float has to be on screen before it is dragged — it is not in the
    // layer, so without this first frame the pasted piece would simply not
    // exist until the pointer moved.
    if (paste && transformTargetIdsRef.current.length === 1) {
      engineRef.current?.previewAreaPaste(
        transformTargetIdsRef.current[0], paste.image,
        { x: paste.x, y: paste.y, width: paste.width, height: paste.height },
        IDENTITY_MATRIX,
      )
    }
  }, [engineRef, transformSessionRef, pendingPasteRef, setTransformSessionMatrix])

  // (#399) Ends the session by baking everything it accumulated as *one*
  // layer_transform. One op per session rather than per gesture is the point:
  // rotate, then nudge, then scale used to cost three resamples of the layer's
  // pixels, and a drawing app cannot spend those.
  //
  // `reopen` is for the callers that apply the session while the tool stays in
  // hand — Enter, and only Enter. The gizmo has to come back for it, on the
  // freshly baked content with a clean identity matrix. Everyone else passes
  // false: the tap past the gizmo puts the tool down straight after (#407), and
  // for the teardown callers either nothing should follow or the effect's own
  // body opens the next session itself.
  const commitTransformSession = useCallback((reopen: boolean) => {
    const session = transformSessionRef.current
    transformSessionRef.current = null
    const dropPreview = () => {
      // Guarded because this can run a round trip late, by which time a
      // session for a *new* selection may already be open — this teardown
      // belongs to the old one and must not blank its matrix.
      if (!transformSessionRef.current) setTransformSessionMatrix(null)
      engineRef.current?.clearLayerTransformPreview()
    }
    // (#395) A teardown that owns no session owns no preview either, so it
    // must not drop one. The tap past the gizmo commits and *then* puts the
    // tool down, which re-runs this from the session effect's cleanup with
    // the session already nulled — and clearing the preview there paints
    // exactly the frame the commit below goes out of its way to avoid: the
    // layer back where the drag started, held until the server's
    // confirmation lands. Whoever is waiting on that op (see
    // pendingTransformCommitRef) owns the preview now and will drop it.
    if (!session) return
    // Nothing accumulated (opened and left alone, or every gesture cancelled
    // itself out): committing an identity matrix would put a real entry on
    // the undo stack for nothing, and the bounds are still the ones the
    // session started from, so there is nothing to refresh either.
    //
    // (#446) Except for a floating paste, whose pixels are not in any layer
    // yet: dropping it exactly where it landed is still the whole of the
    // paste, and skipping it here would lose it.
    if (isIdentityMatrix(session.matrix) && !session.paste) {
      dropPreview()
      if (reopen) startTransformSession()
      return
    }
    const finish = () => {
      dropPreview()
      // Reopening only after the bake has landed, not at dispatch time: the
      // new session's bounds come from the layer's pixels, and until the
      // operation is applied those are still the pre-session ones.
      if (reopen) startTransformSession()
    }
    // (#446) A session scoped to a selection commits the region, not the
    // layer — and moves the selection with it, so the outline ends up around
    // the pixels it just carried instead of around the hole they left. A
    // transform that sends the outline through the vanishing line drops it
    // (transformSelection returns null): the pixels still moved, there is
    // simply no region left to grab them by.
    const dispatched = session.paste && session.targetIds.length === 1
      ? dispatchOp({
        type: 'area_paste',
        layerId: session.targetIds[0],
        image: session.paste.image,
        x: session.paste.x, y: session.paste.y,
        width: session.paste.width, height: session.paste.height,
        // Omitted when it is identity — a paste dropped where it landed says
        // so by carrying no matrix at all (see AreaPasteOperation).
        matrix: isIdentityMatrix(session.matrix) ? undefined : toWireMatrix(session.matrix),
      })
      : session.selection && session.targetIds.length === 1
      ? dispatchOp({
        type: 'area_transform',
        layerId: session.targetIds[0],
        selection: session.selection,
        matrix: toWireMatrix(session.matrix),
      })
      : dispatchOp({
        type: 'layer_transform',
        // (#392) Narrowed back on the way out: a move/scale/rotate/skew session
        // still writes six numbers, and only a session that genuinely carries a
        // Distort writes nine — see toWireMatrix's own docstring for why the
        // compact form is the rule rather than a legacy leftover.
        transforms: session.targetIds.map(layerId => ({ layerId, matrix: toWireMatrix(session.matrix) })),
      })
    if (session.selection && dispatched) {
      setSelection(transformSelection(session.selection, session.matrix))
    }
    // (#395) The preview is deliberately *not* dropped before the commit.
    // clearLayerTransformPreview() repaints synchronously, so dropping it
    // first paints a frame with the preview gone and the transform not yet
    // baked — the layer back where the session started. On the
    // confirmation-gated dispatch path that state then persists for a whole
    // server round trip. The engine's own API says as much: clear the preview
    // "once a real layer_transform op has been appended (commit) or the drag
    // is abandoned (cancel)" — appended, not merely sent. While the preview
    // stands in for the layer the two are pixel-identical by construction (see
    // previewLayerTransform's lockstep note against _bakeTransform), so
    // holding it across the commit shows no seam.
    //
    // Refused outright (room not ready, editing blocked, offline — see
    // dispatchOp) or already painted by the optimistic path: either way
    // nothing is in flight, so finish right here.
    if (!dispatched || dispatched.applied) { finish(); return }
    pendingTransformCommitRef.current = { opId: dispatched.op.id, finish }
  }, [
    engineRef, transformSessionRef, pendingTransformCommitRef,
    dispatchOp, setTransformSessionMatrix, startTransformSession, setSelection,
  ])

  const commitTransformSessionRef = useRef(commitTransformSession)
  commitTransformSessionRef.current = commitTransformSession
  // See resetTransformSessionRef's declaration for its two callers — the
  // re-derive after a real undo/redo, and Esc/Ctrl+Z as the cancel itself.
  resetTransformSessionRef.current = () => {
    const session = transformSessionRef.current
    if (!session) return
    transformSessionRef.current = null
    setTransformSessionMatrix(null)
    engineRef.current?.clearLayerTransformPreview()
    // (#446) Cancelling a floating paste throws the pixels away rather than
    // putting them back where they landed: nothing was ever written to a
    // layer, so there is nothing to undo and nothing to keep. The clipboard
    // still holds them, so Esc costs a second Ctrl+V and never the copy.
    if (session.paste) {
      setSelection(null)
      return
    }
    startTransformSession()
  }

  // (#399) One session per (tool selected, target selection). Ending the
  // effect commits what the session accumulated, which covers three of the
  // four ways a session ends without any of them needing code of its own:
  // selecting another tool, changing the active layer or the selection, and
  // the room unmounting. (#405) The first of those is the model change: with
  // one exclusive selection, "switch tool" is no longer a mode being lifted
  // off a pencil — it is this effect's dependency changing.
  //
  // (#443) The hand is among them now: it is a member of `tool`, so selecting
  // it re-runs this effect and applies the session, exactly like every other
  // tool. #405 exempted it so the view could be moved mid-drag without losing
  // the edit — but the two routes that actually serve that (the middle button
  // and held Space on a PC, one or two fingers on a tablet) never went through
  // `tool` and still don't, so what the exception really covered was a pen on a
  // PC, at the price of a toolbar button that behaved like no other.
  //
  // Held Space is untouched: `handHeld` is not `tool`, so it still pans over an
  // open session without ending it.
  //
  // Keyed on the joined ids rather than the array: transformTargetIds is
  // rebuilt on every layerState change (any peer's stroke does that), and
  // restarting the session there would commit mid-drag.
  useEffect(() => {
    if (!transformActive) return
    startTransformSession()
    return () => {
      commitTransformSessionRef.current(false)
      setTransformBounds(null)
      setTransformCenterOverride(null)
    }
    // (#446) `areaSelection` is in the dependency list by object identity — it
    // is the store's own selection object or null, so it changes exactly when
    // the selection does. A selection that changes under an open session (a
    // paste, an Esc) has to end that session and open one framing the new
    // region, the same way changing the target layer does.
  }, [
    transformActive, transformTargetKey, areaSelection, startTransformSession,
    setTransformBounds, setTransformCenterOverride,
  ])

  // (#528) The three clauses every uncommitted session needs — best-effort
  // save on the way out of the page, a reload hold while it is open, and the
  // click-past-it gesture — now live in one hook, shared with the shape tool.
  // Each of the three is a separately-earned bug (#401, #405, #407/#408); see
  // useCommittableSession for what each one cost.
  //
  // "Past the gizmo" includes past the rotate zones, which reach ~40 screen px
  // beyond each corner — they are part of the gizmo's own hit area (see
  // data-transform-gizmo), so a press there rotates and never lands here.
  useCommittableSession({
    active: transformActive,
    commit: useCallback(() => commitTransformSessionRef.current(false), []),
    vpEl,
    handActiveRef,
    ownControlsSelector: '[data-transform-gizmo]',
    onClickPast: useCallback(() => {
      // (#405/#407) Applies the session and puts the transform tool down,
      // handing the canvas back to the drawing tool — the "I'm done here"
      // gesture that costs no keyboard, which matters because the tablet has
      // none. Bake once and do *not* re-arm: the tool is going down on the next
      // line, so a fresh session would be opened only to be torn straight back
      // down.
      commitTransformSessionRef.current(false)
      // (#446) …and the selection goes with it. This gesture already means
      // "I am done here" — it applies the edit and puts the tool down — so
      // leaving the outline lit would be the one part of it that did not
      // finish, and the frame would then follow whichever tool came next
      // around the canvas with nothing acting on it (Ilya, 13.08). Clicking
      // past the outline with the selection tool in hand clears it for the
      // same reason; this makes the two gestures mean the same thing.
      setSelection(null)
      // (#407) Same hand-back the eyedropper does after a pick, and for the
      // same reason: the gesture was the whole of the tool's job. Only the tap
      // does this — Enter and Esc leave the tool selected, so there is still a
      // way to finish one transform and start another without a trip to the
      // toolbar.
      setTool(drawingToolRef.current)
    }, [drawingToolRef, setSelection, setTool]),
  })

  // Viewport rect for the ruler's own pointer math — see handleRulerHover for
  // why it is cached rather than read per move.

  return { areaSelection, commitTransformSessionRef }
}

function unionTransformBounds(a: TransformBounds, b: TransformBounds): TransformBounds {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}
