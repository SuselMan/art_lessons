import bcrypt from 'bcryptjs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Operation, Participant, Room } from '@art-lessons/shared'
import { DEFAULT_PALETTE_COLORS, SNAPSHOT_SEQ_INTERVAL } from '@art-lessons/shared'

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
  // (#149 epic) Highest seq any client has successfully uploaded a
  // RoomSnapshot for — null if none exists yet. Cached here rather than
  // queried fresh on every getRoomSnapshot call, same reasoning as `nextSeq`:
  // this file's synchronous API assumes live room state is always resident
  // in memory once `ensureRoomLoaded` has run once.
  latestSnapshotSeq: number | null
  // (#190 epic) Hex colors, cached here and pushed live same as
  // `participants` — small, needed on every room_state, unlike RoomSnapshot's
  // pixel blobs which stay Postgres-only (see getLatestSnapshot below).
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

function persistPalette(roomId: string, colors: string[]): void {
  enqueueWrite(roomId, () => prisma.roomPalette.upsert({
    where: { roomId },
    create: { roomId, colors },
    update: { colors },
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

/** Deletes every Operation row at or before `latestSnapshotSeq` (2026-07-19:
 *  replay was dropped from the roadmap — see #207/#206 — so full history no
 *  longer needs to survive past the session that produced it; retention is
 *  now "this live session's undo/redo depth", not "forever"). Only called
 *  once a room has gone genuinely empty (see `leaveRoom`), and only prunes
 *  what's already safely covered by an existing RoomSnapshot — a room that
 *  never crossed the first SNAPSHOT_SEQ_INTERVAL boundary has no covering
 *  snapshot yet, so this is a no-op for it (nothing unsafe to delete, and
 *  short rooms are cheap to keep whole anyway). The next session's own
 *  growth will eventually cross a boundary and make this room prunable
 *  again on its next idle — worst-case steady-state leftover per room is
 *  bounded by one SNAPSHOT_SEQ_INTERVAL's worth of operations, never
 *  unbounded. Fire-and-forget, chained through the same per-room write
 *  queue as every other Postgres write here. */
function pruneOperationsBeforeSnapshot(roomId: string, latestSnapshotSeq: number | null): void {
  if (latestSnapshotSeq === null) return
  enqueueWrite(roomId, () => prisma.operation.deleteMany({
    where: { roomId, seq: { lte: latestSnapshotSeq } },
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
    // (#209) thumbnail narrowed to `updatedAt` only, same reasoning as
    // roomRoutes.ts's list query — the PNG bytes themselves are never needed
    // just to populate in-memory room state.
    include: { operations: { orderBy: { seq: 'asc' } }, thumbnail: { select: { updatedAt: true } } },
  })
  if (!dbRoom) return false

  const operations = dbRoom.operations.map(o => o.data as Operation)
  let maxSeq = 0
  for (const op of operations) maxSeq = Math.max(maxSeq, op.seq ?? 0)
  const nextSeq = operations.length ? maxSeq + 1 : 1

  const latestSnapshot = await prisma.roomSnapshot.findFirst({
    where: { roomId }, orderBy: { seq: 'desc' }, select: { seq: true },
  })

  // A room created before this feature existed has no RoomPalette row yet —
  // seed it with the defaults now rather than leaving `palette` permanently
  // empty for every room that predates #190.
  const existingPalette = await prisma.roomPalette.findUnique({ where: { roomId }, select: { colors: true } })
  const palette = existingPalette?.colors ?? [...DEFAULT_PALETTE_COLORS]
  if (!existingPalette) persistPalette(roomId, palette)

  // (#254/#258) Rebuild the owner-lock mirror from the operation log itself
  // — `layer_owner_lock` is a normal, persisted Operation (unlike
  // roomFrozen/frozenUserIds below, which never touch Postgres at all), so a
  // cold-loaded room must replay its history to know which layers are
  // locked, the same way a client's own applyContentOp would.
  const lockedLayerIds = new Set<string>()
  for (const op of operations) {
    if (op.type !== 'layer_owner_lock') continue
    if (op.locked) lockedLayerIds.add(op.layerId)
    else lockedLayerIds.delete(op.layerId)
  }

  rooms.set(roomId, {
    room: toWireRoom(dbRoom),
    passwordHash: dbRoom.passwordHash ?? undefined,
    operations,
    participants: new Map(),
    nextSeq,
    latestSnapshotSeq: latestSnapshot?.seq ?? null,
    palette,
    roomFrozen: false,
    frozenUserIds: new Set(),
    lockedLayerIds,
  })
  return true
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
  roomData: Pick<Room, 'id' | 'name' | 'paper' | 'infinite' | 'canvasWidth' | 'canvasHeight'>,
  password: string | undefined,
  ownerId: string,
  ownerName: string,
  socketId: string,
): { room: Room; participant: Participant } {
  const existing = rooms.get(roomData.id)
  if (existing && existing.room.ownerId === ownerId) {
    // The owner can never be frozen (#254/#257) — always `false` regardless
    // of whatever frozenUserIds might contain from before (it never would,
    // see setParticipantFrozen, but this stays explicit rather than trusting
    // that invariant silently).
    const participant: Participant = { userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false }
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
  const participant: Participant = { userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false }
  const participants = new Map<string, Participant>([[ownerId, participant]])
  const palette = [...DEFAULT_PALETTE_COLORS]
  rooms.set(room.id, {
    room, passwordHash, operations: [], participants, nextSeq: 1, latestSnapshotSeq: null, palette,
    roomFrozen: false, frozenUserIds: new Set(), lockedLayerIds: new Set(),
  })
  currentSocketForParticipant.set(participantKey(room.id, ownerId), socketId)
  persistRoomCreate(room, passwordHash)
  persistParticipant(room.id, ownerId)
  persistPalette(room.id, palette)
  return { room, participant }
}

/** Joins an existing room. Fails with `not_found` if no room has been
 *  registered under this id yet and `ensureRoomLoaded` couldn't find it in
 *  Postgres either, or `wrong_password` if it requires one and it doesn't
 *  match. Assigns `owner` when `userId` is the room's persisted owner
 *  (reconnecting after a drop, or just reopening the link days later — see
 *  `createRoom`'s doc comment, this is the *only* path a returning owner
 *  goes through) and `member` otherwise. */
export function joinRoom(
  roomId: string, userId: string, name: string, password: string | undefined, socketId: string,
): JoinRoomOutcome {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'not_found' }
  if (record.passwordHash && !(password && bcrypt.compareSync(password, record.passwordHash))) {
    return { ok: false, error: 'wrong_password' }
  }

  const role = userId === record.room.ownerId ? 'owner' : 'member'
  const color = CURSOR_COLORS[record.participants.size % CURSOR_COLORS.length]
  // (#254/#257) Recomputed from frozenUserIds on every join/reconnect — same
  // "derived, like role" treatment the shared contract's own doc comment on
  // Participant.frozen calls for, and the reason a freeze survives a
  // disconnect/reconnect instead of resetting the moment the live
  // Participant record itself gets replaced below. The owner is never frozen
  // (setParticipantFrozen refuses to add them to the set in the first
  // place), but this stays explicit rather than relying on that alone.
  const frozen = role === 'member' && record.frozenUserIds.has(userId)
  const participant: Participant = { userId, name, role, color, frozen }
  record.participants.set(userId, participant)
  currentSocketForParticipant.set(participantKey(roomId, userId), socketId)
  persistParticipant(roomId, userId)
  return { ok: true, participant }
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
  const key = participantKey(roomId, userId)
  if (currentSocketForParticipant.get(key) !== socketId) return false
  currentSocketForParticipant.delete(key)

  const record = rooms.get(roomId)
  if (!record) return false
  const removed = record.participants.delete(userId)
  if (record.participants.size !== 0) return removed

  const pending = pendingWrite.get(roomId)
  if (!pending) {
    pruneOperationsBeforeSnapshot(roomId, record.latestSnapshotSeq)
    rooms.delete(roomId)
    return removed
  }
  pending.finally(() => {
    if (rooms.get(roomId)?.participants.size === 0) {
      pruneOperationsBeforeSnapshot(roomId, record.latestSnapshotSeq)
      rooms.delete(roomId)
    }
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

// ── Owner runtime privileges (#254 epic) ──────────────────────────────────

export function isRoomFrozen(roomId: string): boolean {
  return rooms.get(roomId)?.roomFrozen ?? false
}

/** Sets the room-wide freeze (#256). Returns `false` for an unknown room
 *  (nothing to set), `true` on success — callers (socketHandlers.ts) only
 *  broadcast `room_frozen_changed` on `true`. No role check here: that's the
 *  caller's job (see socket.on('set_room_frozen', ...) — same division of
 *  responsibility as recordOperation/isOperationAllowed below). */
export function setRoomFrozen(roomId: string, frozen: boolean): boolean {
  const record = rooms.get(roomId)
  if (!record) return false
  record.roomFrozen = frozen
  return true
}

/** Sets one participant's freeze (#257), independent of the room-wide flag.
 *  Returns the updated `Participant` on success, or `undefined` if the room
 *  or participant doesn't exist *or* the target is the room's own owner —
 *  the owner can never be frozen, mirroring the "owner never rejects
 *  themselves" invariant `operation_revoke`'s role check already relies on
 *  elsewhere. Like `setRoomFrozen`, does not itself check the *caller's*
 *  role — see socketHandlers.ts. */
export function setParticipantFrozen(roomId: string, userId: string, frozen: boolean): Participant | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  const participant = record.participants.get(userId)
  if (!participant || participant.role === 'owner') return undefined

  if (frozen) record.frozenUserIds.add(userId)
  else record.frozenUserIds.delete(userId)
  const updated: Participant = { ...participant, frozen }
  record.participants.set(userId, updated)
  return updated
}

export function isLayerOwnerLocked(roomId: string, layerId: string): boolean {
  return rooms.get(roomId)?.lockedLayerIds.has(layerId) ?? false
}

/** Updates the server's lightweight owner-lock mirror (#258) — called by
 *  socketHandlers.ts right before recording an accepted `layer_owner_lock`
 *  operation, so the very next operation already sees the new state. A
 *  no-op for an unknown room (recordOperation itself will already have
 *  thrown by the time that could happen in practice). */
export function setLayerOwnerLocked(roomId: string, layerId: string, locked: boolean): void {
  const record = rooms.get(roomId)
  if (!record) return
  if (locked) record.lockedLayerIds.add(layerId)
  else record.lockedLayerIds.delete(layerId)
}

/** The single choke point for "should this operation be applied" (#254
 *  epic) — pure and synchronous so it's unit-testable without a live
 *  socket.io harness (see rooms.test.ts). Folds together every owner-only
 *  runtime privilege check added by the epic:
 *   - `operation_revoke` and `layer_owner_lock` themselves are owner-only to
 *     *send at all* (same role-check shape `operation_revoke` already had
 *     before this epic).
 *   - the room owner's own operations are never rejected by anything below
 *     (an owner can't freeze or lock-out themselves — see
 *     setParticipantFrozen — but this stays an explicit early return rather
 *     than relying on that alone).
 *   - room-wide freeze (#256) and this participant's own freeze (#257)
 *     reject *every* operation type, not just drawing ones.
 *   - an owner-locked layer (#258) rejects only operations that target it
 *     (anything carrying a top-level `layerId`, e.g. `stroke`/`image_import`
 *     — see packages/shared's Operation union for the full set).
 *  Returns `false` (not throw) for an unknown room — recordOperation is the
 *  one that throws for that case; this function is only ever asked to
 *  gate an operation for a room the caller believes is live. */
export function isOperationAllowed(roomId: string, userId: string, op: Operation): boolean {
  const record = rooms.get(roomId)
  if (!record) return false
  const participant = record.participants.get(userId)
  const isOwner = participant?.role === 'owner'

  if (op.type === 'operation_revoke' && !isOwner) return false
  if (op.type === 'layer_owner_lock' && !isOwner) return false
  if (isOwner) return true

  if (record.roomFrozen) return false
  if (record.frozenUserIds.has(userId)) return false
  if ('layerId' in op && record.lockedLayerIds.has(op.layerId)) return false
  return true
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
): {
  room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
  palette: string[]; frozen: boolean
} | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  const latestSnapshotSeq = record.latestSnapshotSeq
  const floor = Math.max(lastKnownSeq ?? 0, latestSnapshotSeq ?? 0)
  const tailOperations = floor > 0 ? record.operations.filter(op => (op.seq ?? 0) > floor) : [...record.operations]
  return {
    room: record.room, latestSnapshotSeq, tailOperations, participants: [...record.participants.values()],
    palette: record.palette, frozen: record.roomFrozen,
  }
}

/** Appends `color` to the room's palette (#190 epic) if it isn't already
 *  there (dedup, case-insensitive since hex casing isn't meaningful) and
 *  persists the result. Returns the new full palette, or `undefined` for an
 *  unknown room. Returns the *existing* array unchanged (not a copy) when
 *  the color is already present, so a caller can tell "nothing changed" by
 *  reference equality if it ever needs to — not currently relied upon. */
export function addPaletteColor(roomId: string, color: string): string[] | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  if (record.palette.some(c => c.toLowerCase() === color.toLowerCase())) return record.palette
  record.palette = [...record.palette, color]
  persistPalette(roomId, record.palette)
  return record.palette
}

/** Removes `color` from the room's palette if present. A no-op (returns the
 *  existing array unchanged) if it isn't there — nothing to persist. */
export function removePaletteColor(roomId: string, color: string): string[] | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  if (!record.palette.some(c => c.toLowerCase() === color.toLowerCase())) return record.palette
  record.palette = record.palette.filter(c => c.toLowerCase() !== color.toLowerCase())
  persistPalette(roomId, record.palette)
  return record.palette
}

/** Whether the server should log a hash mismatch when a redundant snapshot
 *  upload for a seq this room already has doesn't match the stored one — a
 *  live cross-device determinism-violation detector (#149 epic), directly
 *  motivated by this project's own paper-grain determinism saga. Off by
 *  default: dedup itself (see saveSnapshot) always happens regardless of
 *  this flag, only the comparison/logging is gated. */
function verifyDeterminismEnabled(): boolean {
  return process.env.SNAPSHOT_VERIFY_DETERMINISM === 'true'
}

export type SaveSnapshotResult =
  | { ok: true; created: true }
  | { ok: true; created: false; hashMismatch: boolean }
  | { ok: false; error: 'unknown_room' | 'not_a_checkpoint_seq' }

/** Stores a client-baked full-room snapshot (#149 epic). `gzippedData` is
 *  exactly what the client compressed with CompressionStream('gzip') — see
 *  engine's bakeNetworkSnapshot — decompressed here once to compute `hash`
 *  (sha256 of the *decompressed* bytes, so gzip's own non-determinism, if
 *  any, can never masquerade as a pixel/determinism bug).
 *
 *  Dedup is unconditional: `(roomId, seq)` is unique, so a second upload for
 *  a seq this room already has is always just discarded (first arrival
 *  wins — several clients independently crossing the same checkpoint and
 *  uploading concurrently is the expected, normal case, not a race to
 *  avoid). Only the *comparison* against the already-stored hash (and its
 *  resulting warning log on a mismatch) is gated behind
 *  SNAPSHOT_VERIFY_DETERMINISM, since it's pure overhead when nobody's
 *  watching for it. */
export async function saveSnapshot(
  roomId: string, seq: number, layerState: unknown, gzippedData: Uint8Array,
): Promise<SaveSnapshotResult> {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'unknown_room' }
  if (seq <= 0 || seq % SNAPSHOT_SEQ_INTERVAL !== 0) return { ok: false, error: 'not_a_checkpoint_seq' }

  const decompressed = gunzipSync(gzippedData)
  const hash = createHash('sha256').update(decompressed).digest('hex')

  try {
    await prisma.roomSnapshot.create({
      // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — Prisma's
      // generated Bytes-field type is narrower than the Uint8Array this
      // function accepts (which could technically be SharedArrayBuffer-
      // backed), so a straight pass-through doesn't typecheck.
      data: { roomId, seq, layerState: layerState as object, data: new Uint8Array(gzippedData), hash },
    })
    record.latestSnapshotSeq = Math.max(record.latestSnapshotSeq ?? 0, seq)
    return { ok: true, created: true }
  } catch (err) {
    // P2002: unique constraint violation on (roomId, seq) — a snapshot for
    // this checkpoint already exists. Not an error: this is the expected
    // outcome whenever more than one client bakes the same checkpoint.
    const isDuplicate = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002'
    if (!isDuplicate) throw err

    if (!verifyDeterminismEnabled()) return { ok: true, created: false, hashMismatch: false }

    const existing = await prisma.roomSnapshot.findUnique({
      where: { roomId_seq: { roomId, seq } }, select: { hash: true },
    })
    const hashMismatch = existing !== null && existing.hash !== hash
    return { ok: true, created: false, hashMismatch }
  }
}

/** The room's most recently stored snapshot, or `null` if it has none yet
 *  (short room — same case `latestSnapshotSeq === null` covers in
 *  `getRoomSnapshot`). Read from Postgres directly rather than the in-memory
 *  Map: unlike operations, snapshot pixel/layerState payloads are never
 *  cached in `RoomRecord` (#149 epic design — kept out of the hot,
 *  always-resident path since they're only needed at join time). */
export async function getLatestSnapshot(
  roomId: string,
): Promise<{ seq: number; layerState: unknown; data: Uint8Array } | null> {
  const row = await prisma.roomSnapshot.findFirst({
    where: { roomId }, orderBy: { seq: 'desc' },
    select: { seq: true, layerState: true, data: true },
  })
  return row
}

/** Paginated backfill (#169): the page of up to `limit` operations
 *  immediately preceding `beforeSeq` (typically the room's
 *  `latestSnapshotSeq`, then each successive page's own smallest seq) — a
 *  fresh join's tail/snapshot already cover everything from `beforeSeq` on,
 *  this is purely for the client's background history backfill (undo/redo
 *  bookkeeping for operations older than its restored snapshot).
 *
 *  Deliberately anchored at `beforeSeq` and walking *backward* (returning
 *  the page right before it, not the page right after some cursor) rather
 *  than forward pagination from 0: the client merges each page into its log
 *  via OperationLog.prependHistorical, which always inserts at the very
 *  front — that's only correct if each successive page is chronologically
 *  older than every page already merged, i.e. pages must arrive newest-
 *  first-before-the-snapshot, walking back toward the room's start (see
 *  prependHistorical's own doc comment). An empty result means backfill has
 *  reached the beginning of the room's history.
 *
 *  Reads from the in-memory Map, same as `getRoomSnapshot` — `ensureRoomLoaded`
 *  already pulls everything Postgres still has for this room into
 *  `record.operations`, so there's no separate cold Postgres path needed
 *  here. Since 2026-07-19 (#206/#207) that's no longer literally the room's
 *  entire history forever — `leaveRoom` prunes whatever's already covered by
 *  a snapshot once the room goes idle — so "the beginning of the room's
 *  history" below means the oldest operation Postgres still has, which for
 *  a room that's had an idle gap is its current session's own start, not
 *  necessarily the room's true beginning. */
export function getOperationsBefore(roomId: string, beforeSeq: number, limit: number): Operation[] {
  const record = rooms.get(roomId)
  if (!record) return []
  const matching = record.operations.filter(op => (op.seq ?? 0) < beforeSeq)
  return matching.slice(Math.max(0, matching.length - limit))
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
