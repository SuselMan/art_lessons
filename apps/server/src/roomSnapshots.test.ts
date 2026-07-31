import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

import type { StrokeOperation } from '@grafetto/shared'

import {
  _flushPendingWrites, createRoom, deletableOperations, getCoveredSeq, getLatestSnapshot, getOperationsBefore,
  getRoomSnapshot, joinRoom, leaveRoom, recordOperation, saveSnapshot,
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

// (#372) The room-wide floor is gone from the join path. It used to withhold
// every operation at or below `latestSnapshotSeq`, which is how a layer missing
// from a bundle lost its content: no pixels, and no history either. What an
// operation is measured against now is its own layer's coverage.
describe('getRoomSnapshot — coverage is per layer', () => {
  async function coverLayer(roomId: string, layerId: string, seq: number) {
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, seq, {}, layers(layerId))
  }

  it('withholds a stroke its own layer stored pixels reach', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a')) // seq 1, layer-1
    await coverLayer(roomId, 'layer-1', SNAPSHOT_SEQ_INTERVAL)

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  // The #369 case, pinned: one layer being snapshotted must never speak for
  // another. `layer-2` has no stored pixels, so it keeps all of its history.
  it('keeps every operation of a layer nobody snapshotted', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    recordOperation(roomId, { ...stroke('b'), layerId: 'layer-2' })
    await coverLayer(roomId, 'layer-1', SNAPSHOT_SEQ_INTERVAL)

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['b'])
  })

  it('keeps a stroke made after its layer coverage', async () => {
    const roomId = makeRoom()
    await coverLayer(roomId, 'layer-1', SNAPSHOT_SEQ_INTERVAL)
    recordOperation(roomId, stroke('later')) // seq 1, but coverage is 100

    // Coverage is compared against the operation's own seq, and this room has
    // only ever numbered one operation — the guard is the comparison, not the
    // order things happened to be called in.
    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual([])

    for (let i = 0; i < SNAPSHOT_SEQ_INTERVAL; i++) recordOperation(roomId, stroke(`fill-${i}`))
    const tail = getRoomSnapshot(roomId)?.tailOperations ?? []
    expect(tail.every(op => (op.seq ?? 0) > SNAPSHOT_SEQ_INTERVAL)).toBe(true)
    expect(tail.length).toBeGreaterThan(0)
  })

  it('still trims to what a reconnecting client says it already has', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    recordOperation(roomId, stroke('b'))

    expect(getRoomSnapshot(roomId, 1)?.tailOperations.map(o => o.id)).toEqual(['b'])
  })

  it('points the client at the stored structure to restore from', async () => {
    const roomId = makeRoom()
    await coverLayer(roomId, 'layer-1', SNAPSHOT_SEQ_INTERVAL)

    expect(getRoomSnapshot(roomId)?.latestSnapshotSeq).toBe(SNAPSHOT_SEQ_INTERVAL)
  })

  it('reports no snapshot for a room nobody has baked', () => {
    const roomId = makeRoom()
    expect(getRoomSnapshot(roomId)?.latestSnapshotSeq).toBeNull()
  })
})

// (#372) Operations that paint *and* do something else are never withheld:
// the client needs their other half, so it skips their pixel effect itself
// against the coverage it restored. Withholding them here would take away structure
// (layer_merge) or another layer's share of the same operation
// (layer_transform).
describe('getRoomSnapshot — operations that are not coverable', () => {
  it('sends a layer_merge even when its own layer is covered past it', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'm', type: 'layer_merge', userId: 'owner-1', timestamp: 0, layerId: 'layer-1',
      name: 'Merged', sources: [{ id: 'layer-2', opacity: 1 }], parentId: null, index: 0,
    })
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['m'])
  })

  it('sends a layer_transform even when every layer it names is covered', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 't', type: 'layer_transform', userId: 'owner-1', timestamp: 0,
      transforms: [{ layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] }],
    })
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['t'])
  })

  it('sends structural operations at any age', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'layer-1', name: 'Layer',
    })
    mockPrisma.roomLayerSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, layers('layer-1'))

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['add'])
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

// (#372) Deletion of raw operations is still disabled (#289 §5 — a snapshot
// may not license destroying its own evidence until independently verified),
// but the rule it will be re-enabled *with* is pinned here rather than left to
// be reinvented. Getting this wrong is not a bug that shows up as a glitch: it
// is #369 made permanent.
describe('deletableOperations', () => {
  const covered = new Map([['layer-1', 200]])

  it('offers up a stroke its own layer stored pixels reach', () => {
    const ops = [{ ...stroke('a'), seq: 100 }]
    expect(deletableOperations(covered, ops).map(o => o.id)).toEqual(['a'])
  })

  it('spares a stroke made after that coverage', () => {
    const ops = [{ ...stroke('a'), seq: 300 }]
    expect(deletableOperations(covered, ops)).toEqual([])
  })

  // The whole point. A layer with no stored pixels has nothing standing in for
  // its history, however much of the room around it has been snapshotted.
  it('spares every operation of a layer nobody snapshotted', () => {
    const ops = [{ ...stroke('a'), seq: 1, layerId: 'layer-2' }]
    expect(deletableOperations(covered, ops)).toEqual([])
  })

  it('spares structural operations at any age', () => {
    const ops = [{
      id: 'add', type: 'layer_add' as const, userId: 'owner-1', timestamp: 0, seq: 1,
      layerId: 'layer-1', name: 'Layer',
    }]
    expect(deletableOperations(covered, ops)).toEqual([])
  })

  it('spares operations that paint and do something else as well', () => {
    const ops = [
      {
        id: 'm', type: 'layer_merge' as const, userId: 'owner-1', timestamp: 0, seq: 1,
        layerId: 'layer-1', name: 'Merged', sources: [{ id: 'layer-2', opacity: 1 }], parentId: null, index: 0,
      },
      {
        id: 't', type: 'layer_transform' as const, userId: 'owner-1', timestamp: 0, seq: 2,
        transforms: [{ layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number] }],
      },
    ]
    expect(deletableOperations(covered, ops)).toEqual([])
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
