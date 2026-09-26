import type { Operation, RejectReason } from '@grafetto/shared'

import { operationRejectReason } from './operationGate.js'
import { lessonRecordOf, rooms, type RoomRecord } from './roomRegistry.js'
import { persistOperation } from './roomPersistence.js'
import { advanceStructuralLog, deriveLayerIds } from './structuralLog.js'

/** (#612) A resident room's operation log, one operation at a time: whether it
 *  may be applied (operationGate.ts has the rules), whether it already was
 *  (a retried send), the alive/deleted mirrors it may move, and stamping it
 *  with the room's next seq. socketHandlers.ts calls these in that order for
 *  every operation it relays. Moved out of rooms.ts. */

/** The single choke point for "should this operation be applied" — see
 *  operationRejectReason (operationGate.ts) for every rule it folds together.
 *  The `not_owner` fallback for an unknown room is arbitrary/unreachable in
 *  practice: socketHandlers.ts only calls this for a room a socket has joined,
 *  and recordOperation is the one that throws for a genuinely missing room. */
export function getOperationRejectReason(roomId: string, userId: string, op: Operation): RejectReason | null {
  const record = rooms.get(roomId)
  if (!record) return 'not_owner'
  return operationRejectReason(record, lessonRecordOf(record), userId, op)
}

/** Recomputes `aliveIds`/`deletedIds` from whatever is currently `done`.
 *
 *  Rebuilt wholesale rather than patched: an id can be destroyed by either a
 *  `layer_delete` or a `layer_merge` consuming it as a source, so "this delete
 *  was undone" does not by itself mean the id is alive again. Folding the
 *  surviving entries answers that without having to reason about it.
 *
 *  Mutates the existing Sets instead of replacing them — `getOperationRejectReason`
 *  and the tests both read them straight off the record. */
function refreshLayerIdMirrors(record: RoomRecord): void {
  const { aliveIds, deletedIds } = deriveLayerIds(record.structuralLog)
  record.aliveIds.clear()
  for (const id of aliveIds) record.aliveIds.add(id)
  record.deletedIds.clear()
  for (const id of deletedIds) record.deletedIds.add(id)
}

/** Keeps `RoomRecord.aliveIds`/`deletedIds` in sync the instant an operation
 *  is accepted (#289 epic) — called by socketHandlers.ts right before
 *  `recordOperation`, same ordering/reasoning as the existing
 *  `setLayerOwnerLocked` call for `layer_owner_lock` just above it.
 *
 *  Every operation is offered to the structural log, not just the ones that
 *  create or destroy an id (#368): an `operation_undo` names its target rather
 *  than its subject, so there is no way to tell from the type alone whether it
 *  bears on a layer. Recomputing is gated on the log saying something actually
 *  moved, which for a room mid-stroke is almost never. */
export function updateAliveIds(roomId: string, op: Operation): void {
  const record = rooms.get(roomId)
  if (!record) return
  // (#462) Carries the seq `recordOperation` is about to assign. This runs
  // just before it (see socketHandlers.ts) and so is handed the operation
  // unstamped, which left every entry added while the room was resident
  // reading as seq 0 — while the same entries rebuilt on a cold load carried
  // real seqs. Anything asking this log *when* something happened therefore
  // got a different answer depending on how the room got into memory, which
  // is the kind of difference that only shows up in production.
  //
  // Safe to predict rather than thread through: single-threaded, no `await`
  // between here and the `record.nextSeq++` that consumes it.
  const stamped = op.seq === undefined ? { ...op, seq: record.nextSeq } : op
  if (!advanceStructuralLog(record.structuralLog, stamped)) return
  refreshLayerIdMirrors(record)
}

/** Boolean convenience wrapper kept for existing callers/tests that only
 *  ever cared about yes/no — see getOperationRejectReason for the version
 *  socketHandlers.ts actually uses now, which needs the specific reason. */
export function isOperationAllowed(roomId: string, userId: string, op: Operation): boolean {
  return getOperationRejectReason(roomId, userId, op) === null
}

/** O(1) lookup for #289's send-side dedup (reliable history spec v0.2 §10):
 *  a retried send (outbox timeout racing an ack that was merely slow, not
 *  lost) must be recognized as the *same* operation, not recorded a second
 *  time. `Operation.id` is generated client-side before the first send and
 *  never changes across a retry, so it's already the idempotency key —
 *  no separate `clientOperationId` needed. */
export function findDuplicateOperation(roomId: string, operationId: string): Operation | undefined {
  return rooms.get(roomId)?.operationsById.get(operationId)
}

/** Appends an operation to the room's log (#34/#35), stamping it with the
 *  next `seq` — the server assigns total order per ADR 002, since clients
 *  only know their own local order. Returns the stamped copy; that copy (not
 *  the raw client payload) is what gets relayed and stored (in memory
 *  immediately; Postgres in the background, see `persistOperation`). Only
 *  ever called for a room a socket has already successfully joined, so an
 *  unknown roomId here indicates a caller bug, not a normal runtime
 *  condition. */
export function recordOperation(roomId: string, op: Operation): Operation {
  const record = rooms.get(roomId)
  if (!record) throw new Error(`recordOperation: unknown room "${roomId}"`)
  const stamped: Operation = { ...op, seq: record.nextSeq++ }
  record.operations.push(stamped)
  record.operationsById.set(stamped.id, stamped)
  persistOperation(roomId, stamped)
  return stamped
}
