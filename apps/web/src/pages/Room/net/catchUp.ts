// (#289 epic, reliable history spec v0.2 §12/§16) Two small, pure decisions
// Room/index.tsx's confirmed-operation handler asks on every arrival. Kept
// here rather than inline so both are unit-testable without a live socket.

// Entering batch mode is a visible behavior change (peer strokes stop
// animating), so the thresholds are deliberately asymmetric — see
// shouldEnterCatchUp/shouldLeaveCatchUp below.
export const CATCH_UP_ENTER_QUEUE = 25
export const CATCH_UP_LEAVE_QUEUE = 5

/** Whether a client that is still connected — not reconnecting — has fallen
 *  far enough behind that it should stop animating peer strokes and just
 *  apply everything at once (the same suspendDisplay/resumeDisplay batch
 *  path a join/reconnect already uses).
 *
 *  Join/reconnect catch-up was always batched; this covers the case that
 *  wasn't: a live client whose device simply can't keep up with several
 *  peers drawing at once, which used to silently accumulate an ever-growing
 *  reveal backlog with nothing watching it. */
export function shouldEnterCatchUp(pendingCount: number): boolean {
  return pendingCount >= CATCH_UP_ENTER_QUEUE
}

/** Hysteresis counterpart: only returns to normal animated reveal once the
 *  backlog is comfortably small again, not the moment it dips below the
 *  entry threshold — otherwise a client hovering right at the boundary
 *  would flip modes constantly. */
export function shouldLeaveCatchUp(pendingCount: number): boolean {
  return pendingCount <= CATCH_UP_LEAVE_QUEUE
}

/** Whether `seq` arriving next, after `lastSeq`, means confirmed operations
 *  were missed.
 *
 *  On a live connection this is impossible by construction: WebSocket/TCP
 *  never reorders or silently drops messages within one connection, so
 *  consecutive `operation_confirmed` envelopes are always consecutive seqs.
 *  A gap therefore means the connection was interrupted at some point —
 *  even if the client never observed a `disconnect` event (a backgrounded
 *  tab, a sleeping device, a proxy quietly recycling the socket).
 *
 *  So the correct reaction is not "wait for the missing one" or "request
 *  seq N specifically" — it's to distrust the live stream entirely and
 *  redo a full catch-up (room_state with lastKnownSeq), exactly as a normal
 *  reconnect does. See the spec's §12. `lastSeq === 0` means nothing has
 *  arrived yet this session, so there's no gap to detect. */
export function hasSeqGap(lastSeq: number, seq: number): boolean {
  if (lastSeq === 0) return false
  return seq > lastSeq + 1
}
