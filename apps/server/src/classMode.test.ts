import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyBaseLogger } from 'fastify'
import { Server } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AssignmentStartResult, ClientToServerEvents, JoinResult, LessonState, SendResult, ServerToClientEvents,
  StrokeOperation,
} from '@grafetto/shared'

// (#595, ADR 015) Class mode over a real socket.io pair, the same harness
// socketHandlers.test.ts uses and for the same reason: what matters here is
// who hears what — a classmate must never be handed another student's board
// under `teacher_only` — and only a real channel can show that. Postgres is an
// in-memory row store; classMode.ts (the transaction) is replaced by writes
// into it, so the boards a round creates can be cold-loaded the production way.
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  roomParticipant: { upsert: vi.fn(), findUnique: vi.fn() },
  roomPalette: { findUnique: vi.fn(), upsert: vi.fn() },
  roomLayerState: { findUnique: vi.fn() },
  assignment: { findMany: vi.fn(), update: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn() },
  operation: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomBlock: { findUnique: vi.fn() },
  roomInvite: { findUnique: vi.fn() },
  roomJoinRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
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
vi.mock('./classMode.js', () => ({
  createAssignment: async (lessonId: string, name: string, students: Array<{ userId: string; name: string }>) => {
    const id = fresh('assignment')
    const boards = students.map(student => personalRow(lessonId, id, student))
    return { assignment: { id, name, order: 1, createdAt: new Date().toISOString() }, boards }
  },
  createPersonalBoard: async (lessonId: string, assignmentId: string, student: { userId: string; name: string }) =>
    personalRow(lessonId, assignmentId, student),
}))

const { registerRoomHandlers } = await import('./socketHandlers.js')

type Row = {
  id: string; name: string; paper: string; paperColor: null; infinite: boolean; canvasWidth: number
  canvasHeight: number; passwordHash: null; accessMode: 'anyone_with_link'; enabledTools: string[]
  closedAt: null; parentRoomId: null; ownerId: string; createdAt: Date; thumbnail: null
  lessonId: string | null; boardOrder: number; activeBoardId: null
  assignmentId: string | null; boardOwnerId: string | null
  activeAssignmentId: string | null; spotlightBoardId: string | null; classVisibility: 'teacher_only' | 'class'
}
const rows = new Map<string, Row>()
function row(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id, name: id, paper: 'coarse', paperColor: null, infinite: false, canvasWidth: 1240, canvasHeight: 1754,
    passwordHash: null, accessMode: 'anyone_with_link', enabledTools: [], closedAt: null, parentRoomId: null,
    ownerId: 'teacher', createdAt: new Date(), thumbnail: null, lessonId: null, boardOrder: 0, activeBoardId: null,
    assignmentId: null, boardOwnerId: null, activeAssignmentId: null, spotlightBoardId: null,
    classVisibility: 'teacher_only',
    ...overrides,
  }
}

function personalRow(lessonId: string, assignmentId: string, student: { userId: string; name: string }) {
  const id = fresh(`personal-${student.userId}`)
  rows.set(id, row(id, { lessonId, name: student.name, assignmentId, boardOwnerId: student.userId }))
  return { id, name: student.name, order: 0, assignmentId, ownerId: student.userId }
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

function tryJoin(socket: Client, roomId: string, name: string): Promise<JoinResult> {
  return new Promise(resolve => socket.emit('join_room', { roomId, name }, resolve))
}

async function join(socket: Client, roomId: string, name: string) {
  const result = await tryJoin(socket, roomId, name)
  if (!result.ok) throw new Error(result.error)
}

function start(socket: Client, name = 'Cube'): Promise<AssignmentStartResult> {
  return new Promise(resolve => socket.emit('assignment_start', { name }, resolve))
}

function send(socket: Client, op: StrokeOperation): Promise<SendResult> {
  return new Promise(resolve => socket.emit('operation', op, resolve))
}

function stroke(userId: string): StrokeOperation {
  return {
    id: fresh('op'), type: 'stroke', userId, timestamp: 0,
    layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

const personal = (lesson: LessonState) => lesson.boards.filter(b => b.ownerId)

let seq = 0
const fresh = (prefix: string) => `${prefix}-${seq++}`

beforeEach(async () => {
  for (const model of Object.values(mockPrisma)) {
    if (typeof model === 'function') { model.mockReset(); continue }
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  rows.clear()
  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null)
  mockPrisma.room.findMany.mockImplementation(async ({ where }: { where: { OR: [{ id: string }] } }) =>
    [...rows.values()].filter(r => r.id === where.OR[0].id || r.lessonId === where.OR[0].id))
  mockPrisma.room.update.mockResolvedValue({})
  mockPrisma.$transaction.mockResolvedValue([])
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.assignment.findMany.mockResolvedValue([])
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

/** A lesson with its teacher and two students, Alice and Bob, all on the
 *  lesson's own board, and a round handed out: every socket's resulting
 *  `lesson_state`, and each student's own board id. */
async function classInSession() {
  const lessonId = fresh('lesson')
  rows.set(lessonId, row(lessonId))
  const teacher = client('teacher')
  await createLesson(teacher, lessonId)
  const alice = client('alice')
  await join(alice, lessonId, 'Alice')
  const bob = client('bob')
  await join(bob, lessonId, 'Bob')

  const states = [next(teacher, 'lesson_state'), next(alice, 'lesson_state'), next(bob, 'lesson_state')]
  const started = await start(teacher)
  expect(started.ok).toBe(true)
  const [teacherState, aliceState, bobState] = (await Promise.all(states)).map(s => s.lesson)
  const aliceBoard = personal(aliceState)[0].id
  const bobBoard = personal(bobState)[0].id
  return { lessonId, teacher, alice, bob, teacherState, aliceState, bobState, aliceBoard, bobBoard }
}

describe('handing out a round (#595)', () => {
  it('gives each student present a board, shows each only their own, and the teacher all of them', async () => {
    const { teacherState, aliceState, bobState } = await classInSession()

    expect(teacherState.activeAssignmentId).not.toBeNull()
    expect(personal(teacherState).map(b => b.ownerId).sort()).toEqual(['alice', 'bob'])
    expect(personal(aliceState).map(b => b.ownerId)).toEqual(['alice'])
    expect(personal(bobState).map(b => b.ownerId)).toEqual(['bob'])
    // Shared boards are everyone's: the lesson's own page is in every list.
    expect(aliceState.boards.some(b => b.id === aliceState.id)).toBe(true)
  })

  it('is the teacher\'s alone; a second one is added to the list and the class is sent there', async () => {
    const { teacher, alice, teacherState } = await classInSession()
    expect(await start(alice)).toEqual({ ok: false, error: 'not_owner' })

    const moved = next(alice, 'lesson_state')
    const second = await start(teacher, 'Cylinder')
    expect(second.ok).toBe(true)
    const lesson = (await moved).lesson
    expect(lesson.assignments.map(a => a.name)).toEqual(['Cube', 'Cylinder'])
    expect(lesson.activeAssignmentId).not.toBe(teacherState.activeAssignmentId)
    // A board in each: the first one's work is still hers.
    expect(personal(lesson)).toHaveLength(2)
  })

  it('"Все ко мне" moves the class without ending anything, and "Вернуть всех сюда" brings it back to the same work', async () => {
    const { teacher, alice, aliceBoard, aliceState } = await classInSession()
    const assignmentId = aliceState.activeAssignmentId!
    teacher.emit('set_spotlight', { boardId: aliceBoard })
    await next(alice, 'lesson_state')

    const gathered = next(alice, 'lesson_state')
    teacher.emit('set_class_location', { assignmentId: null })
    const atTeacher = (await gathered).lesson
    expect(atTeacher.activeAssignmentId).toBeNull()
    expect(atTeacher.spotlightBoardId).toBeNull()
    expect(atTeacher.assignments.map(a => a.id)).toEqual([assignmentId])
    expect(personal(atTeacher).map(b => b.id)).toEqual([aliceBoard])

    const back = next(alice, 'lesson_state')
    teacher.emit('set_class_location', { assignmentId })
    const returned = (await back).lesson
    expect(returned.activeAssignmentId).toBe(assignmentId)
    // The same board, not a fresh one.
    expect(personal(returned).map(b => b.id)).toEqual([aliceBoard])
  })

  it('a student absent when it was handed out gets a board when the class is sent back to it', async () => {
    const { lessonId, teacher, aliceState } = await classInSession()
    const assignmentId = aliceState.activeAssignmentId!
    teacher.emit('set_class_location', { assignmentId: null })
    await next(teacher, 'lesson_state')

    // Carol arrives while the class is with the teacher: nothing to give her.
    const carol = client('carol')
    await join(carol, lessonId, 'Carol')
    await silent(carol, 'lesson_state')

    const given = new Promise<LessonState>(resolve => {
      carol.on('lesson_state', ({ lesson }) => { if (personal(lesson).length > 0) resolve(lesson) })
    })
    teacher.emit('set_class_location', { assignmentId })
    const lesson = await given
    expect(personal(lesson).map(b => [b.ownerId, b.assignmentId])).toEqual([['carol', assignmentId]])
  })

  it('moves the class only for the teacher, and only to an assignment of this lesson', async () => {
    const { teacher, alice, bob } = await classInSession()
    alice.emit('set_class_location', { assignmentId: null })
    await silent(bob, 'lesson_state')
    teacher.emit('set_class_location', { assignmentId: 'not-an-assignment' })
    await silent(bob, 'lesson_state')
  })

  // (#612) A move to where the class already is changes nothing — above all it
  // does not take down the spotlight, which every real move does.
  it('a move to where the class already is keeps the spotlight and tells nobody', async () => {
    const { teacher, alice, bob, aliceBoard, aliceState } = await classInSession()
    teacher.emit('set_spotlight', { boardId: aliceBoard })
    expect((await next(bob, 'lesson_state')).lesson.spotlightBoardId).toBe(aliceBoard)

    teacher.emit('set_class_location', { assignmentId: aliceState.activeAssignmentId! })
    await silent(alice, 'lesson_state')
  })

  it('gives a latecomer a board of their own, and tells nobody else it exists', async () => {
    const { lessonId, teacher, alice } = await classInSession()
    const carol = client('carol')
    const carolState = next(carol, 'lesson_state')
    const teacherState = next(teacher, 'lesson_state')
    const aliceState = next(alice, 'lesson_state')
    await join(carol, lessonId, 'Carol')

    expect(personal((await carolState).lesson).map(b => b.ownerId)).toEqual(['carol'])
    expect(personal((await teacherState).lesson).map(b => b.ownerId).sort()).toEqual(['alice', 'bob', 'carol'])
    expect(personal((await aliceState).lesson).map(b => b.ownerId)).toEqual(['alice'])
  })
})

describe('who may see and draw on a personal board (#595)', () => {
  it('under teacher_only a classmate cannot open it; its student and the teacher can', async () => {
    const { teacher, alice, bob, aliceBoard } = await classInSession()
    expect(await tryJoin(bob, aliceBoard, 'Bob')).toEqual({ ok: false, error: 'board_not_visible' })
    expect((await tryJoin(alice, aliceBoard, 'Alice')).ok).toBe(true)
    expect((await tryJoin(teacher, aliceBoard, 'Teacher')).ok).toBe(true)
  })

  it('the student and the teacher draw on it; a classmate who may look still cannot', async () => {
    const { teacher, alice, bob, aliceBoard } = await classInSession()
    const opened = next(bob, 'lesson_state')
    teacher.emit('set_class_visibility', { value: 'class' })
    expect(personal((await opened).lesson).map(b => b.ownerId).sort()).toEqual(['alice', 'bob'])

    await join(alice, aliceBoard, 'Alice')
    await join(teacher, aliceBoard, 'Teacher')
    await join(bob, aliceBoard, 'Bob')

    expect((await send(alice, stroke('alice'))).ok).toBe(true)
    expect((await send(teacher, stroke('teacher'))).ok).toBe(true)
    expect(await send(bob, stroke('bob'))).toEqual({ ok: false, reason: 'board_not_yours' })
  })

  it('a live stroke from a classmate is not relayed either', async () => {
    const { teacher, alice, bob, aliceBoard } = await classInSession()
    teacher.emit('set_class_visibility', { value: 'class' })
    await next(bob, 'lesson_state')
    await join(alice, aliceBoard, 'Alice')
    await join(bob, aliceBoard, 'Bob')

    bob.emit('stroke_live', {
      strokeId: 'live-1', layerId: 'layer-1', tool: 'pencil', preset: 'HB', color: [0, 0, 0], packetSeq: 0, dabsPacked: '',
    })
    await silent(alice, 'peer_stroke_live')
  })

  it('the spotlight shows one board to the whole class, and only while it is lit', async () => {
    const { teacher, bob, aliceBoard } = await classInSession()
    const lit = next(bob, 'lesson_state')
    teacher.emit('set_spotlight', { boardId: aliceBoard })
    const litState = (await lit).lesson
    expect(litState.spotlightBoardId).toBe(aliceBoard)
    expect(personal(litState).map(b => b.id)).toContain(aliceBoard)
    expect((await tryJoin(bob, aliceBoard, 'Bob')).ok).toBe(true)

    const dark = next(bob, 'lesson_state')
    teacher.emit('set_spotlight', { boardId: null })
    expect(personal((await dark).lesson).map(b => b.id)).not.toContain(aliceBoard)
  })

  it('a personal board is never the teacher\'s active board — visiting one is not turning the class\'s page', async () => {
    const { teacher, alice, aliceBoard } = await classInSession()
    teacher.emit('set_active_board', { boardId: aliceBoard })
    await silent(alice, 'active_board_changed')
  })

  it('shows a work to everyone wherever the class is — with the teacher, too', async () => {
    const { teacher, bob, aliceBoard } = await classInSession()
    teacher.emit('set_class_location', { assignmentId: null })
    await next(bob, 'lesson_state')
    const lit = next(bob, 'lesson_state')
    teacher.emit('set_spotlight', { boardId: aliceBoard })
    expect((await lit).lesson.spotlightBoardId).toBe(aliceBoard)
  })

  it('refuses a spotlight on anything that is not a student\'s board', async () => {
    const { lessonId, teacher, bob } = await classInSession()
    teacher.emit('set_spotlight', { boardId: lessonId })
    await silent(bob, 'lesson_state')
  })

  it('only the teacher changes the lesson\'s visibility', async () => {
    const { alice, bob } = await classInSession()
    alice.emit('set_class_visibility', { value: 'class' })
    await silent(bob, 'lesson_state')
  })
})

describe('raised hands (#595)', () => {
  it('a student raises their own, the whole lesson hears it, and it rides in lesson_state', async () => {
    const { lessonId, teacher, alice, bob } = await classInSession()
    const heard = next(teacher, 'participant_hand_changed')
    const heardByBob = next(bob, 'participant_hand_changed')
    alice.emit('set_hand_raised', { raised: true })
    expect(await heard).toEqual({ userId: 'alice', raised: true })
    expect(await heardByBob).toEqual({ userId: 'alice', raised: true })

    const state = next(alice, 'lesson_state')
    teacher.emit('set_class_visibility', { value: 'class' })
    expect((await state).lesson.handsRaised).toEqual(['alice'])
    expect(lessonId).toBeTruthy()
  })

  it('a student cannot lower someone else\'s; the teacher can', async () => {
    const { teacher, alice, bob } = await classInSession()
    alice.emit('set_hand_raised', { raised: true })
    await next(teacher, 'participant_hand_changed')

    bob.emit('set_hand_raised', { raised: false, userId: 'alice' })
    await silent(teacher, 'participant_hand_changed')

    const lowered = next(alice, 'participant_hand_changed')
    teacher.emit('set_hand_raised', { raised: false, userId: 'alice' })
    expect(await lowered).toEqual({ userId: 'alice', raised: false })
  })
})
