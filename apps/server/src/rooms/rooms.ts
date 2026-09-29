import bcrypt from 'bcryptjs'
import type {
  LessonState, Operation, Participant, Room, RoomAccessMode,
} from '@grafetto/shared'
import { DEFAULT_PALETTE_COLORS, IMPLICIT_LAYER_IDS } from '@grafetto/shared'

import { isCoveredBySnapshot } from './snapshotCoverage.js'
import { lessonStateFor } from './classroom.js'
import { persistPalette, persistParticipant, persistRoomCreate } from './roomPersistence.js'
import {
  isIdle, lessonRecordOf, pendingWriteOf, rooms, socialRecord, type RoomRecord,
} from './roomRegistry.js'

// The write queue lives with the Map it serves; these are part of this
// module's public face and stay importable from here.
export { _flushPendingWrites, flushAllRoomWrites, flushRoomWrites, pendingWriteCount } from './roomRegistry.js'

// In-memory room store, backed by Postgres (#74) for durability across
// restarts and RAM eviction — but the Map stays the single source of truth
// for anything *live* (current participants, operation relay), and every
// exported function here keeps the exact same synchronous signature it had
// before persistence existed. Postgres writes are fire-and-forget side
// effects (see the `persist*` helpers below), never awaited on the hot path,
// so DB latency never adds to real-time draw latency (#104) — the tradeoff
// is that an operation which loses a race with a server crash is dropped
// from history despite already having been relayed live. Acceptable for a
// classroom drawing tool.
//
// A room can still be absent from this Map even though it exists in
// Postgres — either it was never loaded this process lifetime, or it was
// evicted after going empty (see `leaveRoom`). `ensureRoomLoaded` (async,
// called by socketHandlers.ts before the synchronous functions below) is
// the only thing that reaches into Postgres to repopulate the Map; nothing
// in this file's synchronous API does its own cold-start DB read.

// Cursor colors (#39) — cycled by join order. Purely data at this point; a UI
// consumes this to render peer cursors, which is out of scope here.
const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#a855f7', '#ec4899',
]

const BCRYPT_ROUNDS = 10

// Tracks which socket.id is currently considered "the" live connection for
// a given room+userId (#164). A user can briefly have two overlapping
// sockets for the same room — a page refresh, a flaky reconnect — where the
// OLD socket's 'disconnect' event arrives *after* the NEW socket has already
// joined. Without this, that stale disconnect's leaveRoom call would remove
// the participant (participants is keyed by userId, not socket.id, so the
// old socket's leave looks identical to the new one's) and, if they were
// the room's last participant, evict the room entirely — while a live,
// joined socket for that user still exists and can go on to call
// recordOperation for a room that's no longer in the Map, throwing an
// uncaught exception that crashes the whole process. Keyed by
// `${roomId}:${userId}` rather than nesting inside RoomRecord.participants
// so a stale leaveRoom can check it even after the room itself might
// already be gone.
//
// (#176) Keyed by the *lesson* id: presence is a fact about the lesson, and a
// socket that switches boards is the same live connection for the same
// person, not a new participant.
const currentSocketForParticipant = new Map<string, string>()

function participantKey(lessonId: string, userId: string): string {
  return `${lessonId}:${userId}`
}

// (#176) Which board each connected socket is on, by socket id. The seat
// (`currentSocketForParticipant`) says which socket *counts* for a person;
// this says where every socket actually is, superseded ones included — a
// second tab whose seat was taken over is still a socket on a board, and the
// board must not be evicted from under it just because its seat moved. It is
// also what lets a socket switching boards leave the right one without the
// handler having to say which.
const boardOfSocket = new Map<string, string>()

/** Takes `socketId` off `boardId`'s roster, and lets the board go if it was
 *  the last one there. A lesson's own record is never released by this: its
 *  life is tied to its participants (see `isIdle`), not to its first board's
 *  sockets. */
function removeSocketFromBoard(boardId: string, socketId: string): void {
  const board = rooms.get(boardId)
  if (!board) return
  board.sockets.delete(socketId)
  if (board.lessonId !== null && board.sockets.size === 0) evictWhenIdle(boardId)
}

export type JoinRoomOutcome =
  | {
      ok: true
      participant: Participant
      // (#176) The lesson this seat is in — the social channel the caller has
      // to be subscribed to, whichever board it asked for.
      lessonId: string
      // (#176) Set when this person was already in the lesson: the board they
      // were on before this call. Equal to the joined board on a plain
      // reconnect, different on a switch, absent on a first join. The caller
      // reads it to tell `peer_board_changed` from `peer_joined`.
      previousBoardId?: string
    }
  | { ok: false; error: 'not_found' }

/** Deletes every Operation row at or before `latestSnapshotSeq` (2026-07-19:
 *  replay was dropped from the roadmap — see #207/#206 — so full history no
 *  longer needs to survive past the session that produced it; retention is
 *  now "this live session's undo/redo depth", not "forever"). Only called
 *  once a room has gone genuinely empty (see `leaveRoom`), and only prunes
 *  what's already safely covered by an existing RoomSnapshot.
 *
 *  (#289 epic, reliable history spec v0.2 §5/§13 — 2026-07-25) DISABLED
 *  pending snapshot verification. The rule this used to rely on — "a
 *  snapshot exists for this seq, therefore the operations it covers are
 *  redundant" — is exactly the assumption #287 falsified in production: a
 *  snapshot can be baked from a client whose own view was already corrupt,
 *  and pruning then destroys the only evidence that could have rebuilt it.
 *  Nothing may justify deletion except a snapshot independently corroborated
 *  (see the engine's bakeLayerByFullReplay oracle and RoomSnapshot's new
 *  `verification` column), which isn't wired end-to-end yet.
 *
 *  Ilya's call (2026-07-25): keep full history for now, while the product has
 *  no live users and this doubles as debugging material; revisit before
 *  release, when the storage cost actually starts mattering (#207 tracks the
 *  hot/cold tiering that should carry it then). Kept as a function rather
 *  than deleted so re-enabling it is a one-line change once verification
 *  gates it properly.
 *
 *  (#372) The rule it will re-enable *with* is now written down and tested
 *  rather than left to be reinvented: an operation may be deleted only when
 *  `isCoveredBySnapshot` says stored pixels account for it — per layer, never
 *  by a room-wide seq. See `deletableOperations` (snapshotCoverage.ts), which is that rule and
 *  which this would call. Two conditions have to hold before it may run at
 *  all, and neither is this function's to check alone: the covering snapshot
 *  must be `verified` (#289 §13), and every layer in the room's stored
 *  structure must have coverage — a layer nobody ever snapshotted has no
 *  pixels standing in for anything, and deleting its operations is exactly
 *  #369 made permanent. */
function pruneOperationsBeforeSnapshot(_roomId: string): void {
  // Intentionally a no-op — see the doc comment above.
}

/** Registers a new room and immediately seats its creator as `owner`.
 *  `ownerId` is fixed here, at creation time, and never changes afterward —
 *  this replaces the old "first socket to join becomes teacher" rule (#39),
 *  which raced whenever more than one person opened a room link around the
 *  same time. `join_room` (below) now only ever produces `member`s *for
 *  anyone but the persisted owner* — see the role check there for how a
 *  returning owner reconnecting (or reopening the link on any later day)
 *  gets `owner` back despite always going through `join_room`, not this.
 *
 *  `roomData.id` already existing here is *not* a rare nanoid collision —
 *  it's the expected, common case of the creator's own tab refreshing:
 *  browsers keep `history.state` across a same-entry reload, so the client's
 *  `isCreator`/`creatorDraft` survives too and it emits `create_room` again
 *  for the same id (its own "have I already joined this session" tracking
 *  is just a JS ref, which does reset on reload — see Room/index.tsx). Only
 *  actually recreates when the id is genuinely new; otherwise this is a
 *  no-op rejoin that leaves existing content untouched, same spirit as
 *  `join_room`'s owner-role check just below. A real id collision from a
 *  *different* owner (astronomically unlikely) still falls through to
 *  overwriting, same as always — not worth a dedicated error path for
 *  something this rare. `socketHandlers.ts` calls `ensureRoomLoaded` before
 *  this, same as it does for `join_room`, so "already exists" is detected
 *  even when the room isn't currently live in memory (e.g. a server
 *  restart between the original creation and this reload). */
export function createRoom(
  roomData: Pick<Room, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight' | 'enabledTools' | 'classVisibility'>,
  password: string | undefined,
  ownerId: string,
  ownerName: string,
  socketId: string,
  // (#232) Defaulted here rather than at the call site so the socket handler
  // stays a pass-through: a client that says nothing about access gets the
  // open room it has always got.
  accessMode: RoomAccessMode = 'anyone_with_link',
): { room: Room; participant: Participant } {
  const existing = rooms.get(roomData.id)
  if (existing && existing.room.ownerId === ownerId) {
    // The owner can never be frozen (#254/#257) — always `false` regardless
    // of whatever frozenUserIds might contain from before (it never would,
    // see setParticipantFrozen, but this stays explicit rather than trusting
    // that invariant silently).
    const participant: Participant = {
      userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false, boardId: roomData.id,
    }
    existing.participants.set(ownerId, participant)
    existing.sockets.add(socketId)
    boardOfSocket.set(socketId, roomData.id)
    currentSocketForParticipant.set(participantKey(roomData.id, ownerId), socketId)
    return { room: existing.room, participant }
  }

  const room: Room = {
    ...roomData,
    // (#595) Checked, like `accessMode`: the payload is a socket's claim.
    classVisibility: roomData.classVisibility === 'class' ? 'class' : 'teacher_only',
    hasPassword: !!password,
    // (#224/#232) Written through explicitly rather than left to the column
    // default, so the in-memory record and the row can never disagree about a
    // room's own mode — including when the creator picked one (#232).
    accessMode,
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const passwordHash = password ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : undefined
  const participant: Participant = {
    userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false, boardId: room.id,
  }
  const participants = new Map<string, Participant>([[ownerId, participant]])
  const palette = [...DEFAULT_PALETTE_COLORS]
  rooms.set(room.id, {
    // A created room is always a lesson: boards come only through
    // boardRoutes.ts, which seeds a row and lets the next join cold-load it.
    room, lessonId: null, sockets: new Set([socketId]),
    boards: [{ id: room.id, name: room.name, order: 0 }],
    assignments: [], activeAssignmentId: null, spotlightBoardId: null, handsRaised: new Set(),
    assignmentStarting: false,
    passwordHash, operations: [], participants, nextSeq: 1, palette,
    layerStateSeq: null, layerStateIds: null, coveredSeqByLayer: new Map(),
    roomFrozen: false, frozenUserIds: new Set(), lockedLayerIds: new Set(),
    sharedLockedLayerIds: new Set(),
    aliveIds: new Set(IMPLICIT_LAYER_IDS), deletedIds: new Set(), operationsById: new Map(),
    structuralLog: [],
  })
  boardOfSocket.set(socketId, room.id)
  currentSocketForParticipant.set(participantKey(room.id, ownerId), socketId)
  persistRoomCreate(room, passwordHash)
  persistParticipant(room.id, ownerId, ownerName)
  persistPalette(room.id, palette)
  return { room, participant }
}

/** (#225) The two facts the join gate needs about a live room that aren't on
 *  the wire `Room` type or in Postgres in a form it can use: who owns it and
 *  which mode it's in. Returns undefined for a room not currently resident,
 *  which the gate reads as `not_found` — callers run `ensureRoomLoaded` first,
 *  so a room absent here is a room absent from Postgres too. */
export function getRoomGate(
  roomId: string,
): { ownerId: string; accessMode: RoomAccessMode; lessonId: string } | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  // (#176) Both facts are the lesson's, and the gate also learns *which*
  // lesson, because the rows it goes on to consult (blocks, invites,
  // requests, prior participation) are keyed by it — never by a board.
  const lesson = lessonRecordOf(record)
  return { ownerId: lesson.room.ownerId, accessMode: lesson.room.accessMode, lessonId: lesson.room.id }
}

/** (#225) True when the room has no password, or when this one matches it.
 *  Lives here rather than in `roomAccess.ts` so the hash itself never leaves
 *  this module — the gate gets an answer, not a credential to compare.
 *  (#176) The password is the lesson's, whichever board is being asked for. */
export function checkRoomPassword(roomId: string, password: string | undefined): boolean {
  const record = rooms.get(roomId)
  if (!record) return true
  const { passwordHash } = lessonRecordOf(record)
  if (!passwordHash) return true
  return !!password && bcrypt.compareSync(password, passwordHash)
}

/** (#226) Hashes a room password. Here rather than in the route that sets one
 *  because this module owns every other dealing with the hash — the cost
 *  factor in particular, which has to match what `checkRoomPassword` was built
 *  against. */
export function hashRoomPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS)
}

/** Seats a participant in an existing room. Fails with `not_found` if no room
 *  has been registered under this id yet and `ensureRoomLoaded` couldn't find
 *  it in Postgres either. Assigns `owner` when `userId` is the room's
 *  persisted owner (reconnecting after a drop, or just reopening the link days
 *  later — see `createRoom`'s doc comment, this is the *only* path a returning
 *  owner goes through) and `member` otherwise.
 *
 *  (#225) This decides *nothing* about whether the join is allowed — the
 *  password check that used to live here moved out with the rest of it into
 *  `roomAccess.ts`'s `checkJoinAccess`, which is now the single choke point
 *  for that question (blocks, password, access mode, waiting queue), the way
 *  `getOperationRejectReason` is for operations. Two places deciding access
 *  is how one of them ends up admitting someone the other would refuse; in
 *  particular this function must not re-check the password, since an owner is
 *  admitted to their own room without one. Callers reaching this without
 *  passing the gate first are letting anyone in. */
export function joinRoom(
  roomId: string, userId: string, name: string, socketId: string,
): JoinRoomOutcome {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'not_found' }
  // (#176) The seat is in the lesson, whichever board was asked for: one
  // participant per person per lesson, carrying which board they are on.
  const lesson = lessonRecordOf(record)
  const lessonId = lesson.room.id
  const key = participantKey(lessonId, userId)

  const previous = lesson.participants.get(userId)
  // A socket switching boards leaves the one it was on. If that empties the
  // board, the board goes; the lesson stays, this person is still in it. A
  // socket new to the server has nothing to leave.
  const from = boardOfSocket.get(socketId)
  if (from !== undefined && from !== roomId) removeSocketFromBoard(from, socketId)

  const role = userId === lesson.room.ownerId ? 'owner' : 'member'
  // Kept across a reconnect or a board switch: a colour that changed every
  // time someone turned a page would make peer cursors unrecognisable.
  const color = previous?.color ?? CURSOR_COLORS[lesson.participants.size % CURSOR_COLORS.length]
  // (#254/#257) Recomputed from frozenUserIds on every join/reconnect — same
  // "derived, like role" treatment the shared contract's own doc comment on
  // Participant.frozen calls for, and the reason a freeze survives a
  // disconnect/reconnect instead of resetting the moment the live
  // Participant record itself gets replaced below. The owner is never frozen
  // (setParticipantFrozen refuses to add them to the set in the first
  // place), but this stays explicit rather than relying on that alone.
  const frozen = role === 'member' && lesson.frozenUserIds.has(userId)
  const participant: Participant = { userId, name, role, color, frozen, boardId: roomId }
  lesson.participants.set(userId, participant)
  record.sockets.add(socketId)
  boardOfSocket.set(socketId, roomId)
  currentSocketForParticipant.set(key, socketId)
  // The RoomParticipant row is the lesson's: it is what "Мои уроки" lists and
  // what an invite_only lesson re-admits by, and a board is neither listed nor
  // a thing one is admitted to.
  persistParticipant(lessonId, userId, name)
  return { ok: true, participant, lessonId, previousBoardId: previous?.boardId }
}

/** Removes a participant on disconnect. Evicts the room from memory once
 *  it's empty (frees RAM for idle rooms) — Postgres keeps the room itself
 *  regardless (#74); the next `join_room` for this id repopulates the Map
 *  via `ensureRoomLoaded`. Operation history is a different story since
 *  2026-07-19 (#206/#207): once the room is confirmed genuinely empty, this
 *  also prunes every Operation already covered by the room's latest
 *  snapshot (see `pruneOperationsBeforeSnapshot`) — full history now only
 *  lives as long as the session that produced it, not forever. Waits for
 *  this room's pending writes to settle before actually evicting, so a fast
 *  reconnect (page refresh right after drawing) finds the room still live
 *  in memory instead of racing a Postgres read against the last stroke's
 *  own write — see `enqueueWrite`.
 *  Re-checks participants after the wait: a reconnect that lands during it
 *  re-populates the Map, and that room must not then be deleted out from
 *  under it.
 *
 *  `socketId` must be the disconnecting socket's own id (#164): if a newer
 *  socket for this same room+userId has since joined (see
 *  `currentSocketForParticipant`), this disconnect is stale — a superseded
 *  socket's belated 'disconnect' event, not a real departure — and is
 *  ignored entirely, participant untouched. Without this check a stale
 *  disconnect could evict a still-live, joined participant (and, if they
 *  were the room's last one, the whole room), which then made the live
 *  socket's next `recordOperation` throw on a room no longer in the Map.
 *
 *  Returns whether a participant was actually removed — false for a stale/
 *  superseded socket or an already-gone room/participant. The caller
 *  (socketHandlers.ts) uses this to decide whether to broadcast
 *  `peer_left`: a stale disconnect must not announce someone as gone when
 *  their (newer) socket is still very much connected. */
export function leaveRoom(roomId: string, userId: string, socketId: string): boolean {
  // (#176) `roomId` is the board the socket was on; the seat it releases is
  // the lesson's. Resolved *before* the socket is taken off its board, because
  // that can evict the board on the spot and there would be nothing left to
  // resolve through. Looked up without `lessonRecordOf`'s throw on purpose:
  // this runs from a socket's disconnect, and a superseded tab can disconnect
  // after the lesson it was in has already gone — a throw here is a crashed
  // process (#164), not a caught error.
  const record = rooms.get(roomId)
  const lesson = record ? (record.lessonId === null ? record : rooms.get(record.lessonId)) : undefined

  // Two separate facts end here. The socket's presence on its board is one,
  // and it holds whether or not the socket's seat is still current — a
  // superseded tab was still *on* the board, and the board's roster has to
  // lose it or the board never empties. The seat is the other, and only the
  // socket that holds it may release it (#164, below).
  removeSocketFromBoard(boardOfSocket.get(socketId) ?? roomId, socketId)
  boardOfSocket.delete(socketId)

  const key = participantKey(lesson?.room.id ?? roomId, userId)
  if (currentSocketForParticipant.get(key) !== socketId) return false
  currentSocketForParticipant.delete(key)

  if (!lesson) return false
  const removed = lesson.participants.delete(userId)
  // (#595) A hand belongs to someone in the room; one left up by a person who
  // has gone would sit at the top of the teacher's grid for nobody.
  if (removed) lesson.handsRaised.delete(userId)
  // The lesson goes only when it is empty of people — and takes its boards
  // with it (see evictNow).
  if (lesson.participants.size === 0) evictWhenIdle(lesson.room.id)
  return removed
}

/** Evicts `roomId` from memory once it's genuinely unused, waiting out this
 *  room's in-flight Postgres writes first (see `enqueueWrite`) and
 *  re-checking `isIdle` afterward — a reconnect landing during the wait
 *  repopulates the Map, and that room must not then be deleted out from
 *  under it. */
function evictWhenIdle(roomId: string): void {
  const pending = pendingWriteOf(roomId)
  if (!pending) {
    evictNow(roomId)
    return
  }
  pending.finally(() => {
    const record = rooms.get(roomId)
    if (record && isIdle(record)) evictNow(roomId)
  })
}

/** (#176) The eviction itself. A lesson takes its boards along: their social
 *  state was here, and a board left behind would be one `lessonRecordOf`
 *  cannot answer for. Each board still waits out its own writes, and
 *  `ensureRoomLoaded` reloads the lesson if a join lands on such a board in
 *  the meantime. */
function evictNow(roomId: string): void {
  const record = rooms.get(roomId)
  pruneOperationsBeforeSnapshot(roomId)
  rooms.delete(roomId)
  if (record?.lessonId !== null) return
  for (const [id, other] of rooms) {
    if (other.lessonId === roomId) evictWhenIdle(id)
  }
}

/** (#292) Drops a room that was cold-loaded but never actually joined.
 *
 *  `ensureRoomLoaded` has to run *before* `joinRoom`, not after — the
 *  password it checks lives in the record that load produces — so a wrong
 *  password (or a disconnect during the load) left a fully populated room
 *  sitting in the Map with zero participants. `leaveRoom` is the only thing
 *  that ever evicts, and it never fires for someone who never got in, so
 *  those rooms stayed resident until the process restarted. On a box where
 *  one room can be tens of megabytes, a handful of mistyped passwords was
 *  enough to strand a meaningful share of RAM.
 *
 *  Safe to call unconditionally after a rejected join: it does nothing at
 *  all if anyone is actually in the room. */
export function releaseRoomIfUnused(roomId: string): void {
  const record = rooms.get(roomId)
  if (!record || !isIdle(record)) return
  evictWhenIdle(roomId)
}

/** (#415) Отпускает все резидентные комнаты, в которых никого нет, и
 *  возвращает число тех, что ушли **сразу**.
 *
 *  Считаются именно синхронно ушедшие, а не те, кому вытеснение предложили:
 *  `evictWhenIdle` для комнаты с незавершённой записью откладывает решение до
 *  её конца, и вызывающая сторона (гейт на джойне) должна отличать «место
 *  освободилось» от «может быть, освободится потом». Иначе первый же отказ
 *  превратится в «я что-то сделал» при неизменной куче.
 *
 *  Удаление текущего ключа во время обхода Map безопасно по спецификации —
 *  итератор переживает удаление уже выданного элемента. */
export function evictIdleRooms(): number {
  let released = 0
  for (const [roomId, record] of rooms) {
    if (!isIdle(record)) continue
    evictWhenIdle(roomId)
    if (!rooms.has(roomId)) released += 1
  }
  return released
}

/** (#415) Резидентна ли комната прямо сейчас — то есть обойдётся ли
 *  ближайший `ensureRoomLoaded` без аллокации. Гейт на джойне спрашивает
 *  именно это: отказывать участнику идущего урока из-за общей нехватки
 *  памяти бессмысленно, его комната уже в куче и ничего не добавит. */
export function isRoomResident(roomId: string): boolean {
  return rooms.has(roomId)
}

/** The live participant, looked up by any board of their lesson: being in a
 *  lesson is being in every board of it, which is what lets the snapshot and
 *  thumbnail routes accept a board id with the same check they always made. */
export function getParticipant(roomId: string, userId: string): Participant | undefined {
  return socialRecord(roomId)?.participants.get(userId)
}

/** State for a newly joined (or reconnecting) participant (#36, #149): the
 *  room's metadata, participants, and only the *tail* of the operation log —
 *  everything after `max(lastKnownSeq, latestSnapshotSeq)`. `latestSnapshotSeq`
 *  is always `null` until the #149 epic's snapshot storage exists (every room
 *  behaves exactly as before: `tailOperations` is the entire history); once
 *  snapshots exist, a caller whose own `tailOperations` includes the whole
 *  gap (i.e. it already had `lastKnownSeq >= latestSnapshotSeq`) can skip
 *  fetching the snapshot blob entirely — that's the reconnect fast path
 *  (closes #166) falling out of the same mechanism as a fresh join's fast
 *  path (#169), not a separate code path.
 *
 *  Returns `undefined` for an unregistered room — callers only reach this
 *  after a successful `createRoom`/`joinRoom`, so that should never happen in
 *  practice, but the type keeps that assumption honest rather than silently
 *  fabricating a `Room`. */
export function getRoomSnapshot(
  roomId: string,
  lastKnownSeq?: number,
  // (#595) Who this is for: `lesson.boards` holds only the personal boards
  // they may see (see lessonStateFor). Without one, none of them — the safe
  // reading for a caller that has nobody in particular to show them to.
  viewerId = '',
): {
  room: Room; latestSnapshotSeq: number | null
  tailOperations: Operation[]; participants: Participant[]
  palette: string[]; frozen: boolean; lesson: LessonState
} | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  // (#372) Two independent reasons to leave an operation out, and they answer
  // different questions.
  //
  // `lastKnownSeq` is the caller's own watermark: a reconnecting client says
  // what it already has, and everything at or below that is redundant for it
  // whatever the room's snapshots say.
  //
  // Coverage is per layer. This used to be one room-wide `latestSnapshotSeq`
  // — "a snapshot exists at N, so nobody needs anything below N" — which is
  // #369's actual mechanism of data loss: a layer missing from that snapshot
  // had no pixels *and* was refused the history that would have rebuilt it.
  // Now a stroke is withheld only when *its own* layer's stored pixels
  // positively reach it, so a layer nobody snapshotted keeps every operation.
  const floor = lastKnownSeq ?? 0
  const tailOperations = record.operations.filter(op =>
    (op.seq ?? 0) > floor
    && !isCoveredBySnapshot(
      record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds, undefined,
      id => record.operationsById.get(id)))
  const lesson = lessonRecordOf(record)
  return {
    room: wireRoomOf(record, lesson),
    // The structure's own seq — what a history backfill anchors on. Null
    // means nobody has stored a snapshot for this room and the tail above is
    // its entire history.
    latestSnapshotSeq: record.layerStateSeq,
    tailOperations,
    // (#176) The lesson's roster, each with the board they are on — being in
    // a lesson is being in every board of it.
    participants: [...lesson.participants.values()],
    palette: lesson.palette, frozen: lesson.roomFrozen,
    lesson: lessonStateFor(lesson, viewerId),
  }
}

/** (#176) The `Room` a client is told about. For a lesson it is the record's
 *  own; for a board, the board's row with the lesson's social fields laid over
 *  it, so the client reads `room.closedAt` or `room.enabledTools` off one
 *  object and never has to know which row a fact lives on. The board keeps its
 *  own id, name, paper and size. */
function wireRoomOf(record: RoomRecord, lesson: RoomRecord): Room {
  if (record === lesson) return record.room
  return {
    ...record.room,
    accessMode: lesson.room.accessMode,
    hasPassword: lesson.room.hasPassword,
    closedAt: lesson.room.closedAt,
    enabledTools: lesson.room.enabledTools,
    activeBoardId: lesson.room.activeBoardId,
    classVisibility: lesson.room.classVisibility,
  }
}

/** Appends `color` to the room's palette (#190 epic) if it isn't already
 *  there (dedup, case-insensitive since hex casing isn't meaningful) and
 *  persists the result. Returns the new full palette, or `undefined` for an
 *  unknown room. Returns the *existing* array unchanged (not a copy) when
 *  the color is already present, so a caller can tell "nothing changed" by
 *  reference equality if it ever needs to — not currently relied upon. */
export function addPaletteColor(roomId: string, color: string): string[] | undefined {
  // (#176) One palette per lesson, shared by its boards — the colours a class
  // mixed on page one are the colours it wants on page two.
  const lesson = socialRecord(roomId)
  if (!lesson) return undefined
  if (lesson.palette.some(c => c.toLowerCase() === color.toLowerCase())) return lesson.palette
  lesson.palette = [...lesson.palette, color]
  persistPalette(lesson.room.id, lesson.palette)
  return lesson.palette
}

/** Removes `color` from the room's palette if present. A no-op (returns the
 *  existing array unchanged) if it isn't there — nothing to persist. */
export function removePaletteColor(roomId: string, color: string): string[] | undefined {
  const lesson = socialRecord(roomId)
  if (!lesson) return undefined
  if (!lesson.palette.some(c => c.toLowerCase() === color.toLowerCase())) return lesson.palette
  lesson.palette = lesson.palette.filter(c => c.toLowerCase() !== color.toLowerCase())
  persistPalette(lesson.room.id, lesson.palette)
  return lesson.palette
}
