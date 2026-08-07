import bcrypt from 'bcryptjs'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Operation, Participant, RejectReason, Room, RoomAccessMode } from '@grafetto/shared'
import { DEFAULT_PALETTE_COLORS, IMPLICIT_LAYER_IDS, SNAPSHOT_SEQ_INTERVAL, operationLayerIds } from '@grafetto/shared'

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
  // (#149 epic, #371) The seq of this room's stored RoomLayerState — null
  // until anyone has uploaded one. Cached here rather than queried fresh on
  // every getRoomSnapshot call, same reasoning as `nextSeq`: this file's
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
  | { ok: false; error: 'not_found' }

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

function persistRoomCreate(room: Room, passwordHash: string | undefined): void {
  enqueueWrite(room.id, () => prisma.room.create({
    data: {
      id: room.id, name: room.name, paper: room.paper, paperColor: room.paperColor ?? null,
      infinite: room.infinite,
      canvasWidth: room.canvasWidth ?? null, canvasHeight: room.canvasHeight ?? null,
      passwordHash, accessMode: room.accessMode, ownerId: room.ownerId,
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
 *  by a room-wide seq. See `deletableOperations` below, which is that rule and
 *  which this would call. Two conditions have to hold before it may run at
 *  all, and neither is this function's to check alone: the covering snapshot
 *  must be `verified` (#289 §13), and every layer in the room's stored
 *  structure must have coverage — a layer nobody ever snapshotted has no
 *  pixels standing in for anything, and deleting its operations is exactly
 *  #369 made permanent. */
function pruneOperationsBeforeSnapshot(_roomId: string): void {
  // Intentionally a no-op — see the doc comment above.
}

/** The operations stored pixels account for, i.e. the ones deletion may
 *  eventually consider (#372). Pure function, exported for tests and for
 *  whatever re-enables pruning: the point is that "what a snapshot covers"
 *  has exactly one definition in this file.
 *
 *  Callers must still satisfy the two conditions in
 *  `pruneOperationsBeforeSnapshot`'s comment before deleting anything. */
export function deletableOperations(
  coveredSeqByLayer: ReadonlyMap<string, number>, operations: readonly Operation[],
  layerStateSeq: number | null = null, layerStateIds: ReadonlySet<string> | null = null,
): Operation[] {
  return operations.filter(op => isCoveredBySnapshot(coveredSeqByLayer, op, layerStateSeq, layerStateIds))
}

/** (#292) Operation types that must stay resident for a room's whole life,
 *  however old they are. `aliveIds`, `deletedIds` and `lockedLayerIds` are
 *  rebuilt by folding over `RoomRecord.operations`, so dropping any of these
 *  from the window would silently corrupt those mirrors: a `layer_add` older
 *  than the window would make its layer permanently undeletable
 *  (`target_gone` — the exact shape of #291's initial-layer bug), and a
 *  dropped `layer_owner_lock` would quietly unlock a layer on the next
 *  server restart. (#311) A dropped `layer_delete` would additionally lose a
 *  `deletedIds` entry — that one fails safe (back to accepting content on a
 *  dead layer, the pre-#311 behavior) rather than breaking drawing, but it's
 *  still a mirror this list exists to protect.
 *
 *  (#368) `operation_undo`/`_redo`/`_revoke` are here for the same reason one
 *  step removed: they don't create or destroy an id themselves, they decide
 *  whether the operation that did still counts. Dropping an undo below the
 *  window would resurrect the `layer_delete` it took back, so a room that had
 *  a deleted layer restored would come back from a restart with it deleted
 *  again — and every client that still shows it then diverges from the server
 *  about whether it may be drawn on.
 *
 *  All of them are a few hundred bytes each. The heavy types — `stroke` and
 *  `image_import`, which carry dab arrays and inline base64 image data — are
 *  deliberately absent: their pixels are exactly what a snapshot already
 *  contains, so below the snapshot they are pure weight. An undo *of* a
 *  stroke is kept even though the stroke itself isn't; it is a few hundred
 *  bytes, and telling the two apart would mean resolving every target before
 *  the query that fetches them.
 *
 *  Exported for anything outside this module that has to reproduce the
 *  resident window rather than guess at it — currently forkRoutes.ts (#317),
 *  which copies exactly what a cold load would consider resident. */
export const RESIDENT_OP_TYPES: readonly string[] = [
  'layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_owner_lock',
  'operation_undo', 'operation_redo', 'operation_revoke',
]

/** The ids a stored layerState still lists — see RoomRecord.layerStateIds.
 *  `null` when the stored value can't be read as a layerState at all.
 *
 *  Null rather than an empty set, and the distinction is the whole safety
 *  margin: an empty set says "every layer is gone", which withholds every
 *  operation in the room. This reads JSON a client wrote, so it has to assume
 *  it may one day read something else — and the only acceptable failure is the
 *  one that replays too much, never the one that replays too little. Same
 *  reasoning as #311's "an id the server never heard of is not treated as
 *  destroyed". */
function layerStateIdsOf(state: unknown): Set<string> | null {
  if (typeof state !== 'object' || state === null) return null
  const items = (state as { items?: unknown }).items
  if (typeof items !== 'object' || items === null) return null
  return new Set(Object.keys(items))
}

/** (#372) The operations a layer's stored pixels can stand in for.
 *
 *  Deliberately only the *pure* pixel operations — ones that target a single
 *  layer and do nothing but paint it. Those are also the heavy ones (dab
 *  arrays, inline base64 images), so this is where all the saving is.
 *
 *  `layer_merge` and `layer_transform` paint too and are excluded on purpose.
 *  A merge is also a structural fact (it creates a layer and consumes its
 *  sources) and a transform can name several layers at once, so withholding
 *  either would take away something the client still needs. They are always
 *  sent, and the client skips re-applying their pixel half to a layer it has
 *  already restored past them, judged against the coverage it really has
 *  (#374). */
const COVERABLE_OP_TYPES = ['stroke', 'image_import', 'layer_clear']

/** (#412) `'layerId' in op` used to be enough to narrow to a single-target
 *  operation. It stopped being: `layer_opacity`/`layer_visibility` still
 *  declare a `layerId`, now optional, so the test admits them and the field
 *  can be `undefined`. Narrowing by type instead says what was always meant —
 *  the three operations that carry pixels — and keeps the one list of them. */
type CoverableOperation = Extract<Operation, { type: 'stroke' | 'image_import' | 'layer_clear' }>

function isCoverableOp(op: Operation): op is CoverableOperation {
  return COVERABLE_OP_TYPES.includes(op.type)
}

/** Whether `op` is already accounted for by stored state, and so does not have
 *  to be replayed (#372).
 *
 *  Two kinds of stored state, because there are two kinds of thing an
 *  operation can leave behind:
 *
 *   - **pixels**, covered per layer by `coveredSeqByLayer`;
 *   - **structure** — which layers exist, their order, names, opacity,
 *     visibility — covered by the room's stored layerState at `layerStateSeq`.
 *
 *  The structural half was missing when this was first written, and it cost a
 *  live bug the same day (2026-07-31, room ksEMJOMy). Structural operations
 *  were declared uncoverable and therefore sent at any age, so a client that
 *  restored layerState at seq 3200 was then handed the `layer_merge` from seq
 *  314 and folded it in on top — re-inserting a layer the restored state
 *  already had. Ilya saw one layer listed twice, then three times, gaining a
 *  row per reload. Before this epic a single room-wide floor happened to
 *  withhold those; removing it for pixels left structure with no floor at all.
 *
 *  A `layer_merge` or `layer_transform` needs *both*: they carry structure (or
 *  several layers at once) and pixels, so either half still outstanding means
 *  the operation has to be replayed. That is the asymmetry worth keeping in
 *  view — "covered" is a claim about everything an operation did, not about
 *  its type.
 *
 *  This is the one rule three callers share — what stays in RAM, what a
 *  joining client is sent, and what a fork copies (forkRoutes.ts) — precisely
 *  because letting them drift is the shape of the bug the epic exists to
 *  fix. */
export function isCoveredBySnapshot(
  coveredSeqByLayer: ReadonlyMap<string, number>, op: Operation,
  layerStateSeq: number | null = null, layerStateIds: ReadonlySet<string> | null = null,
): boolean {
  const seq = op.seq ?? 0
  const structureCovered = layerStateSeq !== null && seq <= layerStateSeq
  // A layer the stored structure no longer lists is gone, and a gone layer
  // needs no pixels: nothing displays it. Only meaningful for an operation the
  // structure already accounts for — above that seq, "not listed" means
  // "created since", which is the opposite conclusion.
  const pixelsCovered = (layerId: string): boolean =>
    seq <= (coveredSeqByLayer.get(layerId) ?? 0)
    || (structureCovered && layerStateIds !== null && !layerStateIds.has(layerId))

  if (isCoverableOp(op)) return pixelsCovered(op.layerId)
  if (op.type === 'layer_merge') return structureCovered && pixelsCovered(op.layerId)
  if (op.type === 'layer_transform') return structureCovered && op.transforms.every(t => pixelsCovered(t.layerId))
  // Everything else leaves structure and nothing else behind: layer_add,
  // folder_add, layer_delete, layer_move, layer_rename, layer_opacity,
  // layer_visibility, layer_owner_lock — and the meta operations, whose whole
  // effect is on entries the stored layerState already reflects.
  return structureCovered
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
  const covered = [...coveredSeqByLayer].map(([layerId, seq]) => ({ layerId, seq: { lte: seq } }))
  const where = covered.length === 0
    ? { roomId }
    : { roomId, NOT: { type: { in: COVERABLE_OP_TYPES }, OR: covered } }
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
  if (rooms.has(roomId)) return true

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

  // (#289 epic) Rebuild the aliveIds/deletedIds mirrors the same way — see
  // their doc comments on RoomRecord. (#368) Via the structural log, so a
  // cold-loaded room resolves undone deletes exactly as a live one does;
  // folding the raw types straight into the two Sets is what silently ignored
  // undo before.
  const structuralLog = buildStructuralLog(operations)
  await resolveUndoneEntries(roomId, structuralLog)
  const { aliveIds, deletedIds } = deriveLayerIds(structuralLog)

  rooms.set(roomId, {
    room: toWireRoom(dbRoom),
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
    aliveIds,
    deletedIds,
    operationsById: new Map(operations.map(op => [op.id, op])),
    structuralLog,
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
  roomData: Pick<Room, 'id' | 'name' | 'paper' | 'paperColor' | 'infinite' | 'canvasWidth' | 'canvasHeight'>,
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
    const participant: Participant = { userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false }
    existing.participants.set(ownerId, participant)
    currentSocketForParticipant.set(participantKey(roomData.id, ownerId), socketId)
    return { room: existing.room, participant }
  }

  const room: Room = {
    ...roomData,
    hasPassword: !!password,
    // (#224/#232) Written through explicitly rather than left to the column
    // default, so the in-memory record and the row can never disagree about a
    // room's own mode — including when the creator picked one (#232).
    accessMode,
    ownerId,
    createdAt: new Date().toISOString(),
  }
  const passwordHash = password ? bcrypt.hashSync(password, BCRYPT_ROUNDS) : undefined
  const participant: Participant = { userId: ownerId, name: ownerName, role: 'owner', color: CURSOR_COLORS[0], frozen: false }
  const participants = new Map<string, Participant>([[ownerId, participant]])
  const palette = [...DEFAULT_PALETTE_COLORS]
  rooms.set(room.id, {
    room, passwordHash, operations: [], participants, nextSeq: 1, palette,
    layerStateSeq: null, layerStateIds: null, coveredSeqByLayer: new Map(),
    roomFrozen: false, frozenUserIds: new Set(), lockedLayerIds: new Set(),
    aliveIds: new Set(IMPLICIT_LAYER_IDS), deletedIds: new Set(), operationsById: new Map(),
    structuralLog: [],
  })
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
export function getRoomGate(roomId: string): { ownerId: string; accessMode: RoomAccessMode } | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  return { ownerId: record.room.ownerId, accessMode: record.room.accessMode }
}

/** (#225) True when the room has no password, or when this one matches it.
 *  Lives here rather than in `roomAccess.ts` so the hash itself never leaves
 *  this module — the gate gets an answer, not a credential to compare. */
export function checkRoomPassword(roomId: string, password: string | undefined): boolean {
  const record = rooms.get(roomId)
  if (!record?.passwordHash) return true
  return !!password && bcrypt.compareSync(password, record.passwordHash)
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
  persistParticipant(roomId, userId, name)
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

  evictWhenIdle(roomId)
  return removed
}

/** Evicts `roomId` from memory once it's genuinely unused, waiting out this
 *  room's in-flight Postgres writes first (see `enqueueWrite`) and
 *  re-checking participants afterward — a reconnect landing during the wait
 *  repopulates the Map, and that room must not then be deleted out from
 *  under it. */
function evictWhenIdle(roomId: string): void {
  const pending = pendingWrite.get(roomId)
  if (!pending) {
    pruneOperationsBeforeSnapshot(roomId)
    rooms.delete(roomId)
    return
  }
  pending.finally(() => {
    if (rooms.get(roomId)?.participants.size === 0) {
      pruneOperationsBeforeSnapshot(roomId)
      rooms.delete(roomId)
    }
  })
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
  if (!record || record.participants.size !== 0) return
  evictWhenIdle(roomId)
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

// ── Closed for editing (#222) ─────────────────────────────────────────────

export function isRoomClosed(roomId: string): boolean {
  return rooms.get(roomId)?.room.closedAt !== undefined
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
  const record = rooms.get(roomId)
  if (!record) return false
  record.room = { ...record.room, closedAt: closedAt ?? undefined }
  return true
}

/** Mirrors a `Room.accessMode` change into the live in-memory record (#225),
 *  so the very next join is judged against it rather than against whatever
 *  the room was loaded with. Exactly the same division of labour as
 *  `setRoomClosed` above — persisting belongs to the caller, which will be
 *  #226's `PATCH` endpoint; returning `false` for a non-resident room is not a
 *  failure, since its next cold load reads the stored mode anyway. */
export function setRoomAccessMode(roomId: string, accessMode: RoomAccessMode): boolean {
  const record = rooms.get(roomId)
  if (!record) return false
  record.room = { ...record.room, accessMode }
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
  const record = rooms.get(roomId)
  if (!record) return false
  record.passwordHash = passwordHash ?? undefined
  record.room = { ...record.room, hasPassword: passwordHash !== null }
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
 *   - a room closed for editing (#222) rejects every operation from
 *     everyone, the owner included — the one check here that is not a
 *     privilege of the owner but a state of the document.
 *   - room-wide freeze (#256) and this participant's own freeze (#257)
 *     reject *every* operation type, not just drawing ones.
 *   - an owner-locked layer (#258) rejects only operations that target it
 *     (anything carrying a top-level `layerId`, e.g. `stroke`/`image_import`
 *     — see packages/shared's Operation union for the full set).
 *
 *  (#289 epic, reliable history spec v0.2) Returns the specific
 *  `RejectReason` rather than a bare boolean — a rejected operation now gets
 *  an explicit `SendResult` back instead of the silence isOperationAllowed's
 *  boolean used to produce (socketHandlers.ts just `return`ed with no ack at
 *  all, indistinguishable to the sender from a dropped packet). The
 *  `not_owner` fallback for an unknown room is arbitrary/unreachable in
 *  practice — socketHandlers.ts only ever calls this for a roomId a socket
 *  has already successfully joined; recordOperation is the one that throws
 *  for a genuinely missing room. */
export function getOperationRejectReason(roomId: string, userId: string, op: Operation): RejectReason | null {
  const record = rooms.get(roomId)
  if (!record) return 'not_owner'
  const participant = record.participants.get(userId)
  const isOwner = participant?.role === 'owner'

  if (op.type === 'operation_revoke' && !isOwner) return 'not_owner'
  if (op.type === 'layer_owner_lock' && !isOwner) return 'not_owner'

  // (#289 epic, reliable history spec v0.2 §8) Existence isn't a privilege —
  // checked before the owner short-circuit below, so not even the room's
  // owner can delete/merge/transform a layer that's already gone (a
  // concurrent delete/merge racing this one, the exact class of bug the
  // spec's §5 "merge vs delete" discussion covers). Rejecting outright here,
  // once, on the server, replaces the old behavior of silently accepting
  // both and letting every client's own replay resolve the conflict
  // independently — which could (and did, in the reasoning that led here)
  // resolve differently on different clients.
  if (hasMissingAliveTarget(record, op)) return 'target_gone'

  // (#222) Checked *before* the owner short-circuit below — unlike every
  // other privilege here, closing binds the owner too. The point of a closed
  // lesson is that it has stopped changing: students fork it, and a fork is
  // only a faithful copy of the assignment if the assignment cannot drift
  // afterwards. An owner who wants to correct something reopens the room,
  // which is one toggle away and, being persisted and broadcast, is visible
  // to everyone rather than being a silent exemption. Contrast `room_frozen`
  // below, which is a live control over *other people* and never applies to
  // the person holding it.
  if (record.room.closedAt !== undefined) return 'room_closed'

  if (isOwner) return null

  if (record.roomFrozen) return 'room_frozen'
  if (record.frozenUserIds.has(userId)) return 'participant_frozen'
  if (ownerLockedTargets(record, op)) return 'layer_owner_locked'
  return null
}

/** Whether a non-owner's operation touches a layer the owner reserved.
 *
 *  (#412) `layer_opacity` and `layer_visibility` carry a *list* of targets
 *  now, and the plain `'layerId' in op` test below would simply stop seeing
 *  them — turning the mass form into a way around the owner's lock while the
 *  single form stayed correctly refused. A silent privilege escalation is the
 *  worst shape this could have taken, so the two pluralised types are named
 *  explicitly rather than inferred from whether some field happens to exist.
 *
 *  Deliberately unchanged for everything else, including `layer_delete` and
 *  `layer_transform`, which have never been gated here (neither carries a
 *  `layerId`). Whether that is right is a separate question from this one and
 *  does not get answered by accident in a refactor. */
function ownerLockedTargets(record: RoomRecord, op: Operation): boolean {
  if (op.type === 'layer_opacity' || op.type === 'layer_visibility') {
    return operationLayerIds(op).some(id => record.lockedLayerIds.has(id))
  }
  return 'layerId' in op && record.lockedLayerIds.has(op.layerId)
}

/** True if `op` targets an id that can no longer receive it — see
 *  RoomRecord.aliveIds/deletedIds for the two mirrors this reads.
 *
 *  Two classes, deliberately gated against different sets:
 *
 *  1. *Destructive* operations on someone else's reference
 *     (`layer_delete`/`layer_merge`/`layer_transform`) are gated on
 *     `aliveIds`: a target that isn't positively alive must not be acted
 *     on, whatever the reason (#289 §8).
 *  2. *Content-bearing* operations (`stroke`/`image_import`/`layer_clear`)
 *     are gated on `deletedIds` — a positively-destroyed target only
 *     (#311, revising #289 §4's classification).
 *
 *  §4 originally left class 2 ungated on the grounds that it degrades
 *  gracefully client-side (see engine/index.ts's appendOperation, which
 *  revokes rather than crashes). That reasoning holds for a three-second
 *  drop and fails for a long offline stretch: the operations are accepted,
 *  recorded, broadcast, and then quietly evaporate on every client — the
 *  one path by which a user silently loses drawing they already did. The
 *  author can't even be told, since `target_gone` never fires. Rejecting
 *  instead hands the operations back intact so the client can re-target
 *  them onto a fresh layer (#312).
 *
 *  Property-only operations (`layer_move`/`layer_opacity`/
 *  `layer_visibility`/`layer_rename`) stay ungated: they carry nothing that
 *  can be lost and are fine as last-write-wins, exactly as §4 classified. */
function hasMissingAliveTarget(record: RoomRecord, op: Operation): boolean {
  switch (op.type) {
    case 'layer_delete': return op.layerIds.some(id => !record.aliveIds.has(id))
    case 'layer_merge': return op.sources.some(s => !record.aliveIds.has(s.id))
    case 'layer_transform': return op.transforms.some(t => !record.aliveIds.has(t.layerId))
    case 'stroke':
    case 'image_import':
    case 'layer_clear': return record.deletedIds.has(op.layerId)
    default: return false
  }
}

/** The operations that create or destroy a layer/folder id — the only ones
 *  `aliveIds`/`deletedIds` are derived from (#368). */
type StructuralOperation = Extract<Operation, { type: 'layer_add' | 'folder_add' | 'layer_delete' | 'layer_merge' }>

function isStructuralOperation(op: Operation): op is StructuralOperation {
  return op.type === 'layer_add' || op.type === 'folder_add'
    || op.type === 'layer_delete' || op.type === 'layer_merge'
}

/** Mirrors the client's own three-state log (see OperationLog.ts's header):
 *  `done` applied, `undone` reverted by its author and eligible for redo,
 *  `gone` unreachable — the author acted after undoing, or a teacher revoked
 *  it, and it can never come back. */
interface StructuralEntry {
  op: StructuralOperation
  state: 'done' | 'undone' | 'gone'
}

/** Advances the structural log by one recorded operation, returning whether
 *  anything's *done*-ness changed (i.e. whether the derived mirrors need
 *  recomputing).
 *
 *  Deliberately a transcription of `OperationLog`'s state machine rather than
 *  an independent reading of what undo "should" mean — the whole failure this
 *  fixes was two folds of the same log drifting apart, so the rules that
 *  matter here are whatever the client actually does, including the ones that
 *  look like details:
 *
 *   - undo/redo only ever move an entry authored by the same user, and only
 *     from the one state they're defined on. A redo of an entry that has since
 *     gone `gone` does nothing, exactly as `applyRedo` does nothing.
 *   - any non-meta operation makes its author's `undone` entries `gone`: a
 *     linear log can't branch, so acting after an undo puts that branch out of
 *     reach for good. Skipping this would let a late redo revive a layer every
 *     client has already written off.
 *
 *  Two client-side rules have no counterpart here because they can't touch a
 *  structural entry: gesture expansion by `strokeId` (strokes only) and
 *  opacity coalescing (`layer_opacity` only). */
function advanceStructuralLog(entries: StructuralEntry[], op: Operation): boolean {
  switch (op.type) {
    case 'operation_undo': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state === 'done' && e.op.userId === op.userId)
      if (!target) return false
      target.state = 'undone'
      return true
    }
    case 'operation_redo': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state === 'undone' && e.op.userId === op.userId)
      if (!target) return false
      target.state = 'done'
      return true
    }
    case 'operation_revoke': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state !== 'gone')
      if (!target) return false
      const wasDone = target.state === 'done'
      target.state = 'gone'
      return wasDone
    }
    default: {
      for (const entry of entries) {
        if (entry.state === 'undone' && entry.op.userId === op.userId) entry.state = 'gone'
      }
      if (!isStructuralOperation(op)) return false
      entries.push({ op, state: 'done' })
      return true
    }
  }
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

function deriveLayerIds(entries: readonly StructuralEntry[]): { aliveIds: Set<string>; deletedIds: Set<string> } {
  const aliveIds = new Set<string>(IMPLICIT_LAYER_IDS)
  const deletedIds = new Set<string>()
  for (const entry of entries) {
    if (entry.state !== 'done') continue
    switch (entry.op.type) {
      case 'layer_add':
      case 'folder_add':
        aliveIds.add(entry.op.layerId)
        break
      case 'layer_delete':
        for (const id of entry.op.layerIds) { aliveIds.delete(id); deletedIds.add(id) }
        break
      case 'layer_merge':
        aliveIds.add(entry.op.layerId)
        for (const s of entry.op.sources) { aliveIds.delete(s.id); deletedIds.add(s.id) }
        break
    }
  }
  return { aliveIds, deletedIds }
}

/** The client's own META_OP_TYPES (OperationLog.ts) — the operations that only
 *  ever move another entry between states, and so never count as their
 *  author "acting" for the undone → gone rule. */
const META_OP_TYPES = ['operation_undo', 'operation_redo', 'operation_revoke']

/** Builds a room's structural log from its resident operation log — the cold
 *  load's counterpart to `updateAliveIds` below, and the reason
 *  `operation_undo`/`_redo`/`_revoke` have to stay resident at any age (see
 *  RESIDENT_OP_TYPES). */
function buildStructuralLog(operations: readonly Operation[]): StructuralEntry[] {
  const entries: StructuralEntry[] = []
  for (const op of operations) advanceStructuralLog(entries, op)
  return entries
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
  if (!advanceStructuralLog(record.structuralLog, op)) return
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
): {
  room: Room; latestSnapshotSeq: number | null
  tailOperations: Operation[]; participants: Participant[]
  palette: string[]; frozen: boolean
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
  return {
    room: record.room,
    // The structure's own seq — what a history backfill anchors on. Null
    // means nobody has stored a snapshot for this room and the tail above is
    // its entire history.
    latestSnapshotSeq: record.layerStateSeq,
    tailOperations,
    participants: [...record.participants.values()],
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

export interface StoredLayerSnapshot {
  layerId: string
  seq: number
  data: Uint8Array
}

/** Every layer's newest stored snapshot, plus the room's stored layerState —
 *  what a joining client needs to reconstruct the canvas before replaying the
 *  operations no layer's coverage accounts for (#371).
 *
 *  `layers` is empty for a room nobody has baked yet, and may cover only some
 *  of the layers in `layerState`: a layer with no row here has no stored
 *  pixels and is rebuilt from its operations alone. That case is ordinary, not
 *  an error — it is exactly what #369 got wrong by treating a missing layer as
 *  an empty one.
 *
 *  Read from Postgres directly rather than the in-memory Map: unlike
 *  operations, snapshot pixel payloads are never cached in `RoomRecord`
 *  (#149 epic design — kept out of the hot, always-resident path since
 *  they're only needed at join time). */
export async function getLatestSnapshot(
  roomId: string,
): Promise<{ seq: number; layerState: unknown; layers: StoredLayerSnapshot[] } | null> {
  const [stored, rows] = await Promise.all([
    prisma.roomLayerState.findUnique({ where: { roomId }, select: { seq: true, state: true } }),
    // Newest first, so the first row seen for a layer is the one to keep —
    // retention leaves up to SNAPSHOT_RETENTION_PER_LAYER rows per layer.
    prisma.roomLayerSnapshot.findMany({
      where: { roomId }, orderBy: { seq: 'desc' }, select: { layerId: true, seq: true, data: true },
    }),
  ])
  if (!stored) return null

  const newestByLayer = new Map<string, StoredLayerSnapshot>()
  for (const row of rows) if (!newestByLayer.has(row.layerId)) newestByLayer.set(row.layerId, row)
  return { seq: stored.seq, layerState: stored.state, layers: [...newestByLayer.values()] }
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
