import type { RefObject } from 'react'
import * as Sentry from '@sentry/react'

import type { Operation, Participant } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../engine'
import { reportInvariant } from '../../lib/observability/reportInvariant'
import { useRoomStore } from '../../stores/roomStore'
import type { OpenTimer } from './diagnostics/openTiming'
import { type ReplayGate, yieldToEventLoop } from './replayGate'
import { undoneInBatch } from './undoneInBatch'
import { clearedInBatch } from './clearedInBatch'
import type { createPendingPreviews } from './net/pendingPreviews'
import type { RestoreFailureReason } from './status/RestoreFailedOverlay'
import type { createSnapshotUploader } from './net/snapshotSync'
import type { SnapshotRestoreOutcome } from './net/snapshotRestore'

/** What a `room_state` carries that this function acts on. */
export interface RoomStatePayload {
  latestSnapshotSeq: number | null
  tailOperations: Operation[]
  participants: Participant[]
  palette: string[]
  frozen: boolean
}

/** (#493) Which of the two occasions this is.
 *
 *  - `join` — the first `room_state` of this mount, which arrived before the
 *    engine existed and was parked until it did. The engine has nothing in it
 *    yet, so `alreadyHadSeq` is 0 and the room's open is being timed (#487).
 *  - `catchup` — any later `room_state` into a live engine: a reconnect, or a
 *    gap resync. The engine already holds everything up to `alreadyHadSeq`,
 *    and there is no open to time any more. */
export type RestoreMode = 'join' | 'catchup'

export interface RestoreRoomStateDeps {
  /** (#176) Snapshots belong to a board, not to the lesson it is in. */
  boardId: string
  /** Default OFF until full-journal material/lifecycle hardware gates. */
  diagnosticClearPrefixElision?: boolean
  restoreFromSnapshot: (engine: PencilEngineAPI, boardId: string) => Promise<SnapshotRestoreOutcome['status']>
  backfillHistory: (boardId: string, engine: PencilEngineAPI, fromSeq: number) => Promise<void>
  applyRemoteOp: (op: Operation) => void
  syncFromLogNow: () => void
  markJoinRestoreDone: () => void
  dispatchParticipants: (action: { type: 'room_state'; participants: Participant[] }) => void
  setRestoreFailure: (reason: RestoreFailureReason) => void
  setRoomContentReady: (ready: boolean) => void
  finishOpenTimer: (engine: PencilEngineAPI | null) => void
  notifyReplayIncomplete: () => void
  /** A getter, not a value: the uploader is per board (#176), and the
   *  catch-up caller reads it through a ref at the moment the bootstrap needs
   *  it — which is at the end of an `await`-laden restore, not at its start. */
  getSnapshotUploader: () => ReturnType<typeof createSnapshotUploader> | null
  latestKnownSeqRef: RefObject<number>
  replayIncompleteRef: RefObject<boolean>
  pendingPreviewsRef: RefObject<ReturnType<typeof createPendingPreviews>>
  openTimerRef: RefObject<OpenTimer | null>
  /** (#536, §17.49) Holds live confirmations while the tail replay yields. */
  replayGate: ReplayGate<unknown>
}

/** (#536, §17.49) How long the tail replay may hold the main thread before it
 *  yields: short enough for the socket's ping and a pinch to get through. */
const REPLAY_YIELD_MS = 100

/** (#493) Snapshot, then tail, then history backfill — the whole of how a
 *  `room_state` becomes pixels.
 *
 *  This used to exist twice in Room: once in the engine's mount effect for a
 *  `room_state` that arrived before the engine did, and once in the socket
 *  effect's `handleRoomState` for every later one. The two copies had drifted
 *  apart, and on inspection every difference turned out to be either a
 *  parameter (how much the engine already held; whether the open is being
 *  timed) or code that was a no-op on the side that lacked it. They are one
 *  function, and this is it. Every fix to this path since #147 has had to be
 *  made twice — #385, #480, #533, #538 each touched both — and a fix that
 *  reached only one copy is the failure this merge exists to make impossible.
 *
 *  What stays with the callers is what really differs between them: parking
 *  the payload until the engine exists, the paper wait and its timer stages,
 *  and resetting the ready flag and snapshot gate before a catch-up.
 *
 *  `engine` is nullable because the catch-up caller's always was: a
 *  `room_state` can land while the engine is being torn down. In that case
 *  everything that is not about pixels — the store, the participant list, the
 *  palette — still happens, exactly as it did before. */
export async function restoreRoomState(
  engine: PencilEngineAPI | null,
  state: RoomStatePayload,
  { mode, alreadyHadSeq }: { mode: RestoreMode; alreadyHadSeq: number },
  deps: RestoreRoomStateDeps,
): Promise<void> {
  const { latestSnapshotSeq, tailOperations } = state
  const openTimer = mode === 'join' ? deps.openTimerRef.current : null

  // (#533) Read by the `finally` below: a restore that brought back nothing
  // must not end with the room announced as open. A plain `return` cannot
  // express that — `finally` runs on the way out either way — so the exit has
  // to be flagged rather than jumped to.
  let restoreFailedHere = false
  // (#538) Держится ровно до входа в `resumeDisplay`, а не до его возврата, и
  // это не мелочь: глубина там уменьшается первым же оператором, до
  // `_flushPendingRebuilds`, который и бросает в отчётах `JAVASCRIPT-D/E/G`
  // (выделение тайла не удалось). То есть «suspend всё ещё держится» и «resume
  // не довёл дело до конца» — разные состояния, и повторный `resumeDisplay()`
  // из `catch` по второму поводу заново позвал бы `_display()` на той же
  // нехватке памяти, уже внутри обработчика.
  let displaySuspended = false
  deps.replayGate.begin()
  try {
    // (#147) A room's history can be hundreds/thousands of ops — without this,
    // appendOperation's own per-op _display() (full composite + paper-blend)
    // fires once per operation, a visible freeze that grows with the room's
    // history. suspendDisplay/resumeDisplay defer all of that to one
    // _display() right after the loop — see their own doc comments.
    engine?.suspendDisplay()
    displaySuspended = engine !== null

    openTimer?.stage('snapshot')
    // (#169) Restore only when the snapshot is ahead of what this engine
    // already holds. On a join that is always the case — nothing is held yet,
    // `alreadyHadSeq` is 0, and snapshot seqs start at the first interval — so
    // this reads as "whenever the room has a snapshot at all", which is what
    // the join path used to check directly.
    let restoredFromSnapshot = false
    if (engine && latestSnapshotSeq !== null && alreadyHadSeq < latestSnapshotSeq) {
      const status = await deps.restoreFromSnapshot(engine, deps.boardId)
      // (#533) The one branch that must not fall through to the replay below.
      // `tailOperations` is only what the snapshot did *not* cover — 69
      // operations of a 53 836-operation room, on the day this was found — so
      // replaying it over an engine that received no pixels paints an
      // all-but-empty canvas, and the `finally` then announces the room as
      // open. `restoreFailed` is what turns that into a screen the reader can
      // act on. The open timer is left un-`finish`ed on purpose: the open
      // genuinely did not finish, and #487's alarm reporting it as stalled is
      // the truth.
      //
      // `!== 'restored'` rather than `=== 'failed'`: this branch only runs
      // because room_state said a snapshot exists, so a `none` here — the
      // index answering 204 — is the server contradicting itself, and it
      // arrives with exactly the consequences of a failure.
      if (status !== 'restored') {
        restoreFailedHere = true
        deps.setRestoreFailure('transfer')
        // (#385) The canvas holds less than the room does, permanently for
        // this mount. Load-bearing on the way out: without it the unmount hook
        // bakes a thumbnail from this blank canvas and republishes it over the
        // lesson's real preview, and it closes snapshot baking for the rest of
        // the mount.
        deps.replayIncompleteRef.current = true
        // Balances the suspendDisplay above: the depth is a counter, and
        // leaving it raised would mute every later paint on this engine,
        // including the one a successful retry produces.
        displaySuspended = false
        engine.resumeDisplay()
        return
      }
      restoredFromSnapshot = true
    }
    openTimer?.note({ restoredFromSnapshot })
    openTimer?.stage('replay')

    // Dependency history may precede the restored structural watermark. Seed
    // that inclusive prefix before redo/undo in the tail; appending it would
    // revoke strokes on consumed source layers and double-apply old structure.
    const historicalPrefix = restoredFromSnapshot && latestSnapshotSeq !== null
      ? tailOperations.filter(op => (op.seq ?? 0) <= latestSnapshotSeq) : []
    const replayOperations = historicalPrefix.length
      ? tailOperations.filter(op => (op.seq ?? 0) > latestSnapshotSeq!) : tailOperations
    if (engine && historicalPrefix.length) await engine.restoreHistoricalOperations(historicalPrefix)

    // (#398) Reference images decoded before the loop, not inside it — see
    // PencilEngineAPI.preloadImages. Without this, the operations recorded
    // *after* an import replay against a layer whose image has not landed yet.
    if (engine) await engine.preloadImages(replayOperations)

    // (#385) Per-operation, not around the whole loop. One operation that
    // throws used to abandon every operation after it — and in the real case
    // that produced this guard (a GL allocation failing part way through a
    // 2001-operation room) the ones after it were the overwhelming majority.
    let failed = 0
    const applyOne = (op: Operation): void => {
      try {
        deps.applyRemoteOp(op)
      } catch (err) {
        // Only the first is reported: a failure here is normally a dead GL
        // context, and every subsequent operation fails the same way.
        if (failed === 0) Sentry.captureException(err)
        failed++
      }
    }

    // This client's own deferred operations whose confirmation never arrived
    // — the socket dropped while they were in flight. Their previews are
    // dropped either way; one the tail does not already carry, and the
    // restored snapshot does not already cover, is applied for real. Empty on
    // a join: a preview only exists for an operation dispatched from a room
    // that was already open, so there is nothing to strand before the first
    // one. Running it there anyway is what keeps this one function.
    const tailOpIds = new Set(tailOperations.map(op => op.id))
    for (const opId of deps.pendingPreviewsRef.current.ids()) {
      const seq = deps.pendingPreviewsRef.current.remove(opId) ?? 0
      const stranded = engine?.dropPendingPreview(opId) ?? null
      if (!stranded || tailOpIds.has(opId)) continue
      if (restoredFromSnapshot && latestSnapshotSeq !== null && seq <= latestSnapshotSeq) continue
      applyOne(stranded)
    }
    // (#536, §17.49) In slices, yielding between them, behind the gate - see
    // replayGate.ts on why it is not one piece any more, and why the gate.
    const unpainted = undoneInBatch(replayOperations)
    if (engine && deps.diagnosticClearPrefixElision && mode === 'join' && alreadyHadSeq === 0 && latestSnapshotSeq === null
      && engine.getOperations().length === 0 && replayOperations.at(-1)?.seq === deps.latestKnownSeqRef.current) {
      for (const id of clearedInBatch(replayOperations, engine.liveLayerIds())) unpainted.add(id)
    }
    engine?.setUnpaintedInBatch(unpainted)
    try {
      let sliceStart = performance.now()
      for (const op of replayOperations) {
        applyOne(op)
        if (performance.now() - sliceStart > REPLAY_YIELD_MS) {
          await yieldToEventLoop()
          sliceStart = performance.now()
        }
      }
    } finally {
      engine?.setUnpaintedInBatch(null)
    }

    if (failed > 0) {
      // (#480) The exception already went to Sentry, but not its consequence:
      // from here to the end of the mount this client may not bake snapshots,
      // and will not — silently. That is what has to be visible.
      reportInvariant(
        mode === 'join'
          ? 'join replay incomplete — snapshots disabled for this mount'
          : 'catch-up replay incomplete — snapshots disabled for this mount',
        { failed },
      )
      deps.replayIncompleteRef.current = true
      deps.notifyReplayIncomplete()
    }
    deps.replayGate.end()
    displaySuspended = false
    engine?.resumeDisplay()
    // (#386) Now, not on the next microtask: the bootstrap below reads the
    // store back in this same task. See syncFromLogNow.
    deps.syncFromLogNow()
    // (#462) After syncFromLogNow, never before: the flag's whole claim is
    // that the store now describes this room.
    deps.markJoinRestoreDone()
    deps.dispatchParticipants({ type: 'room_state', participants: state.participants })
    useRoomStore.getState().setPalette(state.palette)
    useRoomStore.getState().setRoomFrozen(state.frozen)

    if (engine && restoredFromSnapshot && latestSnapshotSeq !== null) {
      void deps.backfillHistory(deps.boardId, engine, latestSnapshotSeq)
    }
    // A short room need not ever cross100. Request its first per-layer
    // snapshot at the real current watermark; useSnapshotPublishing retries
    // refused wet/pending layers after they become publishable. The ordinary
    // cadence path below still refuses rounding a113 picture down to100.
    const uploader = deps.getSnapshotUploader()
    if (engine && latestSnapshotSeq === null && uploader) {
      uploader.requestFirstSnapshot()
      uploader.onSeqObserved(
        alreadyHadSeq, deps.latestKnownSeqRef.current, engine, useRoomStore.getState().layerState,
      )
    }
  } catch (error) {
    // (#538) Everything between `resumeDisplay()` and here runs once per
    // restore and nowhere else. A throw on its first line cancels the rest,
    // and the `finally` without a flag would still announce the room as open:
    // the preloader leaves, the pencil works, and `layerState` is still
    // `makeInitialLayerState()` — the editor shows the wrong lesson and says
    // nothing. The same shape #533 closed for a failed snapshot, so the same
    // screen and the same retry.
    restoreFailedHere = true
    deps.setRestoreFailure('apply')
    deps.replayIncompleteRef.current = true
    // Reported explicitly rather than left to the global unhandled-rejection
    // handler: that would claim it went unhandled, which is no longer true.
    // The tag tells a join failure from a catch-up one among events that look
    // alike, and the timer is deliberately not finished — see above.
    Sentry.captureException(error, {
      tags: {
        joinFailure: mode === 'join' ? 'tail' : 'catchup',
        openReached: deps.openTimerRef.current?.stalled().reached,
      },
    })
    if (displaySuspended) {
      // Its own try: if the canvas has stopped answering, a second throw from
      // here would put us back in an unhandled rejection — and leave the
      // person without the failure screen they have by now earned.
      try { engine?.resumeDisplay() } catch { /* the failure screen matters more */ }
    }
  } finally {
    // Runs even if the restore or replay throws — a failed restore must still
    // unblock drawing rather than leave the canvas permanently inert. A
    // snapshot that brought back *nothing* is the exception (#533): there is
    // no partial room to unblock, only an empty one to be wrong about, so that
    // exit leaves the flag set and RestoreFailedOverlay takes the screen.
    //
    // A condition rather than an early `return`: a `return` in a `finally`
    // would also swallow whatever the `try` threw.
    if (!restoreFailedHere) {
      deps.setRoomContentReady(true)
      // (#487) Same `finally`, same reason: "ready" is the moment the
      // preloader left and the pencil started working, which happens even
      // after an imperfect restore. Only a join is timed.
      if (mode === 'join') deps.finishOpenTimer(engine)
    }
  }
}
