import { useCallback, useRef } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { useT } from '../../i18n'
import { notifyError } from '../../stores/noticeStore'
import { restoreRoomState, type RestoreRoomStateDeps, type RoomStatePayload, type RestoreMode } from './restoreRoomState'

/** What stays the same between the two callers of restoreRoomState. */
export type RoomRestoreDeps = Omit<
  RestoreRoomStateDeps, 'boardId' | 'finishOpenTimer' | 'getSnapshotUploader' | 'notifyReplayIncomplete'
>

/** What each caller brings of its own: the board, whether the open is being
 *  timed, and how it reaches the per-board snapshot uploader. */
export type RoomRestoreCall = Pick<RestoreRoomStateDeps, 'boardId' | 'finishOpenTimer' | 'getSnapshotUploader'>

/** (#493) restoreRoomState with everything its two callers share bound once —
 *  the engine's mount (a `room_state` that arrived before the engine) and the
 *  socket's catch-up (every later one). They used to spell the same fourteen
 *  dependencies out twice, side by side, which is the very drift the shared
 *  function exists to prevent.
 *
 *  Stable for as long as its inputs are, and every one of them is already a
 *  dependency of both callers' effects — so depending on this instead changes
 *  nothing about when the engine or the socket is rebuilt. The language is
 *  read through a ref for the same reason the socket effect does it: a
 *  language switch must not tear either of them down. */
export function useRoomRestore(deps: RoomRestoreDeps) {
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t
  const {
    restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone, dispatchParticipants,
    setRestoreFailure, setRoomContentReady, latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef,
    replayGate, diagnosticClearPrefixElision,
  } = deps
  return useCallback((
    engine: PencilEngineAPI | null, state: RoomStatePayload,
    occasion: { mode: RestoreMode; alreadyHadSeq: number }, call: RoomRestoreCall,
  ) => restoreRoomState(engine, state, occasion, {
    ...call,
    restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone, dispatchParticipants,
    setRestoreFailure, setRoomContentReady,
    notifyReplayIncomplete: () => notifyError(tRef.current('room.replayIncomplete'), {
      key: 'replay-incomplete', durationMs: null,
    }),
    latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef, replayGate, diagnosticClearPrefixElision,
  }), [
    restoreFromSnapshot, backfillHistory, applyRemoteOp, syncFromLogNow, markJoinRestoreDone, dispatchParticipants,
    setRestoreFailure, setRoomContentReady, latestKnownSeqRef, replayIncompleteRef, pendingPreviewsRef, openTimerRef,
    replayGate, diagnosticClearPrefixElision,
  ])
}
