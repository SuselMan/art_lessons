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
    roomSnapshot: { findFirst: vi.fn(), create: vi.fn() },
    operation: { findMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) => fn(client))
  return client
})
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('./rooms.js', () => ({
  flushRoomWrites: vi.fn(() => Promise.resolve()),
  RESIDENT_OP_TYPES: ['layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_owner_lock'],
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
  for (const model of [mockPrisma.room, mockPrisma.roomParticipant, mockPrisma.roomPalette, mockPrisma.roomSnapshot, mockPrisma.operation]) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  // Cleared, not reset — `$transaction` carries the implementation that runs
  // the callback against this same client, and mockReset would strip it.
  mockPrisma.$transaction.mockClear()
  mockPrisma.room.findUnique.mockResolvedValue(SOURCE)
  mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student' })
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  mockPrisma.roomSnapshot.findFirst.mockResolvedValue(null)
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

  it('keeps seq numbers, so the seeded snapshot still lines up with the tail', async () => {
    mockPrisma.roomSnapshot.findFirst.mockResolvedValue({
      id: 's1', roomId: SOURCE.id, seq: 40, layerState: { layers: {} }, data: Buffer.from('x'), hash: 'h', verification: 'verified',
    })
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 41 }), opRow({ id: 'op-b', seq: 42 })])

    await fork(buildApp('student'))

    expect(createdOps().map(o => o.seq)).toEqual([41, 42])
    expect(mockPrisma.roomSnapshot.create.mock.calls[0][0].data).toMatchObject({ seq: 40, hash: 'h' })
  })

  it('does not inherit the verification of the snapshot it copies', async () => {
    mockPrisma.roomSnapshot.findFirst.mockResolvedValue({
      id: 's1', roomId: SOURCE.id, seq: 40, layerState: {}, data: Buffer.from('x'), hash: 'h', verification: 'verified',
    })

    await fork(buildApp('student'))

    // Verified means "two clients independently baked this and agreed", and
    // it is what licenses deleting the operations a snapshot covers. Nobody
    // has baked anything in this room yet.
    expect(mockPrisma.roomSnapshot.create.mock.calls[0][0].data.verification).toBe('unverified')
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
    const undo = { id: 'op-u', type: 'operation_undo', userId: 'teacher', seq: 41, targetOpId: 'below-the-snapshot' } as unknown as Operation
    mockPrisma.roomSnapshot.findFirst.mockResolvedValue({
      id: 's1', roomId: SOURCE.id, seq: 40, layerState: {}, data: Buffer.from('x'), hash: 'h', verification: 'unverified',
    })
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-u', seq: 41, type: 'operation_undo', data: undo })])

    await fork(buildApp('student'))

    // The snapshot already contains the result of that undo having happened,
    // so the record has nothing left to do and no target to do it to.
    expect(createdOps()).toHaveLength(0)
  })

  it('asks for structural operations of any age, not just the tail', async () => {
    mockPrisma.roomSnapshot.findFirst.mockResolvedValue({
      id: 's1', roomId: SOURCE.id, seq: 40, layerState: {}, data: Buffer.from('x'), hash: 'h', verification: 'unverified',
    })

    await fork(buildApp('student'))

    // A fork missing the `layer_add` of a layer older than its snapshot would
    // draw that layer perfectly and then refuse to ever delete it
    // (`target_gone` — the shape of #291's bug), because the server rebuilds
    // aliveIds by folding over the log.
    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual([
      { seq: { gt: 40 } },
      { type: { in: ['layer_add', 'folder_add', 'layer_delete', 'layer_merge', 'layer_owner_lock'] } },
    ])
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
