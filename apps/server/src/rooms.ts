import bcrypt from 'bcryptjs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Operation, Participant, ReplayOperation, Room } from '@art-lessons/shared'
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

  const latestSnapshot = await prisma.roomSnapshot.findFirst({
    where: { roomId }, orderBy: { seq: 'desc' }, select: { seq: true },
  })

  // A room created before this feature existed has no RoomPalette row yet —
  // seed it with the defaults now rather than leaving `palette` permanently
  // empty for every room that predates #190.
  const existingPalette = await prisma.roomPalette.findUnique({ where: { roomId }, select: { colors: true } })
  const palette = existingPalette?.colors ?? [...DEFAULT_PALETTE_COLORS]
  if (!existingPalette) persistPalette(roomId, palette)

  rooms.set(roomId, {
    room: toWireRoom(dbRoom),
    passwordHash: dbRoom.passwordHash ?? undefined,
    operations,
    participants: new Map(),
    nextSeq,
    latestSnapshotSeq: latestSnapshot?.seq ?? null,
    palette,
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
  const palette = [...DEFAULT_PALETTE_COLORS]
  rooms.set(room.id, { room, passwordHash, operations: [], participants, nextSeq: 1, latestSnapshotSeq: null, palette })
  currentSocketForParticipant.set(participantKey(room.id, ownerId), socketId)
  persistRoomCreate(room, passwordHash)
  persistParticipant(room.id, ownerId)
  persistPalette(room.id, palette)
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
): {
  room: Room; latestSnapshotSeq: number | null; tailOperations: Operation[]; participants: Participant[]
  palette: string[]
} | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  const latestSnapshotSeq = record.latestSnapshotSeq
  const floor = Math.max(lastKnownSeq ?? 0, latestSnapshotSeq ?? 0)
  const tailOperations = floor > 0 ? record.operations.filter(op => (op.seq ?? 0) > floor) : [...record.operations]
  return {
    room: record.room, latestSnapshotSeq, tailOperations, participants: [...record.participants.values()],
    palette: record.palette,
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
 *  Reads from the in-memory Map, same as `getRoomSnapshot` —
 *  `ensureRoomLoaded` already pulls a room's *entire* operation history into
 *  `record.operations`, unbounded, so there's no separate cold Postgres path
 *  needed here. */
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

export type GetRoomReplayResult =
  | { ok: true; room: Room; operations: ReplayOperation[] }
  | { ok: false; error: 'not_found' | 'forbidden' }

/** Lesson replay (#108): a room's full operation history, with each op's
 *  persisted `createdAt` alongside it — the standalone replay viewer paces
 *  playback off that, not `OperationBase.timestamp`. Deliberately reads
 *  straight from Postgres rather than `ensureRoomLoaded` + the in-memory
 *  Map: replay is meant to work for a room nobody is currently live in
 *  (the whole point is watching it *after* the lesson), and the in-memory
 *  `operations` array drops `createdAt` entirely (see `ensureRoomLoaded`'s
 *  `dbRoom.operations.map(o => o.data as Operation)`) — reconstructing it
 *  from there would need a second Postgres round-trip anyway.
 *
 *  Authorization here is deliberately DB-backed (owner, or an ever-existing
 *  `RoomParticipant` row), not `getParticipant`'s live in-memory check that
 *  the snapshot/backfill routes use — those exist to stop a plain HTTP
 *  client from bypassing a live room's socket-level password gate, which
 *  doesn't apply here: replay's whole premise is viewing history after
 *  everyone (including the room's live presence) is long gone. */
export async function getRoomReplay(roomId: string, userId: string): Promise<GetRoomReplayResult> {
  const dbRoom = await prisma.room.findUnique({ where: { id: roomId } })
  if (!dbRoom) return { ok: false, error: 'not_found' }

  if (dbRoom.ownerId !== userId) {
    const participant = await prisma.roomParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    })
    if (!participant) return { ok: false, error: 'forbidden' }
  }

  const rows = await prisma.operation.findMany({ where: { roomId }, orderBy: { seq: 'asc' } })
  const operations: ReplayOperation[] = rows.map(row => ({
    ...(row.data as Operation),
    createdAt: row.createdAt.toISOString(),
  }))
  return { ok: true, room: toWireRoom(dbRoom), operations }
}
