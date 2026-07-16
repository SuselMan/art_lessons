import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { SNAPSHOT_SEQ_INTERVAL } from '@art-lessons/shared'

import { createRoom, getLatestSnapshot, getRoomSnapshot, saveSnapshot } from './rooms.js'

// rooms.test.ts deliberately runs with no real Postgres — every DB call it
// touches (createRoom/recordOperation/etc.) is fire-and-forget, so a
// rejected connection is silently swallowed (see its own doc comment).
// saveSnapshot/getLatestSnapshot are different: they *await* Postgres
// directly (the snapshot payload is never cached in RoomRecord — see
// rooms.ts's own doc comments), so exercising them without a real DB (CI has
// none — see .github/workflows/ci.yml) needs prisma mocked. Scoped to this
// file only, so rooms.test.ts's all-real style is untouched.
const mockPrisma = vi.hoisted(() => ({
  roomSnapshot: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
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

const gzippedPayload = gzipSync(Buffer.from('fake tile pixels'))

beforeEach(() => {
  mockPrisma.roomSnapshot.create.mockReset()
  mockPrisma.roomSnapshot.findUnique.mockReset()
  mockPrisma.roomSnapshot.findFirst.mockReset()
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
