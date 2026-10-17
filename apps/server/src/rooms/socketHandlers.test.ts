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

const { registerRoomHandlers, removeUserFromRoom, evacuateBoard } = await import('./socketHandlers.js')
const { _flushPendingWrites, getParticipant, getRoomSnapshot, isRoomResident } = await import('./rooms.js')
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
  const { packDabs } = await import('@grafetto/shared')
  const relayed: string[] = []
  const cancelled: string[] = []
  teacher.on('peer_stroke_live', event => relayed.push(event.strokeId))
  teacher.on('peer_stroke_live_end', event => { if (event.cancelled) cancelled.push(event.strokeId) })
  const packet = (strokeId: string) => student.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: packDabs([]) })
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

it.each(['main', 'child'] as const)('#780 moving the final socket off a child board to another lesson %s removes the old participant', async target => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const move = next(teacher, 'peer_board_changed')
  await join(student, boardId, 'Alice')
  await move
  const destination = fresh('destination')
  rows.set(destination, row(destination))
  await createLesson(client('teacher'), destination)
  let destinationBoard = destination
  if (target === 'child') {
    destinationBoard = fresh('destination-child')
    rows.set(destinationBoard, row(destinationBoard, { lessonId: destination, boardOrder: 1 }))
    noteBoardCreated(destination, { id: destinationBoard, name: destinationBoard, order: 1 })
  }
  const departure = next(teacher, 'peer_left', 300)
  await join(student, destinationBoard, 'Alice')
  expect(await departure).toBe('student')
  expect(getParticipant(lessonId, 'student')).toBeUndefined()
  await _flushPendingWrites(boardId)
  expect(isRoomResident(boardId)).toBe(false)
  const teacherSocket = io.sockets.sockets.get(teacher.id!)!
  const disconnected = new Promise<void>(resolve => teacherSocket.once('disconnect', () => resolve()))
  teacher.close()
  await disconnected
  await _flushPendingWrites(lessonId)
  expect(isRoomResident(lessonId)).toBe(false)
  expect(getParticipant(destination, 'student')?.boardId).toBe(destinationBoard)
})

it.each([
  ['main', 'older'], ['main', 'newer'], ['child', 'older'], ['child', 'newer'],
] as const)('#780 child-to-%s cross-lesson preserves a %s sibling and its board seat', async (target, siblingOrder) => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const sibling = client('student')
  if (siblingOrder === 'older') await join(sibling, lessonId, 'Alice')
  const move = next(teacher, 'peer_board_changed')
  await join(student, boardId, 'Alice')
  await move
  if (siblingOrder === 'newer') {
    const restored = next(teacher, 'peer_board_changed')
    await join(sibling, lessonId, 'Alice')
    await restored
  }
  const destination = fresh('sibling-destination')
  rows.set(destination, row(destination))
  await createLesson(client('teacher'), destination)
  let destinationBoard = destination
  if (target === 'child') {
    destinationBoard = fresh('sibling-destination-child')
    rows.set(destinationBoard, row(destinationBoard, { lessonId: destination, boardOrder: 1 }))
    noteBoardCreated(destination, { id: destinationBoard, name: destinationBoard, order: 1 })
  }
  const events: unknown[] = []
  teacher.on('peer_board_changed', event => events.push(event))
  teacher.on('peer_left', userId => events.push(userId))
  await join(student, destinationBoard, 'Alice')
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(getParticipant(lessonId, 'student')?.boardId).toBe(lessonId)
  expect(events).toEqual(siblingOrder === 'older' ? [{ userId: 'student', boardId: lessonId }] : [])
  await _flushPendingWrites(boardId)
  expect(isRoomResident(boardId)).toBe(false)
  const left = next(teacher, 'peer_left')
  sibling.close()
  expect(await left).toBe('student')
  expect(getParticipant(lessonId, 'student')).toBeUndefined()
})

it('#783 disconnect during replay never seats a ghost socket', async () => {
  const { lessonId, teacher } = await classroom()
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const late = client('late-user')
  const heard: unknown[] = []
  teacher.on('peer_joined', participant => heard.push(participant))
  late.emit('join_room', { roomId: lessonId, name: 'Late' }, () => {})
  await reached
  const serverSocket = io.sockets.sockets.get(late.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  late.close()
  await disconnected
  release(null)
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(getParticipant(lessonId, 'late-user')).toBeUndefined()
  expect(heard).toEqual([])
})

it('#783 an older delayed join never replaces the latest completed board intent', async () => {
  const { lessonId, boardId, student } = await classroom()
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const older = new Promise(resolve => student.emit('join_room', { roomId: lessonId, name: 'Alice' }, resolve))
  await reached
  await join(student, boardId, 'Alice')
  expect(getParticipant(lessonId, 'student')?.boardId).toBe(boardId)
  release(null)
  expect(await older).toEqual({ ok: false, error: 'server_busy' })
  expect(getParticipant(lessonId, 'student')?.boardId).toBe(boardId)
})

it.each([false, true])('#783 cold cancelled join cleanup preserves another pending join=%s', async cojoin => {
  const roomId = fresh('cold-pending')
  rows.set(roomId, row(roomId))
  const { ensureRoomLoaded } = await import('./roomLoader.js')
  await ensureRoomLoaded(roomId)
  const releases: ((value: null) => void)[] = []
  let reached!: () => void
  const entered = new Promise<void>(resolve => { reached = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementation(() => new Promise<null>(resolve => {
    releases.push(resolve)
    if (releases.length === (cojoin ? 2 : 1)) reached()
  }))
  const cancelled = client('cancelled-user')
  cancelled.emit('join_room', { roomId, name: 'Cancelled' }, () => {})
  let other: Client | undefined
  let otherJoin: Promise<void> | undefined
  if (cojoin) {
    // Start the second only after the first reached replay, for stable order.
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    other = client('other-user')
    otherJoin = join(other, roomId, 'Other')
  }
  await entered
  const serverSocket = io.sockets.sockets.get(cancelled.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  cancelled.close()
  await disconnected
  releases[0](null)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(getParticipant(roomId, 'cancelled-user')).toBeUndefined()
  expect(isRoomResident(roomId)).toBe(cojoin)
  if (cojoin) {
    releases[1](null)
    await otherJoin
    expect(getParticipant(roomId, 'other-user')).toBeDefined()
  }
})

it('#783 disconnect during create cold load never seats a ghost owner', async () => {
  const roomId = fresh('create-disconnected')
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.room.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const creator = client('creator')
  creator.emit('create_room', { room: { id: roomId, name: roomId, paper: 'coarse', infinite: false, canvasWidth: 1240, canvasHeight: 1754 }, name: 'Creator' }, () => {})
  await reached
  const serverSocket = io.sockets.sockets.get(creator.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  creator.close()
  await disconnected
  release(null)
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(getParticipant(roomId, 'creator')).toBeUndefined()
  expect(isRoomResident(roomId)).toBe(false)
})

it('#783 a newer create intent supersedes an older pending join', async () => {
  const { lessonId } = await classroom()
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const creator = client('new-creator')
  const older = new Promise(resolve => creator.emit('join_room', { roomId: lessonId, name: 'Creator' }, resolve))
  await reached
  const createdId = fresh('new-create-intent')
  await createLesson(creator, createdId)
  release(null)
  expect(await older).toEqual({ ok: false, error: 'server_busy' })
  expect(getParticipant(lessonId, 'new-creator')).toBeUndefined()
  expect(getParticipant(createdId, 'new-creator')?.role).toBe('owner')
})

it('#783 a newer join intent supersedes an older pending create', async () => {
  const { lessonId } = await classroom()
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.room.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const creator = client('late-creator')
  const createdId = fresh('obsolete-create')
  const older = new Promise(resolve => creator.emit('create_room', { room: { id: createdId, name: createdId, paper: 'coarse', infinite: false, canvasWidth: 1240, canvasHeight: 1754 }, name: 'Creator' }, resolve))
  await reached
  await join(creator, lessonId, 'Creator')
  release(null)
  expect(await older).toEqual({ ok: false, error: 'server_busy' })
  expect(getParticipant(lessonId, 'late-creator')?.role).toBe('member')
  expect(getParticipant(createdId, 'late-creator')).toBeUndefined()
})

it.each(['load', 'access'] as const)('#783 disconnect during %s await stops before seating and cleans unused residency', async stage => {
  const roomId = stage === 'access' ? (await classroom()).lessonId : fresh('cold-load-disconnect')
  const stored = row(roomId)
  if (stage === 'load') rows.set(roomId, stored)
  let entered!: () => void
  let release!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  if (stage === 'load') {
    mockPrisma.room.findUnique.mockImplementationOnce(() => { entered(); return new Promise<Row>(resolve => { release = () => resolve(stored) }) })
  } else {
    mockPrisma.roomBlock.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = () => resolve(null) }) })
  }
  const late = client('early-disconnect')
  late.emit('join_room', { roomId, name: 'Late' }, () => {})
  await reached
  const serverSocket = io.sockets.sockets.get(late.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  late.close()
  await disconnected
  release()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(getParticipant(roomId, 'early-disconnect')).toBeUndefined()
  expect(isRoomResident(roomId)).toBe(stage === 'access')
  const { getRoomBacklog } = await import('./roomStats.js')
  expect(getRoomBacklog(roomId)?.participants ?? 0).toBe(stage === 'access' ? 2 : 0)
})

it.each([
  ['main', 'owner'], ['child', 'owner'], ['main', 'member'], ['child', 'member'],
] as const)('#784 pending %s join survives the last %s disconnect', async (target, departingRole) => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const disconnect = async (socket: Client) => {
    const serverSocket = io.sockets.sockets.get(socket.id!)!
    const done = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
    socket.close()
    await done
  }
  await disconnect(departingRole === 'owner' ? student : teacher)
  const departing = departingRole === 'owner' ? teacher : student
  const roomId = target === 'child' ? boardId : lessonId
  const { ensureRoomLoaded } = await import('./roomLoader.js')
  await ensureRoomLoaded(roomId)
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const userId = departingRole === 'owner' ? 'newcomer' : 'teacher'
  const newcomer = client(userId)
  const verdict = new Promise(resolve => newcomer.emit('join_room', { roomId, name: 'Newcomer' }, resolve))
  await reached
  await disconnect(departing)
  await Promise.all([_flushPendingWrites(lessonId), _flushPendingWrites(roomId)])
  release(null)
  expect(await verdict).toEqual({ ok: true, userId })
  expect(getParticipant(roomId, userId)).toMatchObject({ boardId: roomId, role: userId === 'teacher' ? 'owner' : 'member' })
  expect(isRoomResident(lessonId)).toBe(true)
})

it.each(['main', 'child'] as const)('#784 two pending %s joins survive old owner departure and one cancellation, then release fully', async target => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const disconnect = async (socket: Client) => {
    const serverSocket = io.sockets.sockets.get(socket.id!)!
    const done = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
    socket.close()
    await done
  }
  await disconnect(student)
  const roomId = target === 'child' ? boardId : lessonId
  const { ensureRoomLoaded } = await import('./roomLoader.js')
  await ensureRoomLoaded(roomId)
  const releases: ((value: null) => void)[] = []
  mockPrisma.roomLayerState.findUnique.mockImplementation(() => new Promise<null>(resolve => { releases.push(resolve) }))
  const cancelled = client('cancelled-newcomer')
  cancelled.emit('join_room', { roomId, name: 'Cancelled' }, () => {})
  await vi.waitFor(() => expect(releases).toHaveLength(1))
  const survivor = client('surviving-newcomer')
  const verdict = new Promise(resolve => survivor.emit('join_room', { roomId, name: 'Survivor' }, resolve))
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  await disconnect(teacher)
  await disconnect(cancelled)
  releases[0](null)
  await new Promise(resolve => setTimeout(resolve, 20))
  const { evictIdleRooms } = await import('./rooms.js')
  evictIdleRooms()
  expect(isRoomResident(lessonId)).toBe(true)
  expect(isRoomResident(roomId)).toBe(true)
  expect(getParticipant(roomId, 'cancelled-newcomer')).toBeUndefined()
  releases[1](null)
  expect(await verdict).toEqual({ ok: true, userId: 'surviving-newcomer' })
  await disconnect(survivor)
  await Promise.all([_flushPendingWrites(lessonId), _flushPendingWrites(roomId)])
  expect(isRoomResident(roomId)).toBe(false)
  expect(isRoomResident(lessonId)).toBe(false)
})

it.each([false, true])('#784 cold child load retains its newly discovered parent; cancelled=%s', async cancelled => {
  const { lessonId, boardId, teacher, student } = await classroom()
  const disconnect = async (socket: Client) => {
    const serverSocket = io.sockets.sockets.get(socket.id!)!
    const done = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
    socket.close()
    await done
  }
  await disconnect(student)
  expect(isRoomResident(boardId)).toBe(false)
  let release!: (value: null) => void
  let entered!: () => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const newcomer = client('cold-child-newcomer')
  const verdict = new Promise(resolve => newcomer.emit('join_room', { roomId: boardId, name: 'Newcomer' }, resolve))
  await reached
  await disconnect(teacher)
  if (cancelled) await disconnect(newcomer)
  await _flushPendingWrites(lessonId)
  const { evictIdleRooms } = await import('./rooms.js')
  evictIdleRooms()
  expect(isRoomResident(lessonId)).toBe(true)
  release(null)
  if (cancelled) {
    await vi.waitFor(() => {
      expect(isRoomResident(boardId)).toBe(false)
      expect(isRoomResident(lessonId)).toBe(false)
    })
  } else {
    expect(await verdict).toEqual({ ok: true, userId: 'cold-child-newcomer' })
    expect(getParticipant(boardId, 'cold-child-newcomer')?.boardId).toBe(boardId)
    await disconnect(newcomer)
    await Promise.all([_flushPendingWrites(lessonId), _flushPendingWrites(boardId)])
    expect(isRoomResident(boardId)).toBe(false)
    expect(isRoomResident(lessonId)).toBe(false)
  }
})

it.each(['disconnect', 'move'] as const)('#786 rechecks a socket after snapshot await: %s', async action => {
  const { lessonId, boardId, student } = await classroom()
  await join(student, boardId, 'Alice')
  const thirdId = fresh('third-board')
  rows.set(thirdId, row(thirdId, { lessonId, boardOrder: 2 }))
  noteBoardCreated(lessonId, { id: thirdId, name: thirdId, order: 2 })
  let entered!: () => void
  let release!: (value: null) => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const evacuation = evacuateBoard(io as never, lessonId, boardId)
  await reached
  if (action === 'disconnect') {
    const serverSocket = io.sockets.sockets.get(student.id!)!
    const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
    student.close()
    await disconnected
  } else await join(student, thirdId, 'Alice')
  release(null)
  await evacuation
  if (action === 'disconnect') expect(getParticipant(lessonId, 'student')).toBeUndefined()
  else {
    const op = { id: fresh('dry-after-move'), type: 'paper_dry' as const, layerId: 'layer-1', userId: 'student', timestamp: 0 }
    const verdict = await new Promise(resolve => student.emit('operation', op, resolve))
    expect(verdict).toMatchObject({ ok: true })
    expect(getRoomSnapshot(lessonId)?.tailOperations.map(operation => operation.id) ?? []).not.toContain(op.id)
    expect(getRoomSnapshot(thirdId)?.tailOperations.map(operation => operation.id) ?? []).toContain(op.id)
    expect(getParticipant(lessonId, 'student')?.boardId).toBe(thirdId)
  }
})

it('#786 B-C-B still evacuates a socket currently back on the board being deleted', async () => {
  const { lessonId, boardId, student } = await classroom()
  await join(student, boardId, 'Alice')
  const thirdId = fresh('aba-board')
  rows.set(thirdId, row(thirdId, { lessonId, boardOrder: 2 }))
  noteBoardCreated(lessonId, { id: thirdId, name: thirdId, order: 2 })
  let entered!: () => void
  let release!: (value: null) => void
  const reached = new Promise<void>(resolve => { entered = resolve })
  mockPrisma.roomLayerState.findUnique.mockImplementationOnce(() => { entered(); return new Promise<null>(resolve => { release = resolve }) })
  const evacuation = evacuateBoard(io as never, lessonId, boardId)
  await reached
  await join(student, thirdId, 'Alice')
  await join(student, boardId, 'Alice updated')
  release(null)
  await evacuation
  expect(getParticipant(lessonId, 'student')).toMatchObject({ boardId: lessonId, name: 'Alice updated' })
  expect(io.sockets.sockets.get(student.id!)?.data.roomId).toBe(lessonId)
})

it('#786 evacuation of B lets an independently pending C join finish on C', async () => {
  const { lessonId, boardId, student } = await classroom()
  await join(student, boardId, 'Alice')
  const thirdId = fresh('pending-C-board')
  rows.set(thirdId, row(thirdId, { lessonId, boardOrder: 2 }))
  noteBoardCreated(lessonId, { id: thirdId, name: thirdId, order: 2 })
  const { ensureRoomLoaded } = await import('./roomLoader.js')
  await ensureRoomLoaded(thirdId)
  const releases: ((value: null) => void)[] = []
  mockPrisma.roomLayerState.findUnique.mockImplementation(() => new Promise<null>(resolve => { releases.push(resolve) }))
  const evacuation = evacuateBoard(io as never, lessonId, boardId)
  await vi.waitFor(() => expect(releases).toHaveLength(1))
  const joining = join(student, thirdId, 'Alice')
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  releases[0](null)
  await evacuation
  expect(getParticipant(lessonId, 'student')?.boardId).toBe(lessonId)
  releases[1](null)
  await joining
  expect(getParticipant(lessonId, 'student')?.boardId).toBe(thirdId)
  const op = { id: fresh('dry-after-pending-C'), type: 'paper_dry' as const, layerId: 'layer-1', userId: 'student', timestamp: 0 }
  const verdict = await new Promise(resolve => student.emit('operation', op, resolve))
  expect(verdict).toMatchObject({ ok: true })
  expect(getRoomSnapshot(thirdId)?.tailOperations.map(operation => operation.id) ?? []).toContain(op.id)
  expect(getRoomSnapshot(lessonId)?.tailOperations.map(operation => operation.id) ?? []).not.toContain(op.id)
})

it('#792 cancels unrecorded ended watercolor when one sibling socket disconnects', async () => {
  const { lessonId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const strokeId = 'ended-but-unrecorded'
  const live = next(teacher, 'peer_stroke_live')
  student.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal:100:50:PB29:round:wc@m70-r2-v1', color: [0, 0, 1], packetSeq: 0,
    dabsPacked: packDabs([{ x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }]) })
  await live
  const end = next(teacher, 'peer_stroke_live_end')
  student.emit('stroke_live_end', { strokeId })
  expect(await end).toEqual({ userId: 'student', strokeId })
  const cancellations: unknown[] = []
  const departures: unknown[] = []
  teacher.on('peer_stroke_live_end', event => cancellations.push(event))
  teacher.on('peer_left', event => departures.push(event))
  const serverSocket = io.sockets.sockets.get(student.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  student.close()
  await disconnected
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(getParticipant(lessonId, 'student')).toBeDefined()
  expect(getRoomSnapshot(lessonId)?.tailOperations).toHaveLength(0)
  expect(departures).toEqual([])
  expect(cancellations).toEqual([{ userId: 'student', strokeId, cancelled: true }])
})

it.each(['chunk-before-UP', 'final-before-UP', 'UP-before-final'] as const)('#792 retires fully covered live ownership: %s', async order => {
  const { lessonId, teacher, student } = await classroom()
  await join(client('student'), lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
  const strokeId = fresh('covered')
  for (let packetSeq = 0; packetSeq < 2; packetSeq++) {
    const relayed = next(teacher, 'peer_stroke_live')
    student.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq, dabsPacked: packDabs([dab]) })
    await relayed
  }
  const send = async (id: string) => {
    expect(await new Promise(resolve => student.emit('operation', { ...stroke(id, 'student'), tool: 'watercolor', strokeId, dabs: [dab] }, resolve))).toMatchObject({ ok: true })
  }
  const up = async () => {
    const ended = next(teacher, 'peer_stroke_live_end')
    student.emit('stroke_live_end', { strokeId })
    expect(await ended).toEqual({ userId: 'student', strokeId })
  }
  if (order === 'UP-before-final') await up()
  await send(fresh('prefix'))
  if (order === 'chunk-before-UP') await up()
  await send(fresh('final'))
  if (order === 'final-before-UP') await up()
  const cancellations: unknown[] = []
  teacher.on('peer_stroke_live_end', event => cancellations.push(event))
  const serverSocket = io.sockets.sockets.get(student.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  student.close()
  await disconnected
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(cancellations).toEqual([])
})

it('#792 accepted prefix plus duplicate cannot retire an ended unrecorded tail or cancel its sibling', async () => {
  const { lessonId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
  const strokeId = fresh('ended-tail')
  const packet = async (sender: Client, id: string, dabs: typeof dab[]) => {
    const live = next(teacher, 'peer_stroke_live')
    sender.emit('stroke_live', { strokeId: id, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: packDabs(dabs) })
    await live
  }
  await packet(student, strokeId, [dab, dab])
  await packet(sibling, 'sibling-still-held', [dab])
  const prefix = { ...stroke(fresh('accepted-prefix'), 'student'), tool: 'watercolor' as const, strokeId, dabs: [dab] }
  expect(await new Promise(resolve => student.emit('operation', prefix, resolve))).toMatchObject({ ok: true })
  const ended = next(teacher, 'peer_stroke_live_end')
  student.emit('stroke_live_end', { strokeId })
  await ended
  expect(await new Promise(resolve => student.emit('operation', prefix, resolve))).toMatchObject({ ok: true, duplicate: true })
  const cancellation = next(teacher, 'peer_stroke_live_end')
  student.close()
  expect(await cancellation).toEqual({ userId: 'student', strokeId, cancelled: true })
  expect(getRoomSnapshot(lessonId)?.tailOperations.map(op => op.id)).toContain(prefix.id)
  await silent(teacher, 'peer_stroke_live_end', 20)
  expect(sibling.connected).toBe(true)
})

it('#792 more than 128 completed gestures release capacity without false cancellations', async () => {
  const { lessonId, teacher, student } = await classroom()
  await join(client('student'), lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
  const cancellations: unknown[] = []
  teacher.on('peer_stroke_live_end', event => { if (event.cancelled) cancellations.push(event) })
  for (let i = 0; i < 140; i++) {
    const strokeId = `completed-${i}`
    const live = next(teacher, 'peer_stroke_live')
    student.emit('stroke_live', { strokeId, layerId: 'layer-1', tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: packDabs([dab]) })
    await live
    student.emit('stroke_live_end', { strokeId })
    expect(await new Promise(resolve => student.emit('operation', { ...stroke(`completed-op-${i}`, 'student'), strokeId, dabs: [dab] }, resolve))).toMatchObject({ ok: true })
  }
  const serverSocket = io.sockets.sockets.get(student.id!)!
  const disconnected = new Promise<void>(resolve => serverSocket.once('disconnect', () => resolve()))
  student.close()
  await disconnected
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(cancellations).toEqual([])
})

it('#792 layer deletion rejects an ended final chunk and cancels only its transient tail', async () => {
  const { lessonId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
  const layerId = fresh('deleted-live-layer')
  const added = { id: fresh('add'), type: 'layer_add' as const, layerId, name: 'Temporary', userId: 'teacher', timestamp: 0 }
  expect(await new Promise(resolve => teacher.emit('operation', added, resolve))).toMatchObject({ ok: true })
  const strokeId = fresh('deleted-ended')
  const live = next(teacher, 'peer_stroke_live')
  student.emit('stroke_live', { strokeId, layerId, tool: 'watercolor', preset: 'normal', color: [0, 0, 1], packetSeq: 0, dabsPacked: packDabs([dab, dab]) })
  await live
  const prefix = { ...stroke(fresh('prefix'), 'student'), tool: 'watercolor' as const, layerId, strokeId, dabs: [dab] }
  expect(await new Promise(resolve => student.emit('operation', prefix, resolve))).toMatchObject({ ok: true })
  const ended = next(teacher, 'peer_stroke_live_end')
  student.emit('stroke_live_end', { strokeId })
  await ended
  const deleted = { id: fresh('delete'), type: 'layer_delete' as const, layerIds: [layerId], userId: 'teacher', timestamp: 0 }
  expect(await new Promise(resolve => teacher.emit('operation', deleted, resolve))).toMatchObject({ ok: true })
  const cancellation = next(teacher, 'peer_stroke_live_end')
  const final = { ...prefix, id: fresh('rejected-final') }
  expect(await new Promise(resolve => student.emit('operation', final, resolve))).toEqual({ ok: false, reason: 'target_gone' })
  expect(await cancellation).toEqual({ userId: 'student', strokeId, cancelled: true })
  expect(getRoomSnapshot(lessonId)?.tailOperations.map(op => op.id)).toContain(prefix.id)
  expect(getRoomSnapshot(lessonId)?.tailOperations.map(op => op.id)).not.toContain(final.id)
  student.close()
  await silent(teacher, 'peer_stroke_live_end', 20)
  expect(sibling.connected).toBe(true)
})

it('#792 capacity cancels the oldest ended tail and admits new live without touching a sibling held stream', async () => {
  const { lessonId, teacher, student } = await classroom()
  const sibling = client('student')
  await join(sibling, lessonId, 'Alice')
  const { packDabs } = await import('@grafetto/shared')
  const dab = { x: 20, y: 20, pressure: 0.5, tiltX: 0, tiltY: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, t: 0 }
  const payload = { layerId: 'layer-1', tool: 'watercolor' as const, preset: 'normal', color: [0, 0, 1] as [number, number, number], packetSeq: 0, dabsPacked: packDabs([dab]) }
  const siblingLive = next(teacher, 'peer_stroke_live')
  sibling.emit('stroke_live', { ...payload, strokeId: 'sibling-held-capacity' })
  await siblingLive
  const seen: string[] = []
  const cancelled: unknown[] = []
  teacher.on('peer_stroke_live', event => seen.push(event.strokeId))
  teacher.on('peer_stroke_live_end', event => { if (event.cancelled) cancelled.push(event) })
  for (let i = 0; i < 129; i++) {
    student.emit('stroke_live', { ...payload, strokeId: `ended-capacity-${i}` })
    student.emit('stroke_live_end', { strokeId: `ended-capacity-${i}` })
  }
  await vi.waitFor(() => expect(seen).toHaveLength(129))
  expect(cancelled).toEqual([{ userId: 'student', strokeId: 'ended-capacity-0', cancelled: true }])
  expect(seen).toContain('ended-capacity-128')
  expect(sibling.connected).toBe(true)
})
