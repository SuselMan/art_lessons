import type { RefObject } from 'react'

import type { Operation, ServerToClientEvents } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../../engine'
import { reportInvariant } from '../../../lib/observability/reportInvariant'
import { hasSeqGap, shouldEnterCatchUp, shouldLeaveCatchUp } from './catchUp'
import { commitRevealsBelow as commitRevealsBelowShared, type PendingPreviews } from './pendingPreviews'

/** The part of the engine the confirmed stream drives. */
export type ConfirmedStreamEngine = Pick<PencilEngineAPI, 'previewOperation' | 'dropPendingPreview'>

export interface ConfirmedStreamDeps {
  engineRef: RefObject<ConfirmedStreamEngine | null>
  /** The highest seq seen on the live stream — a gap past it means a resync. */
  lastConfirmedSeqRef: RefObject<number>
  /** The highest seq this client knows of anywhere, sent on every rejoin. */
  latestKnownSeqRef: RefObject<number>
  /** Ids already in the engine's log (this client's own included). */
  appliedOpIdsRef: RefObject<Set<string>>
  /** Peer strokes arrived but still being revealed — see pendingPreviews.ts. */
  pendingPreviewsRef: RefObject<PendingPreviews>
  /** Whether peer strokes are being applied without animation for now. */
  catchingUpRef: RefObject<boolean>
  /** Gestures already painted live (#429) — their operation is not animated. */
  streamedStrokeIdsRef: RefObject<Set<string>>
  /** Undo/redo/revoke waiting for a target the backfill has not reached. */
  deferredOpsQueueRef: RefObject<Operation[]>
  previewScheduleRef: RefObject<{ noteOperation(now: number): void } | null>
  /** (#537) This client's own operation has come back with its seq: move it
   *  to its place in the true order (see PencilEngineAPI.confirmOperation). */
  confirmOwnOperation: (op: Operation, seq: number) => void
  markLayerActive: (userId: string, layerId: string) => void
  applyRemoteOp: (op: Operation) => void
  syncFromLog: () => void
  checkSnapshotBoundary: () => void
  requestFullResync: () => void
  /** (#536, ADR 011 §17.49) Holds arrivals while a restore's tail replay
   *  yields - see replayGate.ts. */
  replayGate?: {
    hold(payload: { seq: number; operation: Operation }): boolean
    setHandler(handler: (payload: { seq: number; operation: Operation }) => void): void
  }
}

/** (#493) `operation_confirmed` — the room's one ordered stream of what
 *  happened, for every operation including this client's own. Out of Room's
 *  socket effect; every branch below is a rule about *how* an arrival lands
 *  (painted at once, revealed, skipped, deferred), and until it moved here
 *  none of them could be tested without a server. */
export function createConfirmedStreamHandler({
  engineRef, lastConfirmedSeqRef, latestKnownSeqRef, appliedOpIdsRef, pendingPreviewsRef,
  catchingUpRef, streamedStrokeIdsRef, deferredOpsQueueRef, previewScheduleRef,
  confirmOwnOperation, markLayerActive, applyRemoteOp, syncFromLog, checkSnapshotBoundary, requestFullResync,
  replayGate,
}: ConfirmedStreamDeps): ServerToClientEvents['operation_confirmed'] {
  // (#289 §7/§11 — reliable history spec v0.2) Renamed from
  // handlePeerOperation: this now fires for *every* confirmed operation,
  // including this client's own — `operation_confirmed` is broadcast via
  // `io.to`, not `socket.to`, specifically so every client (author
  // included) paints strictly through this one WebSocket-ordered stream
  // rather than racing it against a separate, faster ack. `seq` comes
  // from the envelope, not `operation.seq` (optional until stamped) —
  // simpler for logging/diagnostics, per the same spec.

  // (#537) See commitRevealsBelow: nothing is committed at `seq` while a
  // stroke below it is still only being shown.
  const commitRevealsBelow = (seq: number): boolean =>
    commitRevealsBelowShared(seq, pendingPreviewsRef.current, engineRef.current, applyRemoteOp)

  const handler: ServerToClientEvents['operation_confirmed'] = ({ seq, operation: op }) => {
    if (replayGate?.hold({ seq, operation: op })) return
    // (#289 §12) A gap in this stream is impossible on an unbroken
    // connection (TCP never silently drops or reorders within one), so
    // seeing one means the connection was interrupted without this client
    // noticing — a backgrounded tab, a sleeping device, a proxy recycling
    // the socket. Don't try to patch the hole; distrust the live stream
    // and redo the same full catch-up a normal reconnect does.
    if (hasSeqGap(lastConfirmedSeqRef.current, seq)) {
      reportInvariant('seq gap in confirmed stream — resyncing', { expected: lastConfirmedSeqRef.current + 1, got: seq })
      requestFullResync()
      return
    }
    lastConfirmedSeqRef.current = Math.max(lastConfirmedSeqRef.current, seq)
    latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, seq)
    // (#595) Anyone's operation — the student's own or the teacher's
    // correction — means the grid's picture of this board is stale.
    previewScheduleRef.current?.noteOperation(Date.now())
    if (appliedOpIdsRef.current.has(op.id)) {
      // This client's own operation, looping back through the same
      // ordered stream every peer gets — onLocalOperation already applied
      // it optimistically at dispatch time, so there is nothing left to
      // paint here.
      //
      // (#537) …but it was painted before its seq existed, and now it has
      // one. Confirming moves it from the log's pending tail to its place in
      // the room's order; if peer operations were painted on the same layer
      // in between and now sort *after* it, the engine re-settles that layer.
      // The ack reports the same seq — whichever arrives first confirms, the
      // other is a no-op.
      const flushed = commitRevealsBelow(seq)
      confirmOwnOperation(op, seq)
      if (flushed) syncFromLog()
      checkSnapshotBoundary()
      return
    }
    // Stroke ops are revealed progressively (#37 follow-up v2) rather than
    // committed on arrival — see the engine's onPreviewApplied option
    // above, which does the actual applyRemoteOp/syncFromLog once the
    // reveal finishes playing every dab back.
    if (op.type === 'stroke') {
      // A peer whose client predates live streaming (#429) only ever shows
      // up here, whole and after the fact — still enough to light the row.
      markLayerActive(op.userId, op.layerId)
      // (#289 §16) A live client that simply can't keep up (weak device,
      // several peers drawing at once) used to accumulate an unbounded
      // reveal backlog with nothing watching it. Past the threshold, drop
      // the animation and apply immediately — the same "correct content
      // now, no animation" tradeoff join/reconnect catch-up already
      // makes — until the backlog is comfortably small again.
      const backlog = pendingPreviewsRef.current.size
      if (catchingUpRef.current ? !shouldLeaveCatchUp(backlog) : shouldEnterCatchUp(backlog)) {
        if (!catchingUpRef.current) {
          catchingUpRef.current = true
          reportInvariant('reveal backlog — applying peer strokes without animation', { backlog })
        }
        commitRevealsBelow(seq)
        applyRemoteOp(op)
        syncFromLog()
        checkSnapshotBoundary()
        return
      }
      // (#429) Already on the layer, streamed live while the author drew it
      // — the engine's own claim skipped the dabs it had pre-painted when
      // applyRemoteOp ran below. Animating it as well would redraw the mark
      // on top of itself in a preview buffer. This is the same "correct
      // content now, no animation" branch the catch-up path above takes, and
      // for a stronger reason: here the content is not merely correct, it is
      // already visible, and has been since the author drew it.
      if (op.strokeId && streamedStrokeIdsRef.current.has(op.strokeId)) {
        commitRevealsBelow(seq)
        applyRemoteOp(op)
        syncFromLog()
        checkSnapshotBoundary()
        return
      }
      catchingUpRef.current = false
      // Arrived, not yet committed (#149) — held out of the snapshot
      // watermark until onPreviewApplied's reveal-complete commit retires
      // it. See pendingPreviews.ts's own doc comment.
      pendingPreviewsRef.current.add(op.id, seq)
      engineRef.current?.previewOperation(op)
      return
    }
    // Everything below this point commits `op` now, so whatever still
    // reveals below it goes first (#537). That includes an undo/revoke racing
    // the reveal of its own target: the target is committed, then flipped,
    // in the same task — nothing reaches the screen in between, and the log
    // keeps the 'done'-then-'undone' entry a later redo needs.
    commitRevealsBelow(seq)
    // (#169) Target isn't in the log yet — background backfill hasn't
    // reached it (or, very rarely, a real gap). Defer rather than apply
    // now: applying now would silently no-op and lose it permanently. See
    // deferredOpsQueueRef's own doc comment; drainDeferredQueue re-checks
    // this after every backfill page.
    if (
      (op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke') &&
      !appliedOpIdsRef.current.has(op.targetOpId)
    ) {
      deferredOpsQueueRef.current.push(op)
      return
    }
    applyRemoteOp(op)
    syncFromLog()
    checkSnapshotBoundary()
  }
  // Held arrivals come back through this same handler once the gate opens.
  replayGate?.setHandler(handler)
  return handler
}
