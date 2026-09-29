import { useCallback, type RefObject } from 'react'
import { nanoid } from 'nanoid'

import type { Operation, OperationDraft } from '@grafetto/shared'

import { useConfirmDialog } from '../../components/ConfirmDialog/useConfirmDialog'
import type { PencilEngineAPI } from '../../engine'
import { isLockedAgainst } from '../../lib/layers/layers'
import { useT } from '../../i18n'
import { useRoomStore } from '../../stores/roomStore'
import { isLocalIslandSafe } from './net/optimism'
import type { Outbox } from './net/outbox'
import { isIdentityMatrix } from '../../lib/transform/transformMath'
import type { TransformSession } from './useTransformSession'

/** What dispatchOp did with an operation (#395). `applied: true` means the
 *  engine already carries it (the optimistic local-island path); `false`
 *  means it is queued in the Outbox and only becomes real when the server
 *  confirms it. A null return means it was refused outright and nothing will
 *  ever land. Only the transform gizmo reads this — it has to keep its
 *  preview on screen until the operation is genuinely applied; every other
 *  call site ignores the result. */
export interface DispatchedOp { op: Operation; applied: boolean }

export interface OperationDispatchDeps {
  /** False until the room's content has been restored into the engine. */
  roomContentReady: boolean
  /** Frozen, closed for editing, or a board this user may only look at. */
  editingBlocked: boolean
  connected: boolean
  outbox: Outbox
  engineRef: RefObject<PencilEngineAPI | null>
  /** Ids this client created and the server has not confirmed yet — the
   *  "local island" an operation may act on optimistically. */
  pendingIdsRef: RefObject<Set<string>>
  isOwnerRef: RefObject<boolean>
  /** Re-derives the store's layer state from the engine's log. */
  syncFromLog: () => void
  /** Declared in Room: the gizmo's handlers write them, undo reads them. */
  transformSessionRef: RefObject<TransformSession | null>
  resetTransformSessionRef: RefObject<() => void>
}

/** (#493) How an operation leaves this client, and how one is taken back.
 *
 *  `dispatchOp` is the one door every locally made operation goes through —
 *  strokes excepted, which the engine emits itself: applied optimistically when
 *  it only touches this client's own unconfirmed ids, sent through the outbox
 *  to wait for the server otherwise, and refused outright when the room is not
 *  ready, editing is blocked, the layer is locked, or it needs the server and
 *  there is none. Undo and redo sit with it because they share every one of
 *  those gates.
 *
 *  The refs that come in are named in the dependency lists: as parameters the
 *  lint rule no longer recognises them as refs, and a ref object never changes
 *  identity, so naming it costs nothing. Their `.current` is read at call
 *  time, on purpose, and never listed. */
export function useOperationDispatch({
  roomContentReady, editingBlocked, connected, outbox, engineRef, pendingIdsRef, isOwnerRef,
  syncFromLog, transformSessionRef, resetTransformSessionRef,
}: OperationDispatchDeps) {
  const t = useT()
  const { confirm, alert: showAlert } = useConfirmDialog()

  // (syncFromLog stays in Room, alongside markActive, since the mount-engine
  // effect needs it too — see the pending-snapshot replay there.)
  // #185's audit: LayerPanel's onOp and TransformGizmo's commit both go
  // through dispatchOp, and undo/redo has both header buttons and hotkeys —
  // all four paths are safe no-ops while roomContentReady is false, the same
  // window the canvas itself is already pointer-events:none for (see
  // roomContentReady's own doc comment). A single guard here rather than
  // disabling each control individually — the visible preloader already
  // covers the canvas, and this window is a couple of seconds at most.
  //
  // (#254 epic, #222) editingBlocked added to the same guard: the server
  // rejects these operations outright once the room is frozen (#256/#257) or
  // closed for editing (#222), so without this the sender could still see
  // their own stroke/undo/redo apply locally before silently failing to ever
  // reach anyone else — "drawing into the void" (see its own doc comment).
  const dispatchOp = useCallback((draft: OperationDraft): DispatchedOp | null => {
    if (!roomContentReady || editingBlocked) return null
    // (#518) The one gate on the lock, for every operation that paints.
    //
    // Before this there was exactly one, and it sat on the *pointer* path
    // (engine.setLocked, see useLayerStateSync): it stopped a
    // stroke and nothing else. The transform gizmo, the bucket, and
    // delete/cut/paste of a selection all reach the canvas without ever
    // touching that path, so all four rewrote locked layers — which is how a
    // locked layer could be dragged across the sheet.
    //
    // Here rather than at those four call sites because a fifth is always
    // coming: `isLockedAgainst` refuses whatever `paintedLayerIds` names, so
    // a new painting operation is covered by being listed in the shared
    // package, not by whoever adds the tool remembering this rule exists.
    //
    // Silent, like the stroke gate it generalizes: the closed padlock in the
    // layer panel is the explanation, and every route that can reach this in
    // normal use is already visibly refused before it is taken (the gizmo
    // does not open on a locked layer, the bucket ignores the tap, the
    // selection buttons are disabled). Anything that still arrives here is a
    // path we missed or a stale one — refusing it is the point.
    //
    // Emission only. Nothing on the *replay* side asks this: operations
    // arriving from a peer, from a rejoin, or from redo must apply whatever
    // the log says, or a layer locked today would lose every stroke drawn on
    // it yesterday, once, permanently, on every client at the same moment.
    if (isLockedAgainst(useRoomStore.getState().layerState, draft, isOwnerRef.current)) return null
    const op = { ...draft, id: nanoid(10), userId: useRoomStore.getState().userId, timestamp: Date.now() }

    if (isLocalIslandSafe(op, pendingIdsRef.current)) {
      engineRef.current?.appendOperation(op) // source defaults to 'local' → broadcast via onLocalOperation
      syncFromLog()
      return { op, applied: true }
    }

    // (#289 §17) The same operation offline: it can only be resolved by the
    // server (that's what made it non-optimistic in the first place), and
    // queueing it would let it land minutes later against a room that has
    // since moved on. Refuse it up front, visibly, rather than appearing to
    // accept it. Operations confined to this client's own local island are
    // unaffected — they took the optimistic branch above and work offline.
    if (!connected) {
      // Fire-and-forget (#310): nothing here waits on the dismissal, the
      // operation is refused either way.
      void showAlert({ message: t('room.offlineSharedAction') })
      return null
    }

    // (#289 §2/§4) References at least one id this client didn't itself
    // just create — a concurrent delete/merge/transform race is possible
    // (the server checks aliveIds, see rooms.ts), so this must not become
    // visible locally until confirmed. Sent directly, bypassing
    // appendOperation/onLocalOperation (which would paint it immediately) —
    // handleOperationConfirmed's ordinary applyRemoteOp fallback applies it
    // for real if/when operation_confirmed for this id actually arrives,
    // exactly like a peer's own op. Still goes through the Outbox (#289 §9)
    // so a dropped packet is retried rather than silently swallowed — its
    // `onSettled` handles the verdict either way.
    void outbox.enqueue(op)
    return { op, applied: false }
  }, [syncFromLog, roomContentReady, editingBlocked, outbox, connected, t, showAlert,
      engineRef, pendingIdsRef, isOwnerRef])

  // (#263) A structural undo/redo (layer_add/layer_delete/layer_merge) can
  // silently wipe a layer's content on the canvas even though nothing is
  // actually lost from the log (see docs/adr/002-collaborative-undo.md and
  // this issue's own repro) — peekUndo/peekRedo is a read-only look at what
  // the pending call would act on, so a decline here leaves state exactly
  // as if the button/hotkey was never pressed.
  //
  // (#310) These two now await an in-app dialog instead of blocking on
  // window.confirm. One real difference: window.confirm froze all JS, so the
  // peek below could not go stale while it was up — an awaited dialog lets
  // peers' operations keep arriving. That's acceptable here because the peek
  // only decides whether to *ask*: undo()/redo() re-resolve their own target
  // when they actually run, so a confirmed undo still acts on current state.
  const handleUndo = useCallback(async () => {
    if (!roomContentReady || editingBlocked) return
    // (#405) An open session with gestures in it is what "undo" means right
    // now, and it is undone by throwing it away — nothing was committed, so
    // there is no entry on the stack to take back and nothing to confirm.
    // Reaching past it into the log would take back some *earlier* operation
    // while the preview carried on showing gestures the layer never received,
    // i.e. appear to do nothing at all. Same answer as Esc, deliberately:
    // both mean "not that", and a session is the innermost thing open.
    if (transformSessionRef.current && !isIdentityMatrix(transformSessionRef.current.matrix)) {
      resetTransformSessionRef.current()
      return
    }
    const peek = engineRef.current?.peekUndo()
    if (peek?.hasOtherContent && !await confirm({
      title: t('room.undo'),
      message: t('room.confirmUndo'),
      confirmLabel: t('room.undo'),
      danger: true,
    })) return
    // Reset *after* the undo, not before: re-opening the session re-derives
    // the gizmo bounds from the layer, and doing that first would read the
    // pixels the undo is about to change. Both happen in this one task, so
    // nothing is painted in between.
    const undone = engineRef.current?.undo()
    resetTransformSessionRef.current()
    if (undone) syncFromLog()
  }, [syncFromLog, roomContentReady, editingBlocked, t, confirm,
      engineRef, transformSessionRef, resetTransformSessionRef])

  const handleRedo = useCallback(async () => {
    if (!roomContentReady || editingBlocked) return
    const peek = engineRef.current?.peekRedo()
    if (peek?.hasOtherContent && !await confirm({
      title: t('room.redo'),
      message: t('room.confirmRedo'),
      confirmLabel: t('room.redo'),
      danger: true,
    })) return
    // Same ordering as handleUndo above.
    const redone = engineRef.current?.redo()
    resetTransformSessionRef.current()
    if (redone) syncFromLog()
  }, [syncFromLog, roomContentReady, editingBlocked, t, confirm,
      engineRef, resetTransformSessionRef])

  return { dispatchOp, handleUndo, handleRedo }
}
