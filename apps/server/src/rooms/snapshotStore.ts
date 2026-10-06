import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { Operation } from '@grafetto/shared'

import { prisma } from '../db/prisma.js'
import { rooms, type RoomRecord } from './roomRegistry.js'
import { permitsSnapshotWatermark } from './firstSnapshotPolicy.js'
import { isCoveredBySnapshot, layerStateIdsOf } from './snapshotCoverage.js'
import { deriveLayerIds } from './structuralLog.js'
import { prepareSnapshotReplay } from './snapshotReplayLoader.js'

/** (#612) Where a room's client-baked snapshots live (#149 epic, per layer
 *  since #371): storing an upload after checking its structure against the
 *  server's own log (#462), keeping two per layer, and serving the index, the
 *  blobs and the history below them back to a joining client. What a snapshot
 *  *covers* is snapshotCoverage.ts; this is the storage around that rule.
 *  Moved out of rooms.ts. */

/** (#292) Drops what stored snapshots have made redundant, so a long live
 *  session stays as bounded as a cold load is. Without this the resident set
 *  only ever grows between restarts — the snapshot mechanism would bound
 *  rejoins while the process itself kept every stroke of a marathon room in
 *  the heap. Same window rule as rooms.ts's `loadResidentOperations`. */
function trimResidentOperations(record: RoomRecord): void {
  if (record.coveredSeqByLayer.size === 0) return
  record.operations = record.operations.filter(
    op => !isCoveredBySnapshot(
      record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds, undefined,
      id => record.operationsById.get(id)))
  record.operationsById = new Map(record.operations.map(op => [op.id, op]))
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
export async function loadCoveredSeqByLayer(roomId: string): Promise<Map<string, number>> {
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
  if (!permitsSnapshotWatermark(seq, record.nextSeq - 1, record.coveredSeqByLayer, [...layers.keys()])) {
    return { ok: false, error: 'not_a_checkpoint_seq' }
  }

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
    // see trimResidentOperations above.
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
  return (await prepareSnapshotReplay(roomId)).index
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
export async function getOperationsBefore(roomId: string, beforeSeq: number, limit: number, layerIds?: string[]): Promise<Operation[]> {
  // `orderBy: seq desc` + take, then reversed: "the newest `limit`
  // operations below beforeSeq" is a suffix, and the (roomId, seq) unique
  // index makes it an indexed range scan rather than a full-table sort.
  const needed = layerIds ? new Set(layerIds) : null
  if (needed) {
    // Structural/history metadata is small; close sources without downloading
    // any unrelated covered stroke population. The caller pins beforeSeq.
    const metadata = await prisma.operation.findMany({
      where: { roomId, seq: { lt: beforeSeq }, type: { in: ['layer_merge', 'layer_duplicate'] } }, select: { data: true },
    })
    let changed = true
    while (changed) {
      changed = false
      for (const row of metadata) {
        const op = row.data as Operation
        if ((op.type !== 'layer_merge' && op.type !== 'layer_duplicate') || !needed.has(op.layerId)) continue
        for (const id of op.type === 'layer_merge' ? op.sources.map(s => s.id) : [op.sourceId]) {
          if (!needed.has(id)) { needed.add(id); changed = true }
        }
      }
    }
  }
  const rows = await prisma.operation.findMany({
    where: { roomId, seq: { lt: beforeSeq }, ...(needed ? { OR: [
      { layerId: { in: [...needed] } },
      { type: { in: ['operation_undo', 'operation_redo', 'operation_revoke', 'paper_dry', 'layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_duplicate', 'layer_transform'] } },
    ] } : {}) },
    orderBy: { seq: 'desc' },
    take: limit,
    select: { data: true },
  })
  return rows.reverse().map(row => row.data as Operation)
}
