import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Operation } from '@art-lessons/shared'

import { getRoomReplay } from './rooms.js'

// Same reasoning as roomSnapshots.test.ts: getRoomReplay reads straight from
// Postgres (never the in-memory Map), so it needs prisma mocked to run
// without a real database (CI has none).
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn() },
  roomParticipant: { findUnique: vi.fn() },
  operation: { findMany: vi.fn() },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

function dbRoom(overrides: Partial<{ ownerId: string }> = {}) {
  return {
    id: 'room-1', name: 'Still life', paper: 'rough', infinite: false,
    canvasWidth: 1240, canvasHeight: 1754, passwordHash: null, ownerId: 'owner-1',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  }
}

beforeEach(() => {
  mockPrisma.room.findUnique.mockReset()
  mockPrisma.roomParticipant.findUnique.mockReset()
  mockPrisma.operation.findMany.mockReset()
})

describe('getRoomReplay', () => {
  it('returns not_found for an unknown room, without querying operations', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(null)

    const result = await getRoomReplay('missing', 'user-1')

    expect(result).toEqual({ ok: false, error: 'not_found' })
    expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
  })

  it('grants the owner access without a RoomParticipant lookup', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(dbRoom())
    mockPrisma.operation.findMany.mockResolvedValueOnce([])

    const result = await getRoomReplay('room-1', 'owner-1')

    expect(result.ok).toBe(true)
    expect(mockPrisma.roomParticipant.findUnique).not.toHaveBeenCalled()
  })

  it('grants a past participant access even if nobody is currently live in the room', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(dbRoom())
    mockPrisma.roomParticipant.findUnique.mockResolvedValueOnce({ id: 'p1' })
    mockPrisma.operation.findMany.mockResolvedValueOnce([])

    const result = await getRoomReplay('room-1', 'student-1')

    expect(result.ok).toBe(true)
    expect(mockPrisma.roomParticipant.findUnique).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room-1', userId: 'student-1' } },
    })
  })

  it('rejects a caller who was never a participant and does not own the room', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(dbRoom())
    mockPrisma.roomParticipant.findUnique.mockResolvedValueOnce(null)

    const result = await getRoomReplay('room-1', 'stranger-1')

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
  })

  it('attaches each row\'s persisted createdAt to its Operation payload, in seq order', async () => {
    mockPrisma.room.findUnique.mockResolvedValueOnce(dbRoom())
    const op1: Operation = {
      id: 'op-1', userId: 'owner-1', timestamp: 111, seq: 1,
      type: 'layer_add', layerId: 'layer-2', name: 'Layer 2',
    }
    const op2: Operation = {
      id: 'op-2', userId: 'owner-1', timestamp: 222, seq: 2,
      type: 'layer_clear', layerId: 'layer-2',
    }
    mockPrisma.operation.findMany.mockResolvedValueOnce([
      { data: op1, createdAt: new Date('2026-07-01T00:00:01.000Z') },
      { data: op2, createdAt: new Date('2026-07-01T00:00:02.500Z') },
    ])

    const result = await getRoomReplay('room-1', 'owner-1')

    if (!result.ok) throw new Error('expected ok result')
    expect(result.operations).toEqual([
      { ...op1, createdAt: '2026-07-01T00:00:01.000Z' },
      { ...op2, createdAt: '2026-07-01T00:00:02.500Z' },
    ])
    expect(mockPrisma.operation.findMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1' }, orderBy: { seq: 'asc' },
    })
  })
})
