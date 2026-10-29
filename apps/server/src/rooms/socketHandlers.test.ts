import {canonicalStrokeStorage,strokeEndSample,strokeDabs,packStrokeEndSample} from '@grafetto/shared'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { BrushStorage, empty, setBrushStorage } from '../brushLibrary/storage.js'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyBaseLogger } from 'fastify'
import { Server } from 'socket.io'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBrushRandomStrokeId, packDabs, type Dab, type ClientToServerEvents, type ServerToClientEvents, type StrokeOperation, type SendResult } from '@grafetto/shared'

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

const { registerRoomHandlers } = await import('./socketHandlers.js')
const { _flushPendingWrites, isRoomResident } = await import('./rooms.js')
const { noteBoardCreated } = await import('./classroom.js')

type Row = {
  rasterVersion?: string
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

describe('explicit independent brush seeds transport', () => {
  const brushRandom = { version: 1 as const, sequentialSeed: 0, strokeSeed: 0xffffffff }
  const gestureId = createBrushRandomStrokeId('seed-gesture', brushRandom)
  const packet = { strokeId: gestureId, layerId: 'layer-1', tool: 'digitalBrush' as const,
    preset: 'brush:ink-round@2', color: [0, 0, 0] as [number, number, number], packetSeq: 0, dabsPacked: '', brushRandom }
  it('forwards exact uint32 endpoints and keeps legacy packets without seeds', async () => {
    const { teacher, student } = await classroom()
    const received = next(student, 'peer_stroke_live')
    teacher.emit('stroke_live', packet)
    expect(await received).toMatchObject({ ...packet, userId: 'teacher' })
    const { brushRandom: _unused, ...legacy } = packet
    void _unused
    const old = next(student, 'peer_stroke_live')
    teacher.emit('stroke_live', { ...legacy, strokeId: 'legacy-gesture' })
    expect(await old).not.toHaveProperty('brushRandom')
  })
  it('drops malformed original live metadata before constructing the stripped permission stand-in', async () => {
    const { teacher, student } = await classroom()
    for (const extra of [
      { brushRandom: undefined }, { brushRandom: { ...brushRandom, sequentialSeed: 1 } },
      { brushRandom: null }, { brushRandom: { ...brushRandom, strokeSeed: 0x100000000 } },
      { brushRandom: { ...brushRandom, sequentialSeed: -1 } }, { brushRandom: { ...brushRandom, strokeSeed: true } },
      { brushRandom: { ...brushRandom, extra: 1 } }, { strokeId: '' }, { tool: 'pencil' },
    ]) {
      const quiet = silent(student, 'peer_stroke_live', 35)
      teacher.emit('stroke_live', { ...packet, ...extra } as never)
      await quiet
    }
  })
  it('confirms, persists and rejoins with seed metadata on every chunk including empty pen-up', async () => {
    const { teacher, student, lessonId } = await classroom()
    for (const [index, extra] of [{}, { strokeEnd: true as const, strokeEndSample: { x: 1, y: 2, size: 3, opacity: 1, pressure: 0, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, baseSize: 4, t: 0 } }].entries()) {
      const op: StrokeOperation = { ...stroke(`seed-op-${index}`, 'teacher'), tool: 'digitalBrush',
        preset: 'brush:ink-round@2', strokeId: gestureId, brushRandom, dabsPacked: '', ...extra }
      const confirmed = next(student, 'operation_confirmed')
      const result = await new Promise(resolve => teacher.emit('operation', op, resolve))
      expect(result).toMatchObject({ ok: true })
      expect((await confirmed).operation).toMatchObject({ id: op.id, brushRandom })
    }
    await _flushPendingWrites(lessonId)
    const saved = mockPrisma.operation.create.mock.calls.map(call => call[0].data.data)
      .filter((op: StrokeOperation) => op.strokeId === gestureId)
    expect(saved).toHaveLength(2)
    expect(saved.every((op: StrokeOperation) => JSON.stringify(op.brushRandom) === JSON.stringify(brushRandom))).toBe(true)
    const late = client('seed-late')
    const state = next(late, 'room_state')
    await join(late, lessonId, 'Later')
    const history = (await state).tailOperations.filter(op => op.type === 'stroke' && op.strokeId === gestureId)
    expect(history).toHaveLength(2)
    for (const op of history) expect(op).toHaveProperty('brushRandom', brushRandom)
    const bad = { ...stroke('bad-final', 'teacher'), tool: 'digitalBrush', strokeId: gestureId, brushRandom: { ...brushRandom, strokeSeed: 1 }, dabsPacked: '', strokeEnd: true,
      strokeEndSample: { x: 1, y: 2, size: 3, opacity: 1, pressure: 0, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, baseSize: 4, t: 0 } }
    const rejected = await new Promise(resolve => teacher.emit('operation', bad as never, resolve))
    expect(rejected).toEqual({ ok: false, reason: 'invalid_operation' })
    const missing = await new Promise(resolve => teacher.emit('operation', { ...bad, id: 'missing-final', brushRandom: undefined, strokeEnd: true } as never, resolve))
    expect(missing).toEqual({ ok: false, reason: 'invalid_operation' })
  })
})

it('preserves explicit seeds from stored operation JSON on cold board history load', async () => {
  const { teacher, boardId } = await classroom()
  expect(isRoomResident(boardId)).toBe(false)
  const saved: StrokeOperation = { ...stroke('stored-seeds', 'teacher'), seq: 1,
    tool: 'digitalBrush', strokeId: createBrushRandomStrokeId('stored-gesture', { version: 1, sequentialSeed: 0xffffffff, strokeSeed: 0 }),
    brushRandom: { version: 1, sequentialSeed: 0xffffffff, strokeSeed: 0 }, dabsPacked: '', strokeEnd: true }
  mockPrisma.operation.findMany.mockResolvedValue([{ data: JSON.parse(JSON.stringify(saved)) }])
  mockPrisma.operation.aggregate.mockResolvedValue({ _max: { seq: 1 } })
  const state = next(teacher, 'room_state')
  await join(teacher, boardId, 'Teacher')
  const tail = (await state).tailOperations
  expect(tail).toContainEqual(saved)
  expect(tail.find(op => op.id === saved.id)).toHaveProperty('brushRandom', saved.brushRandom)
})


describe('native brush capability admission', () => {
  it.each([false, true])('rejects seedless native writes/live before pins and sequence allocation (child=%s)', async child => {
    const { lessonId, teacher, student } = await classroom()
    const directory = mkdtempSync(joinPath(tmpdir(), 'native-brush-gate-'))
    const storage = new BrushStorage(directory), library = empty()
    const descriptor = {
      id: 'imported-' + 'a'.repeat(16), version: 1, model: 'stamp' as const, category: 'paint' as const,
      tip: { kind: 'round' as const, hardness: 1, aspect: 1, rotation: 'fixed' as const, angle: 0 },
      paperInteraction: 0, spacing: .1, flow: 1, flowPer: 'pass' as const, opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]] as const, flowByPressure: [[0, 0], [1, 1]] as const, opacityByPressure: [[0, 0], [1, 1]] as const,
    }
    const native = { version: 2 as const, dynamics: { angle: { control: 'strokeRandom' as const, minimum: 0, jitter: 0,
      randomSource: { kind: 'qt5Taus88' as const, key: 'RotationFuzzyStrokeКлюч😀' } } } }
    library.brushes.push({ name: 'native', source: 'qa', warnings: [], descriptor: { ...descriptor,
      behavior: child ? { version: 2, dual: { brush: { ...descriptor, id: 'imported-' + 'b'.repeat(16), behavior: native }, blendMode: 'multiply' } } : native } })
    library.brushes.push({ name: 'legacy', source: 'qa', warnings: [], descriptor: { ...descriptor, id: 'imported-' + 'c'.repeat(16),
      behavior: { version: 2, dynamics: { angle: { control: 'strokeRandom', minimum: 0, jitter: 0, randomStream: 4 } } } } })
    setBrushStorage(storage, library)
    const preset = 'brush:' + descriptor.id + '@1'
    const op: StrokeOperation = { ...stroke(fresh('native-bad'), 'teacher'), tool: 'digitalBrush', preset, strokeId: 'legacy-identity' }
    try {
      const quiet = silent(student, 'operation_confirmed', 45)
      const result = await new Promise<SendResult>(resolve => teacher.emit('operation', op, resolve))
      expect(result).toEqual({ ok: false, reason: 'invalid_operation' })
      await quiet
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const quietLive = silent(student, 'peer_stroke_live', 45)
      teacher.emit('stroke_live', { strokeId: op.strokeId!, layerId: op.layerId, tool: op.tool, preset, color: op.color, dabsPacked: '', packetSeq: 0 })
      await quietLive
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const brushRandom = { version: 1 as const, sequentialSeed: 0xffffffff, strokeSeed: 0 }
      const strokeId = createBrushRandomStrokeId('native-seeded-valid', brushRandom)
      const received = next(student, 'peer_stroke_live')
      teacher.emit('stroke_live', { strokeId, layerId: op.layerId, tool: op.tool, preset, color: op.color, dabsPacked: '', packetSeq: 1, brushRandom })
      expect(await received).toMatchObject({ strokeId, brushRandom })
      const good = { ...op, id: fresh('native-good'), strokeId, brushRandom }
      const accepted = await new Promise<SendResult>(resolve => teacher.emit('operation', good, resolve))
      expect(accepted).toMatchObject({ ok: true, seq: 1 })
      await _flushPendingWrites(lessonId)
      const stored = mockPrisma.operation.create.mock.calls.map(call => call[0].data.data)
      expect(stored).toContainEqual(expect.objectContaining({ id: good.id, brushRandom }))
      const pinned = storage.library('rooms', lessonId)
      expect(pinned.brushes[0].descriptor).toEqual(library.brushes[0].descriptor)
      const legacy = { ...stroke(fresh('legacy-good'), 'teacher'), tool: 'digitalBrush' as const, preset: 'brush:imported-' + 'c'.repeat(16) + '@1', strokeId: 'legacy-no-context' }
      expect(await new Promise<SendResult>(resolve => teacher.emit('operation', legacy, resolve))).toMatchObject({ ok: true, seq: 2 })
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})


describe('native XY source input admission', () => {
  it('validates all plain/packed batch dabs, live packets and endpoint-only finals before mutation', async () => {
    const { lessonId, teacher, student } = await classroom()
    const directory = mkdtempSync(joinPath(tmpdir(), 'native-xy-input-'))
    const storage = new BrushStorage(directory), library = empty()
    library.brushes.push({ name: 'generic xy', source: 'qa', warnings: [], descriptor: {
      id: 'imported-' + 'e'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'round', profile: { kind: 'gaussian', fade: .85, antialias: false }, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: .2, flow: 1, flowPer: 'stamp', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
      scatter: { count: 1, radius: .09, scale: 1, sizeJitter: 0, angleJitter: 0, flowJitter: 0 },
      behavior: { version: 2, sequentialRandom: { version: 1, kind: 'qt5Taus88', policy: 'scatterXY' }, scatter: { countJitter: 0, bothAxes: true, placement: 'xyUniform' } },
    } })
    setBrushStorage(storage, library)
    const brushRandom = { version: 1 as const, sequentialSeed: 1, strokeSeed: 2 }
    const base: StrokeOperation = { ...stroke(fresh('xy'), 'teacher'), tool: 'digitalBrush', preset: 'brush:' + library.brushes[0].descriptor.id + '@1',
      strokeId: createBrushRandomStrokeId('native-xy-sources', brushRandom), brushRandom }
    const dab: Dab = { x: 1, y: 2, size: 10, pressure: 1, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 1, t: 0 }
    const valid: Dab = { ...dab, sourceSize: 16, sourceScale: .5 }
    const badOps: StrokeOperation[] = [
      { ...base, dabs: [dab] },
      { ...base, dabs: [valid, dab] },
      { ...base, dabs: [{ ...valid, sourceSize: 1.5 }] },
      { ...base, dabs: [{ ...valid, sourceSize: 0 }] },
      { ...base, dabs: [{ ...valid, sourceScale: 1.01 }] },
      { ...base, dabs: [{ ...valid, sourceScale: undefined }] },
      { ...base, dabs: [{ ...valid, sourceScale: NaN }] },
      { ...base, dabs: undefined, dabsPacked: packDabs([dab]) },
      { ...base, dabs: undefined, dabsPacked: packDabs([valid, dab]) },
      { ...base, dabs: undefined, dabsPacked: 'malformed' },
      { ...base, dabs: [], strokeEnd: true, strokeEndSample: { ...dab, baseSize: 16 } },
    ]
    try {
      const quiet = silent(student, 'operation_confirmed', 120)
      for (const operation of badOps) {
        const result = await new Promise<SendResult>(resolve => teacher.emit('operation', { ...operation, id: fresh('bad-xy') }, resolve))
        expect(result).toEqual({ ok: false, reason: 'invalid_operation' })
      }
      await quiet
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const quietLive = silent(student, 'peer_stroke_live', 70)
      for (const dabsPacked of [packDabs([dab]), packDabs([valid, dab]), 'malformed']) {
        teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, dabsPacked, packetSeq: 0, brushRandom })
      }
      await quietLive
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const live = next(student, 'peer_stroke_live'), packed = packDabs([valid, { ...valid, sourceSize: 32, sourceScale: 0 }])
      teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, dabsPacked: packed, packetSeq: 1, brushRandom })
      expect(await live).toMatchObject({ dabsPacked: packed })
      const accepted: StrokeOperation[] = [
        { ...base, id: fresh('plain-xy'), dabs: [valid] },
        { ...base, id: fresh('packed-xy'), dabs: undefined, dabsPacked: packed },
        { ...base, id: fresh('endpoint-xy'), dabs: [], strokeEnd: true, strokeEndSample: { ...valid, baseSize: 16 } },
        { ...base, id: fresh('empty-final-xy'), dabs: [], strokeEnd: true },
      ]
      for (const [index, operation] of accepted.entries()) expect(await new Promise<SendResult>(resolve => teacher.emit('operation', operation, resolve))).toMatchObject({ ok: true, seq: index + 1 })
      await _flushPendingWrites(lessonId)
      const stored = mockPrisma.operation.create.mock.calls.map(call => call[0].data.data)
      expect(stored).toContainEqual(expect.objectContaining(canonicalStrokeStorage(accepted[0])))
      expect(stored).toContainEqual(expect.objectContaining({ id: accepted[1].id, dabsPacked: packed }))
      expect(stored).toContainEqual(expect.objectContaining(canonicalStrokeStorage(accepted[2])))
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})

describe.each([false, true])('native direction source input admission (sequential=%s)', sequential => {
  it('validates all plain/packed batch dabs, live packets and endpoint-only finals before mutation', async () => {
    const { lessonId, teacher, student } = await classroom()
    const directory = mkdtempSync(joinPath(tmpdir(), 'native-direction-input-'))
    const storage = new BrushStorage(directory), library = empty()
    library.brushes.push({ name: 'generic direction', source: 'qa', warnings: [], descriptor: {
      id: 'imported-' + 'e'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'round', profile: { kind: 'gaussian', fade: .85, antialias: false }, hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: .2, flow: 1, flowPer: 'stamp', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
      scatter: { count: 1, radius: .09, scale: 1, sizeJitter: 0, angleJitter: 0, flowJitter: 0 },
      behavior: { version: 2, strokeInput: { version: 1, initialDirection: 'cursorHistory' }, ...(sequential ? { sequentialRandom: { version: 1 as const, kind: 'qt5Taus88' as const, policy: 'scatterXY' as const } } : {}), scatter: { countJitter: 0, bothAxes: true, placement: 'xyUniform' } },
    } })
    setBrushStorage(storage, library)
    const brushRandom = { version: 1 as const, sequentialSeed: 1, strokeSeed: 2 }
    const base: StrokeOperation = { ...stroke(fresh('xy'), 'teacher'), tool: 'digitalBrush', preset: 'brush:' + library.brushes[0].descriptor.id + '@1',
      strokeId: sequential ? createBrushRandomStrokeId('native-direction-sources', brushRandom) : 'direction-without-random-context', ...(sequential ? { brushRandom } : {}) }
    const dab: Dab = { x: 1, y: 2, size: 10, pressure: 1, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 1, t: 0 }
    const allocation: Dab = { ...dab, sourceSize: 16, sourceScale: .5 }
    const valid: Dab = { ...(sequential ? allocation : dab), sourceAngle: -.803928256 }
    const encoded = packDabs([valid])
    const bytes = Buffer.from(encoded.slice(2), 'base64')
    bytes.writeDoubleLE(NaN, 52)
    const corrupt = '4:' + bytes.toString('base64')
    const badOps: StrokeOperation[] = [
      { ...base, dabs: [dab] },
      { ...base, dabs: [valid, dab] },
      { ...base, dabs: [{ ...valid, sourceAngle: NaN }] },
      { ...base, dabs: [{ ...valid, sourceAngle: Infinity }] },
      { ...base, dabs: undefined, dabsPacked: packDabs([allocation]) },
      { ...base, dabs: undefined, dabsPacked: packDabs([dab]) },
      { ...base, dabs: undefined, dabsPacked: packDabs([valid, dab]) },
      { ...base, dabs: undefined, dabsPacked: 'malformed' },
      { ...base, dabs: undefined, dabsPacked: corrupt },
      { ...base, dabs: [], strokeEnd: true, strokeEndSample: { ...dab, baseSize: 16 } },
      { ...base, dabs: [], strokeEnd: true, strokeEndSample: { ...valid, sourceAngle: NaN, baseSize: 16 } },
    ]
    if (sequential) badOps.push(
      { ...base, brushRandom: undefined, dabs: [valid] },
      { ...base, dabs: [{ ...dab, sourceAngle: 0 }] },
      { ...base, dabs: undefined, dabsPacked: packDabs([{ ...dab, sourceAngle: 0 }]) },
    )
    try {
      const quiet = silent(student, 'operation_confirmed', 120)
      for (const operation of badOps) {
        const result = await new Promise<SendResult>(resolve => teacher.emit('operation', { ...operation, id: fresh('bad-xy') }, resolve))
        expect(result).toEqual({ ok: false, reason: 'invalid_operation' })
      }
      await quiet
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const quietLive = silent(student, 'peer_stroke_live', 70)
      for (const dabsPacked of [packDabs([dab]), packDabs([allocation]), packDabs([valid, dab]), corrupt, 'malformed']) {
        teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, dabsPacked, packetSeq: 0, ...(sequential ? { brushRandom } : {}) })
      }
      await quietLive
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const live = next(student, 'peer_stroke_live'), packed = packDabs([valid, { ...valid, sourceSize: 32, sourceScale: 0 }])
      teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, dabsPacked: packed, packetSeq: 1, ...(sequential ? { brushRandom } : {}) })
      expect(await live).toMatchObject({ dabsPacked: packed })
      const accepted: StrokeOperation[] = [
        { ...base, id: fresh('plain-xy'), dabs: [valid] },
        { ...base, id: fresh('packed-xy'), dabs: undefined, dabsPacked: packed },
        { ...base, id: fresh('endpoint-xy'), dabs: [], strokeEnd: true, strokeEndSample: { ...valid, baseSize: 16 } },
        { ...base, id: fresh('empty-final-xy'), dabs: [], strokeEnd: true },
      ]
      for (const [index, operation] of accepted.entries()) expect(await new Promise<SendResult>(resolve => teacher.emit('operation', operation, resolve))).toMatchObject({ ok: true, seq: index + 1 })
      await _flushPendingWrites(lessonId)
      const stored = mockPrisma.operation.create.mock.calls.map(call => call[0].data.data)
      expect(stored).toContainEqual(expect.objectContaining(canonicalStrokeStorage(accepted[0])))
      expect(stored).toContainEqual(expect.objectContaining({ id: accepted[1].id, dabsPacked: packed }))
      expect(stored).toContainEqual(expect.objectContaining(canonicalStrokeStorage(accepted[2])))
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})


describe('lossless source-angle operation storage',()=>{
 it('relays and stores opaque binary endpoints and canonicalizes new plain dabs',async()=>{
  const {teacher,student,lessonId}=await classroom()
  for(const [i,angle] of [3.1415927410125732,Math.PI/2,Math.PI,0,-0].entries()){
   const sample={x:1,y:2,size:24,pressure:1,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:1,sourceAngle:angle}
   const op:StrokeOperation={...stroke('lossless-'+i,'teacher'),tool:'digitalBrush',preset:'ink-round',strokeId:'exact-'+i,strokeEnd:true,dabs:[sample],strokeEndSample:{...sample,baseSize:24}}
   const wire=Object.is(angle,-0)?canonicalStrokeStorage(op):op
   const confirmed=next(student,'operation_confirmed')
   expect(await new Promise<SendResult>(resolve=>teacher.emit('operation',wire,resolve))).toMatchObject({ok:true})
   const peer=(await confirmed).operation as StrokeOperation
   expect(peer.dabs).toBeUndefined();expect(peer.strokeEndSample).toBeUndefined()
   await _flushPendingWrites(lessonId)
   const saved=mockPrisma.operation.create.mock.calls.map(call=>call[0].data.data).find(value=>value.id===op.id) as StrokeOperation
   // Opaque strings bypass the numeric JSON channel; a real DB check remains device QA.
   const cold=JSON.parse(JSON.stringify(saved)) as StrokeOperation
   for(const value of [peer,cold]){
    expect(Object.is(strokeEndSample(value)?.sourceAngle,angle)).toBe(true)
    expect(Object.is(strokeDabs(value)[0].sourceAngle,angle)).toBe(true)
    expect(value.strokeEndSamplePacked).toBe(packStrokeEndSample(op.strokeEndSample!))
   }
  }
 })
 it('rejects malformed/dual binary endpoint before storage and relay',async()=>{
  const {teacher,student}=await classroom()
  const sample={x:1,y:2,size:24,pressure:1,tiltX:0,tiltY:0,angle:0,aspectRatio:1,opacity:1,t:1,baseSize:24,sourceAngle:Math.PI}
  const packed=packStrokeEndSample(sample)
  const quiet=silent(student,'operation_confirmed',100)
  for(const [i,extra] of [{strokeEndSamplePacked:packed.slice(0,-1)},{strokeEndSamplePacked:packed,strokeEndSample:sample}].entries()){
   expect(await new Promise<SendResult>(resolve=>teacher.emit('operation',{...stroke('bad-bin-'+i,'teacher'),tool:'digitalBrush',strokeId:'bad-bin',strokeEnd:true,...extra},resolve))).toEqual({ok:false,reason:'invalid_operation'})
  }
  await quiet
  expect(mockPrisma.operation.create).not.toHaveBeenCalled()
 })
})

describe.each(['timing', 'time', 'childTime'] as const)('author clock source admission (%s)', mode => {
  it('guards missing/corrupt source time before pin, persistence and live relay', async () => {
    const { teacher, student, lessonId } = await classroom()
    const directory = mkdtempSync(joinPath(tmpdir(), 'native-clock-input-'))
    const storage = new BrushStorage(directory), library = empty()
    const descriptor: import('@grafetto/shared').BrushDescriptor = {
      id: 'imported-' + 'f'.repeat(16), version: 1, model: 'stamp', category: 'paint',
      tip: { kind: 'round', hardness: 1, aspect: 1, rotation: 'fixed', angle: 0 },
      paperInteraction: 0, spacing: .2, flow: 1, flowPer: 'stamp', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
    }
    const clock: import('@grafetto/shared').BrushDynamic = { control: 'time', period: 1470, periodic: true, jitter: 0, minimum: 0 }
    descriptor.behavior = mode === 'timing' ? { version: 2, timing: { version: 1, rate: 20, ignoreDistanceSpacing: false } }
      : mode === 'time' ? { version: 2, dynamics: { size: clock } }
        : { version: 2, dual: { brush: { ...descriptor, behavior: { version: 2, dynamics: { size: clock } } }, sampling: 'independent', blendMode: 'normal' } }
    library.brushes.push({ name: 'generic author clock', source: 'qa', warnings: [], descriptor })
    setBrushStorage(storage, library)
    const base: StrokeOperation = { ...stroke(fresh('clock'), 'teacher'), tool: 'digitalBrush', preset: 'brush:' + descriptor.id + '@1', strokeId: fresh('clock-gesture') }
    const dab: Dab = { x: 1, y: 2, size: 24, pressure: 1, tiltX: 0, tiltY: 0, angle: 0, aspectRatio: 1, opacity: 1, t: 1470 }
    const valid: Dab = { ...dab, sourceTime: 1469.99999 }, packed = packDabs([valid])
    const bytes = Buffer.from(packed.slice(2), 'base64'); bytes.writeDoubleLE(NaN, 60)
    const corrupt = '5:' + bytes.toString('base64')
    try {
      const quiet = silent(student, 'operation_confirmed', 100)
      for (const extra of [
        { dabs: [dab] }, { dabs: [valid, dab] }, { dabs: undefined, dabsPacked: packDabs([dab]) },
        { dabs: undefined, dabsPacked: packDabs([valid, dab]) }, { dabs: undefined, dabsPacked: corrupt },
        { dabs: [], strokeEnd: true as const, strokeEndSample: { ...dab, baseSize: 24 } },
      ]) {
        expect(await new Promise<SendResult>(resolve => teacher.emit('operation', { ...base, ...extra, id: fresh('invalid-clock') }, resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      }
      await quiet
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const quietLive = silent(student, 'peer_stroke_live', 70)
      for (const dabsPacked of [packDabs([dab]), packDabs([valid, dab]), corrupt]) {
        teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, packetSeq: 0, dabsPacked })
      }
      await quietLive
      expect(existsSync(storage.path('rooms', lessonId))).toBe(false)
      const live = next(student, 'peer_stroke_live')
      teacher.emit('stroke_live', { strokeId: base.strokeId!, layerId: base.layerId, tool: base.tool, preset: base.preset, color: base.color, packetSeq: 1, dabsPacked: packed })
      expect(await live).toMatchObject({ dabsPacked: packed })
      const confirmed = next(student, 'operation_confirmed')
      const op: StrokeOperation = { ...base, id: fresh('valid-clock'), dabs: [valid], strokeEnd: true, strokeEndSample: { ...valid, baseSize: 24 } }
      expect(await new Promise<SendResult>(resolve => teacher.emit('operation', op, resolve))).toMatchObject({ ok: true, seq: 1 })
      const peer = (await confirmed).operation as StrokeOperation
      expect(peer.dabs).toBeUndefined(); expect(peer.strokeEndSample).toBeUndefined()
      expect(strokeDabs(peer)[0].sourceTime).toBe(valid.sourceTime)
      expect(strokeEndSample(peer)?.sourceTime).toBe(valid.sourceTime)
      expect(await new Promise<SendResult>(resolve => teacher.emit('operation', { ...base, id: fresh('empty-clock'), dabs: [], strokeEnd: true }, resolve))).toMatchObject({ ok: true, seq: 2 })
      await _flushPendingWrites(lessonId)
      const stored = mockPrisma.operation.create.mock.calls.map(call => call[0].data.data).find(value => value.id === op.id) as StrokeOperation
      expect(stored.dabsPacked).toBe(packed)
      expect(strokeEndSample(JSON.parse(JSON.stringify(stored)))?.sourceTime).toBe(valid.sourceTime)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})

it('refuses unsupported trusted room formats before loading snapshots or emitting pixels', async () => {
  for (const rasterVersion of ['straight-rgba8-v1', 'unknown-future']) {
    const roomId = fresh('format')
    rows.set(roomId, row(roomId, { rasterVersion }))
    const socket = client('teacher')
    const emitted: unknown[] = []
    socket.on('room_state', value => emitted.push(value))
    const result = await new Promise(resolve => socket.emit('join_room', { roomId, name: 'Teacher' }, resolve))
    expect(result).toEqual({ ok: false, error: 'unsupported_raster_version' })
    expect(emitted).toEqual([])
    expect(isRoomResident(roomId)).toBe(false)
    expect(mockPrisma.roomLayerSnapshot.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.operation.findMany).not.toHaveBeenCalled()
  }
})
