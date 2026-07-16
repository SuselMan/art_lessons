import bcrypt from 'bcryptjs'
import type { Operation, Participant, Room } from '@art-lessons/shared'

import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'

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

interface RoomRecord {
  room: Room
  passwordHash: string | undefined
  operations: Operation[]
  participants: Map<string, Participant> // keyed by userId — live presence only, not join history
  nextSeq: number
}

const rooms = new Map<string, RoomRecord>()

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
const currentSocketForParticipant = new Map<string, string>()

function participantKey(roomId: string, userId: string): string {
  return `${roomId}:${userId}`
}

export type JoinRoomOutcome =
  | { ok: true; participant: Participant }
  | { ok: false; error: 'not_found' | 'wrong_password' }

// Chains every Postgres write for a room onto whatever was already queued
// for it, so they land in order (in particular: persistRoomCreate always
// finishes before persistParticipant/persistOperation's FK on it can be
// violated). Also lets `leaveRoom` below defer evicting a room from memory
// until its writes have actually landed — otherwise a quick "draw a stroke,
// immediately refresh" can race a same-process reconnect's cold-load against
// that stroke's own fire-and-forget insert still being in flight, and come
// back missing content that was never really lost, just not queryable yet.
const pendingWrite = new Map<string, Promise<void>>()

function enqueueWrite(roomId: string, run: () => Promise<unknown>): void {
  const prior = pendingWrite.get(roomId) ?? Promise.resolve()
  const next = prior.then(run).then(
    () => {},
    err => { console.error(`failed to persist write for room ${roomId}`, err) },
  )
  pendingWrite.set(roomId, next)
}

function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, infinite: room.infinite,
      canvasWidth: room.canvasWidth ?? null, canvasHeight: room.canvasHeight ?? null,
      passwordHash, ownerId: room.ownerId,
    },
  }))
}

function persistParticipant(roomId: string, userId: string): void {
  enqueueWrite(roomId, () => prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: { lastActiveAt: new Date() },
  }))
}

function persistOperation(roomId: string, op: Operation): void {
  const layerId = 'layerId' in op ? op.layerId : null
  enqueueWrite(roomId, () => prisma.operation.create({
    data: {
      id: op.id, seq: op.seq ?? 0, type: op.type, roomId, userId: op.userId,
      layerId, tool: op.type === 'stroke' ? op.tool : null,
      data: op,
    },
  }))
}

/** Repopulates the in-memory Map for `roomId` from Postgres if it isn't
 *  already there — called by socketHandlers.ts right before `createRoom`/
 *  `joinRoom` so those can stay synchronous. A no-op (returns immediately,
 *  true) if the room is already live in memory. Reconstructed `participants`
 *  always starts empty: presence is inherently live-only, nobody is
 *  "currently connected" to a room that just got cold-loaded. */
export async function ensureRoomLoaded(roomId: string): Promise<boolean> {
  if (rooms.has(roomId)) return true

  const dbRoom = await prisma.room.findUnique({
    where: { id: roomId },
    include: { operations: { orderBy: { seq: 'asc' } } },
  })
  if (!dbRoom) return false

  const operations = dbRoom.operations.map(o => o.data as Operation)
  let maxSeq = 0
  for (const op of operations) maxSeq = Math.max(maxSeq, op.seq ?? 0)
  const nextSeq = operations.length ? maxSeq + 1 : 1

  rooms.set(roomId, {
    room: toWireRoom(dbRoom),
    passwordHash: dbRoom.passwordHash ?? undefined,
    operations,
    participants: new Map(),
    nextSeq,
  })
  return true
}

/** Registers a new room and immediately seats its creator as `teacher`.
 *  `ownerId` is fixed here, at creation time, and never changes afterward —
 *  this replaces the old "first socket to join becomes teacher" rule (#39),
 *  which raced whenever more than one person opened a room link around the
 *  same time. `join_room` (below) now only ever produces `student`s *for
 *  anyone but the persisted owner* — see the role check there for how a
 *  returning owner reconnecting (or reopening the link on any later day)
 *  gets `teacher` back despite always going through `join_room`, not this.
 *
 *  `roomData.id` already existing here is *not* a rare nanoid collision —
 *  it's the expected, common case of the creator's own tab refreshing:
 *  browsers keep `history.state` across a same-entry reload, so the client's
 *  `isCreator`/`creatorDraft` survives too and it emits `create_room` again
 *  for the same id (its own "have I already joined this session" tracking
 *  is just a JS ref, which does reset on reload — see Room/index.tsx). Only
 *  actually recreates when the id is genuinely new; otherwise this is a
 *  no-op rejoin that leaves existing content untouched, same spirit as
 *  `join_room`'s teacher-role check just below. A real id collision from a
 *  *different* owner (astronomically unlikely) still falls through to
 *  overwriting, same as always — not worth a dedicated error path for
 *  something this rare. `socketHandlers.ts` calls `ensureRoomLoaded` before
 *  this, same as it does for `join_room`, so "already exists" is detected
 *  even when the room isn't currently live in memory (e.g. a server
 *  restart between the original creation and this reload). */
export function createRoom(
  roomData: Pick<Room, 'id' | 'name' | 'paper' | 'infinite' | 'canvasWidth' | 'canvasHeight'>,
  password: string | undefined,
  ownerId: string,
  ownerName: string,
  socketId: string,
): { room: Room; participant: Participant } {
  const existing = rooms.get(roomData.id)
  if (existing && existing.room.ownerId === ownerId) {
    const participant: Participant = { userId: ownerId, name: ownerName, role: 'teacher', color: CURSOR_COLORS[0] }
    existing.participants.set(ownerId, participant)
    currentSocketForParticipant.set(participantKey(roomData.id, ownerId), socketId)
    return { room: existing.room, participant }
  }

  const room: Room = {
    ...roomData,
    hasPassword: !!password,
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const passwordHash = password ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : undefined
  const participant: Participant = { userId: ownerId, name: ownerName, role: 'teacher', color: CURSOR_COLORS[0] }
  const participants = new Map<string, Participant>([[ownerId, participant]])
  rooms.set(room.id, { room, passwordHash, operations: [], participants, nextSeq: 1 })
  currentSocketForParticipant.set(participantKey(room.id, ownerId), socketId)
  persistRoomCreate(room, passwordHash)
  persistParticipant(room.id, ownerId)
  return { room, participant }
}

/** Joins an existing room. Fails with `not_found` if no room has been
 *  registered under this id yet and `ensureRoomLoaded` couldn't find it in
 *  Postgres either, or `wrong_password` if it requires one and it doesn't
 *  match. Assigns `teacher` when `userId` is the room's persisted owner
 *  (reconnecting after a drop, or just reopening the link days later — see
 *  `createRoom`'s doc comment, this is the *only* path a returning owner
 *  goes through) and `student` otherwise. */
export function joinRoom(
  roomId: string, userId: string, name: string, password: string | undefined, socketId: string,
): JoinRoomOutcome {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'not_found' }
  if (record.passwordHash && !(password && bcrypt.compareSync(password, record.passwordHash))) {
    return { ok: false, error: 'wrong_password' }
  }

  const role = userId === record.room.ownerId ? 'teacher' : 'student'
  const color = CURSOR_COLORS[record.participants.size % CURSOR_COLORS.length]
  const participant: Participant = { userId, name, role, color }
  record.participants.set(userId, participant)
  currentSocketForParticipant.set(participantKey(roomId, userId), socketId)
  persistParticipant(roomId, userId)
  return { ok: true, participant }
}

/** Removes a participant on disconnect. Evicts the room from memory once
 *  it's empty (frees RAM for idle rooms) — Postgres keeps the room and its
 *  history regardless (#74); the next `join_room` for this id repopulates
 *  the Map via `ensureRoomLoaded`. Waits for this room's pending writes to
 *  settle before actually evicting, so a fast reconnect (page refresh right
 *  after drawing) finds the room still live in memory instead of racing a
 *  Postgres read against the last stroke's own write — see `enqueueWrite`.
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
  const key = participantKey(roomId, userId)
  if (currentSocketForParticipant.get(key) !== socketId) return false
  currentSocketForParticipant.delete(key)

  const record = rooms.get(roomId)
  if (!record) return false
  const removed = record.participants.delete(userId)
  if (record.participants.size !== 0) return removed

  const pending = pendingWrite.get(roomId)
  if (!pending) { rooms.delete(roomId); return removed }
  pending.finally(() => {
    if (rooms.get(roomId)?.participants.size === 0) rooms.delete(roomId)
  })
  return removed
}

/** Test-only seam: resolves once `roomId`'s in-flight Postgres writes (if
 *  any) have settled, so tests can assert `leaveRoom`'s deferred-eviction
 *  behavior without a real database — enqueueWrite's rejections are caught
 *  internally either way, so this resolves regardless of whether Postgres
 *  was actually reachable. */
export function _flushPendingWrites(roomId: string): Promise<void> {
  return pendingWrite.get(roomId) ?? Promise.resolve()
}

export function getParticipant(roomId: string, userId: string): Participant | undefined {
  return rooms.get(roomId)?.participants.get(userId)
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
): { room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[] } | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  // TODO(#168): replace with the room's actual latest stored snapshot seq
  // once RoomSnapshot storage exists.
  const latestSnapshotSeq: number | null = null
  const floor = Math.max(lastKnownSeq ?? 0, latestSnapshotSeq ?? 0)
  const tailOperations = floor > 0 ? record.operations.filter(op => (op.seq ?? 0) > floor) : [...record.operations]
  return { room: record.room, latestSnapshotSeq, tailOperations, participants: [...record.participants.values()] }
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
  persistOperation(roomId, stamped)
  return stamped
}
