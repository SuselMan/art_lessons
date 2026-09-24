import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyBaseLogger } from 'fastify'
import { Server } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClientToServerEvents, ServerToClientEvents, StrokeOperation } from '@grafetto/shared'

// (#176, ADR 014 §3) A real socket.io server + client pair, like
// shutdown.test.ts and for the same reason: what is under test is which
// *channel* an event travels on — a board's content channel versus the
// lesson's social channel — and a mocked socket would only prove we called
// what we meant to call. Postgres is a fake in-memory row store so a board
// can be cold-loaded the way production loads it; identity is the cookie
// header verbatim, so each client picks its own userId.
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  roomParticipant: { upsert: vi.fn(), findUnique: vi.fn() },
  roomPalette: { findUnique: vi.fn(), upsert: vi.fn() },
  roomLayerState: { findUnique: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn() },
  operation: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomBlock: { findUnique: vi.fn() },
  roomInvite: { findUnique: vi.fn() },
  roomJoinRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('./identity.js', () => ({
  resolveSocketIdentity: async (cookie: string | undefined) => ({ userId: cookie ?? 'anonymous', deviceId: 'device' }),
}))
vi.mock('./sessions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sessions.js')>()),
  recordSighting: () => {},
}))
vi.mock('./memory.js', () => ({
  readMemory: () => ({ heapUsedPct: 0, heapUsedMb: 0 }),
  pressureOf: () => 'ok',
}))
vi.mock('./instrument.js', () => ({ reportException: () => {}, reportIssue: () => {} }))

const { registerRoomHandlers } = await import('./socketHandlers.js')
const { _flushPendingWrites, isRoomResident, noteBoardCreated } = await import('./rooms.js')

type Row = {
  id: string; name: string; paper: string; paperColor: null; infinite: boolean; canvasWidth: number
  canvasHeight: number; passwordHash: null; accessMode: 'anyone_with_link'; enabledTools: string[]
  closedAt: null; parentRoomId: null; ownerId: string; createdAt: Date; thumbnail: null
  lessonId: string | null; boardOrder: number; activeBoardId: null
}
const rows = new Map<string, Row>()
function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id, name: id, paper: 'coarse', paperColor: null, infinite: false, canvasWidth: 1240, canvasHeight: 1754,
    passwordHash: null, accessMode: 'anyone_with_link', enabledTools: [], closedAt: null, parentRoomId: null,
    ownerId: 'teacher', createdAt: new Date(), thumbnail: null, lessonId: null, boardOrder: 0, activeBoardId: null,
    ...overrides,
  }
}

const log = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
  child() { return log },
} as unknown as FastifyBaseLogger

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>

let http: HttpServer
let io: Server
let port: number
const clients: Client[] = []

function client(userId: string): Client {
  const socket: Client = connect(`http://localhost:${port}`, {
    extraHeaders: { cookie: userId }, transports: ['websocket'], forceNew: true,
  })
  clients.push(socket)
  return socket
}

/** The next `event` on `socket`, or a timeout — a test that waits for an
 *  event that never comes should say which one. */
function next<E extends keyof ServerToClientEvents>(
  socket: Client, event: E, ms = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms}ms`)), ms)
    socket.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer)
      resolve(payload)
    }) as never)
  })
}

/** Proves `event` does *not* arrive on `socket` within a short window —
 *  the complement of `next`, for isolation assertions. */
async function silent<E extends keyof ServerToClientEvents>(socket: Client, event: E, ms = 150): Promise<void> {
  let heard = false
  const listener = () => { heard = true }
  socket.on(event, listener as never)
  await new Promise(resolve => setTimeout(resolve, ms))
  socket.off(event, listener as never)
  expect(heard, `${event} should not have arrived`).toBe(false)
}

function createLesson(socket: Client, lessonId: string) {
  return new Promise<void>((resolve, reject) => {
    socket.emit('create_room', {
      room: { id: lessonId, name: lessonId, paper: 'coarse', infinite: false, canvasWidth: 1240, canvasHeight: 1754 },
      name: 'Teacher',
    }, result => result.ok ? resolve() : reject(new Error(result.error)))
  })
}

function join(socket: Client, roomId: string, name: string) {
  return new Promise<void>((resolve, reject) => {
    socket.emit('join_room', { roomId, name }, result => result.ok ? resolve() : reject(new Error(result.error)))
  })
}

function stroke(id: string, userId: string): StrokeOperation {
  return {
    id, type: 'stroke', userId, timestamp: 0,
    layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

let seq = 0
const fresh = (prefix: string) => `${prefix}-${seq++}`

beforeEach(async () => {
  for (const model of Object.values(mockPrisma)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  rows.clear()
  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null)
  mockPrisma.room.findMany.mockImplementation(async ({ where }: { where: { OR: [{ id: string }] } }) =>
    [...rows.values()].filter(r => r.id === where.OR[0].id || r.lessonId === where.OR[0].id))
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.roomLayerSnapshot.groupBy.mockResolvedValue([])
  mockPrisma.operation.findMany.mockResolvedValue([])
  mockPrisma.operation.aggregate.mockResolvedValue({ _max: { seq: null } })
  mockPrisma.operation.groupBy.mockResolvedValue([])
  mockPrisma.roomPalette.findUnique.mockResolvedValue(null)
  mockPrisma.roomBlock.findUnique.mockResolvedValue(null)

  http = createServer()
  io = new Server(http)
  registerRoomHandlers(io as never, log)
  await new Promise<void>(resolve => http.listen(0, resolve))
  port = (http.address() as AddressInfo).port
})

afterEach(async () => {
  for (const c of clients.splice(0)) c.close()
  io.close()
  await new Promise<void>(resolve => http.close(() => resolve()))
})

/** A lesson with its owner on it, one student on it, and a second board
 *  seeded in the "database" but not yet loaded. */
async function classroom() {
  const lessonId = fresh('lesson')
  const boardId = fresh('board')
  rows.set(lessonId, row(lessonId))
  rows.set(boardId, row(boardId, { lessonId, boardOrder: 1 }))

  const teacher = client('teacher')
  await createLesson(teacher, lessonId)
  noteBoardCreated(lessonId, { id: boardId, name: boardId, order: 1 })

  const student = client('student')
  const joined = next(teacher, 'peer_joined')
  await join(student, lessonId, 'Alice')
  expect((await joined).boardId).toBe(lessonId)
  return { lessonId, boardId, teacher, student }
}

describe('join_room to a board on a live socket (#176)', () => {
  it('turns the page: the lesson hears peer_board_changed, not a leave and a join', async () => {
    const { lessonId, boardId, teacher, student } = await classroom()
    const moved = next(teacher, 'peer_board_changed')
    const leftOrJoined = Promise.race([next(teacher, 'peer_left', 300), next(teacher, 'peer_joined', 300)])
    const state = next(student, 'room_state')

    await join(student, boardId, 'Alice')

    expect(await moved).toEqual({ userId: 'student', boardId })
    await expect(leftOrJoined).rejects.toThrow(/within/)
    const received = await state
    expect(received.room.id).toBe(boardId)
    expect(received.room.lessonId).toBe(lessonId)
    expect(received.lesson).toEqual({
      id: lessonId, activeBoardId: null,
      boards: [{ id: lessonId, name: lessonId, order: 0 }, { id: boardId, name: boardId, order: 1 }],
    })
    expect(received.participants.map(p => [p.userId, p.boardId])).toEqual([['teacher', lessonId], ['student', boardId]])
  })

  it('content stays on the board while social state reaches the whole lesson', async () => {
    const { boardId, teacher, student } = await classroom()
    await join(student, boardId, 'Alice')
    await next(student, 'room_state').catch(() => undefined)

    // Content: a stroke on board two never reaches the teacher on board one,
    // and does reach its author (operation_confirmed is io.to the board).
    const confirmed = next(student, 'operation_confirmed')
    const teacherSilent = silent(teacher, 'operation_confirmed')
    student.emit('operation', stroke('op-1', 'student'), () => {})
    expect((await confirmed).operation.id).toBe('op-1')
    await teacherSilent

    // Social: a freeze set by the owner on board one lands on the student on
    // board two — the freeze is the lesson's.
    const frozen = next(student, 'room_frozen_changed')
    teacher.emit('set_room_frozen', true)
    expect(await frozen).toEqual({ frozen: true })
    const rejected = new Promise(resolve => student.emit('operation', stroke('op-2', 'student'), resolve))
    expect(await rejected).toEqual({ ok: false, reason: 'room_frozen' })
  })

  it('evicts the board when its last socket leaves, while the lesson stays', async () => {
    const { lessonId, boardId, teacher, student } = await classroom()
    await join(student, boardId, 'Alice')
    expect(isRoomResident(boardId)).toBe(true)

    const left = next(teacher, 'peer_left')
    student.close()

    expect(await left).toBe('student')
    await _flushPendingWrites(boardId)
    expect(isRoomResident(boardId)).toBe(false)
    expect(isRoomResident(lessonId)).toBe(true)
  })
})

describe('set_active_board (#176)', () => {
  it('is refused for a student: nothing broadcast, nothing persisted', async () => {
    const { boardId, teacher, student } = await classroom()
    mockPrisma.room.update.mockClear()

    student.emit('set_active_board', { boardId })

    await silent(teacher, 'active_board_changed')
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('set_active_board'))
  })

  it('for the owner it is persisted on the lesson row and broadcast to the whole lesson', async () => {
    const { lessonId, boardId, teacher, student } = await classroom()
    await join(student, boardId, 'Alice')
    const heardByStudent = next(student, 'active_board_changed')
    const heardByTeacher = next(teacher, 'active_board_changed')

    teacher.emit('set_active_board', { boardId })

    expect(await heardByStudent).toEqual({ boardId })
    expect(await heardByTeacher).toEqual({ boardId })
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: lessonId }, data: { activeBoardId: boardId } })

    // A late joiner is told where the teacher is.
    const late = client('late')
    const state = next(late, 'room_state')
    await join(late, lessonId, 'Bob')
    expect((await state).lesson.activeBoardId).toBe(boardId)
  })

  it('ignores a board that is not in this lesson', async () => {
    const { teacher } = await classroom()
    mockPrisma.room.update.mockClear()

    teacher.emit('set_active_board', { boardId: 'some-other-board' })

    await silent(teacher, 'active_board_changed')
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })
})
