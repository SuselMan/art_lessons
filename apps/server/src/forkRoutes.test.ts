import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

import { isForkSeedUser } from '@grafetto/shared'
import type { Operation } from '@grafetto/shared'

import { registerForkRoutes } from './forkRoutes.js'
import { residentOperationWhere } from './rooms.js'

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
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation((fn: (tx: typeof client) => Promise<unknown>) => fn(client))
  return client
})
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))
// Only `flushRoomWrites` is stubbed. `isCoveredBySnapshot` comes through for
// real on purpose (#372): a fork copies the operations stored pixels don't
// account for, and the whole point of that rule living in one function is that
// nothing gets to hold a second opinion about it — least of all its own test.
vi.mock('./rooms.js', async importActual => ({
  ...(await importActual<typeof import('./rooms.js')>()),
  flushRoomWrites: vi.fn(() => Promise.resolve()),
}))

const SOURCE = {
  id: 'lesson-1', name: 'Still life', paper: 'coarse', paperColor: '#f5f0e6',
  infinite: false, canvasWidth: 1240, canvasHeight: 1754,
  passwordHash: 'hashed', closedAt: new Date(), parentRoomId: null,
  accessMode: 'invite_only' as const,
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

/** (#418) The snapshot copy is a raw `INSERT ... SELECT` so the pixel blobs
 *  are rewritten inside Postgres instead of travelling through this process.
 *  Returns the statement text and the values bound into it. */
function snapshotCopy(): { sql: string; forkId: string; sourceIds: string[] } | null {
  const call = mockPrisma.$executeRaw.mock.calls[0]
  if (!call) return null
  const [strings, forkId, ids] = call as [readonly string[], string, Prisma.Sql]
  return { sql: strings.join(' ? '), forkId, sourceIds: ids.values as string[] }
}

/** Every operation row written for the fork. */
function createdOps(): Array<{ id: string; seq: number; type: string; userId: string; layerId: string | null; data: Operation }> {
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
  mockPrisma.$executeRaw.mockReset()
  mockPrisma.$executeRaw.mockResolvedValue(1)
  mockPrisma.room.findUnique.mockResolvedValue(SOURCE)
  mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student' })
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([])
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.operation.findMany.mockResolvedValue([])
  mockPrisma.room.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve({
      ...SOURCE, id: where.id, ownerId: 'student', parentRoomId: SOURCE.id,
      passwordHash: null, accessMode: 'anyone_with_link' as const,
    }))
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

  it('does not inherit the source room\'s access mode (#224)', async () => {
    // SOURCE is `invite_only`. Its invites are not copied — they were decided
    // for the lesson, not for a student's copy of it — so a fork that
    // inherited the mode would be a room with an empty allow-list: homework
    // the teacher would have to queue up to look at. Left unset, the column
    // default (`anyone_with_link`) applies.
    await fork(buildApp('student'))

    expect(createdRoom().accessMode).toBeUndefined()
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
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-a', seq: 41 }), opRow({ id: 'op-b', seq: 42 })])

    await fork(buildApp('student'))

    expect(createdOps().map(o => o.seq)).toEqual([41, 42])
    // seq and the pixels behind it travel together: the copy names the source
    // row, and the row carries its own seq across untouched.
    expect(snapshotCopy()!.sourceIds).toEqual(['s1'])
    expect(snapshotCopy()!.sql).toContain('s."seq"')
    expect(mockPrisma.roomLayerState.create.mock.calls[0][0].data).toMatchObject({ seq: 40 })
  })

  // (#371) Retention keeps up to two rows per layer; a fork only needs each
  // layer's current pixels, so an older row for a layer already seen is
  // dropped rather than copied alongside its successor.
  it('copies only the newest row per layer', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 200, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', layerId: 'layer-1', seq: 200 },
      { id: 's2', layerId: 'layer-1', seq: 100 },
      { id: 's3', layerId: 'layer-2', seq: 100 },
    ])

    await fork(buildApp('student'))

    // The superseded row for layer-1 is not named, so its blob is never even
    // read inside Postgres, let alone copied.
    expect(snapshotCopy()!.sourceIds).toEqual(['s1', 's3'])
  })

  // (#418) The whole reason this route stopped OOM-killing the server: a
  // layer's snapshot is megabytes of gzipped tiles whose only destination is
  // another row of the same table. Reading them here to write them back is
  // the picture making a round trip through the heap for nothing.
  it('never reads a snapshot blob into the process', async () => {
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])

    await fork(buildApp('student'))

    const select = mockPrisma.roomLayerSnapshot.findMany.mock.calls[0][0].select
    expect(select).toEqual({ id: true, layerId: true, seq: true })
    expect(select.data).toBeUndefined()
    // And the copy itself is one statement Postgres runs on its own rows.
    expect(snapshotCopy()!.sql).toContain('INSERT INTO "RoomLayerSnapshot"')
    expect(snapshotCopy()!.forkId).toBe(createdRoom().id)
    expect(mockPrisma.roomLayerSnapshot.createMany).not.toHaveBeenCalled()
  })

  it('does not inherit the verification of the snapshots it copies', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])

    await fork(buildApp('student'))

    // Verified means "two clients independently baked this and agreed", and
    // it is what licenses deleting the operations a snapshot covers. Nobody
    // has baked anything in this room yet — so the copy writes the literal
    // rather than selecting the source column.
    const { sql } = snapshotCopy()!
    expect(sql).toContain("'unverified'")
    expect(sql).not.toContain('s."verification"')
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

  // (#418) The window is asked of Postgres, not of the result. It is the same
  // `where` a cold load uses — one function, `residentOperationWhere`, so the
  // three consumers of "what a snapshot covers" cannot drift apart. Reading
  // the log first and filtering afterwards is what this route did until a
  // 22 603-operation lesson turned one student's fork into an OOM kill of the
  // whole server.
  it('asks Postgres for the resident window, not for the whole log', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])

    await fork(buildApp('student'))

    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where).toEqual(residentOperationWhere(SOURCE.id, new Map([['layer-1', 40]])))
    // Named explicitly as well, because the point is what it leaves in the
    // database: a stroke on a layer whose pixels are already snapshotted.
    expect(where.NOT.type.in).toContain('stroke')
    expect(where.NOT.OR).toEqual([{ layerId: 'layer-1', seq: { lte: 40 } }])
  })

  // The query is bounded per layer, never by one room-wide seq — the case
  // #369 got wrong and #372 fixed, and it has to survive the move into SQL.
  it('keeps a layer nobody snapshotted, however old its strokes are', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: {} })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])
    const onLayerTwo = { id: 'op-old', type: 'stroke', userId: 'teacher', seq: 5, layerId: 'layer-2' } as unknown as Operation
    mockPrisma.operation.findMany.mockResolvedValue([
      { ...opRow({ id: 'op-old', seq: 5, data: onLayerTwo }), layerId: 'layer-2' },
      opRow({ id: 'op-late', seq: 41 }),
    ])

    await fork(buildApp('student'))

    // A narrower query must not become a narrower fork. layer-2 has no
    // stored pixels standing in for anything, so its seq-5 stroke is the
    // only record that it was ever drawn.
    expect(createdOps().map(o => o.layerId).sort()).toEqual(['layer-1', 'layer-2'])
    // And the exclusion it was spared by is named per layer, not room-wide.
    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where.NOT.OR.map((c: { layerId: string }) => c.layerId)).toEqual(['layer-1'])
  })

  // (#498) The bug this exists to keep out. A fork used to run a second,
  // finer filter over what the query returned — `isCoveredBySnapshot`, which
  // withholds anything a stored layerState accounts for. That is the right
  // rule for a joining *client*: it seeds structure from that layerState, so
  // it needs no `layer_add` to know a layer is there. The server has no
  // layerState to seed from — it folds the stored log into `aliveIds`. So the
  // copy arrived missing every structural operation below `layerState.seq`
  // and disbelieved in layers it was visibly rendering: on Ilya's lesson the
  // `layer_merge` that created "grdients" sat at seq 11557 under a structure
  // at 22400, and deleting that layer answered `target_gone` — "another
  // participant already deleted this layer" — for good.
  it('copies a structural operation the stored structure already accounts for', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({
      roomId: SOURCE.id, seq: 22400, state: { items: { 'layer-1': {}, 'merged-1': {} } },
    })
    // The merged layer has pixels of its own, baked long after the merge that
    // created it — which is exactly what made the operation read as "covered"
    // and got it dropped.
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([
      { id: 's1', layerId: 'layer-1', seq: 22400 },
      { id: 's2', layerId: 'merged-1', seq: 22200 },
    ])
    const merge = {
      id: 'op-m', type: 'layer_merge', userId: 'teacher', seq: 11557, layerId: 'merged-1',
      name: 'grdients', index: 0, sources: [{ id: 'layer-9' }],
    } as unknown as Operation
    mockPrisma.operation.findMany.mockResolvedValue([opRow({ id: 'op-m', seq: 11557, type: 'layer_merge', data: merge })])

    await fork(buildApp('student'))

    // Whatever the window returns is what the fork stores. A row read out of
    // Postgres and then dropped on the way back in is the whole bug.
    expect(createdOps().map(o => o.type)).toEqual(['layer_merge'])
  })

  it('copies the whole log when the source has no snapshot yet', async () => {
    await fork(buildApp('student'))

    // Nothing is covered, so nothing is excluded — a room whose bakes never
    // ran forks in full rather than forking empty.
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
