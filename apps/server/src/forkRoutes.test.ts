import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { isForkSeedUser } from '@grafetto/shared'
import type { Operation } from '@grafetto/shared'

import { registerForkRoutes } from './forkRoutes.js'

// Route-level test, Prisma mocked — same shape as roomFolderRoutes.test.ts.
// `$transaction(fn)` hands the callback the same mock client, so every write
// below is observable on these spies.
const mockPrisma = vi.hoisted(() => {
  const client = {
    room: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    roomParticipant: { findUnique: vi.fn(), create: vi.fn() },
    roomPalette: { findUnique: vi.fn(), create: vi.fn() },
    roomLayerSnapshot: { findMany: vi.fn(), createMany: vi.fn() },
    roomLayerState: { findUnique: vi.fn(), create: vi.fn() },
    operation: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) => fn(client))
  return client
})
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('./rooms.js', () => ({
  flushRoomWrites: vi.fn(() => Promise.resolve()),
}))

const SOURCE = {
  id: 'lesson-1', name: 'Still life', paper: 'coarse', paperColor: '#f5f0e6',
  infinite: false, canvasWidth: 1240, canvasHeight: 1754,
  passwordHash: 'hashed', closedAt: new Date(), parentRoomId: null,
  ownerId: 'teacher', createdAt: new Date(),
}

function opRow(over: Partial<{ id: string; seq: number; type: string; data: Operation }>) {
  const id = over.id ?? 'op-1'
  const type = over.type ?? 'stroke'
  const data = over.data ?? ({ id, type, userId: 'teacher', seq: over.seq ?? 1, layerId: 'layer-1' } as unknown as Operation)
  return { id, seq: over.seq ?? 1, type, roomId: SOURCE.id, userId: 'teacher', layerId: 'layer-1', tool: null, data }
}

function buildApp(userId = 'student'): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async request => { request.userId = userId })
  registerForkRoutes(app)
  return app
}

function fork(app: FastifyInstance, id = SOURCE.id, payload?: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/rooms/${id}/fork`, payload: payload ?? {} })
}

/** The Room row handed to `room.create` inside the transaction. */
function createdRoom() {
  return mockPrisma.room.create.mock.calls[0][0].data
}

/** Every operation row written for the fork. */
function createdOps(): Array<{ id: string; seq: number; type: string; userId: string; data: Operation }> {
  const call = mockPrisma.operation.createMany.mock.calls[0]
  return call ? call[0].data : []
}

beforeEach(() => {
  const models = [
    mockPrisma.room, mockPrisma.roomParticipant, mockPrisma.roomPalette,
    mockPrisma.roomLayerSnapshot, mockPrisma.roomLayerState, mockPrisma.operation,
  ]
  for (const model of models) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  // Cleared, not reset — `$transaction` carries the implementation that runs
  // the callback against this same client, and mockReset would strip it.
  mockPrisma.$transaction.mockClear()
  mockPrisma.room.findUnique.mockResolvedValue(SOURCE)
  mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student' })
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([])
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.operation.findMany.mockResolvedValue([])
  mockPrisma.room.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({ ...SOURCE, id: where.id, ownerId: 'student', parentRoomId: SOURCE.id, passwordHash: null }))
})

describe('POST /api/rooms/:id/fork (#317)', () => {
  it('refuses a room the caller has never been in', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)

    const res = await fork(buildApp('stranger'))

    // Without this, knowing a room id is enough to pull a password-protected
    // lesson's content out through a copy of it.
    expect(res.statusCode).toBe(403)
    expect(mockPrisma.room.create).not.toHaveBeenCalled()
  })

  it('lets the owner fork their own room without a participant row', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)

    expect((await fork(buildApp('teacher'))).statusCode).toBe(201)
  })

  it('404s on a room that does not exist', async () => {
    mockPrisma.room.findUnique.mockResolvedValue(null)
    expect((await fork(buildApp())).statusCode).toBe(404)
  })

  it('gives the fork to whoever asked for it, and records where it came from', async () => {
    const res = await fork(buildApp('student'))

    expect(res.statusCode).toBe(201)
    const room = createdRoom()
    expect(room.ownerId).toBe('student')
    expect(room.parentRoomId).toBe(SOURCE.id)
    expect(room.id).not.toBe(SOURCE.id)
    // The canvas has to match or the seeded snapshot wouldn't line up with it.
    expect(room).toMatchObject({ paper: 'coarse', paperColor: '#f5f0e6', infinite: false, canvasWidth: 1240, canvasHeight: 1754 })
  })

  it('leaves the password and the closed flag behind', async () => {
    await fork(buildApp('student'))

    const room = createdRoom()
    // Inheriting the lesson's password would lock the student out of their
    // own work; inheriting `closedAt` would hand them a sheet they can't
    // draw on, which is the one thing a fork exists to give them.
    expect(room.passwordHash).toBeUndefined()
    expect(room.closedAt).toBeUndefined()
  })

  it('re-stamps inherited operations so nobody can undo them', async () => {
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 1 }), opRow({ id: 'op-b', seq: 2 })])

    await fork(buildApp('student'))

    const ops = createdOps()
    expect(ops).toHaveLength(2)
    for (const op of ops) {
      expect(isForkSeedUser(op.userId)).toBe(true)
      // The client replays `data`, not the columns — an identity rewritten in
      // only one of the two would leave the fork replaying as the teacher's
      // own log while looking reseated in the database.
      expect(isForkSeedUser(op.data.userId)).toBe(true)
      expect(op.data.id).toBe(op.id)
    }
  })

  it('gives inherited operations new ids, inside the payload too', async () => {
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 1 })])

    await fork(buildApp('student'))

    const [op] = createdOps()
    // Operation.id is a primary key across the whole table, not per room.
    expect(op.id).not.toBe('op-a')
    expect(op.data.id).not.toBe('op-a')
  })

  it('keeps seq numbers, so the seeded snapshots still line up with the tail', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: { layers: {} } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', roomId: SOURCE.id, layerId: 'layer-1', seq: 40, data: Buffer.from('x'), hash: 'h', verification: 'verified' },
    ])
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 41 }), opRow({ id: 'op-b', seq: 42 })])

    await fork(buildApp('student'))

    expect(createdOps().map(o => o.seq)).toEqual([41, 42])
    expect(mockPrisma.roomLayerSnapshot.createMany.mock.calls[0][0].data)
      .toMatchObject([{ layerId: 'layer-1', seq: 40, hash: 'h' }])
    expect(mockPrisma.roomLayerState.create.mock.calls[0][0].data).toMatchObject({ seq: 40 })
  })

  // (#371) Retention keeps up to two rows per layer; a fork only needs each
  // layer's current pixels, so an older row for a layer already seen is
  // dropped rather than copied alongside its successor.
  it('copies only the newest row per layer', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 200, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', roomId: SOURCE.id, layerId: 'layer-1', seq: 200, data: Buffer.from('new'), hash: 'h2', verification: 'unverified' },
      { id: 's2', roomId: SOURCE.id, layerId: 'layer-1', seq: 100, data: Buffer.from('old'), hash: 'h1', verification: 'unverified' },
      { id: 's3', roomId: SOURCE.id, layerId: 'layer-2', seq: 100, data: Buffer.from('two'), hash: 'h3', verification: 'unverified' },
    ])

    await fork(buildApp('student'))

    expect(mockPrisma.roomLayerSnapshot.createMany.mock.calls[0][0].data).toMatchObject([
      { layerId: 'layer-1', seq: 200 },
      { layerId: 'layer-2', seq: 100 },
    ])
  })

  it('does not inherit the verification of the snapshots it copies', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', roomId: SOURCE.id, layerId: 'layer-1', seq: 40, data: Buffer.from('x'), hash: 'h', verification: 'verified' },
    ])

    await fork(buildApp('student'))

    // Verified means "two clients independently baked this and agreed", and
    // it is what licenses deleting the operations a snapshot covers. Nobody
    // has baked anything in this room yet.
    expect(mockPrisma.roomLayerSnapshot.createMany.mock.calls[0][0].data[0].verification).toBe('unverified')
  })

  it('repoints an inherited undo at the copy of its target', async () => {
    const undo = { id: 'op-u', type: 'operation_undo', userId: 'teacher', seq: 3, targetOpId: 'op-a' } as unknown as Operation
    mockPrisma.operation.findMany.mockResolvedValue([
      opRow({ id: 'op-a', seq: 1 }),
      opRow({ id: 'op-u', seq: 3, type: 'operation_undo', data: undo }),
    ])

    await fork(buildApp('student'))

    const ops = createdOps()
    const copiedStroke = ops.find(o => o.type === 'stroke')!
    const copiedUndo = ops.find(o => o.type === 'operation_undo')!
    // Left unmapped this would point at a live operation in the *source*
    // room — an id that exists, in someone else's log.
    expect((copiedUndo.data as unknown as { targetOpId: string }).targetOpId).toBe(copiedStroke.id)
  })

  it('drops an inherited undo whose target stayed behind', async () => {
    const undo = { id: 'op-u', type: 'operation_undo', userId: 'teacher', seq: 41, targetOpId: 'never-copied' } as unknown as Operation
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-u', seq: 41, type: 'operation_undo', data: undo })])

    await fork(buildApp('student'))

    // Left unmapped it would point into the source room's log — an id that
    // exists, in someone else's room, which is worse than dangling.
    expect(createdOps()).toHaveLength(0)
  })

  // (#371) Coverage is per layer now, so "what a fork can safely skip" is a
  // per-layer question — one #372 answers. Until it does, copying everything
  // is the only choice that cannot silently drop content, which is exactly
  // what trusting a single room-wide snapshot seq did in #369.
  it('copies the whole log regardless of what the source has snapshotted', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', roomId: SOURCE.id, layerId: 'layer-1', seq: 40, data: Buffer.from('x'), hash: 'h', verification: 'unverified' },
    ])

    await fork(buildApp('student'))

    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ roomId: SOURCE.id })
  })

  it('copies the whole log when the source has no snapshot yet', async () => {
    await fork(buildApp('student'))

    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ roomId: SOURCE.id })
  })

  it('takes the source name unless given one', async () => {
    await fork(buildApp('student'))
    expect(createdRoom().name).toBe('Still life')

    mockPrisma.room.create.mockClear()
    await fork(buildApp('student'), SOURCE.id, { name: '  Homework 3  ' })
    expect(createdRoom().name).toBe('Homework 3')
  })

  it('carries the palette across when the source has one', async () => {
    mockPrisma.roomPalette.findUnique.mockResolvedValue({ colors: ['#111111', '#222222'] })

    await fork(buildApp('student'))

    expect(mockPrisma.roomPalette.create).toHaveBeenCalledWith({
      data: { roomId: createdRoom().id, colors: ['#111111', '#222222'] },
    })
  })

  it('writes everything in one transaction', async () => {
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 1 })])

    await fork(buildApp('student'))

    // A fork that existed with half its content would read as a lesson
    // somebody had already erased most of.
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })
})
