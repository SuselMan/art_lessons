import { useCallback, useMemo, useRef } from 'react'

import type { Operation } from '@grafetto/shared'

import { createPendingPreviews } from './net/pendingPreviews'

/** (#493) Where this client stands in the current board's operation stream:
 *  what it has applied, what it sent and is waiting on, the last seq it saw,
 *  what is still being revealed or was watched live. All of it describes one
 *  board's content, and all of it goes back to zero together on a page turn —
 *  which is `resetStream`, called by Room's enterBoard.
 *
 *  Refs rather than state throughout: the socket handlers that read and write
 *  them are wired once per connection and must see the current value, and
 *  nothing here is ever rendered. */
export function useBoardStream() {
  // Applied operation ids — the idempotency net useRemoteOperations'
  // applyRemoteOp keeps (see its own comment), and what backfill and the
  // deferred queue check targets against.
  const appliedOpIdsRef = useRef<Set<string>>(new Set())
  // (#289 epic — reliable history spec v0.2 §2/§4) layerId/folderId this
  // client itself created but the server hasn't confirmed yet — the
  // "local island" isLocalIslandSafe checks a layer_delete/layer_merge/
  // layer_duplicate/layer_transform's targets against. Added the instant a
  // layer_add/folder_add is dispatched (see onLocalOperation), removed once
  // its SendResult settles either way — confirmed means it's now something
  // a peer could plausibly reference too; rejected means it never became
  // real in the first place.
  const pendingIdsRef = useRef<Set<string>>(new Set())
  // (#289 §12) Last seq seen on the live confirmed stream — distinct from
  // latestKnownSeqRef, which also folds in bulk room_state catch-up and so
  // can't tell "the live stream skipped something" from "we just replayed a
  // batch". Reset on every full resync, since the stream restarts there.
  const lastConfirmedSeqRef = useRef(0)
  // Highest operation seq this client has definitely seen — from ack'd local
  // operations and from operation_confirmed's envelopes (#149/#289). Sent back as
  // lastKnownSeq on every join_room/create_room (including reconnects), so
  // the server can trim room_state's tailOperations instead of resending
  // everything already known. 0 means "nothing yet," same as omitting it.
  const latestKnownSeqRef = useRef(0)
  // (#289 §16) True while this client is deliberately skipping peer-stroke
  // reveal animation to work through a backlog — see handleOperationConfirmed.
  const catchingUpRef = useRef(false)
  // (#169) A live operation_undo/operation_redo/operation_revoke whose
  // targetOpId isn't in appliedOpIdsRef yet — the target is somewhere in
  // pre-snapshot history background backfill hasn't reached yet. Applying it
  // immediately would silently no-op (OperationLog.applyUndo/applyRedo/
  // revoke all return null for an unknown id, see their own doc comments),
  // losing the operation permanently instead of catching up once backfill
  // reaches it. Drained by drainDeferredQueue after every backfill page.
  const deferredOpsQueueRef = useRef<Operation[]>([])
  // Stroke ops whose live reveal (previewOperation) hasn't finished playing
  // yet — i.e. not yet appendOperation'd into the log/layer. Consulted by
  // handleOperationConfirmed so a fast operation_undo/operation_revoke
  // targeting one of these can drop it from the reveal instead of trying
  // (and silently failing) to undo an op the log was never given, and by
  // checkSnapshotBoundary for the seqs those reveals still owe. (#477) One
  // structure for both readings — see pendingPreviews.ts for why they were
  // two, and what that cost.
  const pendingPreviewsRef = useRef(createPendingPreviews())
  // (#429) Gestures this client watched arrive live, so their operations are
  // applied straight rather than animated a second time (see
  // handleOperationConfirmed's stroke branch).
  //
  // Trimmed rather than cleared on any particular event: a gesture's
  // operations follow its packets within moments, but there is no single
  // moment at which an id is provably finished with — a long gesture emits an
  // operation at every STROKE_DAB_CHUNK_LIMIT boundary, so "the operation
  // arrived" does not mean "no more will". Keeping the most recent
  // STREAMED_STROKE_MEMORY ids covers any plausible in-flight window while
  // bounding what would otherwise grow for the whole lesson. Insertion order
  // is Set's own iteration order, so the oldest is simply the first.
  const streamedStrokeIdsRef = useRef<Set<string>>(new Set())

  const resetStream = useCallback(() => {
    appliedOpIdsRef.current = new Set()
    pendingIdsRef.current = new Set()
    lastConfirmedSeqRef.current = 0
    latestKnownSeqRef.current = 0
    catchingUpRef.current = false
    deferredOpsQueueRef.current = []
    pendingPreviewsRef.current = createPendingPreviews()
    streamedStrokeIdsRef.current = new Set()
  }, [])

  // One object for the handler factories, which take these by name. Stable:
  // its members are ref objects.
  const stream = useMemo(() => ({
    appliedOpIdsRef, pendingIdsRef, lastConfirmedSeqRef, latestKnownSeqRef, catchingUpRef, deferredOpsQueueRef,
    pendingPreviewsRef, streamedStrokeIdsRef,
  }), [])

  return { stream, resetStream }
}

export type BoardStream = ReturnType<typeof useBoardStream>['stream']
