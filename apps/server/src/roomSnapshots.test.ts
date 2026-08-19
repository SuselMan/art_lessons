import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'

import type { Operation, StrokeOperation } from '@grafetto/shared'

import {
  _flushPendingWrites, createRoom, deletableOperations, getCoveredSeq, getLayerSnapshot, getOperationsBefore,
  getRoomSnapshot, getSnapshotIndex, joinRoom, leaveRoom, recordOperation, saveSnapshot, updateAliveIds,
} from './rooms.js'

// rooms.test.ts deliberately runs with no real Postgres — every DB call it
// touches (createRoom/recordOperation/etc.) is fire-and-forget, so a
// rejected connection is silently swallowed (see its own doc comment).
// saveSnapshot/getSnapshotIndex are different: they *await* Postgres
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

/** (#462) `recordOperation` alone is the raw writer — it stamps a seq and
 *  appends, and touches neither `structuralLog` nor the `aliveIds` mirror
 *  derived from it. socketHandlers.ts always calls `updateAliveIds` first, so
 *  any test whose subject reads the server's fold of the log (rather than only
 *  the operations array) has to do the same or it is exercising a room state
 *  production can never be in. */
function recordStructural(roomId: string, op: Operation): void {
  updateAliveIds(roomId, op)
  recordOperation(roomId, op)
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

  // (#462) The production incident this exists for: a client whose join-time
  // restore had not run yet uploaded makeInitialLayerState() over a lesson
  // that had merged 'layer-1' away hours earlier. The server believed it, and
  // from then on withheld every operation below that seq from every joiner —
  // the room read as wiped with all of it still in Postgres (room F4uw21Ob).
  it('refuses a layer state that omits a layer the log says is alive', async () => {
    const roomId = makeRoom()
    recordStructural(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'drawn-on',
      name: 'Work', parentId: null, index: 0,
    })

    const result = await saveSnapshot(
      roomId, SNAPSHOT_SEQ_INTERVAL,
      { items: { 'layer-1': {}, background: {} } }, layers('layer-1'),
    )

    expect(result).toEqual({ ok: false, error: 'stale_layer_state', missing: ['drawn-on'] })
    // Nothing at all is written — not the structure, and not the pixels that
    // came with it, which were baked by the same client out of the same buffers.
    expect(mockPrisma.roomLayerState.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.roomLayerSnapshot.create).not.toHaveBeenCalled()
    expect(getCoveredSeq(roomId, 'layer-1')).toBeUndefined()
  })

  // The reason the check is bounded by the upload's own seq rather than read
  // off the live mirror: a bake is compressed and posted, and a peer can add a
  // layer in that window. The uploader is right not to list it, and an honest
  // snapshot must not be lost to someone else's timing.
  it('accepts a layer state omitting a layer created after the baked seq', async () => {
    const roomId = makeRoom()
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    for (let i = 0; i < SNAPSHOT_SEQ_INTERVAL; i++) recordOperation(roomId, stroke(`s${i}`))
    // Lands at seq SNAPSHOT_SEQ_INTERVAL + 1 — past the boundary being baked.
    recordStructural(roomId, {
      id: 'late', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'too-new',
      name: 'Peer', parentId: null, index: 0,
    })

    const result = await saveSnapshot(
      roomId, SNAPSHOT_SEQ_INTERVAL,
      { items: { 'layer-1': {}, background: {} } }, layers('layer-1'),
    )

    expect(result.ok).toBe(true)
  })

  // Null rather than an empty set, same reasoning as layerStateIdsOf's own:
  // something unparseable is a claim about nothing, and this check has no
  // business turning it into a claim about everything.
  it('lets an unreadable layer state through rather than judging it', async () => {
    const roomId = makeRoom()
    recordStructural(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'drawn-on',
      name: 'Work', parentId: null, index: 0,
    })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, 'not a layer state', new Map())

    expect(result.ok).toBe(true)
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

describe('getSnapshotIndex', () => {
  it('returns null when the room has no stored structure yet', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce(null)
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([])
    expect(await getSnapshotIndex(makeRoom())).toBeNull()
  })

  it('returns the stored structure with each layer newest row', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 200, state: { rootOrder: ['a'] } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([
      { layerId: 'layer-1', seq: 200, hash: 'hash-1-200' },
      { layerId: 'layer-1', seq: 100, hash: 'hash-1-100' },
      { layerId: 'layer-2', seq: 100, hash: 'hash-2-100' },
    ])

    const index = await getSnapshotIndex(makeRoom())

    expect(index?.seq).toBe(200)
    expect(index?.layerState).toEqual({ rootOrder: ['a'] })
    expect(index?.layers).toEqual([
      { layerId: 'layer-1', seq: 200, hash: 'hash-1-200' },
      { layerId: 'layer-2', seq: 100, hash: 'hash-2-100' },
    ])
  })

  // (#474) Every entry here is a blob the client downloads and inflates before
  // handing it to the engine, which drops any layer it has no buffer for. A
  // deleted layer therefore costs bandwidth and peak memory to reach a no-op:
  // production room 2xKybCLI listed five layers for a three-layer room, ~20 MiB
  // of inflated pixels, on a join that came up showing one partial layer.
  it('omits layers the room structure no longer lists', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({
      seq: 4300,
      state: { items: { 'live-a': {}, 'live-b': {}, background: {} }, rootOrder: ['live-b', 'live-a', 'background'] },
    })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([
      { layerId: 'live-b', seq: 4300, hash: 'h-b' },
      { layerId: 'live-a', seq: 2200, hash: 'h-a' },
      { layerId: 'deleted-1', seq: 1200, hash: 'h-d1' },
      { layerId: 'deleted-2', seq: 500, hash: 'h-d2' },
    ])

    const index = await getSnapshotIndex(makeRoom())

    expect(index?.layers).toEqual([
      { layerId: 'live-b', seq: 4300, hash: 'h-b' },
      { layerId: 'live-a', seq: 2200, hash: 'h-a' },
    ])
  })

  // Fails open, and that direction is the whole point: an unreadable structure
  // that filtered everything out would withhold pixels the server has already
  // stopped sending operations for — #369 all over again. Listing a blob nobody
  // needs wastes memory; withholding one that is needed loses drawing.
  it('filters nothing when the stored structure cannot be read', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 200, state: { rootOrder: ['a'] } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([
      { layerId: 'layer-1', seq: 200, hash: 'h-1' },
      { layerId: 'whatever', seq: 100, hash: 'h-2' },
    ])

    const index = await getSnapshotIndex(makeRoom())

    expect(index?.layers).toHaveLength(2)
  })

  // (#427) The whole point of splitting the index off the blobs: a join used
  // to read every retained row's `data` — several MB each — out of Postgres
  // and drop all but the newest per layer in JS.
  it('never selects the pixel payload', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 100, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([])

    await getSnapshotIndex(makeRoom())

    const select = mockPrisma.roomLayerSnapshot.findMany.mock.calls[0][0].select
    expect(select).not.toHaveProperty('data')
    expect(select).toHaveProperty('hash')
  })

  // A layer in the structure with no stored pixels is ordinary — it is rebuilt
  // from its operations alone. Treating that absence as "the layer is empty" is
  // precisely what lost content in #369.
  it('reports a structure whose layers have no stored pixels at all', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValueOnce({ seq: 100, state: { rootOrder: ['a'] } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValueOnce([])

    const index = await getSnapshotIndex(makeRoom())

    expect(index?.seq).toBe(100)
    expect(index?.layers).toEqual([])
  })
})

describe('getLayerSnapshot', () => {
  it('addresses one row by its full (room, layer, seq) key', async () => {
    mockPrisma.roomLayerSnapshot.findUnique.mockResolvedValueOnce({ data: gzippedPayload, hash: 'h' })

    const row = await getLayerSnapshot('room-1', 'layer-1', 200)

    expect(row).toEqual({ data: gzippedPayload, hash: 'h' })
    expect(mockPrisma.roomLayerSnapshot.findUnique).toHaveBeenCalledWith({
      where: { roomId_layerId_seq: { roomId: 'room-1', layerId: 'layer-1', seq: 200 } },
      select: { data: true, hash: true },
    })
  })

  // Aged out of retention between the client reading the index and fetching
  // from it — an ordinary race, answered with a 404 the client falls back from.
  it('returns null for a triple that is not stored', async () => {
    mockPrisma.roomLayerSnapshot.findUnique.mockResolvedValueOnce(null)
    expect(await getLayerSnapshot('room-1', 'layer-1', 200)).toBeNull()
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

// (#372) An operation is withheld only when stored state accounts for
// *everything* it did. Pixels are covered per layer; structure is covered by
// the room's stored layerState at its own seq. The structural half was missing
// at first and cost a live bug the same day — a restored room replayed an
// ancient layer_merge over a layerState that already held its result, and the
// layer appeared once more in the panel per reload.
describe('getRoomSnapshot — structure has its own coverage', () => {
  async function coverAll(roomId: string, seq: number, ...layerIds: string[]) {
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    await saveSnapshot(roomId, seq, { rootOrder: [] }, layers(...layerIds))
  }

  it('withholds a structural operation the stored layerState already reflects', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'layer-1', name: 'Layer',
    })
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1')

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  it('sends a structural operation newer than the stored layerState', async () => {
    const roomId = makeRoom()
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1')
    for (let i = 0; i < SNAPSHOT_SEQ_INTERVAL + 1; i++) recordOperation(roomId, stroke(`fill-${i}`))
    recordOperation(roomId, {
      id: 'add-late', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'layer-2', name: 'Layer',
    })

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toContain('add-late')
  })

  it('sends every structural operation when nothing has been stored at all', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'layer-1', name: 'Layer',
    })

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['add'])
  })

  // A merge leaves both structure and pixels behind, so one half being covered
  // is not enough — withholding it would hand the client a layer with no
  // content and no way to rebuild it.
  it('still sends a layer_merge whose result layer has no stored pixels', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'm', type: 'layer_merge', userId: 'owner-1', timestamp: 0, layerId: 'merged',
      name: 'Merged', sources: [{ id: 'layer-1', opacity: 1 }], parentId: null, index: 0,
    })
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1') // 'merged' deliberately uncovered

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['m'])
  })

  // The case that got away and reached production the same afternoon: a merge
  // whose *result* was itself consumed by a later merge. That layer can never
  // get a snapshot — it stopped existing — so judging it by pixel coverage
  // alone kept this operation forever uncoverable, while the merge that
  // consumed it was withheld. The client rebuilt the dead layer and nothing
  // took it away again: an empty row at the top of the panel that the server
  // refused to delete, since it rightly held the layer destroyed.
  it('withholds a merge whose result the stored structure no longer lists', async () => {
    const roomId = makeRoom()
    recordStructural(roomId, {
      id: 'inner', type: 'layer_merge', userId: 'owner-1', timestamp: 0, layerId: 'consumed',
      name: 'Inner', sources: [{ id: 'layer-1', opacity: 1 }], parentId: null, index: 0,
    })
    recordStructural(roomId, {
      id: 'outer', type: 'layer_merge', userId: 'owner-1', timestamp: 0, layerId: 'final',
      name: 'Outer', sources: [{ id: 'consumed', opacity: 1 }], parentId: null, index: 0,
    })
    // The stored structure knows only the surviving layer — 'consumed' is gone.
    // 'background' is listed because the log says it is still alive, and #462
    // makes accounting for every live id the price of storing a structure at
    // all. It is what a real client sends anyway.
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { items: { final: {}, background: {} } }, layers('final'))

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  it('withholds a stroke made on a layer the stored structure no longer lists', async () => {
    const roomId = makeRoom()
    // Killed through the log rather than asserted out of thin air: #462 checks
    // a stored structure against the server's own fold, so a layer can only be
    // absent from one if the log says it died.
    recordStructural(roomId, {
      id: 'add', type: 'layer_add', userId: 'owner-1', timestamp: 0, layerId: 'consumed',
      name: 'Doomed', parentId: null, index: 0,
    })
    recordOperation(roomId, { ...stroke('gone'), layerId: 'consumed' })
    recordStructural(roomId, {
      id: 'del', type: 'layer_delete', userId: 'owner-1', timestamp: 0, layerIds: ['consumed'],
    })
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    await saveSnapshot(
      roomId, SNAPSHOT_SEQ_INTERVAL, { items: { 'layer-1': {}, background: {} } }, layers('layer-1'),
    )

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  // An unreadable structure must mean "nothing is known to be gone", never
  // "everything is" — the latter withholds the entire room.
  it('replays everything when the stored structure cannot be read', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, { ...stroke('keep'), layerId: 'whatever' })
    mockPrisma.roomLayerSnapshot.create.mockResolvedValue({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, 'not a layer state', layers('final'))

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['keep'])
  })

  it('withholds a layer_merge once both its structure and its pixels are stored', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 'm', type: 'layer_merge', userId: 'owner-1', timestamp: 0, layerId: 'merged',
      name: 'Merged', sources: [{ id: 'layer-1', opacity: 1 }], parentId: null, index: 0,
    })
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1', 'merged')

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
  })

  // Same reasoning per named layer: one uncovered entry keeps the whole
  // operation, since it cannot be sent for some layers and not others.
  it('still sends a layer_transform when any layer it names is uncovered', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 't', type: 'layer_transform', userId: 'owner-1', timestamp: 0,
      transforms: [
        { layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] },
        { layerId: 'layer-2', matrix: [1, 0, 0, 1, 0, 0] },
      ],
    })
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1')

    expect(getRoomSnapshot(roomId)?.tailOperations.map(o => o.id)).toEqual(['t'])
  })

  it('withholds a layer_transform once every layer it names is stored', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, {
      id: 't', type: 'layer_transform', userId: 'owner-1', timestamp: 0,
      transforms: [
        { layerId: 'layer-1', matrix: [1, 0, 0, 1, 0, 0] },
        { layerId: 'layer-2', matrix: [1, 0, 0, 1, 0, 0] },
      ],
    })
    await coverAll(roomId, SNAPSHOT_SEQ_INTERVAL, 'layer-1', 'layer-2')

    expect(getRoomSnapshot(roomId)?.tailOperations).toEqual([])
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
    joinRoom(roomId, 'student-1', 'Student', `sock-${roomId}-student`)
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
