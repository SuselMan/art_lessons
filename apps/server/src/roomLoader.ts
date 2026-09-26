import type { AssignmentSummary, BoardSummary, Operation } from '@grafetto/shared'
import { DEFAULT_PALETTE_COLORS } from '@grafetto/shared'

import { prisma } from './prisma.js'
import { toWireRoom } from './roomMapper.js'
import { rooms } from './roomRegistry.js'
import { persistPalette } from './roomPersistence.js'
import { layerStateIdsOf, residentOperationWhere } from './snapshotCoverage.js'
import { loadCoveredSeqByLayer } from './snapshotStore.js'
import { buildStructuralLog, deriveLayerIds, META_OP_TYPES, type StructuralEntry } from './structuralLog.js'

/** (#612) The cold load: turning a room's rows back into a resident record —
 *  the operation window no snapshot covers (#292/#372), the mirrors folded
 *  from it (locks, alive/deleted ids via the structural log, #368), and for a
 *  lesson its strip and assignment rounds. The only thing that reaches into
 *  Postgres to repopulate the Map; everything synchronous in rooms.ts and the
 *  domain modules assumes it has run. Moved out of rooms.ts. */

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
