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
  assignment: { findMany: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn(), findMany: vi.fn() },
  operation: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomBlock: { findUnique: vi.fn() },
  roomInvite: { findUnique: vi.fn() },
  roomJoinRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
}))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('../auth/identity.js', () => ({
  resolveSocketIdentity: async (cookie: string | undefined) => ({ userId: cookie ?? 'anonymous', deviceId: 'device' }),
}))
vi.mock('../auth/sessions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/sessions.js')>()),
  recordSighting: () => {},
}))
vi.mock('../health/memory.js', () => ({
  readMemory: () => ({ heapUsedPct: 0, heapUsedMb: 0 }),
  pressureOf: () => 'ok',
}))
vi.mock('../instrument.js', () => ({ reportException: () => {}, reportIssue: () => {} }))

const { registerRoomHandlers, removeUserFromRoom } = await import('./socketHandlers.js')
const { _flushPendingWrites, isRoomResident } = await import('./rooms.js')
const { noteBoardCreated } = await import('./classroom.js')

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
  mockPrisma.assignment.findMany.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.groupBy.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([])
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
      assignments: [], activeAssignmentId: null, spotlightBoardId: null, classVisibility: 'teacher_only', handsRaised: [],
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

describe('explicit cancellation of an ephemeral live tail', () => {
  it('forwards only a true cancellation marker, keeping ordinary end backward compatible', async () => {
    const { teacher, student } = await classroom()
    for (const [strokeId, marker, expected] of [
      ['ordinary', undefined, undefined], ['cancelled', true, true],
      ['not-cancelled', false, undefined], ['malformed-marker', 'true', undefined],
    ] as const) {
      const received = next(student, 'peer_stroke_live_end')
      teacher.emit('stroke_live_end', { strokeId, ...(marker === undefined ? {} : { cancelled: marker }) } as never)
      expect(await received).toEqual({ userId: 'teacher', strokeId, ...(expected === true ? { cancelled: true } : {}) })
    }
  })
})

it('cancels already relayed live ink when the final stroke is rejected after a room freeze',async()=>{
 const {teacher,student}=await classroom()
 const strokeId='freeze-mid-watercolor'
 const live=next(teacher,'peer_stroke_live')
 student.emit('stroke_live',{strokeId,layerId:'layer-1',tool:'watercolor',preset:'normal:100:50:PB29:round:wc@m70-r2-v1',color:[0,0,1],packetSeq:0,dabsPacked:''})
 expect((await live).strokeId).toBe(strokeId)
 const frozen=next(student,'room_frozen_changed')
 teacher.emit('set_room_frozen',true)
 expect((await frozen).frozen).toBe(true)
 const cancellation=next(teacher,'peer_stroke_live_end',300)
 const verdict=await new Promise(resolve=>student.emit('operation',{...stroke('refused-watercolor','student'),tool:'watercolor',strokeId},resolve))
 expect(verdict).toMatchObject({ok:false,reason:'room_frozen'})
 expect(await cancellation).toEqual({userId:'student',strokeId,cancelled:true})
})

it('keeps accepted chunks and does not cancel successfully recorded live ink',async()=>{
 const {teacher,student}=await classroom()
 const confirmation=next(teacher,'operation_confirmed')
 const op={...stroke('accepted-chunk','student'),strokeId:'long-accepted'}
 const verdict=await new Promise(resolve=>student.emit('operation',op,resolve))
 expect(verdict).toMatchObject({ok:true})
 expect((await confirmation).operation.id).toBe(op.id)
 await silent(teacher,'peer_stroke_live_end',40)
})

// #780: real transports, two overlapping sockets of one identity.
it.each(['latest', 'old'] as const)('keeps logical presence and cancels only the %s departing socket live tail', async order => {
  const { lessonId, teacher, student } = await classroom()
  const newer = client('student')
  await join(newer, lessonId, 'Alice')
  for (const [sender, strokeId] of [[student, 'old-held'], [newer, 'new-held']] as const) {
    const packet = next(teacher, 'peer_stroke_live')
    sender.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: '' })
    expect((await packet).strokeId).toBe(strokeId)
  }
  const cancelled: unknown[] = []
  const left: string[] = []
  teacher.on('peer_stroke_live_end', event => cancelled.push(event))
  teacher.on('peer_left', userId => left.push(userId))
  const gone = order === 'latest' ? newer : student
  const remaining = order === 'latest' ? student : newer
  const cancellation = next(teacher, 'peer_stroke_live_end')
  gone.close()
  expect(await cancellation).toEqual({ userId: 'student', strokeId: order === 'latest' ? 'new-held' : 'old-held', cancelled: true })
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(cancelled).toHaveLength(1)
  expect(left).toEqual([])
  const departed = next(teacher, 'peer_left')
  remaining.close()
  expect(await departed).toBe('student')
})

it('#780 broadcasts the remaining socket board seat after the latest tab leaves', async () => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const firstMove = next(teacher, 'peer_board_changed')
  await join(student, boardId, 'Alice')
  await firstMove
  const newer = client('student')
  const taken = next(teacher, 'peer_board_changed')
  await join(newer, lessonId, 'Alice')
  await taken
  const moved = next(teacher, 'peer_board_changed')
  newer.close()
  expect(await moved).toEqual({ userId: 'student', boardId })
  await silent(teacher, 'peer_left', 30)
})

it('#780 bounds tracked live streams, retires ended streams, and ignores refused live packets', async () => {
  const { teacher, student } = await classroom()
  const relayed: string[] = []
  const cancelled: string[] = []
  teacher.on('peer_stroke_live', event => relayed.push(event.strokeId))
  teacher.on('peer_stroke_live_end', event => { if (event.cancelled) cancelled.push(event.strokeId) })
  const packet = (strokeId: string) => student.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: '' })
  for (let i = 0; i < 129; i++) packet(`bounded-${i}`)
  // Ordered ack is a barrier for preceding messages on this transport.
  await new Promise<void>(resolve => student.emit('clock_sync', () => resolve()))
  student.emit('stroke_live_end', { strokeId: 'bounded-0' })
  packet('replacement')
  const frozen = next(student, 'room_frozen_changed')
  teacher.emit('set_room_frozen', true)
  await frozen
  packet('refused')
  await new Promise<void>(resolve => student.emit('clock_sync', () => resolve()))
  const left = next(teacher, 'peer_left')
  student.close()
  await left
  expect(relayed).toHaveLength(129)
  expect(relayed).not.toContain('bounded-128')
  expect(relayed).toContain('replacement')
  expect(cancelled).toHaveLength(128)
  expect(cancelled).not.toContain('bounded-0')
  expect(cancelled).not.toContain('refused')
})

it('#780 keeps the old owner socket authorized after its newer tab leaves a frozen room', async () => {
  const { lessonId, teacher, student } = await classroom()
  const newer = client('teacher')
  await join(newer, lessonId, 'Teacher')
  const frozen = next(student, 'room_frozen_changed')
  teacher.emit('set_room_frozen', true)
  await frozen
  const serverSocket = io.sockets.sockets.get(newer.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  newer.close()
  await disconnected
  const verdict = await new Promise(resolve => teacher.emit('operation', stroke(fresh('owner-after-close'), 'teacher'), resolve))
  expect(verdict).toMatchObject({ ok: true })
  const refused = await new Promise(resolve => student.emit('operation', stroke(fresh('student-still-frozen'), 'student'), resolve))
  expect(refused).toEqual({ ok: false, reason: 'room_frozen' })
})

it.each(['board', 'lesson'] as const)('#780 cancels only the moving socket live tail on joining another %s', async target => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  for (const [sender, strokeId] of [[sibling, 'sibling-held'], [student, 'moving-held']] as const) {
    const relayed = next(teacher, 'peer_stroke_live')
    sender.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: '' })
    await relayed
  }
  let destination = boardId
  if (target === 'lesson') {
    destination = fresh('second-lesson')
    rows.set(destination, row(destination))
    const otherTeacher = client('teacher')
    await createLesson(otherTeacher, destination)
  }
  const cancelled: unknown[] = []
  teacher.on('peer_stroke_live_end', event => cancelled.push(event))
  const ended = next(teacher, 'peer_stroke_live_end', 300)
  await join(student, destination, 'Alice')
  expect(await ended).toEqual({ userId: 'student', strokeId: 'moving-held', cancelled: true })
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(cancelled).toHaveLength(1)
})

it('#780 announces the old lesson board fallback when the latest socket moves to another lesson', async () => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const movedToBoard = next(teacher, 'peer_board_changed')
  await join(student, boardId, 'Alice')
  await movedToBoard
  const newer = client('student')
  const movedToLesson = next(teacher, 'peer_board_changed')
  await join(newer, lessonId, 'Alice')
  await movedToLesson
  const destination = fresh('second-lesson')
  rows.set(destination, row(destination))
  await createLesson(client('teacher'), destination)
  const fallback = next(teacher, 'peer_board_changed', 300)
  await join(newer, destination, 'Alice')
  expect(await fallback).toEqual({ userId: 'student', boardId })
  await silent(teacher, 'peer_left', 20)
})

it('#780 kicking both same-identity sockets emits one logical departure for observer cleanup', async () => {
  const { lessonId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  for (const [sender, strokeId] of [[student, 'kick-old'], [sibling, 'kick-new']] as const) {
    const live = next(teacher, 'peer_stroke_live')
    sender.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: '' })
    await live
  }
  const departures: string[] = []
  teacher.on('peer_left', userId => departures.push(userId))
  const oldKicked = next(student, 'kicked')
  const newKicked = next(sibling, 'kicked')
  const left = next(teacher, 'peer_left')
  await removeUserFromRoom(io as never, lessonId, 'student')
  expect(await oldKicked).toEqual({ roomId: lessonId })
  expect(await newKicked).toEqual({ roomId: lessonId })
  expect(await left).toBe('student')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(departures).toEqual(['student'])
  expect(student.connected).toBe(true)
  expect(sibling.connected).toBe(true)
})
