import type {
  AssignmentSummary, BoardSummary, Operation, Participant, Room,
} from '@grafetto/shared'

import type { StructuralEntry } from './structuralLog.js'

/** (#612) The bottom of the room store: what a resident room *is*
 *  (`RoomRecord`), the one Map that holds them, the lesson/board rule every
 *  social read goes through, and the per-room Postgres write queue. Nothing
 *  here knows what an operation means or when a room is loaded or evicted —
 *  that is rooms.ts and the domain modules above it, which all share this one
 *  Map rather than each keeping their own. Moved out of rooms.ts so those
 *  domains could leave it without importing it back. */

export interface RoomRecord {
  room: Room
  // (#176, ADR 014) `null` for a lesson, the lesson's id for a board. It
  // decides which half of this record is *live*: a lesson's record holds the
  // social state (participants, freeze, palette, password) for itself and
  // every board under it, and a board's copies of those fields are never read
  // — every social question goes through `lessonRecordOf` first. The content
  // half (operations, seq, locks, coverage, structural log) is the record's
  // own either way, because a lesson is also its own first board.
  //
  // Invariant: a board is never resident without its lesson. `ensureRoomLoaded`
  // loads the lesson before the board, and `lessonRecordOf` throws rather than
  // fall back to the board's own empty social state — a board judged by an
  // allow-list nobody filled in would be an open door into a private lesson.
  lessonId: string | null
  // (#176) Which sockets currently have this record as their *content*
  // channel — i.e. are on this board. A board is evicted the moment this
  // empties, even while its lesson stays live; a lesson is evicted only when
  // `participants` empties, since its record carries the social state every
  // board needs. See `isIdle`.
  sockets: Set<string>
  // (#176) The lesson's board strip, itself first, in `order`. Read on every
  // `room_state` — which is synchronous — so it is cached here rather than
  // queried, and kept current by the `noteBoard*` mirrors boardRoutes.ts
  // calls after each write. Empty on a board's own record: never read there.
  boards: BoardSummary[]
  // (#595, ADR 015) Class mode, lesson records only — like `boards`, empty
  // or null on a board's own record and never read there. The assignment
  // rounds in order, the one in progress, the personal board in the
  // spotlight. Mirrors of the lesson row, written through by the setters in
  // the class-mode setters in rooms.ts. `classVisibility` lives on `room`.
  assignments: AssignmentSummary[]
  activeAssignmentId: string | null
  spotlightBoardId: string | null
  // Raised hands, by userId. Live only, like `roomFrozen`: a hand is a
  // gesture in a lesson, not a fact about it.
  handsRaised: Set<string>
  // True while `assignment_start` is writing its rows — the await between the
  // teacher's tap and the round existing is where a double tap would make two.
  assignmentStarting: boolean
  passwordHash: string | undefined
  operations: Operation[]
  participants: Map<string, Participant> // keyed by userId — live presence only, not join history
  nextSeq: number
  // (#149 epic, #371) The seq of this room's stored RoomLayerState — null
  // until anyone has uploaded one. Cached here rather than queried fresh on
  // every getRoomSnapshot call, same reasoning as `nextSeq`: rooms.ts's
  // synchronous API assumes live room state is always resident in memory once
  // `ensureRoomLoaded` has run once.
  //
  // No longer doubles as "everything below this is covered" — see
  // `coveredSeqByLayer`, which is the only thing that now answers that.
  layerStateSeq: number | null
  // (#372) Every id the stored layerState still lists. Absence, for an
  // operation the stored structure already accounts for, means the layer is
  // *gone* — consumed by a merge, or deleted — and so needs neither pixels nor
  // replay. Without this a merge whose result was later consumed looked
  // permanently uncovered (a layer that stopped existing can never get a
  // snapshot), so it kept being sent while the merge that consumed it was
  // withheld: the client rebuilt the dead layer and nothing took it away
  // again. Seen live on 2026-07-31 in room ksEMJOMy — an empty layer at the
  // top that refused to be deleted, the server rightly holding it destroyed.
  layerStateIds: Set<string> | null
  // (#371) `coveredSeq` per layer: the newest seq a RoomLayerSnapshot exists
  // for. A layer absent here has no stored pixels at all and is covered by
  // nothing — its whole history has to be replayed.
  //
  // This replaces the single room-wide floor that #369 lost content to. There
  // is deliberately no room-wide summary of it (no min, no max): every honest
  // question about coverage is per layer, and every attempt to collapse it
  // into one number is how a layer nobody snapshotted ends up treated as
  // covered. #372 makes `getRoomStateFor` read it per layer; until then every
  // joiner simply replays the full log.
  coveredSeqByLayer: Map<string, number>
  // (#190 epic) Hex colors, cached here and pushed live same as
  // `participants` — small, needed on every room_state, unlike RoomSnapshot's
  // pixel blobs which stay Postgres-only (see rooms.ts's getLayerSnapshot).
  palette: string[]
  // (#254/#256 epic) Room-wide freeze — an owner-triggered runtime control,
  // never persisted to Postgres (same ephemeral status as `participants`
  // itself): a server restart or a room going idle and being evicted simply
  // loses it, same as every participant's own live presence does. See
  // setRoomFrozen/isRoomFrozen.
  roomFrozen: boolean
  // (#254/#257 epic) Per-participant freeze, keyed by userId rather than
  // stored directly on the live `Participant` record in `participants` —
  // that map entry gets fully replaced on every join/reconnect (see
  // joinRoom), which would silently clear a freeze the instant its target
  // refreshed their tab. Keeping it here instead, and recomputing each
  // Participant's own `frozen` field from membership in this set at
  // join/create time (same pattern `role` already uses against
  // `room.ownerId`), makes a freeze survive a reconnect the way it needs to
  // for the "settle down one noisy student" use case to actually work.
  frozenUserIds: Set<string>
  // (#254/#258 epic) The one place the server inspects operation *content*
  // rather than just relaying it (see LayerOwnerLockOperation's own doc
  // comment in packages/shared) — a lightweight mirror of which layer ids
  // are currently owner-locked, kept in sync by `setLayerOwnerLocked`
  // whenever a `layer_owner_lock` operation is accepted. Rebuilt by folding
  // over `operations` in `ensureRoomLoaded` on a cold load, since (unlike
  // `roomFrozen`/`frozenUserIds`) this mirrors real operation-log content,
  // not ephemeral session state.
  lockedLayerIds: Set<string>
  // (#518) The *other* lock's mirror, kept the same way and deliberately not
  // merged into the set above: the two are different rules, not two spellings
  // of one. `lockedLayerIds` is the owner reserving a layer and stops everyone
  // but the owner, from touching it at all; this one stops *painting*, from
  // every hand including the owner's, and leaves renaming/moving/clearing/
  // deleting alone. Merging them would silently give each the other's blast
  // radius.
  //
  // Under-locks rather than over-locks where it cannot be sure, on purpose.
  // It is folded from the *resident* operation window (see
  // loadResidentOperations), so a `layer_lock` old enough to have been
  // snapshot-covered is simply not seen on a cold load, and an undo of one is
  // resolved by dropping the layer from the set (see setLayerLocked). Both
  // land on "not locked", because the cost is asymmetric: a lock this misses
  // is a courtesy the client is already enforcing on every participant's
  // screen, while a lock this invents refuses real drawing that nothing in the
  // UI explains — the failure `aliveIds` is written to avoid, for the same
  // reason.
  sharedLockedLayerIds: Set<string>
  // (#289 epic, reliable history spec v0.2 §8) Which layerId/folderId are
  // currently alive — created (the baked-in `IMPLICIT_LAYER_IDS`, or a done
  // `layer_add`/`folder_add`/`layer_merge` result) and not since destroyed
  // (listed in a done `layer_delete`, or consumed as a `layer_merge`
  // source). Kept in sync by `updateAliveIds` whenever an operation is
  // accepted — same "lightweight derived mirror, folded from the log on a
  // cold load" pattern `lockedLayerIds` already uses. The one thing the
  // server checks operation content for besides the owner-lock mirror:
  // `getOperationRejectReason` rejects `layer_delete`/`layer_merge`/
  // `layer_transform` outright when they reference an id no longer in this
  // set, instead of silently accepting a race that would otherwise resolve
  // differently (and possibly divergently) on every client's own replay.
  aliveIds: Set<string>
  // (#311) Ids that were alive and have since been destroyed — the strict
  // subset of "not in aliveIds" that we can positively attribute to a
  // `layer_delete`/`layer_merge` rather than to an id the server simply
  // never heard of. Content-bearing operations (`stroke`/`image_import`/
  // `layer_clear`) are gated on *this*, not on `aliveIds`.
  //
  // (#368) Not monotonic, despite what this used to assume: undoing the
  // `layer_delete` that put an id here takes it back out. Both mirrors are
  // derived from `structuralLog`, never edited in place by an arriving
  // operation — see `refreshLayerIdMirrors`.
  //
  // The distinction is the whole point. Gating strokes has an incomparably
  // larger blast radius than gating deletes: any hole in `aliveIds` would
  // start rejecting ordinary drawing, i.e. break the product outright, and
  // #291 is precedent that such holes happen (a layer left permanently
  // undeletable by exactly that shape of bug). Keying off a positive record
  // of destruction means an unknown id (never created, or a `layer_add`
  // that got lost) falls through to the pre-#311 behavior — the stroke is
  // accepted and degrades client-side — which is the status quo rather than
  // a regression.
  deletedIds: Set<string>
  // (#289 epic, reliable history spec v0.2 §10) Index of every operation
  // currently in `operations`, keyed by its client-generated `Operation.id`
  // — lets `findDuplicateOperation` answer "have we already recorded this
  // exact operation" in O(1) instead of scanning `operations` on every
  // single incoming message. Needed once a retried send (outbox timeout
  // racing an ack that was merely slow, not lost) must be recognized as the
  // same operation rather than recorded a second time.
  operationsById: Map<string, Operation>
  // (#368) Every layer-structural operation this room has recorded, with the
  // done/undone/gone state the client's own OperationLog would give it. The
  // single source `aliveIds`/`deletedIds` are derived from.
  //
  // It exists because those two mirrors used to be edited in place by each
  // arriving operation, which had no way to express "that delete was taken
  // back": `updateAliveIds` knew `layer_delete` and not `operation_undo`, so
  // undoing a delete revived the layer on every client and nowhere on the
  // server. From then on the layer was in a trap — strokes into it rejected
  // as `target_gone`, deleting it rejected as "already deleted by another
  // participant" — and no later operation could get it out. Seen in
  // production on 2026-07-30, room TYOwS7TR.
  //
  // Deriving instead of patching is what makes that unrepresentable: undo,
  // redo and revoke move an entry between states, and the mirrors are simply
  // recomputed from whatever is currently `done`.
  structuralLog: StructuralEntry[]
}

export const rooms = new Map<string, RoomRecord>()

/** (#176) The record that holds `record`'s social state: itself for a lesson,
 *  its lesson for a board. Every participant/freeze/palette/password/closed
 *  read or write in the room store goes through here, which is what makes "social
 *  lives on the lesson" one rule rather than a convention each function has
 *  to remember.
 *
 *  Throws for a board whose lesson is not resident. That cannot happen if the
 *  load and eviction paths keep their invariant (see RoomRecord.lessonId), and
 *  if it ever does, failing loudly is the right failure: the alternative is a
 *  board silently judged by its own empty allow-list and no password. */
export function lessonRecordOf(record: RoomRecord): RoomRecord {
  if (record.lessonId === null) return record
  const lesson = rooms.get(record.lessonId)
  if (!lesson) throw new Error(`board "${record.room.id}" is resident without its lesson "${record.lessonId}"`)
  return lesson
}

/** (#176) Whether nothing live depends on this record any more. A board is
 *  idle when no socket is on it; a lesson only when nobody is in the lesson at
 *  all — it may have no socket on its own first board and still be carrying
 *  the participants and freeze state of a class drawing on board three. */
export function isIdle(record: RoomRecord): boolean {
  return record.lessonId === null ? record.participants.size === 0 : record.sockets.size === 0
}

// Chains every Postgres write for a room onto whatever was already queued
// for it, so they land in order (in particular: persistRoomCreate always
// finishes before persistParticipant/persistOperation's FK on it can be
// violated). Also lets rooms.ts's `leaveRoom` defer evicting a room from memory
// until its writes have actually landed — otherwise a quick "draw a stroke,
// immediately refresh" can race a same-process reconnect's cold-load against
// that stroke's own fire-and-forget insert still being in flight, and come
// back missing content that was never really lost, just not queryable yet.
const pendingWrite = new Map<string, Promise<void>>()

export function enqueueWrite(roomId: string, run: () => Promise<unknown>): void {
  const prior = pendingWrite.get(roomId) ?? Promise.resolve()
  const next: Promise<void> = prior.then(run).then(
    () => {},
    err => { console.error(`failed to persist write for room ${roomId}`, err) },
  ).finally(() => {
    // (#292) Drop the entry once it's settled and nothing has chained onto
    // it since. Without this the map only ever grew: one entry per room this
    // process has *ever* written to, outliving the room's own eviction and
    // living until restart. Individually tiny, but unbounded in count — and
    // it kept the last write's whole closure reachable along with it.
    //
    // The identity check is what makes this safe: a write enqueued while
    // this one was in flight has already replaced the entry with its own
    // promise, and that one must survive so `leaveRoom` still defers
    // eviction behind it.
    if (pendingWrite.get(roomId) === next) pendingWrite.delete(roomId)
  })
  pendingWrite.set(roomId, next)
}

/** Waits out whatever writes are already queued for `roomId` (#317).
 *
 *  Every persist here is fire-and-forget by design — the socket path must not
 *  wait on Postgres — which means "what the database holds" trails "what the
 *  room is" by however long the queue is. Anything that reads a room's
 *  content straight from Postgres, rather than from the in-memory record, has
 *  to close that gap first or it silently copies a stale room. */
export function flushRoomWrites(roomId: string): Promise<void> {
  return pendingWrite.get(roomId) ?? Promise.resolve()
}

/** (#497) The same wait, for every room at once — what a shutdown owes the
 *  lesson that was going on when it started.
 *
 *  Fire-and-forget persistence means an operation is acknowledged to its
 *  author before Postgres has it. That is the right trade on the socket path
 *  and a straightforward way to lose confirmed work on the way out: the
 *  process dies, and the strokes still in this queue were told they were
 *  saved. `main` auto-deploys on every push, so that window opens several
 *  times a day, and it opens widest exactly when the room is busiest.
 *
 *  Loops rather than awaiting one snapshot of the values, because settling a
 *  write can enqueue another (a snapshot bake finishing behind a stroke), and
 *  a `Promise.all` over what happened to be in the map at the first tick
 *  would return with those still outstanding. `rounds` bounds it: the caller
 *  is racing a SIGKILL, and a queue that will not drain must not be what
 *  holds the shutdown open until the kernel decides it. */
export async function flushAllRoomWrites(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds && pendingWrite.size > 0; i++) {
    await Promise.all([...pendingWrite.values()])
  }
}

/** The write `roomId` is waiting on, or undefined when its queue is empty —
 *  undefined rather than a resolved promise, so eviction can happen in the
 *  same tick when there is nothing to wait for. */
export function pendingWriteOf(roomId: string): Promise<void> | undefined {
  return pendingWrite.get(roomId)
}

/** (#497) How much is still unwritten — for the shutdown log line, so a
 *  deploy that dropped work says so instead of leaving it to be inferred. */
export function pendingWriteCount(): number {
  return pendingWrite.size
}

/** Test-only seam: resolves once `roomId`'s in-flight Postgres writes (if
 *  any) have settled, so tests can assert `leaveRoom`'s deferred-eviction
 *  behavior without a real database — enqueueWrite's rejections are caught
 *  internally either way, so this resolves regardless of whether Postgres
 *  was actually reachable. */
export function _flushPendingWrites(roomId: string): Promise<void> {
  return pendingWrite.get(roomId) ?? Promise.resolve()
}

/** (#176) Resident or not, by any of its ids — and for a board, the lesson's
 *  record, which is where every social answer comes from. */
export function socialRecord(roomId: string): RoomRecord | undefined {
  const record = rooms.get(roomId)
  return record && lessonRecordOf(record)
}
