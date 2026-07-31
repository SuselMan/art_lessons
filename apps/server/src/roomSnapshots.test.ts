import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

import type { StrokeOperation } from '@grafetto/shared'

import {
  _flushPendingWrites, createRoom, getCoveredSeq, getLatestSnapshot, getOperationsBefore, getRoomSnapshot, joinRoom,
  leaveRoom, recordOperation, saveSnapshot,
} from './rooms.js'

// rooms.test.ts deliberately runs with no real Postgres — every DB call it
// touches (createRoom/recordOperation/etc.) is fire-and-forget, so a
// rejected connection is silently swallowed (see its own doc comment).
// saveSnapshot/getLatestSnapshot are different: they *await* Postgres
// directly (the snapshot payload is never cached in RoomRecord — see
// rooms.ts's own doc comments), so exercising them without a real DB (CI has
// none — see .github/workflows/ci.yml) needs prisma mocked. Scoped to this
// file only, so rooms.test.ts's all-real style is untouched. `operation` is
// here too (not a separate file) for the leaveRoom-prunes-on-idle tests
// below, which need to assert *whether* deleteMany fired — a fire-and-forget
// call rooms.test.ts's plain style has no way to observe.
const mockPrisma = vi.hoisted(() => ({
  roomLayerSnapshot: {
    create: vi.fn(),
    createMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    groupBy: vi.fn(),
  },
  roomLayerState: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  operation: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

let nextRoomId = 0
function freshRoomId(): string {
  return `snapshot-room-${nextRoomId++}`
}

function roomDraft(id: string) {
  return { id, name: 'Still life', paper: 'coarse' as const, infinite: false, canvasWidth: 1240, canvasHeight: 1754 }
}

function makeRoom(): string {
  const roomId = freshRoomId()
  createRoom(roomDraft(roomId), undefined, 'owner-1', 'Teacher', `sock-${roomId}`)
  return roomId
}

function stroke(id: string): StrokeOperation {
  return {
    id, type: 'stroke', userId: 'owner-1', timestamp: 0,
    layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

const gzippedPayload = gzipSync(Buffer.from('fake tile pixels'))

/** (#371) The upload shape: layerId -> one gzipped encodeLayerTiles payload. */
function layers(...layerIds: string[]): Map<string, Uint8Array> {
  return new Map(layerIds.map(layerId => [layerId, gzippedPayload]))
}

beforeEach(() => {
  mockPrisma.roomLayerSnapshot.create.mockReset()
  mockPrisma.roomLayerSnapshot.findUnique.mockReset()
  // (#292) saveSnapshot fires deleteSupersededSnapshots — default these to
  // "this layer has one snapshot, nothing to prune" so the tests about saving
  // stay unaffected by retention.
  mockPrisma.roomLayerSnapshot.findMany.mockReset().mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  mockPrisma.roomLayerState.findUnique.mockReset().mockResolvedValue(null)
  mockPrisma.roomLayerState.upsert.mockReset().mockResolvedValue({})
  mockPrisma.operation.deleteMany.mockReset().mockResolvedValue({ count: 0 })
})

afterEach(() => {
  delete process.env.SNAPSHOT_VERIFY_DETERMINISM
})

describe('saveSnapshot', () => {
  it('rejects a seq that is not a multiple of SNAPSHOT_SEQ_INTERVAL', async () => {
    const roomId = makeRoom()
    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL + 1, {}, layers('layer-1'))
    expect(result).toEqual({ ok: false, error: 'not_a_checkpoint_seq' })
    expect(mockPrisma.roomLayerSnapshot.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown room without touching Postgres', async () => {
    const result = await saveSnapshot('never-created', SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))
    expect(result).toEqual({ ok: false, error: 'unknown_room' })
    expect(mockPrisma.roomLayerSnapshot.create).not.toHaveBeenCalled()
  })

  it('stores a first upload and advances that layer coveredSeq', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { rootOrder: [] }, layers('layer-1'))

    expect(result).toEqual({ ok: true, created: ['layer-1'], duplicated: [], mismatched: [] })
    expect(getCoveredSeq(roomId, 'layer-1')).toBe(SNAPSHOT_SEQ_INTERVAL)
    expect(mockPrisma.roomLayerSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roomId, layerId: 'layer-1', seq: SNAPSHOT_SEQ_INTERVAL }),
    }))
  })

  // The point of the epic: a bake carries the layers that changed, and a layer
  // left out keeps whatever coverage it already had rather than being read as
  // empty (#369).
  it('leaves an unmentioned layer uncovered instead of inferring anything', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})

    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getCoveredSeq(roomId, 'layer-1')).toBe(SNAPSHOT_SEQ_INTERVAL)
    expect(getCoveredSeq(roomId, 'layer-2')).toBeUndefined()
  })

  it('stores several layers in one upload, each as its own row', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1', 'layer-2'))

    expect(result.ok && result.created).toEqual(['layer-1', 'layer-2'])
    expect(mockPrisma.roomLayerSnapshot.create).toHaveBeenCalledTimes(2)
  })

  it('accepts an upload carrying no layers at all — structure alone still lands', async () => {
    const roomId = makeRoom()

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { rootOrder: ['a'] }, new Map())

    expect(result).toEqual({ ok: true, created: [], duplicated: [], mismatched: [] })
    expect(mockPrisma.roomLayerSnapshot.create).not.toHaveBeenCalled()
    expect(mockPrisma.roomLayerState.upsert).toHaveBeenCalled()
  })

  it('silently dedups a duplicate layer when SNAPSHOT_VERIFY_DETERMINISM is off', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(result).toEqual({ ok: true, created: [], duplicated: ['layer-1'], mismatched: [] })
    expect(mockPrisma.roomLayerSnapshot.findUnique).not.toHaveBeenCalled()
  })

  // A duplicate proves the row exists at this seq just as well as a fresh
  // insert does — a room that re-entered memory with rows already stored would
  // otherwise under-claim its own coverage.
  it('advances coveredSeq on a duplicate too, not only on a fresh insert', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })

    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getCoveredSeq(roomId, 'layer-1')).toBe(SNAPSHOT_SEQ_INTERVAL)
  })

  it('flags a hash mismatch on a duplicate when SNAPSHOT_VERIFY_DETERMINISM is on', async () => {
    process.env.SNAPSHOT_VERIFY_DETERMINISM = 'true'
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })
    mockPrisma.roomLayerSnapshot.findUnique.mockResolvedValueOnce({ hash: 'a-completely-different-hash' })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(result).toEqual({ ok: true, created: [], duplicated: ['layer-1'], mismatched: ['layer-1'] })
  })

  it('does not flag a mismatch when the duplicate really is byte-identical', async () => {
    process.env.SNAPSHOT_VERIFY_DETERMINISM = 'true'
    const roomId = makeRoom()
    // Same payload both times -> saveSnapshot computes the same sha256 the
    // "already stored" row is stubbed to have.
    const matchingHash = createHash('sha256').update(gunzipSync(gzippedPayload)).digest('hex')
    mockPrisma.roomLayerSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })
    mockPrisma.roomLayerSnapshot.findUnique.mockResolvedValueOnce({ hash: matchingHash })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(result).toEqual({ ok: true, created: [], duplicated: ['layer-1'], mismatched: [] })
  })

  it('re-throws a non-duplicate error instead of swallowing it', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockRejectedValueOnce(new Error('connection reset'))

    await expect(saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1')))
      .rejects.toThrow('connection reset')
  })
})

// (#371) layerState is one row per room, last write wins — it no longer has to
// travel atomically with pixels, since every operation that changes it is
// structural and structural operations are resident for a room's whole life.
describe('saveSnapshot — stored layerState', () => {
  it('upserts the structure at the seq it was baked for', async () => {
    const roomId = makeRoom()
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { rootOrder: ['a'] }, new Map())

    expect(mockPrisma.roomLayerState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId },
      create: { roomId, seq: SNAPSHOT_SEQ_INTERVAL, state: { rootOrder: ['a'] } },
      update: { seq: SNAPSHOT_SEQ_INTERVAL, state: { rootOrder: ['a'] } },
    }))
  })

  // Uploads from several clients race by nature, and an older one landing last
  // must not walk the room's structure backward.
  it('ignores an out-of-order arrival older than what is already stored', async () => {
    const roomId = makeRoom()
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL * 2, { rootOrder: ['new'] }, new Map())
    mockPrisma.roomLayerState.upsert.mockClear()

    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { rootOrder: ['old'] }, new Map())

    expect(mockPrisma.roomLayerState.upsert).not.toHaveBeenCalled()
  })
})

describe('getLatestSnapshot', () => {
  it('returns null when the room has no stored structure yet', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce(null)
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([])
    expect(await getLatestSnapshot(makeRoom())).toBeNull()
  })

  it('returns the stored structure with each layer newest row', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 200, state: { rootOrder: ['a'] } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([
      { layerId: 'layer-1', seq: 200, data: gzippedPayload },
      { layerId: 'layer-1', seq: 100, data: gzippedPayload },
      { layerId: 'layer-2', seq: 100, data: gzippedPayload },
    ])

    const snapshot = await getLatestSnapshot(makeRoom())

    expect(snapshot?.seq).toBe(200)
    expect(snapshot?.layerState).toEqual({ rootOrder: ['a'] })
    expect(snapshot?.layers).toEqual([
      { layerId: 'layer-1', seq: 200, data: gzippedPayload },
      { layerId: 'layer-2', seq: 100, data: gzippedPayload },
    ])
  })

  // A layer in the structure with no stored pixels is ordinary — it is rebuilt
  // from its operations alone. Treating that absence as "the layer is empty" is
  // precisely what lost content in #369.
  it('reports a structure whose layers have no stored pixels at all', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 100, state: { rootOrder: ['a'] } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([])

    const snapshot = await getLatestSnapshot(makeRoom())

    expect(snapshot?.seq).toBe(100)
    expect(snapshot?.layers).toEqual([])
  })
})

// (#371) The room-wide floor is gone from the join path. It used to withhold
// every operation at or below `latestSnapshotSeq`, which is how a layer missing
// from a bundle lost its content: no pixels, and no history either.
describe('getRoomSnapshot — no room-wide snapshot floor', () => {
  it('hands a fresh joiner the whole tail even once snapshots exist', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['a'])
  })

  it('still trims to what a reconnecting client says it already has', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    recordOperation(roomId, stroke('b'))

    expect(getRoomSnapshot(roomId, 1)?.tailOperations.map(o => o.id)).toEqual(['b'])
  })

  // Advertising one would have a client restore pixels and then replay the very
  // operations that produced them. Restored per-layer by #374.
  it('advertises no whole-room snapshot to restore from', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getRoomSnapshot(roomId)?.latestSnapshotSeq).toBeNull()
  })
})

// 2026-07-19 (#206/#207) introduced idle-time pruning of operations already
// covered by a snapshot. 2026-07-25 (#289, reliable history spec v0.2 §5)
// disabled it: #287 proved in production that "a snapshot exists for this
// seq" does NOT imply the operations it covers are safely redundant — a
// snapshot baked from an already-corrupt client passes that test perfectly,
// and pruning then destroys the only evidence that could rebuild the room.
// Deletion now requires independent corroboration (see the engine's
// bakeLayerByFullReplay oracle and RoomLayerSnapshot.verification), which
// isn't wired end-to-end yet — so nothing is deleted at all for now. See
// pruneOperationsBeforeSnapshot's own doc comment in rooms.ts.
describe('leaveRoom no longer prunes operations (#289 — pending snapshot verification)', () => {
  it('keeps operations even once a covering snapshot exists and the room goes idle', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    leaveRoom(roomId, 'owner-1', `sock-${roomId}`)
    // Two flushes, as before: deferred eviction chains onto a *new* per-room
    // write once the already-pending ones settle (see leaveRoom's doc
    // comment) — flushing twice makes sure a prune would have landed by now
    // if one were still being issued at all.
    await _flushPendingWrites(roomId)
    await _flushPendingWrites(roomId)

    expect(mockPrisma.operation.deleteMany).not.toHaveBeenCalled()
  })

  it('does nothing when the room has never crossed a checkpoint (no covering snapshot yet)', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))

    leaveRoom(roomId, 'owner-1', `sock-${roomId}`)
    await _flushPendingWrites(roomId)

    expect(mockPrisma.operation.deleteMany).not.toHaveBeenCalled()
  })

  it('does not prune while another participant is still in the room', async () => {
    const roomId = makeRoom()
    joinRoom(roomId, 'student-1', 'Student', undefined, `sock-${roomId}-student`)
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    // The owner leaves, but the student is still connected — not idle yet.
    leaveRoom(roomId, 'owner-1', `sock-${roomId}`)
    await _flushPendingWrites(roomId)

    expect(mockPrisma.operation.deleteMany).not.toHaveBeenCalled()
  })
})

// (#292) Moved here from rooms.test.ts when this stopped reading
// `record.operations`. The resident set is a window; this endpoint serves
// exactly the operations that window excludes, so it has to query Postgres.
describe('getOperationsBefore', () => {
  beforeEach(() => { mockPrisma.operation.findMany.mockReset() })

  it('asks for the newest `limit` operations strictly below beforeSeq', async () => {
    mockPrisma.operation.findMany.mockResolvedValueOnce([])
    await getOperationsBefore('room-1', 400, 100)

    expect(mockPrisma.operation.findMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', seq: { lt: 400 } },
      orderBy: { seq: 'desc' },
      take: 100,
      select: { data: true },
    })
  })

  // The client merges every page at the very front of its log
  // (OperationLog.prependHistorical), so a page must arrive oldest-first
  // even though the query that produced it walks backward.
  it('returns the page oldest-first, reversing the descending query', async () => {
    mockPrisma.operation.findMany.mockResolvedValueOnce([
      { data: { id: 'c', seq: 3 } }, { data: { id: 'b', seq: 2 } }, { data: { id: 'a', seq: 1 } },
    ])
    expect((await getOperationsBefore('room-1', 4, 3)).map(o => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty page once backfill reaches the start of stored history', async () => {
    mockPrisma.operation.findMany.mockResolvedValueOnce([])
    expect(await getOperationsBefore('room-1', 1, 100)).toEqual([])
  })

  // No in-memory record is consulted any more, so a room this process has
  // never loaded is answerable — it simply has no rows.
  it('answers for a room that was never loaded into memory', async () => {
    mockPrisma.operation.findMany.mockResolvedValueOnce([{ data: { id: 'a', seq: 1 } }])
    expect((await getOperationsBefore('never-loaded', 100, 500)).map(o => o.id)).toEqual(['a'])
  })
})

// (#292) Nothing ever deleted a superseded snapshot: prod held 93 rows /
// 117 MB on 2026-07-26, 65 of them older than their room's newest and read
// by nothing. (#371) Counted per layer — two room-wide rows would be two
// *layers*, discarding every other layer's only copy.
describe('snapshot retention', () => {
  beforeEach(() => {
    mockPrisma.roomLayerSnapshot.findMany.mockReset()
    mockPrisma.roomLayerSnapshot.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  })

  async function saveAt(roomId: string, seq: number, layerIds = ['layer-1']) {
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    await saveSnapshot(roomId, seq, {}, layers(...layerIds))
    // deleteSupersededSnapshots is fire-and-forget from saveSnapshot.
    await new Promise(resolve => setImmediate(resolve))
  }

  it('deletes everything below this layer second-newest snapshot', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([{ seq: 300 }, { seq: 200 }])
    await saveAt(roomId, 300)

    expect(mockPrisma.roomLayerSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, layerId: 'layer-1', seq: { lt: 200 } },
    })
  })

  it('keeps both when a layer only has two — nothing is superseded yet', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([{ seq: 200 }, { seq: 100 }])
    await saveAt(roomId, 200)

    // Still issues the delete, but bounded below the older of the two, so it
    // matches nothing — simpler than special-casing, and the query is indexed.
    expect(mockPrisma.roomLayerSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, layerId: 'layer-1', seq: { lt: 100 } },
    })
  })

  it('deletes nothing at all when the layer has fewer than two snapshots', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([{ seq: 100 }])
    await saveAt(roomId, 100)

    expect(mockPrisma.roomLayerSnapshot.deleteMany).not.toHaveBeenCalled()
  })

  // The bug a room-wide count would have: pruning is scoped to the layer that
  // was just written, never to "the room's newest two rows".
  it('prunes each uploaded layer against its own history', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.findMany
      .mockResolvedValueOnce([{ seq: 300 }, { seq: 200 }])
      .mockResolvedValueOnce([{ seq: 300 }, { seq: 100 }])
    await saveAt(roomId, 300, ['layer-1', 'layer-2'])

    expect(mockPrisma.roomLayerSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, layerId: 'layer-1', seq: { lt: 200 } },
    })
    expect(mockPrisma.roomLayerSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, layerId: 'layer-2', seq: { lt: 100 } },
    })
  })

  it('never fails the upload when pruning throws', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.findMany.mockRejectedValueOnce(new Error('db down'))
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})

    await expect(saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1')))
      .resolves.toEqual({ ok: true, created: ['layer-1'], duplicated: [], mismatched: [] })
  })
})
