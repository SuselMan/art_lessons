import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { SNAPSHOT_SEQ_INTERVAL } from '@art-lessons/shared'

import type { StrokeOperation } from '@art-lessons/shared'

import {
  _flushPendingWrites, createRoom, getLatestSnapshot, getOperationsBefore, getRoomSnapshot, joinRoom, leaveRoom,
  recordOperation, saveSnapshot,
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
  roomSnapshot: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
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
  return { id, name: 'Still life', paper: 'rough' as const, infinite: false, canvasWidth: 1240, canvasHeight: 1754 }
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

beforeEach(() => {
  mockPrisma.roomSnapshot.create.mockReset()
  mockPrisma.roomSnapshot.findUnique.mockReset()
  mockPrisma.roomSnapshot.findFirst.mockReset()
  mockPrisma.operation.deleteMany.mockReset().mockResolvedValue({ count: 0 })
  // (#292) saveSnapshot now fires deleteSupersededSnapshots — default these
  // to "room has one snapshot, nothing to prune" so the tests above, which
  // are about saving rather than retention, stay unaffected by it.
  mockPrisma.roomSnapshot.findMany.mockReset().mockResolvedValue([])
  mockPrisma.roomSnapshot.deleteMany.mockReset().mockResolvedValue({ count: 0 })
})

afterEach(() => {
  delete process.env.SNAPSHOT_VERIFY_DETERMINISM
})

describe('saveSnapshot', () => {
  it('rejects a seq that is not a multiple of SNAPSHOT_SEQ_INTERVAL', async () => {
    const roomId = makeRoom()
    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL + 1, {}, gzippedPayload)
    expect(result).toEqual({ ok: false, error: 'not_a_checkpoint_seq' })
    expect(mockPrisma.roomSnapshot.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown room without touching Postgres', async () => {
    const result = await saveSnapshot('never-created', SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)
    expect(result).toEqual({ ok: false, error: 'unknown_room' })
    expect(mockPrisma.roomSnapshot.create).not.toHaveBeenCalled()
  })

  it('stores a first upload and bumps the room latestSnapshotSeq', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.create.mockResolvedValueOnce({})

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, { rootOrder: [] }, gzippedPayload)

    expect(result).toEqual({ ok: true, created: true })
    expect(getRoomSnapshot(roomId)?.latestSnapshotSeq).toBe(SNAPSHOT_SEQ_INTERVAL)
    expect(mockPrisma.roomSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roomId, seq: SNAPSHOT_SEQ_INTERVAL }),
    }))
  })

  it('silently dedups a duplicate upload when SNAPSHOT_VERIFY_DETERMINISM is off', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)

    expect(result).toEqual({ ok: true, created: false, hashMismatch: false })
    expect(mockPrisma.roomSnapshot.findUnique).not.toHaveBeenCalled()
  })

  it('flags a hash mismatch on a duplicate when SNAPSHOT_VERIFY_DETERMINISM is on', async () => {
    process.env.SNAPSHOT_VERIFY_DETERMINISM = 'true'
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })
    mockPrisma.roomSnapshot.findUnique.mockResolvedValueOnce({ hash: 'a-completely-different-hash' })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)

    expect(result).toEqual({ ok: true, created: false, hashMismatch: true })
  })

  it('does not flag a mismatch when the duplicate really is byte-identical', async () => {
    process.env.SNAPSHOT_VERIFY_DETERMINISM = 'true'
    const roomId = makeRoom()
    // Same payload both times -> saveSnapshot computes the same sha256 the
    // "already stored" row is stubbed to have.
    const matchingHash = createHash('sha256').update(gunzipSync(gzippedPayload)).digest('hex')
    mockPrisma.roomSnapshot.create.mockRejectedValueOnce({ code: 'P2002' })
    mockPrisma.roomSnapshot.findUnique.mockResolvedValueOnce({ hash: matchingHash })

    const result = await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)

    expect(result).toEqual({ ok: true, created: false, hashMismatch: false })
  })

  it('re-throws a non-duplicate error instead of swallowing it', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.create.mockRejectedValueOnce(new Error('connection reset'))

    await expect(saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)).rejects.toThrow('connection reset')
  })
})

describe('getLatestSnapshot', () => {
  it('returns null when the room has no snapshot yet', async () => {
    mockPrisma.roomSnapshot.findFirst.mockResolvedValueOnce(null)
    expect(await getLatestSnapshot(makeRoom())).toBeNull()
  })

  it('passes through the stored row', async () => {
    const row = { seq: SNAPSHOT_SEQ_INTERVAL, layerState: { rootOrder: ['a'] }, data: gzippedPayload }
    mockPrisma.roomSnapshot.findFirst.mockResolvedValueOnce(row)
    expect(await getLatestSnapshot(makeRoom())).toEqual(row)
  })
})

// 2026-07-19 (#206/#207) introduced idle-time pruning of operations already
// covered by a snapshot. 2026-07-25 (#289, reliable history spec v0.2 §5)
// disabled it: #287 proved in production that "a snapshot exists for this
// seq" does NOT imply the operations it covers are safely redundant — a
// snapshot baked from an already-corrupt client passes that test perfectly,
// and pruning then destroys the only evidence that could rebuild the room.
// Deletion now requires independent corroboration (see the engine's
// bakeLayerByFullReplay oracle and RoomSnapshot.verification), which isn't
// wired end-to-end yet — so nothing is deleted at all for now. See
// pruneOperationsBeforeSnapshot's own doc comment in rooms.ts.
describe('leaveRoom no longer prunes operations (#289 — pending snapshot verification)', () => {
  it('keeps operations even once a covering snapshot exists and the room goes idle', async () => {
    const roomId = makeRoom()
    recordOperation(roomId, stroke('a'))
    mockPrisma.roomSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)

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
    mockPrisma.roomSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload)

    // The owner leaves, but the student is still connected — not idle yet.
    leaveRoom(roomId, 'owner-1', `sock-${roomId}`)
    await _flushPendingWrites(roomId)

    expect(mockPrisma.operation.deleteMany).not.toHaveBeenCalled()
  })
})

// (#292) Moved here from rooms.test.ts when this stopped reading
// `record.operations`. The resident set is now a window around the latest
// snapshot; this endpoint serves exactly the operations that window
// excludes, so it has to query Postgres.
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
// by nothing.
describe('snapshot retention', () => {
  beforeEach(() => {
    mockPrisma.roomSnapshot.findMany.mockReset()
    mockPrisma.roomSnapshot.deleteMany.mockReset()
    mockPrisma.roomSnapshot.deleteMany.mockResolvedValue({ count: 0 })
  })

  async function saveAt(roomId: string, seq: number) {
    mockPrisma.roomSnapshot.create.mockResolvedValueOnce({})
    await saveSnapshot(roomId, seq, {}, gzippedPayload)
    // deleteSupersededSnapshots is fire-and-forget from saveSnapshot.
    await new Promise(resolve => setImmediate(resolve))
  }

  it('deletes everything below the second-newest snapshot', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.findMany.mockResolvedValueOnce([
      { seq: 300 }, { seq: 200 },
    ])
    await saveAt(roomId, 300)

    expect(mockPrisma.roomSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, seq: { lt: 200 } },
    })
  })

  it('keeps both when a room only has two — nothing is superseded yet', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.findMany.mockResolvedValueOnce([{ seq: 200 }, { seq: 100 }])
    await saveAt(roomId, 200)

    // Still issues the delete, but bounded below the older of the two, so it
    // matches nothing — simpler than special-casing, and the query is indexed.
    expect(mockPrisma.roomSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { roomId, seq: { lt: 100 } },
    })
  })

  it('deletes nothing at all when the room has fewer than two snapshots', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.findMany.mockResolvedValueOnce([{ seq: 100 }])
    await saveAt(roomId, 100)

    expect(mockPrisma.roomSnapshot.deleteMany).not.toHaveBeenCalled()
  })

  it('never fails the upload when pruning throws', async () => {
    const roomId = makeRoom()
    mockPrisma.roomSnapshot.findMany.mockRejectedValueOnce(new Error('db down'))
    mockPrisma.roomSnapshot.create.mockResolvedValueOnce({})

    await expect(saveSnapshot(roomId, SNAPSHOT_SEQ_INTERVAL, {}, gzippedPayload))
      .resolves.toEqual({ ok: true, created: true })
  })
})
