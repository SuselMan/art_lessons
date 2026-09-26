import bcrypt from 'bcryptjs'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  AssignmentSummary, BoardSummary, LessonState, Operation, Participant, RejectReason, Room,
  RoomAccessMode, ToggleableTool,
} from '@grafetto/shared'
import {
  DEFAULT_PALETTE_COLORS, IMPLICIT_LAYER_IDS, SNAPSHOT_SEQ_INTERVAL, sanitizeEnabledTools,
} from '@grafetto/shared'

import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'
import { operationRejectReason } from './operationGate.js'
import {
  advanceStructuralLog, buildStructuralLog, deriveLayerIds, META_OP_TYPES, type StructuralEntry,
} from './structuralLog.js'
import { isCoveredBySnapshot, layerStateIdsOf, residentOperationWhere } from './snapshotCoverage.js'
import { lessonStateFor } from './classroom.js'
import {
  enqueueWrite, isIdle, lessonRecordOf, pendingWriteOf, rooms, socialRecord, type RoomRecord,
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

function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, paperColor: room.paperColor ?? null,
      infinite: room.infinite,
      canvasWidth: room.canvasWidth ?? null, canvasHeight: room.canvasHeight ?? null,
      passwordHash, accessMode: room.accessMode, ownerId: room.ownerId,
      // (#548) `[]` is the column's own "no restriction" — see schema.prisma.
      enabledTools: room.enabledTools ?? [],
      classVisibility: room.classVisibility ?? 'teacher_only',
    },
  }))
}

/** (#226) `name` is refreshed on every join, not just written once: it is what
 *  this person calls themselves *now*, and the access panel showing a name
 *  they abandoned three lessons ago would be worse than showing none. */
function persistParticipant(roomId: string, userId: string, name: string): void {
  enqueueWrite(roomId, () => prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId, name },
    update: { lastActiveAt: new Date(), name },
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

/** (#292) The subset of a room's log that has to live in RAM: everything no
 *  layer's stored pixels account for. Everything else stays in Postgres and is
 *  served page-by-page by `getOperationsBefore` when a client actually
 *  backfills undo history.
 *
 *  (#372) Bounded per layer rather than by one room-wide seq, and the
 *  exclusion is pushed into the query rather than applied to its result. That
 *  matters more than it looks: `data` is the whole stroke payload, so filtering
 *  in JS would still drag every covered dab array out of Postgres and through
 *  this process's heap before discarding it — the exact cost this window
 *  exists to avoid. `type`/`layerId`/`seq` are already their own indexed
 *  columns (see the Operation model) precisely so questions like this need not
 *  parse the JSON.
 *
 *  Reads as: exclude rows that are BOTH a coverable type AND one of the
 *  (layer, at-or-below-its-coverage) pairs. A room with no coverage yet has
 *  nothing to exclude and loads in full. */
async function loadResidentOperations(
  roomId: string, coveredSeqByLayer: ReadonlyMap<string, number>,
): Promise<Operation[]> {
  const where = residentOperationWhere(roomId, coveredSeqByLayer)
  const rows = await prisma.operation.findMany({ where, orderBy: { seq: 'asc' }, select: { data: true } })
  return rows.map(row => row.data as Operation)
}

/** (#292) Drops what stored snapshots have made redundant, so a long live
 *  session stays as bounded as a cold load is. Without this the resident set
 *  only ever grows between restarts — the snapshot mechanism would bound
 *  rejoins while the process itself kept every stroke of a marathon room in
 *  the heap. Same window rule as `loadResidentOperations`. */
function trimResidentOperations(record: RoomRecord): void {
  if (record.coveredSeqByLayer.size === 0) return
  record.operations = record.operations.filter(
    op => !isCoveredBySnapshot(record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds))
  record.operationsById = new Map(record.operations.map(op => [op.id, op]))
}

/** Repopulates the in-memory Map for `roomId` from Postgres if it isn't
 *  already there — called by socketHandlers.ts right before `createRoom`/
 *  `joinRoom` so those can stay synchronous. A no-op (returns immediately,
 *  true) if the room is already live in memory. Reconstructed `participants`
 *  always starts empty: presence is inherently live-only, nobody is
 *  "currently connected" to a room that just got cold-loaded. */
export async function ensureRoomLoaded(roomId: string): Promise<boolean> {
  const resident = rooms.get(roomId)
  if (resident) {
    // (#176) A board's residency is only worth anything with its lesson
    // beside it — see RoomRecord.lessonId. The lesson can go first (its own
    // eviction is deferred behind its own writes, the board's behind the
    // board's), so "the board is here" has to also mean "so is the lesson"
    // before anything synchronous is allowed to ask a social question of it.
    if (resident.lessonId !== null && !rooms.has(resident.lessonId)) return ensureRoomLoaded(resident.lessonId)
    return true
  }

  const dbRoom = await prisma.room.findUnique({
    where: { id: roomId },
    // (#209) thumbnail narrowed to `updatedAt` only, same reasoning as
    // roomRoutes.ts's list query — the PNG bytes themselves are never needed
    // just to populate in-memory room state.
    //
    // (#292) `operations` deliberately NOT included here any more — that
    // was one unbounded query pulling every row the room had ever written
    // into the heap. See loadResidentOperations.
    include: { thumbnail: { select: { updatedAt: true } } },
  })
  if (!dbRoom) return false

  // (#176) Lesson first, always: the board's join gate, freeze and
  // participants are all read off the lesson's record, so a board resident
  // without it is a board nobody can be admitted to. A lesson that has gone
  // from Postgres takes its boards with it (the FK cascades), so `false` here
  // is the same "not found" the board itself would have been.
  if (dbRoom.lessonId !== null && !(await ensureRoomLoaded(dbRoom.lessonId))) return false

  const [storedLayerState, coveredSeqByLayer] = await Promise.all([
    prisma.roomLayerState.findUnique({ where: { roomId }, select: { seq: true, state: true } }),
    loadCoveredSeqByLayer(roomId),
  ])
  // Sequenced after coverage rather than alongside it: which operations are
  // resident is decided by that map (#372).
  const operations = await loadResidentOperations(roomId, coveredSeqByLayer)

  // (#292) Read from Postgres rather than from `operations`: the resident
  // set is now a *window*, so its own highest seq is not necessarily the
  // room's. A room whose newest operation sits at or below its latest
  // snapshot loads no tail at all, and deriving nextSeq from the window
  // would restart numbering in the middle of existing history — every new
  // operation colliding with a stored seq.
  const maxSeq = await prisma.operation.aggregate({ where: { roomId }, _max: { seq: true } })
  const nextSeq = (maxSeq._max.seq ?? 0) + 1

  // A room created before this feature existed has no RoomPalette row yet —
  // seed it with the defaults now rather than leaving `palette` permanently
  // empty for every room that predates #190.
  //
  // (#176) Lessons only. A board's palette is its lesson's (see
  // addPaletteColor), so its own field is never read and no row is seeded for
  // it — seeding one would be a RoomPalette row nothing ever consults.
  const existingPalette = dbRoom.lessonId === null
    ? await prisma.roomPalette.findUnique({ where: { roomId }, select: { colors: true } })
    : null
  const palette = existingPalette?.colors ?? (dbRoom.lessonId === null ? [...DEFAULT_PALETTE_COLORS] : [])
  if (!existingPalette && dbRoom.lessonId === null) persistPalette(roomId, palette)

  // (#176) The strip, for a lesson. A board's record keeps none: the list is
  // read off the lesson on every room_state, whichever board asked.
  const boards = dbRoom.lessonId === null ? await loadBoardSummaries(roomId) : []
  // (#595) The lesson's assignment rounds, same reasoning as the strip.
  const assignments = dbRoom.lessonId === null ? await loadAssignments(roomId) : []

  // (#254/#258) Rebuild the owner-lock mirror from the operation log itself
  // — `layer_owner_lock` is a normal, persisted Operation (unlike
  // roomFrozen/frozenUserIds below, which never touch Postgres at all), so a
  // cold-loaded room must replay its history to know which layers are
  // locked, the same way a client's own applyContentOp would.
  // (#518) The shared lock (`layer_lock`) is rebuilt in the same pass, from
  // the same log, for the same reason — it is a persisted operation too.
  const lockedLayerIds = new Set<string>()
  const sharedLockedLayerIds = new Set<string>()
  for (const op of operations) {
    if (op.type !== 'layer_owner_lock' && op.type !== 'layer_lock') continue
    const target = op.type === 'layer_owner_lock' ? lockedLayerIds : sharedLockedLayerIds
    if (op.locked) target.add(op.layerId)
    else target.delete(op.layerId)
  }

  // (#289 epic) Rebuild the aliveIds/deletedIds mirrors the same way — see
  // their doc comments on RoomRecord. (#368) Via the structural log, so a
  // cold-loaded room resolves undone deletes exactly as a live one does;
  // folding the raw types straight into the two Sets is what silently ignored
  // undo before.
  const structuralLog = buildStructuralLog(operations)
  await resolveUndoneEntries(roomId, structuralLog)
  const { aliveIds, deletedIds } = deriveLayerIds(structuralLog)

  // Two joins racing the same cold load both get here; the second must not
  // replace a record the first has already seated someone in. (#176 made the
  // window wider — a board load awaits its lesson's — but the race predates
  // it.)
  if (rooms.has(roomId)) return true

  rooms.set(roomId, {
    room: toWireRoom(dbRoom),
    lessonId: dbRoom.lessonId,
    sockets: new Set(),
    boards,
    assignments,
    activeAssignmentId: dbRoom.lessonId === null ? dbRoom.activeAssignmentId ?? null : null,
    spotlightBoardId: dbRoom.lessonId === null ? dbRoom.spotlightBoardId ?? null : null,
    handsRaised: new Set(),
    assignmentStarting: false,
    passwordHash: dbRoom.passwordHash ?? undefined,
    operations,
    participants: new Map(),
    nextSeq,
    layerStateSeq: storedLayerState?.seq ?? null,
    layerStateIds: layerStateIdsOf(storedLayerState?.state),
    coveredSeqByLayer,
    palette,
    roomFrozen: false,
    frozenUserIds: new Set(),
    lockedLayerIds,
    sharedLockedLayerIds,
    aliveIds,
    deletedIds,
    operationsById: new Map(operations.map(op => [op.id, op])),
    structuralLog,
  })
  return true
}

/** (#176) A lesson's strip as Postgres has it: the lesson row itself and every
 *  row pointing at it, in `boardOrder`. Thumbnail narrowed to `updatedAt` for
 *  the same reason every other room query narrows it. */
async function loadBoardSummaries(lessonId: string): Promise<BoardSummary[]> {
  const rows = await prisma.room.findMany({
    where: { OR: [{ id: lessonId }, { lessonId }] },
    orderBy: { boardOrder: 'asc' },
    select: {
      id: true, name: true, boardOrder: true, assignmentId: true, boardOwnerId: true,
      thumbnail: { select: { updatedAt: true } },
    },
  })
  return rows.map(row => ({
    id: row.id, name: row.name, order: row.boardOrder,
    thumbnailUpdatedAt: row.thumbnail?.updatedAt.toISOString(),
    // (#595) Personal boards ride in the same cache — the strip and the class
    // grid are one list, split by these two fields at the read site.
    ...(row.assignmentId && row.boardOwnerId ? { assignmentId: row.assignmentId, ownerId: row.boardOwnerId } : {}),
  }))
}

/** (#595) A lesson's assignment rounds, in order. */
async function loadAssignments(lessonId: string): Promise<AssignmentSummary[]> {
  const rows = await prisma.assignment.findMany({ where: { lessonId }, orderBy: { order: 'asc' } })
  return rows.map(toAssignmentSummary)
}

export function toAssignmentSummary(row: {
  id: string; name: string; order: number; createdAt: Date
}): AssignmentSummary {
  return { id: row.id, name: row.name, order: row.order, createdAt: row.createdAt.toISOString() }
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

/** (#415, трек #314 §1) Сколько эта карта сейчас держит. До этого числа
 *  наружу не выходило вообще: `rooms` — приватная константа модуля, и
 *  `rooms.size` не читал ни один файл в проекте, то есть «сколько комнат
 *  держит коробка» нельзя было ни спросить у живого прода, ни отследить во
 *  времени.
 *
 *  `idle` считается отдельно от `total` не для симметрии: резидентная комната
 *  без участников — это либо гонка отложенного вытеснения (`evictWhenIdle`
 *  ждёт записи, а перепроверка после ожидания видит уже не тот состав), либо
 *  комната, удалённая через `DELETE /api/rooms/:id` из-под живого участника.
 *  Обе — течи, и ненулевой `idle` на спокойном сервере есть их единственный
 *  внешний признак.
 *
 *  Байты сознательно не оцениваются. Честно их знает только куча (см.
 *  memory.ts), а посчитать вес `operations` можно лишь сериализацией — то
 *  есть построив в памяти копию ровно того, что мы боимся не уместить. */
export function getResidentRoomStats(): { total: number; idle: number; operations: number } {
  let idle = 0
  let operations = 0
  for (const record of rooms.values()) {
    operations += record.operations.length
    if (isIdle(record)) idle += 1
  }
  return { total: rooms.size, idle, operations }
}

/** (#480) Сколько операций пришлось бы проиграть заново тому, кто входит в
 *  комнату прямо сейчас — то есть чего снапшоты ещё не покрывают.
 *
 *  Это ровно тот же фильтр, которым `getRoomSnapshot` собирает `tailOperations`
 *  для входящего с чистого листа, и намеренно он же, а не своя мерка: покрытие
 *  здесь величина по слоям (см. `coveredSeqByLayer`), и всякая попытка свернуть
 *  её в одно room-wide число — это механизм потери содержимого из #369.
 *  Сторожу (`snapshotLagWatch.ts`) нужна цена перезахода, и она тут не
 *  приближение, а она сама.
 *
 *  `undefined` для нерезидентной комнаты — спрашивать про неё нечего. */
export function getRoomBacklog(roomId: string): {
  roomId: string; participants: number; latestSeq: number; uncoveredOps: number
} | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  let uncoveredOps = 0
  for (const op of record.operations) {
    if (!isCoveredBySnapshot(record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds)) {
      uncoveredOps += 1
    }
  }
  return {
    roomId,
    // (#176) Who could bake this board: the sockets on it, not the lesson's
    // whole roster — someone on another board holds none of these pixels.
    participants: record.sockets.size,
    latestSeq: record.nextSeq - 1,
    uncoveredOps,
  }
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

export type LiveLesson = {
  lessonId: string
  name: string
  ownerId: string
  boards: number
  participants: Array<{ userId: string; name: string; role: Participant['role']; boardId: string | undefined }>
}

/** (#586) Lessons somebody is in right now, for the admin panel. Presence is
 *  a fact about the lesson (see `currentSocketForParticipant`), so boards are
 *  not listed on their own — a board is live exactly when someone in its
 *  lesson is on it, and `boardId` says who. */
export function listLiveLessons(): LiveLesson[] {
  const live: LiveLesson[] = []
  for (const record of rooms.values()) {
    if (record.lessonId !== null || record.participants.size === 0) continue
    live.push({
      lessonId: record.room.id,
      name: record.room.name,
      ownerId: record.room.ownerId,
      boards: Math.max(1, record.boards.length),
      participants: [...record.participants.values()].map(p => ({
        userId: p.userId, name: p.name, role: p.role, boardId: p.boardId,
      })),
    })
  }
  return live
}

/** The live participant, looked up by any board of their lesson: being in a
 *  lesson is being in every board of it, which is what lets the snapshot and
 *  thumbnail routes accept a board id with the same check they always made. */
export function getParticipant(roomId: string, userId: string): Participant | undefined {
  return socialRecord(roomId)?.participants.get(userId)
}

// ── Owner runtime privileges (#254 epic) ──────────────────────────────────

export function isRoomFrozen(roomId: string): boolean {
  return socialRecord(roomId)?.roomFrozen ?? false
}

/** Sets the room-wide freeze (#256). Returns `false` for an unknown room
 *  (nothing to set), `true` on success — callers (socketHandlers.ts) only
 *  broadcast `room_frozen_changed` on `true`. No role check here: that's the
 *  caller's job (see socket.on('set_room_frozen', ...) — same division of
 *  responsibility as recordOperation/isOperationAllowed below). */
/** (#548) Replaces the room's toolset, in memory and in Postgres. Returns the
 *  sanitized list actually stored — `undefined` for "no restriction" — or
 *  `false` when there is no such room, so the caller can tell "nothing to
 *  broadcast" from "broadcast the unrestricted room".
 *
 *  Sanitizing here rather than trusting the caller is the point: this is the
 *  only door the value comes through, and what the room ends up holding is the
 *  normalized list, never one client's raw claim. Like `setRoomFrozen` it does
 *  not check the caller's role — see socketHandlers.ts. */
export function setRoomTools(roomId: string, enabledTools: unknown): ToggleableTool[] | undefined | false {
  // (#176) The toolset is the lesson's: "today we work in pencil" holds on
  // every page, so it is stored on the lesson row and overlaid onto each
  // board's `room` in getRoomSnapshot.
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  const sanitized = sanitizeEnabledTools(enabledTools)
  lesson.room.enabledTools = sanitized
  const lessonId = lesson.room.id
  enqueueWrite(lessonId, () => prisma.room.update({
    where: { id: lessonId },
    data: { enabledTools: sanitized ?? [] },
  }))
  return sanitized
}

export function setRoomFrozen(roomId: string, frozen: boolean): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.roomFrozen = frozen
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
  const lesson = socialRecord(roomId)
  if (!lesson) return undefined
  const participant = lesson.participants.get(userId)
  if (!participant || participant.role === 'owner') return undefined

  if (frozen) lesson.frozenUserIds.add(userId)
  else lesson.frozenUserIds.delete(userId)
  const updated: Participant = { ...participant, frozen }
  lesson.participants.set(userId, updated)
  return updated
}

// ── Closed for editing (#222) ─────────────────────────────────────────────

export function isRoomClosed(roomId: string): boolean {
  const lesson = socialRecord(roomId)
  return lesson !== undefined && lesson.room.closedAt !== undefined
}

/** Mirrors a `Room.closedAt` change into the live in-memory record, so the
 *  very next operation is judged against it (#222). Returns `false` when the
 *  room isn't resident — which is not a failure: a room nobody is connected
 *  to has no in-memory state to correct and no one to broadcast to, and its
 *  next cold load reads the new value straight from Postgres (see
 *  ensureRoomLoaded's toWireRoom). Persisting is the caller's job
 *  (roomRoutes.ts), same division as setRoomFrozen above — with the
 *  difference that this one *is* persisted at all, because a closed lesson
 *  must still be closed after a restart. */
export function setRoomClosed(roomId: string, closedAt: string | null): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.room = { ...lesson.room, closedAt: closedAt ?? undefined }
  return true
}

/** Mirrors a `Room.accessMode` change into the live in-memory record (#225),
 *  so the very next join is judged against it rather than against whatever
 *  the room was loaded with. Exactly the same division of labour as
 *  `setRoomClosed` above — persisting belongs to the caller, which will be
 *  #226's `PATCH` endpoint; returning `false` for a non-resident room is not a
 *  failure, since its next cold load reads the stored mode anyway. */
export function setRoomAccessMode(roomId: string, accessMode: RoomAccessMode): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.room = { ...lesson.room, accessMode }
  return true
}

/** (#226) Hashes a room password. Here rather than in the route that sets one
 *  because this module owns every other dealing with the hash — the cost
 *  factor in particular, which has to match what `checkRoomPassword` was built
 *  against. */
export function hashRoomPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS)
}

/** Mirrors a password change into the live in-memory record (#226), so the
 *  join gate stops accepting the old one immediately instead of at the room's
 *  next cold load. Same caller-persists division as `setRoomClosed` /
 *  `setRoomAccessMode`; `null` removes the password entirely.
 *
 *  Both halves of the record move together on purpose: `passwordHash` is what
 *  the gate compares against, and `room.hasPassword` is what every client is
 *  told — a room that silently kept saying `hasPassword: true` after its
 *  password was removed would have every joiner send one that is no longer
 *  checked, which reads as "the password stopped working". */
export function setRoomPassword(roomId: string, passwordHash: string | null): boolean {
  const lesson = socialRecord(roomId)
  if (!lesson) return false
  lesson.passwordHash = passwordHash ?? undefined
  lesson.room = { ...lesson.room, hasPassword: passwordHash !== null }
  return true
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

export function isLayerLocked(roomId: string, layerId: string): boolean {
  return rooms.get(roomId)?.sharedLockedLayerIds.has(layerId) ?? false
}

/** (#518) The shared lock's mirror, updated exactly where the owner lock's is
 *  — see setLayerOwnerLocked above. */
export function setLayerLocked(roomId: string, layerId: string, locked: boolean): void {
  const record = rooms.get(roomId)
  if (!record) return
  if (locked) record.sharedLockedLayerIds.add(layerId)
  else record.sharedLockedLayerIds.delete(layerId)
}

/** (#518) Undo/redo of a `layer_lock`, resolved by giving the lock up.
 *
 *  A client folds undo properly: its log knows which entries are `done` and
 *  recomputes the flag from them. The server has no such fold for anything but
 *  structural operations (see `structuralLog`, which exists precisely because
 *  reconstructing undo state is not free), so it cannot say what the flag
 *  became — only that it changed.
 *
 *  Which is why this releases rather than guesses. The mirror's whole job is
 *  to stop a stale or hostile client from painting through a lock everyone
 *  else can see; a lock it lets go of is still enforced on every real client
 *  in the room, whereas a lock it holds after the room has released it refuses
 *  drawing that no padlock on screen accounts for, with no way for the user to
 *  clear it. The next `layer_lock` operation re-establishes the truth either
 *  way — including the one a client sends when someone re-locks the layer.
 *
 *  Cheap to reach and rarely taken: only an undo/redo whose target is itself a
 *  lock operation gets here, which is why the lookup is against
 *  `operationsById` rather than a scan. */
export function releaseLockOnUndo(roomId: string, op: Operation): void {
  if (op.type !== 'operation_undo' && op.type !== 'operation_redo') return
  const record = rooms.get(roomId)
  if (!record) return
  const target = record.operationsById.get(op.targetOpId)
  if (target?.type === 'layer_lock') record.sharedLockedLayerIds.delete(target.layerId)
}

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

/** Finishes a cold load's fold by asking Postgres the one question the
 *  resident log can't answer.
 *
 *  `advanceStructuralLog`'s undone → gone rule fires on its author's next
 *  ordinary operation — and ordinary operations are exactly what the resident
 *  window drops below a snapshot (a stroke, an opacity change). So a fold over
 *  the resident log alone can leave an entry `undone` that every client long
 *  since wrote off as `gone`, and then honour a redo of it that no client
 *  would have sent. That revives a layer here and nowhere else, which is
 *  #368's own failure with the roles swapped.
 *
 *  Guessing instead of asking would be wrong in either direction: assume
 *  `gone` and a legitimate redo after a reconnect gets refused (the room can
 *  be evicted while a client sits there with its undo stack intact); assume
 *  `undone` and the divergence above stands. One grouped query settles it, and
 *  only runs for a room that cold-loads with an undone structural entry at all
 *  — i.e. almost never. */
async function resolveUndoneEntries(roomId: string, entries: StructuralEntry[]): Promise<void> {
  const undone = entries.filter(e => e.state === 'undone')
  if (undone.length === 0) return

  const authors = [...new Set(undone.map(e => e.op.userId))]
  const latest = await prisma.operation.groupBy({
    by: ['userId'],
    where: { roomId, userId: { in: authors }, type: { notIn: META_OP_TYPES } },
    _max: { seq: true },
  })
  const latestByAuthor = new Map(latest.map(row => [row.userId, row._max.seq ?? 0]))

  for (const entry of undone) {
    if ((latestByAuthor.get(entry.op.userId) ?? 0) > (entry.op.seq ?? 0)) entry.state = 'gone'
  }
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
    && !isCoveredBySnapshot(record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds))
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

/** Whether the server should log a hash mismatch when a redundant snapshot
 *  upload for a seq this room already has doesn't match the stored one — a
 *  live cross-device determinism-violation detector (#149 epic), directly
 *  motivated by this project's own paper-grain determinism saga. Off by
 *  default: dedup itself (see saveSnapshot) always happens regardless of
 *  this flag, only the comparison/logging is gated. */
function verifyDeterminismEnabled(): boolean {
  return process.env.SNAPSHOT_VERIFY_DETERMINISM === 'true'
}

/** sha256 of a gzipped payload's *decompressed* bytes, without ever holding
 *  those bytes.
 *
 *  Hashing the decompressed form rather than the gzip bytes is deliberate
 *  and must stay that way: gzip output is not guaranteed identical across
 *  browsers or zlib versions for identical input, so hashing the compressed
 *  form would report determinism violations that aren't ones — and catching
 *  real pixel-determinism violations is the entire point of this hash (#149).
 *
 *  (#292) It used to be `gunzipSync(gzippedData)` into one buffer. Raw RGBA
 *  tiles compress extremely well, so ~15 MB of gzip expanded to well over a
 *  hundred megabytes in a single allocation, on a 960 MB box — the measured
 *  source of the server's 730 MB memory peak, and all of it thrown away
 *  immediately afterward. Streaming keeps only a chunk at a time; the hash
 *  it produces is byte-for-byte the same. */
async function hashOfDecompressed(gzipped: Uint8Array): Promise<string> {
  const sha = createHash('sha256')
  await pipeline(
    // `Readable.from(buffer)` would iterate the buffer *byte by byte* (a
    // Buffer is an iterable of numbers) — the single-element array is what
    // makes this one chunk rather than N one-byte chunks.
    Readable.from([Buffer.from(gzipped)]),
    createGunzip(),
    async source => { for await (const chunk of source) sha.update(chunk) },
  )
  return sha.digest('hex')
}

/** (#292, per layer since #371) How many snapshots a room keeps *of each
 *  layer*. Nothing had ever deleted a superseded one, so they accumulated
 *  indefinitely: on 2026-07-26 prod held 93 rows totalling 117 MB, of which
 *  65 rows / 83 MB were older than each room's newest and read by nothing.
 *
 *  Two rather than one: the previous snapshot is the only fallback if the
 *  newest turns out to be baked from a corrupt client view (#287), and two
 *  is exactly the depth the agreed undo rule already works in (spec v0.2
 *  §7). This does not touch the raw operations — those are the actual
 *  evidence #289's verification needs, and they stay untouched.
 *
 *  Counted per layer rather than per room, which is what keeps the rule
 *  meaningful now that a bake only carries the layers that changed: two
 *  room-wide rows would be two *layers*, discarding every other layer's only
 *  copy the moment a third one was uploaded. */
const SNAPSHOT_RETENTION_PER_LAYER = 2

/** Deletes each layer's snapshots older than its newest
 *  `SNAPSHOT_RETENTION_PER_LAYER`. Fire-and-forget, and deliberately swallows
 *  its own errors: failing to reclaim space must never fail the upload that
 *  triggered it. */
async function deleteSupersededSnapshots(roomId: string, layerIds: readonly string[]): Promise<void> {
  try {
    for (const layerId of layerIds) {
      const keep = await prisma.roomLayerSnapshot.findMany({
        where: { roomId, layerId },
        orderBy: { seq: 'desc' }, take: SNAPSHOT_RETENTION_PER_LAYER, select: { seq: true },
      })
      if (keep.length < SNAPSHOT_RETENTION_PER_LAYER) continue
      const oldestKept = keep[keep.length - 1].seq
      await prisma.roomLayerSnapshot.deleteMany({ where: { roomId, layerId, seq: { lt: oldestKept } } })
    }
  } catch (err) {
    console.error(`failed to prune superseded snapshots for room ${roomId}`, err)
  }
}

/** Every layer this room has stored pixels for, mapped to the newest seq they
 *  were stored at — the `coveredSeq` that decides which operations a layer
 *  still needs replayed (#371). */
async function loadCoveredSeqByLayer(roomId: string): Promise<Map<string, number>> {
  const rows = await prisma.roomLayerSnapshot.groupBy({
    by: ['layerId'], where: { roomId }, _max: { seq: true },
  })
  return new Map(rows.map(row => [row.layerId, row._max.seq ?? 0]))
}

export type SaveSnapshotResult =
  | { ok: true; created: string[]; duplicated: string[]; mismatched: string[] }
  | { ok: false; error: 'unknown_room' | 'not_a_checkpoint_seq' }
  // (#462) `missing` is the point of the rejection, not a detail of it: it
  // names the layers the upload would have erased, which is what makes an
  // occurrence in the logs diagnosable instead of merely countable.
  | { ok: false; error: 'stale_layer_state'; missing: string[] }

/** (#462) Which layers an uploaded `layerState` is obliged to account for: the
 *  ids alive as of `seq`, judged from the server's own fold of the structural
 *  log rather than from anything the uploading client says.
 *
 *  Bounded by `seq` and not simply read off `record.aliveIds`, because a layer
 *  someone else created *after* the boundary being baked is one the uploader
 *  is right not to list — checking against the live set would reject an honest
 *  upload every time a bake and a `layer_add` overlapped.
 *
 *  The entries' done/undone state is today's, not the state as of `seq`, and
 *  that asymmetry is deliberate. An entry undone since `seq` drops out here,
 *  so the uploader listing it is simply not our business — this only ever
 *  looks for ids it *omits*. The converse (undone at `seq`, redone since)
 *  could in principle reject an honest upload; the cost of that is one skipped
 *  snapshot on a best-effort path, against a room that reads as wiped. */
function requiredLayerIdsAt(record: RoomRecord, seq: number): Set<string> {
  return deriveLayerIds(record.structuralLog.filter(e => (e.op.seq ?? 0) <= seq)).aliveIds
}

/** Stores a client-baked snapshot (#149 epic, per layer since #371).
 *
 *  `layers` maps layerId to exactly what the client compressed with
 *  CompressionStream('gzip') — see the engine's bakeNetworkSnapshot — each
 *  decompressed here once to compute its `hash` (sha256 of the *decompressed*
 *  bytes, so gzip's own non-determinism, if any, can never masquerade as a
 *  pixel/determinism bug).
 *
 *  A partial upload is legitimate, and that is the point of the whole epic: a
 *  client sends the layers it actually re-baked, and a layer left out simply
 *  keeps whatever coverage it already had. Nothing is inferred from absence.
 *
 *  Dedup is unconditional and per layer: `(roomId, layerId, seq)` is unique,
 *  so a second upload of a layer at a seq this room already has is discarded
 *  (first arrival wins — several clients independently crossing the same
 *  checkpoint and uploading concurrently is the expected, normal case, not a
 *  race to avoid). Only the *comparison* against the already-stored hash is
 *  gated behind SNAPSHOT_VERIFY_DETERMINISM, since it's pure overhead when
 *  nobody's watching for it.
 *
 *  `layerState` is stored once per room, last write wins — see the
 *  RoomLayerState model comment for why it no longer has to travel atomically
 *  with the pixels. An out-of-order arrival (an older seq landing after a
 *  newer one) is ignored rather than allowed to walk the structure backward. */
export async function saveSnapshot(
  roomId: string, seq: number, layerState: unknown, layers: ReadonlyMap<string, Uint8Array>,
): Promise<SaveSnapshotResult> {
  const record = rooms.get(roomId)
  if (!record) return { ok: false, error: 'unknown_room' }
  if (seq <= 0 || seq % SNAPSHOT_SEQ_INTERVAL !== 0) return { ok: false, error: 'not_a_checkpoint_seq' }

  // (#462) The structure a client sends has to agree with the log the server
  // already holds. Checked here rather than trusted, because `layerState` is
  // the one thing an upload can get wrong that erases the room for everyone
  // else: a layer missing from it reads as deleted to `isCoveredBySnapshot`,
  // and a deleted layer's operations stop being sent at all.
  //
  // On 2026-08-17 (room F4uw21Ob) a client whose join-time restore had not run
  // yet uploaded `makeInitialLayerState()` — two layers — over a lesson with
  // four, at seq 22400 of 22445. Every operation below that seq was withheld
  // from then on and the room read as wiped, with every byte of it still in
  // Postgres. The client-side race is fixed at its source, but this check is
  // what makes the whole class unrepresentable rather than that one path: the
  // server is the only party that can compare a claimed structure against the
  // log, and it costs one fold of the structural entries per checkpoint.
  //
  // Whole upload rejected, pixels included. They were baked by the same client
  // out of the same buffers, so a structure that disagrees with the log is
  // reason enough to doubt them — and refusing a snapshot only costs the room
  // a slower join, which is what it already had.
  //
  // An unreadable `layerState` is deliberately *not* rejected here, for the
  // same reason `layerStateIdsOf` answers `null` instead of an empty set:
  // something we cannot parse is a claim about nothing, and nothing is what it
  // is then allowed to withhold. Rejecting it would put this check in the
  // business of validating a shape, which is not what it is for.
  const claimed = layerState === undefined ? null : layerStateIdsOf(layerState)
  if (claimed !== null) {
    const missing = [...requiredLayerIdsAt(record, seq)].filter(id => !claimed.has(id))
    if (missing.length > 0) return { ok: false, error: 'stale_layer_state', missing }
  }

  const created: string[] = []
  const duplicated: string[] = []
  const mismatched: string[] = []

  // Coverage follows the row existing, not this call being the one that wrote
  // it: a duplicate proves the layer is stored at this seq just as well as a
  // fresh insert does. Skipping it would leave a room that re-entered memory
  // while rows already existed under-claiming its own coverage.
  const noteCovered = (layerId: string): void => {
    if (seq > (record.coveredSeqByLayer.get(layerId) ?? 0)) record.coveredSeqByLayer.set(layerId, seq)
  }

  for (const [layerId, gzippedData] of layers) {
    const hash = await hashOfDecompressed(gzippedData)
    try {
      await prisma.roomLayerSnapshot.create({
        // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — Prisma's
        // generated Bytes-field type is narrower than the Uint8Array this
        // function accepts (which could technically be SharedArrayBuffer-
        // backed), so a straight pass-through doesn't typecheck.
        data: { roomId, layerId, seq, data: new Uint8Array(gzippedData), hash },
      })
      created.push(layerId)
      noteCovered(layerId)
    } catch (err) {
      // P2002: unique constraint violation on (roomId, layerId, seq) — this
      // layer is already stored at this checkpoint. Not an error: it is the
      // expected outcome whenever more than one client bakes the same one.
      const isDuplicate = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002'
      if (!isDuplicate) throw err
      duplicated.push(layerId)
      noteCovered(layerId)

      if (!verifyDeterminismEnabled()) continue
      const existing = await prisma.roomLayerSnapshot.findUnique({
        where: { roomId_layerId_seq: { roomId, layerId, seq } }, select: { hash: true },
      })
      if (existing !== null && existing.hash !== hash) mismatched.push(layerId)
    }
  }

  if (layerState !== undefined && seq > (record.layerStateSeq ?? 0)) {
    await prisma.roomLayerState.upsert({
      where: { roomId },
      create: { roomId, seq, state: layerState as object },
      update: { seq, state: layerState as object },
    })
    record.layerStateSeq = seq
    record.layerStateIds = layerStateIdsOf(layerState)
  }

  if (created.length > 0) {
    // (#292) These layers no longer need their covered operations resident —
    // see trimResidentOperations, currently a no-op pending #372.
    trimResidentOperations(record)
    void deleteSupersededSnapshots(roomId, created)
  }
  return { ok: true, created, duplicated, mismatched }
}

/** How far this layer's stored pixels reach — the seq of its newest
 *  RoomLayerSnapshot, or `undefined` if nothing has ever been stored for it
 *  and its whole history still has to be replayed (#371).
 *
 *  A plain read of `coveredSeqByLayer`, which #372 makes `getRoomStateFor`
 *  consult per layer when deciding which operations a joining client still
 *  needs. Until then this is how the coverage the storage layer maintains can
 *  be observed at all. */
export function getCoveredSeq(roomId: string, layerId: string): number | undefined {
  return rooms.get(roomId)?.coveredSeqByLayer.get(layerId)
}

export interface SnapshotIndexEntry {
  layerId: string
  seq: number
  /** sha256 of the layer's *decompressed* pixels — see hashOfDecompressed.
   *  Doubles as the blob's ETag: it is already exactly a content hash of
   *  immutable content, so there is nothing to compute per request. */
  hash: string
}

/** Which layers have stored pixels and at what seq, plus the room's stored
 *  layerState — everything a joining client needs to *plan* its restore,
 *  without a single pixel attached (#427).
 *
 *  `layers` is empty for a room nobody has baked yet, and may cover only some
 *  of the layers in `layerState`: a layer with no row here has no stored
 *  pixels and is rebuilt from its operations alone. That case is ordinary, not
 *  an error — it is exactly what #369 got wrong by treating a missing layer as
 *  an empty one.
 *
 *  This used to be `getLatestSnapshot`, which selected `data` for *every*
 *  retained row of the room and then dropped all but the newest per layer in
 *  JS. With SNAPSHOT_RETENTION_PER_LAYER rows per layer at several MB each,
 *  a join read ~10MB out of Postgres to serve ~9.7MB, and held the surplus in
 *  server memory for the length of the request. Splitting the metadata from
 *  the pixels means the index costs kilobytes and each blob is fetched by
 *  primary key, exactly once, only if the client doesn't already have it.
 *
 *  Read from Postgres directly rather than the in-memory Map: unlike
 *  operations, snapshot pixel payloads are never cached in `RoomRecord`
 *  (#149 epic design — kept out of the hot, always-resident path since
 *  they're only needed at join time). */
export async function getSnapshotIndex(
  roomId: string,
): Promise<{ seq: number; layerState: unknown; layers: SnapshotIndexEntry[] } | null> {
  const [stored, rows] = await Promise.all([
    prisma.roomLayerState.findUnique({ where: { roomId }, select: { seq: true, state: true } }),
    // Newest first, so the first row seen for a layer is the one to keep —
    // retention leaves up to SNAPSHOT_RETENTION_PER_LAYER rows per layer.
    prisma.roomLayerSnapshot.findMany({
      where: { roomId }, orderBy: { seq: 'desc' }, select: { layerId: true, seq: true, hash: true },
    }),
  ])
  if (!stored) return null

  // (#474) Only layers the room still has. Every blob listed here is one the
  // client downloads and inflates before handing it to the engine, and a layer
  // absent from the structure is dropped by the engine's first line
  // (`restoreLayerFromSnapshot`'s `if (!buf) return`) — so listing it spends
  // bandwidth and, far more expensively, peak memory to reach a no-op.
  //
  // Production room 2xKybCLI listed five layers for a three-layer room: ~1.5 MB
  // on the wire and ~20 MiB of inflated pixels, on a join that then came up
  // showing one partial layer. Whether or not that join died of memory, asking
  // a tablet to inflate a fifth of a room it will never draw is not a cost this
  // can justify.
  //
  // `null` from layerStateIdsOf means the stored structure could not be read at
  // all, and that fails open on purpose — same reasoning as its own doc
  // comment. Listing a blob nobody needs wastes memory; withholding one that is
  // needed loses drawing, and only one of those is recoverable.
  const liveIds = layerStateIdsOf(stored.state)
  const newestByLayer = new Map<string, SnapshotIndexEntry>()
  for (const row of rows) {
    if (liveIds !== null && !liveIds.has(row.layerId)) continue
    if (!newestByLayer.has(row.layerId)) newestByLayer.set(row.layerId, row)
  }
  return { seq: stored.seq, layerState: stored.state, layers: [...newestByLayer.values()] }
}

/** One layer's stored snapshot: the gzipped `encodeLayerTiles` payload exactly
 *  as the baking client uploaded it, plus its hash (#427).
 *
 *  Addressed by the full `(roomId, layerId, seq)` unique key rather than "the
 *  newest for this layer" on purpose — that is what makes the response
 *  immutable, and immutability is what lets it be cached forever by URL. A
 *  "give me the newest" route could never say that about itself.
 *
 *  Null for a triple that was never stored, or was stored and has since aged
 *  out of SNAPSHOT_RETENTION_PER_LAYER between a client reading the index and
 *  fetching from it — an ordinary race, not an error: the client falls back to
 *  replaying that layer's operations, same as for a layer never baked at all. */
export async function getLayerSnapshot(
  roomId: string, layerId: string, seq: number,
): Promise<{ data: Uint8Array; hash: string } | null> {
  return await prisma.roomLayerSnapshot.findUnique({
    where: { roomId_layerId_seq: { roomId, layerId, seq } },
    select: { data: true, hash: true },
  })
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
 *  (#292) Queries Postgres directly rather than the in-memory Map. It used
 *  to read `record.operations` on the premise that `ensureRoomLoaded` had
 *  pulled the room's entire history into RAM — which is precisely the
 *  premise that made a 1 GB box hold 500 MB of stroke JSON. The resident set
 *  is now a window around the latest snapshot, and this endpoint asks for
 *  exactly the operations that window deliberately excludes, so it has to go
 *  to the source. An empty result means backfill has reached the beginning
 *  of the room's stored history. */
export async function getOperationsBefore(roomId: string, beforeSeq: number, limit: number): Promise<Operation[]> {
  // `orderBy: seq desc` + take, then reversed: "the newest `limit`
  // operations below beforeSeq" is a suffix, and the (roomId, seq) unique
  // index makes it an indexed range scan rather than a full-table sort.
  const rows = await prisma.operation.findMany({
    where: { roomId, seq: { lt: beforeSeq } },
    orderBy: { seq: 'desc' },
    take: limit,
    select: { data: true },
  })
  return rows.reverse().map(row => row.data as Operation)
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
