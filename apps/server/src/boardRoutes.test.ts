import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { InjectPayload, Response as LightMyRequestResponse } from 'light-my-request'

import { registerBoardRoutes } from './boardRoutes.js'

// Route-level tests, Prisma mocked — same pattern as roomAccessRoutes.test.ts.
// rooms.ts's mirrors are spies: what a live lesson is told is asserted here,
// how it holds it is boards.test.ts's business.
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

const mockRooms = vi.hoisted(() => ({
  flushRoomWrites: vi.fn(() => Promise.resolve()),
  noteBoardCreated: vi.fn(),
  noteBoardRenamed: vi.fn(),
  noteBoardsReordered: vi.fn(),
  noteBoardDeleted: vi.fn(() => ({ wasActive: false })),
}))
vi.mock('./rooms.js', () => mockRooms)
vi.mock('./classroom.js', () => mockRooms)

const OWNER = 'teacher'
const LESSON = {
  id: 'lesson-1', name: 'Still life', ownerId: OWNER, lessonId: null, paper: 'coarse', paperColor: '#f5f0e6',
  infinite: false, canvasWidth: 1240, canvasHeight: 1754, enabledTools: ['pencil'], activeBoardId: null,
}
const strip = () => [
  { id: 'lesson-1', name: 'Still life', boardOrder: 0, thumbnail: null },
  { id: 'board-a', name: 'A', boardOrder: 1, thumbnail: { updatedAt: new Date('2026-09-23T10:00:00Z') } },
  { id: 'board-b', name: 'B', boardOrder: 2, thumbnail: null },
]

/** The calls the notifier records, in order — the delete route's ordering
 *  (evacuate before forget before announce) is the point of one test. */
const calls: string[] = []
const notify = {
  boardCreated: vi.fn(() => { calls.push('boardCreated') }),
  boardRenamed: vi.fn(() => { calls.push('boardRenamed') }),
  boardsReordered: vi.fn(() => { calls.push('boardsReordered') }),
  boardDeleted: vi.fn(() => { calls.push('boardDeleted') }),
  activeBoardChanged: vi.fn(() => { calls.push('activeBoardChanged') }),
  evacuateBoard: vi.fn(async () => { calls.push('evacuateBoard') }),
}

function buildApp(userId = OWNER): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async (request) => { request.userId = userId })
  registerBoardRoutes(app, notify)
  return app
}

type Res = Promise<LightMyRequestResponse>
const post = (app: FastifyInstance, url: string, payload?: unknown): Res =>
  app.inject({ method: 'POST', url, payload: payload as InjectPayload })
const patch = (app: FastifyInstance, url: string, payload?: unknown): Res =>
  app.inject({ method: 'PATCH', url, payload: payload as InjectPayload })
const del = (app: FastifyInstance, url: string): Res => app.inject({ method: 'DELETE', url })

beforeEach(() => {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'function') { (model as ReturnType<typeof vi.fn>).mockClear(); continue }
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  for (const fn of Object.values(mockRooms)) (fn as ReturnType<typeof vi.fn>).mockClear()
  mockRooms.noteBoardDeleted.mockReturnValue({ wasActive: false })
  for (const fn of Object.values(notify)) fn.mockClear()
  calls.length = 0

  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === LESSON.id) return LESSON
    if (where.id === 'board-a') return { id: 'board-a', lessonId: LESSON.id, ownerId: OWNER }
    if (where.id === 'board-b') return { id: 'board-b', lessonId: LESSON.id, ownerId: OWNER }
    if (where.id === 'foreign-board') return { id: 'foreign-board', lessonId: 'lesson-2', ownerId: OWNER }
    return null
  })
  mockPrisma.room.findMany.mockResolvedValue(strip())
  mockPrisma.room.aggregate.mockResolvedValue({ _max: { boardOrder: 2 } })
  mockPrisma.room.create.mockImplementation(async ({ data }: { data: { id: string; name: string; boardOrder: number } }) =>
    ({ id: data.id, name: data.name, boardOrder: data.boardOrder }))
  mockPrisma.room.update.mockResolvedValue({})
  mockPrisma.room.delete.mockResolvedValue({})
})

describe('ownership and depth (#176)', () => {
  const cases: Array<[string, (app: FastifyInstance) => Res]> = [
    ['POST /boards', app => post(app, '/api/rooms/lesson-1/boards', {})],
    ['PATCH /boards/:boardId', app => patch(app, '/api/rooms/lesson-1/boards/board-a', { name: 'X' })],
    ['DELETE /boards/:boardId', app => del(app, '/api/rooms/lesson-1/boards/board-a')],
  ]

  for (const [label, call] of cases) {
    it(`${label} is 403 for a participant who is not the owner`, async () => {
      const res = await call(buildApp('student'))
      expect(res.statusCode).toBe(403)
      expect(mockPrisma.room.create).not.toHaveBeenCalled()
      expect(mockPrisma.room.update).not.toHaveBeenCalled()
      expect(mockPrisma.room.delete).not.toHaveBeenCalled()
    })
  }

  it('is 404 for a lesson that does not exist', async () => {
    const res = await post(buildApp(), '/api/rooms/nope/boards', {})
    expect(res.statusCode).toBe(404)
  })

  it('refuses to nest: a board cannot own boards', async () => {
    // Depth is exactly one (ADR 014 §2). The row exists and the caller owns
    // it, so this is neither 404 nor 403 — the request is wrong about the
    // model, and the error says so.
    const res = await post(buildApp(), '/api/rooms/board-a/boards', { name: 'Nested' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'not_a_lesson' })
    expect(mockPrisma.room.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/rooms/:id/boards', () => {
  it('creates the board after the lesson\'s own row has landed, inheriting the sheet, and tells the lesson', async () => {
    const res = await post(buildApp(), '/api/rooms/lesson-1/boards', { name: '  Page 4 ' })

    expect(res.statusCode).toBe(201)
    const board = res.json()
    expect(board).toEqual({ id: expect.any(String), name: 'Page 4', order: 3 })
    // The lesson row is written fire-and-forget by create_room; the FK needs it.
    expect(mockRooms.flushRoomWrites).toHaveBeenCalledWith('lesson-1')
    expect(mockPrisma.room.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lessonId: 'lesson-1', boardOrder: 3, ownerId: OWNER,
        paper: 'coarse', paperColor: '#f5f0e6', infinite: false, canvasWidth: 1240, canvasHeight: 1754,
        enabledTools: ['pencil'],
      }),
    }))
    // Nothing social travels: no password, no access mode of its own.
    const data = mockPrisma.room.create.mock.calls[0][0].data
    expect(data).not.toHaveProperty('passwordHash')
    expect(data).not.toHaveProperty('accessMode')
    expect(mockRooms.noteBoardCreated).toHaveBeenCalledWith('lesson-1', board)
    expect(notify.boardCreated).toHaveBeenCalledWith('lesson-1', board)
  })

  it('names an unnamed board after the lesson, numbered', async () => {
    const res = await post(buildApp(), '/api/rooms/lesson-1/boards')
    expect(res.statusCode).toBe(201)
    expect(res.json().name).toBe('Still life 4')
  })

  it('rejects a blank name rather than reading it as "no name"', async () => {
    const res = await post(buildApp(), '/api/rooms/lesson-1/boards', { name: '   ' })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'invalid_name' })
  })
})

describe('PATCH /api/rooms/:id/boards/:boardId', () => {
  it('renames a board and tells the lesson', async () => {
    const res = await patch(buildApp(), '/api/rooms/lesson-1/boards/board-a', { name: ' Sketches ' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      board: { id: 'board-a', name: 'Sketches', order: 1, thumbnailUpdatedAt: '2026-09-23T10:00:00.000Z' },
      order: ['lesson-1', 'board-a', 'board-b'],
    })
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: 'board-a' }, data: { name: 'Sketches' } })
    expect(mockRooms.noteBoardRenamed).toHaveBeenCalledWith('lesson-1', 'board-a', 'Sketches')
    expect(notify.boardRenamed).toHaveBeenCalledWith('lesson-1', 'board-a', 'Sketches')
    expect(notify.boardsReordered).not.toHaveBeenCalled()
  })

  it('renames the lesson itself — it is the first board', async () => {
    const res = await patch(buildApp(), '/api/rooms/lesson-1/boards/lesson-1', { name: 'Portrait' })
    expect(res.statusCode).toBe(200)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: 'lesson-1' }, data: { name: 'Portrait' } })
    expect(notify.boardRenamed).toHaveBeenCalledWith('lesson-1', 'lesson-1', 'Portrait')
  })

  it('moves a board, rewriting only the positions that changed, in one transaction', async () => {
    const res = await patch(buildApp(), '/api/rooms/lesson-1/boards/board-b', { order: 1 })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      board: { id: 'board-b', name: 'B', order: 1, thumbnailUpdatedAt: undefined },
      order: ['lesson-1', 'board-b', 'board-a'],
    })
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    // Two rows swapped; the lesson stayed at 0 and was not touched.
    expect(mockPrisma.room.update).toHaveBeenCalledTimes(2)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: 'board-b' }, data: { boardOrder: 1 } })
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: 'board-a' }, data: { boardOrder: 2 } })
    expect(mockRooms.noteBoardsReordered).toHaveBeenCalledWith('lesson-1', ['lesson-1', 'board-b', 'board-a'])
    expect(notify.boardsReordered).toHaveBeenCalledWith('lesson-1', ['lesson-1', 'board-b', 'board-a'])
  })

  it('keeps the lesson first and bounds the order', async () => {
    const app = buildApp()
    expect((await patch(app, '/api/rooms/lesson-1/boards/lesson-1', { order: 1 })).json()).toEqual({ error: 'lesson_is_first' })
    expect((await patch(app, '/api/rooms/lesson-1/boards/board-a', { order: 0 })).json()).toEqual({ error: 'invalid_order' })
    expect((await patch(app, '/api/rooms/lesson-1/boards/board-a', { order: 3 })).json()).toEqual({ error: 'invalid_order' })
    expect((await patch(app, '/api/rooms/lesson-1/boards/board-a', { order: 1.5 })).json()).toEqual({ error: 'invalid_order' })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('is 404 for a board of another lesson, and 400 for an empty patch', async () => {
    const app = buildApp()
    expect((await patch(app, '/api/rooms/lesson-1/boards/foreign-board', { name: 'X' })).statusCode).toBe(404)
    expect((await patch(app, '/api/rooms/lesson-1/boards/board-a', {})).statusCode).toBe(400)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/rooms/:id/boards/:boardId', () => {
  it('deletes the row, moves everyone off first, then forgets and announces', async () => {
    mockRooms.noteBoardDeleted.mockImplementation(() => { calls.push('noteBoardDeleted'); return { wasActive: false } })

    const res = await del(buildApp(), '/api/rooms/lesson-1/boards/board-a')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(mockPrisma.room.delete).toHaveBeenCalledWith({ where: { id: 'board-a' } })
    // Not the active board: the lesson's pointer is left alone.
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
    expect(notify.evacuateBoard).toHaveBeenCalledWith('lesson-1', 'board-a')
    expect(calls).toEqual(['evacuateBoard', 'noteBoardDeleted', 'boardDeleted'])
    expect(notify.activeBoardChanged).not.toHaveBeenCalled()
  })

  it('resets the active board when deleting it, in the same transaction, and says so', async () => {
    mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === LESSON.id) return { ...LESSON, activeBoardId: 'board-b' }
      if (where.id === 'board-b') return { id: 'board-b', lessonId: LESSON.id }
      return null
    })
    mockRooms.noteBoardDeleted.mockReturnValue({ wasActive: true })

    const res = await del(buildApp(), '/api/rooms/lesson-1/boards/board-b')

    expect(res.statusCode).toBe(200)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: 'lesson-1' }, data: { activeBoardId: null } })
    expect(notify.activeBoardChanged).toHaveBeenCalledWith('lesson-1', null)
    expect(calls).toEqual(['evacuateBoard', 'boardDeleted', 'activeBoardChanged'])
  })

  it('never deletes the lesson itself this way', async () => {
    const res = await del(buildApp(), '/api/rooms/lesson-1/boards/lesson-1')
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'cannot_delete_lesson' })
    expect(mockPrisma.room.delete).not.toHaveBeenCalled()
  })

  it('is 404 for a board that belongs to another lesson', async () => {
    const res = await del(buildApp(), '/api/rooms/lesson-1/boards/foreign-board')
    expect(res.statusCode).toBe(404)
    expect(mockPrisma.room.delete).not.toHaveBeenCalled()
    expect(notify.evacuateBoard).not.toHaveBeenCalled()
  })
})
