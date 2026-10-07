import { useCallback, useRef, type RefObject } from 'react'

import type { LayerState, Operation } from '@grafetto/shared'
import { IMPLICIT_LAYER_IDS, SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../engine'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'
import { computeCompositeOrder, replayLayerState } from '../../lib/layers/layers'
import { reportSnapshotRestore } from './diagnostics/reportRestore'
import { drainDeferredOps } from './net/deferredOps'
import { continueSnapshotHistoryRepair } from './net/snapshotHistoryRepair'
import { restoreLatestSnapshot, walkHistoryBackward, type SnapshotRestoreOutcome } from './net/snapshotRestore'

// (#291) How far back of the pre-snapshot operation log backfillHistory
// pulls in for undo/redo coverage. One snapshot interval below the restored
// snapshot's own seq means a joining client ends up holding roughly the last
// two snapshots' worth of history — exactly the undo depth spec v0.2 §7
// commits to, and nothing beyond it, since an operation older than that can
// never be undone anyway. See backfillHistory for why an unbounded walk is
// not an option.
const HISTORY_BACKFILL_DEPTH = SNAPSHOT_SEQ_INTERVAL

export interface RemoteOperationsDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  boardId: string
  onHistoryRepairFailure: () => void
  /** The board stream's applied ids and deferred meta-ops — see useBoardStream. */
  appliedOpIdsRef: RefObject<Set<string>>
  deferredOpsQueueRef: RefObject<Operation[]>
  /** useLogDerivedState's base for LayerState after a snapshot restore. */
  restoredLayerStateRef: RefObject<LayerState | null>
  markActive: (userId: string) => void
  resolveTransformCommit: (opId: string) => void
  confirmOwnOperation: (op: Operation, seq: number, fromRoomState: boolean) => void
  noteOperationSeq: (op: Operation, seq: number) => void
  syncFromLog: () => void
  checkSnapshotBoundary: () => void
}

/** (#493) How the network's operations reach the engine: once each, deferred
 *  while their target is still in unfetched history, restored from a snapshot,
 *  and backfilled behind it for undo. Out of Room — the three restore steps
 *  are what restoreRoomState is handed. */
export function useRemoteOperations({
  engineRef, boardId, onHistoryRepairFailure, appliedOpIdsRef, deferredOpsQueueRef, restoredLayerStateRef, markActive, resolveTransformCommit,
  confirmOwnOperation, noteOperationSeq, syncFromLog, checkSnapshotBoundary,
}: RemoteOperationsDeps) {
  const ordinaryBackfills = useRef(new Map<PencilEngineAPI, Promise<void>>())
  const repairs = useRef(new Map<PencilEngineAPI, Promise<void>>())

  // Applies an operation that arrived from the network (room_state replay or
  // operation_confirmed) exactly once. The guard isn't full reconnect/catch-up
  // logic (#74) — it's a minimal idempotency net: since a reconnect re-runs
  // join_room and gets the *entire* history back in a fresh room_state,
  // without this guard every op already applied before the drop would be
  // appended to the engine's log a second time (OperationLog.append() does
  // not dedupe by id — see engine/src/oplog/OperationLog.ts), corrupting pixel
  // state and undo. It does not attempt to reconcile a divergent history.
  const applyRemoteOp = useCallback((op: Operation) => {
    if (appliedOpIdsRef.current.has(op.id)) {
      // (#537) Seen before — and if it is this client's own, still waiting for
      // its seq, this is where it gets one: room_state's tail after a
      // reconnect carries operations whose broadcast and ack were both lost
      // with the old socket. Without this they would sit in the pending tail
      // for good, above everything anybody draws from then on.
      if (op.seq !== undefined) confirmOwnOperation(op, op.seq, true)
      return
    }
    appliedOpIdsRef.current.add(op.id)
    engineRef.current?.appendOperation(op, 'remote')
    if (op.seq !== undefined) noteOperationSeq(op, op.seq)
    if (op.type === 'stroke') markActive(op.userId)
    // (#395) The layer now genuinely carries this transform, so the gizmo
    // preview that has been standing in for it since pointerup can go. This
    // is the only place that can know it: on the confirmation-gated dispatch
    // path the author's own layer_transform comes back through here like any
    // peer's (see dispatchOp's outbox branch and #289 §7/§11).
    resolveTransformCommit(op.id)
  }, [engineRef, appliedOpIdsRef, markActive, resolveTransformCommit, confirmOwnOperation, noteOperationSeq])

  // (#169) Re-checks every deferred meta-op (see deferredOpsQueueRef's own
  // doc comment) after a backfill page lands — anything whose target has
  // since become known gets applied now, in the order it originally arrived.
  const drainDeferredQueue = useCallback(() => {
    const queue = deferredOpsQueueRef.current
    if (!queue.length) return
    const { stillDeferred, appliedAny } = drainDeferredOps(queue, id => appliedOpIdsRef.current.has(id), applyRemoteOp)
    deferredOpsQueueRef.current = stillDeferred
    if (appliedAny) {
      syncFromLog()
      checkSnapshotBoundary()
    }
  }, [deferredOpsQueueRef, appliedOpIdsRef, applyRemoteOp, syncFromLog, checkSnapshotBoundary])

  const repairSnapshotHistory = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !boardId || repairs.current.has(engine)) return
    const work = (async () => {
      const complete = await continueSnapshotHistoryRepair(boardId, engine, {
        ordinary: ordinaryBackfills.current.get(engine), current: () => engineRef.current === engine,
        onPage: page => {
          for (const op of page) appliedOpIdsRef.current.add(op.id)
          drainDeferredQueue()
        },
      })
      if (!complete) return
      if (engineRef.current === engine) { syncFromLog(); checkSnapshotBoundary() }
    })().catch(() => { if (engineRef.current === engine) onHistoryRepairFailure() })
      .finally(() => { repairs.current.delete(engine) })
    repairs.current.set(engine, work)
  }, [engineRef, boardId, appliedOpIdsRef, syncFromLog, checkSnapshotBoundary, onHistoryRepairFailure, drainDeferredQueue])

  // (#169 bug fix) Injects a downloaded snapshot's pixels + structure into
  // `engine` and sets restoredLayerStateRef so syncFromLog starts deriving
  // LayerState from it. Awaited by the caller before applying tailOperations
  // on top — unlike backfillHistory below, this must finish first (the tail
  // paints relative to this restored buffer state).
  //
  // The layer buffers come first, from the snapshot's own layerState rather
  // than from store state (which a fresh joiner doesn't have yet). (#486)
  // setBaseLayers, not a loop of initLayer: the restored structure has to be
  // able to *retire* a layer this mount already init'd, not only add to it.
  // See the engine method's own doc comment for the room that fixing this
  // gets back.
  //
  // setActiveLayer/setCompositeOrder must run *after* every
  // restoreLayerFromSnapshot call, not before: setCompositeOrder
  // unconditionally invalidates and repaints the engine's below/above
  // split-composite cache (#122) right when it's called — calling it while
  // layers are still freshly initLayer'd (i.e. empty) bakes that emptiness
  // into the cache for every layer except whichever one is active, and
  // nothing afterward invalidates it again just because pixels got injected
  // later. The result: any non-active layer's restored content is silently
  // missing from the composite until some *later*, unrelated event forces
  // another invalidation (a stroke on yet another layer, or an undo/redo,
  // whose own history-replay path always invalidates unconditionally) —
  // exactly the "part of the drawing disappeared after reload, drawing
  // something and hitting undo brought it back" report (#121).
  //
  // (#374) Each layer carries its own `coveredSeq`, handed to the engine so it
  // can tell which of the operations arriving next are already in these
  // pixels. A layer in `layerState` with no entry here simply has nothing
  // stored — it stays empty and is rebuilt from the operations the server
  // sends precisely because it is uncovered. Treating that as an empty layer
  // instead is what lost drawing in #369.
  /** Restores this room from its stored snapshot, reporting whether there was
   *  one to restore. Returns false for "nothing baked yet" and for a failed
   *  fetch alike — the caller falls back to replaying operations either way.
   *
   *  (#467) The layers arrive one at a time through a sink instead of as a map
   *  handed over whole, and the engine call inside `applyLayer` is what makes
   *  that worth doing: it copies each layer's pixels into GL and keeps no
   *  reference, so the decoded buffer dies with the iteration that made it.
   *  Room F4uw21Ob measured 431 MiB of inflated pixels across ten layers —
   *  held at once, that killed the tab on iPadOS.
   *
   *  (#533) Returns the outcome's own status rather than a boolean, because the
   *  two ways of not restoring are opposites and the callers have to tell them
   *  apart: `none` is a room nobody ever baked, whose whole history the server
   *  is therefore sending as operations, and `failed` is a room whose history
   *  was withheld in favour of pixels that then did not arrive. The boolean
   *  collapsed them, and the second one used to open a blank room. */
  const restoreFromSnapshot = useCallback(async (
    engine: PencilEngineAPI, roomId: string,
  ): Promise<SnapshotRestoreOutcome['status']> => {
    const outcome = await restoreLatestSnapshot(roomId, {
      beginLayers: (layerState, replayStructure) => engine.setBaseLayers(
        replayStructure ? IMPLICIT_LAYER_IDS : Object.values(layerState.items).filter(item => item.kind === 'layer').map(item => item.id),
      ),
      restoreHistory: (operations, replayStructure) => engine.restoreHistoricalOperations(operations, replayStructure),
      applyLayer: (layerId, tiles, coveredSeq) => engine.restoreLayerFromSnapshot(layerId, tiles, coveredSeq),
    })
    // (#474) Drained here and nowhere else, on every path including failure:
    // the audit is what the engine saw, and leaving it behind on a failed
    // restore would hand those records to the *next* one. This is also the
    // only moment both accounts of the restore exist at once — the plan the
    // network described and the tiles the engine ended up holding.
    // Wrapped because this sits on the join path: reporting must never be able
    // to break the restore it is describing. A driver that answers getParameter
    // oddly, or a Sentry transport that throws, would otherwise cost the lesson
    // — the exact failure this code exists to catch, caused by the catching.
    try {
      reportSnapshotRestore(roomId, outcome, engine.takeSnapshotRestoreAudit(), engine.gpuInfo())
    } catch { /* a report we couldn't build is not worth a room we can't open */ }
    if (outcome.status !== 'restored') return outcome.status
    const { head } = outcome
    // A structural fallback has rebuilt its prefix from the original base;
    // the uploaded tree is no longer the authoritative input to these setters.
    const folded = head.replayStructure
      ? replayLayerState(makeInitialLayerState(), engine.getOperations()) : head.layerState
    engine.setActiveLayer(folded.activeId)
    engine.setCompositeOrder(computeCompositeOrder(folded))
    restoredLayerStateRef.current = head.replayStructure ? null : head.layerState
    return 'restored'
  }, [restoredLayerStateRef])

  // (#169) Walks the room's history backward from `fromSeq` (the restored
  // snapshot's own seq) in pages, merging each into the engine's log purely
  // for undo/redo purposes (see absorbHistoricalOperations's own doc
  // comment — never paints). Deliberately fire-and-forget from every caller:
  // this runs fully in the background, must not block first paint, and its
  // own best-effort failure handling (fetchHistoryPage swallows errors,
  // returning []) means it simply stops rather than throwing.
  //
  // (#291) Bounded to HISTORY_BACKFILL_DEPTH, not the room's whole history.
  // This used to walk all the way to seq 0, which stayed cheap only because
  // `pruneOperationsBeforeSnapshot` deleted pre-snapshot operations once a
  // room went idle — there was simply nothing old left to fetch. #289
  // disabled that prune (a snapshot can't authorize deleting its own
  // evidence until it's independently verified), and the unbounded walk
  // immediately became the dominant cost of opening any long room:
  // production room nHImlawW served 66 MB of stroke JSON in a single
  // response, 22 s on the wire, and hard-froze the renderer while parsing —
  // a tablet just OOMs instead.
  //
  // The depth matches the agreed undo rule (spec v0.2 §7): an operation
  // older than roughly the last two snapshots is permanently out of undo
  // reach, so backfilling past that point buys nothing anyone can use. This
  // bound holds regardless of whether pruning is ever re-enabled.
  const backfillHistory = useCallback(async (roomId: string, engine: PencilEngineAPI, fromSeq: number) => {
    const existing = ordinaryBackfills.current.get(engine)
    if (existing) return existing
    const work = walkHistoryBackward(roomId, fromSeq, HISTORY_BACKFILL_DEPTH, page => {
      if (engineRef.current !== engine) return
      engine.absorbHistoricalOperations(page)
      for (const op of page) appliedOpIdsRef.current.add(op.id)
      drainDeferredQueue()
    })
    ordinaryBackfills.current.set(engine, work)
    try { await work } finally {
      ordinaryBackfills.current.delete(engine)
      if (engineRef.current === engine && engine.pendingSnapshotHistoryRepairs().length) repairSnapshotHistory()
    }
  }, [engineRef, appliedOpIdsRef, drainDeferredQueue, repairSnapshotHistory])

  return { applyRemoteOp, restoreFromSnapshot, backfillHistory, repairSnapshotHistory }
}
