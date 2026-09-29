import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import { Outbox } from './net/outbox'
import { createIndexedDbOutboxStorage } from './net/outboxStorage'
import { createOutboxVerdicts, type OutboxVerdictDeps } from './net/outboxVerdict'
import { sendOperationWithTimeout, type OperationEmitter } from './net/sendOperation'

export interface BoardOutboxDeps {
  /** The board the queue belongs to — or, before the first `room_state`, the
   *  URL id standing in for it. */
  boardId: string
  socketRef: RefObject<OperationEmitter | null>
  /** Whether create_room/join_room has succeeded on this socket's lineage. */
  hasJoinedRef: RefObject<boolean>
  /** The board the server has this socket on, as far as this client knows. */
  socketBoardRef: RefObject<string | null>
  /** What a stalled or settled operation means for this client — see
   *  outboxVerdict.ts. Each is a dependency of the queue: they are all stable
   *  callbacks, so in practice only the board rebuilds it. */
  verdicts: OutboxVerdictDeps
}

/** (#289 epic, reliable history spec v0.2 §9) Every outgoing operation goes
 *  through here rather than a bare `socket.emit` — persisted to IndexedDB
 *  first, retried with exponential backoff until a real `SendResult` arrives,
 *  and replayed wholesale on reconnect (see joinFlow's resendAll). Without
 *  this, an operation whose packet was dropped was simply lost forever: it
 *  painted locally, never reached the server, and nothing ever noticed or
 *  retried it.
 *
 *  (#493) Out of Room: the queue for the board, its retirement when the board
 *  changes, and the live count the banners report. */
export function useBoardOutbox({ boardId, socketRef, hasJoinedRef, socketBoardRef, verdicts }: BoardOutboxDeps) {
  // (#201) Live size of the outbox — how much drawing exists only on this
  // device so far. Mirrored into state (rather than read off the Outbox on
  // render) because the Outbox is not a React store and its changes come
  // from socket acks, not renders.
  const [outboxState, setOutboxState] = useState({ pending: 0, stalled: 0 })
  const {
    pendingIdsRef, latestKnownSeqRef, checkSnapshotBoundary, confirmOperation, discardOperation,
    resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
  } = verdicts
  // (#176) The queue's key is the board, not the URL: operations are content,
  // and a page turn hands the next board a queue of its own (see the effect
  // below that retires the previous one). Before the first `room_state` a
  // joiner has no board yet; the URL id stands in so the offline screen (#313)
  // can still count a previous visit's unsent work for the common case of a
  // lesson with one board.
  const outbox = useMemo(() => new Outbox({
    storage: createIndexedDbOutboxStorage(),
    // (#358) Binds this queue to this board, in storage as well as in memory.
    // `boardId` is in the dep list below for the same reason: a queue holding
    // one board's unconfirmed strokes must not survive into another — that is
    // exactly how they used to get sent there.
    roomId: boardId,
    send: op => sendOperationWithTimeout(socketRef.current, op),
    // (#298) Nothing may go out before create_room/join_room has completed:
    // the server has no room to record against and answers `not_joined`, so
    // every such send is guaranteed to fail. This used to drain on *connect*
    // instead, which on a tablet with a 384-operation backlog meant blasting
    // ~55 MB of stroke JSON at a socket that had joined nothing — every
    // reconnect, forever.
    //
    // (#176) And nothing may go out while the socket is on — or on its way to
    // — a board other than this queue's. An operation carries no board of its
    // own; the server records it against wherever the socket is. The join ack
    // for the *lesson* can land after this client has already asked to turn to
    // the teacher's board, and a `resendAll` at that moment would put the
    // first board's leftovers on the second.
    canSend: () => hasJoinedRef.current && socketBoardRef.current === boardId,
    // `onSettled` is the one place a definitive verdict lands, for both
    // dispatch paths (optimistic and confirmation-gated).
    ...createOutboxVerdicts({
      pendingIdsRef, latestKnownSeqRef, checkSnapshotBoundary, confirmOperation, discardOperation,
      resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
    }),
    // (#201) The counter the ConnectionBanner reports. Passing a plain
    // setState is safe from any callsite: React batches, and the Outbox
    // only ever calls this after a real size change.
    onPendingChange: (pending, stalled) => setOutboxState({ pending, stalled }),
  }), [
    boardId, socketRef, hasJoinedRef, socketBoardRef, pendingIdsRef, latestKnownSeqRef, checkSnapshotBoundary,
    confirmOperation, discardOperation, resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
  ])
  // (#176) For the socket effect, which must not list `outbox` as a
  // dependency — see snapshotUploaderRef.
  const outboxRef = useRef(outbox)
  outboxRef.current = outbox

  // (#313) Surfaces a previous page load's unconfirmed work immediately,
  // without waiting for a join that may never come on this visit — the
  // offline screen's whole job is to report that number at exactly the
  // moment nothing can be sent.
  //
  // (#358) Also where the *previous* room's queue is retired. Room is one
  // component for every `/room/:id` (no `key` on the route), so an in-place id
  // change — taking a copy of a closed room, opening a fork — swaps `outbox`
  // without unmounting anything, and the instance left behind kept its retry
  // timers, its unsent entries, and a `send` closing over the shared socket
  // ref that has since joined the new room. Its next retry then landed in that
  // room, because an operation carries no room of its own and the server
  // records whatever arrives against the socket's current one.
  //
  // Retired by comparing instances rather than from this effect's cleanup:
  // StrictMode runs mount → cleanup → mount while `useMemo` keeps handing back
  // the same Outbox, so a disposing cleanup would leave the live queue dead in
  // development and nowhere else. Comparing means a simulated remount sees two
  // identical refs and does nothing.
  const previousOutbox = useRef(outbox)
  useEffect(() => {
    if (previousOutbox.current !== outbox) {
      previousOutbox.current.dispose()
      previousOutbox.current = outbox
    }
    void outbox.hydrate()
  }, [outbox])

  return { outbox, outboxRef, outboxState }
}
