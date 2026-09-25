import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

import { forkSeedUserId, isForkSeedUser } from '@grafetto/shared'
import type { Operation } from '@grafetto/shared'

import { copiedOperationId, registerForkRoutes } from './forkRoutes.js'
import { residentOperationWhere } from './rooms.js'

// Route-level test, Prisma mocked — same shape as roomFolderRoutes.test.ts.
// `$transaction(fn)` hands the callback the same mock client, so every write
// below is observable on these spies.
const mockPrisma = vi.hoisted(() => {
  const client = {
    room: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn() },
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
const { flushRoomWrites } = await import('./rooms.js')

const SOURCE = {
  id: 'lesson-1', name: 'Still life', paper: 'coarse', paperColor: '#f5f0e6',
  infinite: false, canvasWidth: 1240, canvasHeight: 1754,
  passwordHash: 'hashed', closedAt: new Date(), parentRoomId: null,
  accessMode: 'invite_only' as const, enabledTools: ['pencil'],
  lessonId: null, boardOrder: 0, activeBoardId: null,
  ownerId: 'teacher', createdAt: new Date(),
}

// (#568) A second board of SOURCE. Nothing social of its own — no password,
// no closedAt — because those are the lesson's (ADR 014 §2).
const BOARD_2 = {
  ...SOURCE, id: 'board-2', name: 'Still life 2', lessonId: SOURCE.id, boardOrder: 1,
  passwordHash: null, closedAt: null, enabledTools: [],
}

type OpRow = { id: string; seq: number; type: string; roomId: string; userId: string; layerId: string | null; tool: string | null; data: Operation }

function opRow(over: Partial<{ id: string; seq: number; type: string; roomId: string; layerId: string; data: Operation }>): OpRow {
  const id = over.id ?? 'op-1'
  const type = over.type ?? 'stroke'
  const layerId = over.layerId ?? 'layer-1'
  const data = over.data ?? ({ id, type, userId: 'teacher', seq: over.seq ?? 1, layerId } as unknown as Operation)
  return { id, seq: over.seq ?? 1, type, roomId: over.roomId ?? SOURCE.id, userId: 'teacher', layerId, tool: null, data }
}

/** (#568) The route asks the operation table twice per board: once for the
 *  ids the resident window admits, then for the full rows of the few that
 *  name another operation. Answer both from one list, the way Postgres
 *  would. */
function givenOperations(rows: OpRow[]): void {
  mockPrisma.operation.findMany.mockImplementation(({ where }: { where: { roomId?: string; id?: { in: string[] } } }) => {
    if (where.id?.in) return Promise.resolve(rows.filter(r => where.id!.in.includes(r.id)))
    return Promise.resolve(rows.filter(r => r.roomId === where.roomId))
  })
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

/** The Room rows handed to `room.create` inside the transaction, in order —
 *  the lesson (or standalone copy) first, then each copied board. */
function createdRooms() {
  return mockPrisma.room.create.mock.calls.map(call => call[0].data)
}
function createdRoom() {
  return createdRooms()[0]
}

/** Every raw statement, as text plus the values bound into it. Both copies
 *  — pixels (#418) and log (#568) — are `INSERT ... SELECT`s that rewrite
 *  rows inside Postgres, told apart by the table they write. */
function rawCopies(table: 'RoomLayerSnapshot' | 'Operation'): Array<{ sql: string; values: unknown[] }> {
  return mockPrisma.$executeRaw.mock.calls
    .map(call => {
      const [strings, ...values] = call as [readonly string[], ...unknown[]]
      // `?` where a value is bound, whitespace collapsed, so an assertion
      // can quote the statement the way it reads.
      return { sql: strings.join('?').replace(/\s+/g, ' ').trim(), values }
    })
    .filter(copy => copy.sql.includes(`INSERT INTO "${table}"`))
}

/** (#418) The snapshot copy: the statement text, the fork it writes into and
 *  the source rows it names. First board only, which is all the single-room
 *  tests have. */
function snapshotCopy(): { sql: string; forkId: string; sourceIds: string[] } | null {
  const [copy] = rawCopies('RoomLayerSnapshot')
  if (!copy) return null
  return { sql: copy.sql, forkId: copy.values[0] as string, sourceIds: (copy.values[1] as Prisma.Sql).values as string[] }
}

/** (#568) The log copies: one per board (per chunk), each naming the fork it
 *  writes into, the seed user it stamps and the source rows it copies. */
function operationCopies(): Array<{ sql: string; forkId: string; seedUserId: string; sourceIds: string[] }> {
  return rawCopies('Operation').map(copy => ({
    sql: copy.sql,
    forkId: copy.values[0] as string,
    seedUserId: copy.values[2] as string,
    sourceIds: (copy.values[copy.values.length - 1] as Prisma.Sql).values as string[],
  }))
}

/** Every operation row this process wrote itself — the referencing ones. */
function createdOps(): Array<{ id: string; seq: number; type: string; userId: string; layerId: string | null; data: Operation }> {
  return mockPrisma.operation.createMany.mock.calls.flatMap(call => call[0].data)
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
  vi.mocked(flushRoomWrites).mockClear()
  mockPrisma.room.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve([SOURCE, BOARD_2].find(r => r.id === where.id) ?? null))
  mockPrisma.room.findMany.mockResolvedValue([])
  mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student' })
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([])
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  givenOperations([])
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
    // (#548) And the assignment's toolset.
    expect(room.enabledTools).toEqual(['pencil'])
  })

  it('files the copy in the folder the source is filed in (#552)', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student', folderId: 'folder-7' })

    const res = await fork(buildApp('student'))

    // Folders are per-user, so the placement lives on the participant row and
    // not on the room: created without it, the copy of a lesson filed in a
    // course folder turns up at the root of "Мои уроки" instead of beside it.
    expect(mockPrisma.roomParticipant.create).toHaveBeenCalledWith({
      data: { roomId: createdRoom().id, userId: 'student', folderId: 'folder-7' },
    })
    // And the answer says so, so the list doesn't have to assume the copy
    // landed in whichever folder happens to be on screen.
    expect(res.json().room.folderId).toBe('folder-7')
  })

  it('leaves an unfiled source\'s copy unfiled (#552)', async () => {
    const res = await fork(buildApp('student'))

    expect(mockPrisma.roomParticipant.create.mock.calls[0][0].data.folderId).toBeNull()
    expect(res.json().room.folderId).toBeUndefined()
  })

  it('files an owner\'s copy at the root when they have no participant row (#552)', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)

    expect((await fork(buildApp('teacher'))).statusCode).toBe(201)
    expect(mockPrisma.roomParticipant.create.mock.calls[0][0].data.folderId).toBeNull()
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
    givenOperations([opRow({ id: 'op-a', seq: 1 }), opRow({ id: 'op-b', seq: 2 })])

    await fork(buildApp('student'))

    const [copy] = operationCopies()
    expect(copy.sourceIds).toEqual(['op-a', 'op-b'])
    expect(isForkSeedUser(copy.seedUserId)).toBe(true)
    expect(copy.seedUserId).toBe(forkSeedUserId(createdRoom().id))
    // The client replays `data`, not the columns — an identity rewritten in
    // only one of the two would leave the fork replaying as the teacher's
    // own log while looking reseated in the database. So the statement
    // writes the seed user into the payload as well as the column.
    expect(copy.sql).toContain(`jsonb_build_object('id', md5(o."id" || ?), 'userId', ?)`)
  })

  it('gives inherited operations new ids, inside the payload too', async () => {
    givenOperations([opRow({ id: 'op-a', seq: 1 })])

    await fork(buildApp('student'))

    const [copy] = operationCopies()
    // Operation.id is a primary key across the whole table, not per room:
    // the key column and the payload's `id` are both the derived id.
    expect(copy.sql).toContain(`SELECT md5(o."id" || ?), o."seq"`)
    expect(copy.sql).toContain(`'id', md5(o."id" || ?)`)
    expect(copy.forkId).toBe(createdRoom().id)
  })

  it('keeps seq numbers, so the seeded snapshots still line up with the tail', async () => {
    mockPrisma.roomLayerState.findUnique.mockResolvedValue({ roomId: SOURCE.id, seq: 40, state: { layers: {} } })
    mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([{ id: 's1', layerId: 'layer-1', seq: 40 }])
    givenOperations([opRow({ id: 'op-a', seq: 41 }), opRow({ id: 'op-b', seq: 42 })])

    await fork(buildApp('student'))

    // seq and the pixels behind it travel together: each copy names its
    // source rows, and the rows carry their own seq across untouched.
    expect(operationCopies()[0].sql).toContain('o."seq"')
    expect(operationCopies()[0].sourceIds).toEqual(['op-a', 'op-b'])
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

  // (#568) The same for the log. Prisma's `createMany` over 2 000 stroke rows
  // took 5.6 s where one `INSERT ... SELECT` took 0.33 s, and a lesson fork
  // pays that per board — so the strokes never come out of Postgres either.
  it('never reads a stroke payload into the process', async () => {
    givenOperations([opRow({ id: 'op-a', seq: 1 }), opRow({ id: 'op-b', seq: 2 })])

    await fork(buildApp('student'))

    // The window is asked for ids and types, nothing more.
    const [first] = mockPrisma.operation.findMany.mock.calls
    expect(first[0].select).toEqual({ id: true, type: true })
    // No second read: nothing here names another operation.
    expect(mockPrisma.operation.findMany).toHaveBeenCalledOnce()
    // The rows are copied by one statement Postgres runs on its own rows,
    // and this process writes none of them itself.
    expect(operationCopies()).toHaveLength(1)
    expect(mockPrisma.operation.createMany).not.toHaveBeenCalled()
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
    givenOperations([
      opRow({ id: 'op-a', seq: 1 }),
      opRow({ id: 'op-u', seq: 3, type: 'operation_undo', data: undo }),
    ])

    await fork(buildApp('student'))

    const forkId = createdRoom().id
    // The stroke went through Postgres; the undo, which names it, was
    // rewritten here — and only it was read in full.
    expect(operationCopies()[0].sourceIds).toEqual(['op-a'])
    expect(mockPrisma.operation.findMany.mock.calls[1][0].where).toEqual({ id: { in: ['op-u'] } })
    const [copiedUndo] = createdOps()
    expect(copiedUndo.type).toBe('operation_undo')
    expect(copiedUndo.id).toBe(copiedOperationId('op-u', forkId))
    expect(copiedUndo.data.id).toBe(copiedUndo.id)
    expect(isForkSeedUser(copiedUndo.userId)).toBe(true)
    expect(isForkSeedUser(copiedUndo.data.userId)).toBe(true)
    // Left unmapped this would point at a live operation in the *source*
    // room — an id that exists, in someone else's log. It points at what
    // the stroke's copy is keyed as — the same function SQL spells as
    // `md5(o."id" || fork)`, so the two sides agree without a map.
    expect((copiedUndo.data as unknown as { targetOpId: string }).targetOpId).toBe(copiedOperationId('op-a', forkId))
  })

  it('derives the copied id the way the SQL does', () => {
    // Postgres's md5(text) is the lowercase hex of the UTF-8 bytes; so is
    // this. If one side ever changes, an undo lands on an id that no row has.
    expect(copiedOperationId('op-a', 'fork-1')).toBe('5c9e1e2c8ebfae516f71a7ba7caea473')
    expect(copiedOperationId('op-a', 'fork-1')).not.toBe(copiedOperationId('op-a', 'fork-2'))
  })

  it('drops an inherited undo whose target stayed behind', async () => {
    const undo = { id: 'op-u', type: 'operation_undo', userId: 'teacher', seq: 41, targetOpId: 'never-copied' } as unknown as Operation
    givenOperations([opRow({ id: 'op-u', seq: 41, type: 'operation_undo', data: undo })])

    await fork(buildApp('student'))

    // Left unmapped it would point into the source room's log — an id that
    // exists, in someone else's room, which is worse than dangling.
    expect(createdOps()).toHaveLength(0)
    expect(operationCopies()).toHaveLength(0)
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
    givenOperations([
      opRow({ id: 'op-old', seq: 5, layerId: 'layer-2' }),
      opRow({ id: 'op-late', seq: 41 }),
    ])

    await fork(buildApp('student'))

    // A narrower query must not become a narrower fork. layer-2 has no
    // stored pixels standing in for anything, so its seq-5 stroke is the
    // only record that it was ever drawn.
    expect(operationCopies()[0].sourceIds).toEqual(['op-old', 'op-late'])
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
    givenOperations([opRow({ id: 'op-m', seq: 11557, type: 'layer_merge', layerId: 'merged-1', data: merge })])

    await fork(buildApp('student'))

    // Whatever the window returns is what the fork stores. A row read out of
    // Postgres and then dropped on the way back in is the whole bug.
    expect(operationCopies()[0].sourceIds).toEqual(['op-m'])
  })

  it('copies the whole log when the source has no snapshot yet', async () => {
    await fork(buildApp('student'))

    // Nothing is covered, so nothing is excluded — a room whose bakes never
    // ran forks in full rather than forking empty.
    const where = mockPrisma.operation.findMany.mock.calls[0][0].where
    expect(where).toEqual({ roomId: SOURCE.id })
  })

  // (#568) One statement binds one parameter per id, and Postgres takes
  // 32 767 per statement; a never-snapshotted room copies its whole log.
  it('copies a long log in chunks Postgres can bind', async () => {
    givenOperations(Array.from({ length: 10_001 }, (_, i) => opRow({ id: `op-${i}`, seq: i + 1 })))

    await fork(buildApp('student'))

    const copies = operationCopies()
    expect(copies.map(c => c.sourceIds.length)).toEqual([10_000, 1])
    expect(copies[1].sourceIds).toEqual(['op-10000'])
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
    givenOperations([opRow({ id: 'op-a', seq: 1 })])

    await fork(buildApp('student'))

    // A fork that existed with half its content would read as a lesson
    // somebody had already erased most of.
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('rejects a scope it does not know', async () => {
    const res = await fork(buildApp('student'), SOURCE.id, { scope: 'everything' })

    expect(res.statusCode).toBe(400)
    expect(mockPrisma.room.create).not.toHaveBeenCalled()
  })
})

// (#568, ADR 014 §5) «Взять в работу»: the board the student is looking at,
// whichever page of the lesson it is, becomes a standalone room of their own.
describe('scope: board (#568)', () => {
  it('is the default, so a client that never heard of boards forks as before', async () => {
    await fork(buildApp('student'))

    const [room, ...more] = createdRooms()
    expect(more).toHaveLength(0)
    expect(room).toMatchObject({ lessonId: null, boardOrder: 0, activeBoardId: null })
    expect(mockPrisma.room.findMany).not.toHaveBeenCalled()
  })

  it('forks a secondary board into a standalone room', async () => {
    givenOperations([opRow({ id: 'op-b', seq: 1, roomId: BOARD_2.id })])

    const res = await fork(buildApp('student'), BOARD_2.id, { scope: 'board' })

    expect(res.statusCode).toBe(201)
    const [room, ...more] = createdRooms()
    expect(more).toHaveLength(0)
    // A page torn out becomes its own lesson: no lesson above it, first and
    // only board, nothing to point at.
    expect(room).toMatchObject({ lessonId: null, boardOrder: 0, activeBoardId: null, parentRoomId: BOARD_2.id, name: 'Still life 2' })
    // The board's own content came along, and it was that board's queue
    // that was flushed first.
    expect(operationCopies()[0].sourceIds).toEqual(['op-b'])
    expect(flushRoomWrites).toHaveBeenCalledWith(BOARD_2.id)
    // (#548) The toolset is the lesson's — the live value every gate reads —
    // not the record on the board row, which is empty here.
    expect(room.enabledTools).toEqual(['pencil'])
  })

  it('reads the palette and the folder off the lesson, which is where a board has them', async () => {
    mockPrisma.roomPalette.findUnique.mockResolvedValue({ colors: ['#333333'] })
    mockPrisma.roomParticipant.findUnique.mockResolvedValue({ roomId: SOURCE.id, userId: 'student', folderId: 'folder-7' })

    await fork(buildApp('student'), BOARD_2.id, { scope: 'board' })

    expect(mockPrisma.roomPalette.findUnique).toHaveBeenCalledWith({ where: { roomId: SOURCE.id }, select: { colors: true } })
    expect(mockPrisma.roomPalette.create).toHaveBeenCalledWith({ data: { roomId: createdRoom().id, colors: ['#333333'] } })
    expect(mockPrisma.roomParticipant.create.mock.calls[0][0].data.folderId).toBe('folder-7')
  })

  it('answers a board id with its lesson\'s membership', async () => {
    await fork(buildApp('student'), BOARD_2.id, { scope: 'board' })

    // A board has no participant rows of its own (ADR 014 §2); asked of the
    // board, the check would find nobody and lock every student out of the
    // sheet they were just drawing on.
    expect(mockPrisma.roomParticipant.findUnique).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: SOURCE.id, userId: 'student' } },
    })
  })

  it('refuses a board of a lesson the caller has never been in', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)

    expect((await fork(buildApp('stranger'), BOARD_2.id, { scope: 'board' })).statusCode).toBe(403)
    expect(mockPrisma.room.create).not.toHaveBeenCalled()
  })

  it('lets the lesson\'s owner fork any board of it without a participant row', async () => {
    mockPrisma.roomParticipant.findUnique.mockResolvedValue(null)

    expect((await fork(buildApp('teacher'), BOARD_2.id, { scope: 'board' })).statusCode).toBe(201)
  })
})

// (#568, ADR 014 §5) «Форк» from «Мои уроки»: the lesson and every board of
// it — the shape a lesson template (#107) takes.
describe('scope: lesson (#568)', () => {
  const LESSON = { ...SOURCE, activeBoardId: BOARD_2.id }

  beforeEach(() => {
    mockPrisma.room.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve([LESSON, BOARD_2].find(r => r.id === where.id) ?? null))
    mockPrisma.room.findMany.mockResolvedValue([BOARD_2])
    mockPrisma.roomLayerState.findUnique.mockImplementation(({ where }: { where: { roomId: string } }) =>
      Promise.resolve({ roomId: where.roomId, seq: where.roomId === LESSON.id ? 10 : 20, state: {} }))
    mockPrisma.roomLayerSnapshot.findMany.mockImplementation(({ where }: { where: { roomId: string } }) =>
      Promise.resolve([{ id: `snap-${where.roomId}`, layerId: 'layer-1', seq: where.roomId === LESSON.id ? 10 : 20 }]))
    givenOperations([
      opRow({ id: 'op-l', seq: 11, roomId: LESSON.id }),
      opRow({ id: 'op-b', seq: 21, roomId: BOARD_2.id }),
    ])
  })

  it('copies the lesson and every board of it, in order, with the active board remapped', async () => {
    const res = await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })

    expect(res.statusCode).toBe(201)
    const [lesson, board] = createdRooms()
    expect(createdRooms()).toHaveLength(2)
    // The copy of the lesson is a lesson; the copy of the board is a board of
    // it, at the position it had. Provenance is per board: each remembers
    // the row it was copied from.
    expect(lesson).toMatchObject({ lessonId: null, boardOrder: 0, parentRoomId: LESSON.id, ownerId: 'student' })
    expect(board).toMatchObject({ lessonId: lesson.id, boardOrder: 1, parentRoomId: BOARD_2.id, ownerId: 'student', name: 'Still life 2' })
    expect(board.id).not.toBe(BOARD_2.id)
    // The teacher was on board 2; the copy's teacher starts on board 2's copy.
    expect(lesson.activeBoardId).toBe(board.id)
    // And the answer is the lesson, which is what the list shows.
    expect(res.json().room.id).toBe(lesson.id)
  })

  it('seeds each board with its own content, by the single-board procedure', async () => {
    await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })

    const [lesson, board] = createdRooms()
    // Both queues flushed, both windows asked, both copied — each into its
    // own copy, each stamped with that copy's seed user.
    expect(flushRoomWrites).toHaveBeenCalledWith(LESSON.id)
    expect(flushRoomWrites).toHaveBeenCalledWith(BOARD_2.id)
    const ops = operationCopies()
    expect(ops.map(c => [c.forkId, c.sourceIds])).toEqual([[lesson.id, ['op-l']], [board.id, ['op-b']]])
    expect(ops.map(c => c.seedUserId)).toEqual([forkSeedUserId(lesson.id), forkSeedUserId(board.id)])
    const snaps = rawCopies('RoomLayerSnapshot')
    expect(snaps.map(c => [c.values[0], (c.values[1] as Prisma.Sql).values])).toEqual([
      [lesson.id, [`snap-${LESSON.id}`]], [board.id, [`snap-${BOARD_2.id}`]],
    ])
    expect(mockPrisma.roomLayerState.create.mock.calls.map(call => call[0].data)).toEqual([
      { roomId: lesson.id, seq: 10, state: {} }, { roomId: board.id, seq: 20, state: {} },
    ])
  })

  it('writes the social side once, on the lesson', async () => {
    mockPrisma.roomPalette.findUnique.mockResolvedValue({ colors: ['#111111'] })

    await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })

    const [lesson] = createdRooms()
    // Participants, palette, folder: facts about the lesson (ADR 014 §2). A
    // board with a participant row of its own would be a second door.
    expect(mockPrisma.roomParticipant.create).toHaveBeenCalledOnce()
    expect(mockPrisma.roomParticipant.create.mock.calls[0][0].data.roomId).toBe(lesson.id)
    expect(mockPrisma.roomPalette.create).toHaveBeenCalledOnce()
    expect(mockPrisma.roomPalette.create.mock.calls[0][0].data.roomId).toBe(lesson.id)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('applies the given name to the lesson and leaves the boards their own', async () => {
    await fork(buildApp('student'), LESSON.id, { scope: 'lesson', name: 'Still life — copy' })

    const [lesson, board] = createdRooms()
    expect(lesson.name).toBe('Still life — copy')
    expect(board.name).toBe('Still life 2')
  })

  it('forks the whole lesson when given one of its boards', async () => {
    await fork(buildApp('student'), BOARD_2.id, { scope: 'lesson' })

    const [lesson, board] = createdRooms()
    expect(createdRooms()).toHaveLength(2)
    expect(lesson).toMatchObject({ lessonId: null, parentRoomId: LESSON.id })
    expect(board).toMatchObject({ lessonId: lesson.id, parentRoomId: BOARD_2.id })
  })

  it('points the copy at nothing when the source pointed at nothing, or at a board since deleted', async () => {
    mockPrisma.room.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve([{ ...LESSON, activeBoardId: null }, BOARD_2].find(r => r.id === where.id) ?? null))
    await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })
    expect(createdRoom().activeBoardId).toBeNull()

    mockPrisma.room.create.mockClear()
    // `activeBoardId` is not a relation (schema.prisma): it can name a board
    // that was deleted a moment ago, and the copy must not inherit a pointer
    // into nowhere.
    mockPrisma.room.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve([{ ...LESSON, activeBoardId: 'gone-board' }, BOARD_2].find(r => r.id === where.id) ?? null))
    await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })
    expect(createdRoom().activeBoardId).toBeNull()
  })

  it('forks a lesson with a single board as one room', async () => {
    mockPrisma.room.findMany.mockResolvedValue([])

    await fork(buildApp('student'), LESSON.id, { scope: 'lesson' })

    expect(createdRooms()).toHaveLength(1)
    expect(createdRoom()).toMatchObject({ lessonId: null, boardOrder: 0, activeBoardId: null })
  })
})
