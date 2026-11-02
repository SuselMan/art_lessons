import { createHash } from 'node:crypto'
import { buildCanonicalMaterial,prepareCanonicalRecordedAttachment,CANONICAL_MATERIAL_PROFILE, CANONICAL_MATERIAL_LIMITS, CANONICAL_STROKE_RASTER_PROFILE, canonicalMaterialGeometryCost, sourceImageTransformMetadata, sourcePngRasterShape, packCanonicalMaterial, isBrushLibrary, type CanonicalStrokeBeginResult, type CanonicalStrokeLiveResult, type CanonicalStrokeOperation, type CanonicalMaterialFrame, type CanonicalStrokeSnapshot } from '@grafetto/shared'
import { rooms } from './roomRegistry.js'
import {canonicalStrokeStorage,strokeEndSample,strokeDabs,packStrokeEndSample} from '@grafetto/shared'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
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
const mockPrisma = vi.hoisted(() => ({$transaction:vi.fn(),
  room: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  roomParticipant: { upsert: vi.fn(), findUnique: vi.fn() },
  roomPalette: { findUnique: vi.fn(), upsert: vi.fn() },
  roomLayerState: { findUnique: vi.fn() },
  assignment: { findMany: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn(), findMany: vi.fn() },
  $queryRawUnsafe:vi.fn(),$executeRawUnsafe:vi.fn(),
  operation: { findFirst:vi.fn(),create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  roomBlock: { findUnique: vi.fn() },
  roomInvite: { findUnique: vi.fn() },
  roomJoinRequest: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
}))
mockPrisma.$transaction=vi.fn(async(run:(connection:typeof mockPrisma)=>Promise<unknown>)=>run(mockPrisma))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('../db/canonicalIndexedReader.js',()=>({withCanonicalIndexedValidation:async(run:(database:unknown)=>Promise<unknown>)=>run(mockPrisma)}))
const resolveIdentity=vi.hoisted(()=>vi.fn(async(cookie:string|undefined)=>({userId:cookie??'anonymous',deviceId:'device'})))
vi.mock('../auth/identity.js', () => ({resolveSocketIdentity:resolveIdentity}))
vi.mock('../auth/sessions.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth/sessions.js')>()),
  recordSighting: () => {},
}))
vi.mock('../health/memory.js', () => ({
  readMemory: () => ({ heapUsedPct: 0, heapUsedMb: 0 }),
  pressureOf: () => 'ok',
}))
vi.mock('../instrument.js', () => ({ reportException: () => {}, reportIssue: () => {} }))

// Test-only explicit auto policy. Production default remains empty/OFF; real
// handlers/storage/transport and their durable write receipt still execute.
vi.mock('./canonicalExecutionPolicy.js',async importOriginal=>{
 const original=await importOriginal<typeof import('./canonicalExecutionPolicy.js')>()
 return {...original,CANONICAL_ROOM_EXECUTION_POLICY:{...original.CANONICAL_ROOM_EXECUTION_POLICY,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1}}}}
})
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
    if(vi.isMockFunction(model))model.mockReset()
    else for(const fn of Object.values(model))if(vi.isMockFunction(fn))fn.mockReset()
  }
  mockPrisma.$transaction.mockImplementation(async(run:(connection:typeof mockPrisma)=>Promise<unknown>)=>run(mockPrisma))
  rows.clear()
  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null)
  mockPrisma.room.findMany.mockImplementation(async ({ where }: { where: { OR: [{ id: string }] } }) =>
    [...rows.values()].filter(r => r.id === where.OR[0].id || r.lessonId === where.OR[0].id))
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.assignment.findMany.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.groupBy.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.findMany.mockResolvedValue([])
  mockPrisma.operation.findMany.mockResolvedValue([])
  mockPrisma.operation.findUnique.mockResolvedValue(null)
  mockPrisma.operation.count.mockResolvedValue(0)
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
    const legacyState=await state
    if(!legacyState.tailOperations)throw Error('Expected legacy original tail')
    const history = legacyState.tailOperations.filter(op => op.type === 'stroke' && op.strokeId === gestureId)
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
  const legacyState=await state
  if(!legacyState.tailOperations)throw Error('Expected legacy original tail')
  const tail = legacyState.tailOperations
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

it('rejects unregistered canonical operation/live claims before pin, persistence and relay', async () => {
  const { teacher, student, lessonId } = await classroom()
  const directory = mkdtempSync(joinPath(tmpdir(), 'closed-canonical-'))
  const storage = new BrushStorage(directory), pin = vi.spyOn(storage, 'pin')
  setBrushStorage(storage, empty())
  try {
    for (const patch of [{ type: 'canonical_stroke', frame: {} }, { type: 'future_unregistered' }, { canonicalFrame: {} }, { rasterProfile: 'installed-arm64-scalar-fused-fpcr0-v1' }, { materialPacked: '1|AAAA' }]) {
      const quiet = silent(student, 'operation_confirmed', 30)
      const operation = { ...stroke(fresh('closed-canonical'), 'teacher'), preset: 'brush:imported-' + 'a'.repeat(16) + '@1', ...patch }
      const result = await new Promise<SendResult>(resolve => teacher.emit('operation', operation as never, resolve))
      expect(result).toMatchObject({ ok: false, reason: 'invalid_operation' })
      await quiet
    }
    for (const patch of [{ type: 'canonical_stroke_live', frame: {} }, { canonicalFrame: {} }, { materialPacked: '1|AAAA' }, { rasterProfile: 'installed-arm64-scalar-fused-fpcr0-v1' }]) {
      const quiet = silent(student, 'peer_stroke_live', 30)
      teacher.emit('stroke_live', { strokeId: 'closed', layerId: 'layer-1', tool: 'digitalBrush', preset: 'brush:imported-' + 'a'.repeat(16) + '@1', color: [0, 0, 0], dabsPacked: '', packetSeq: 0, ...patch } as never)
      await quiet
    }
    await _flushPendingWrites(lessonId)
    expect(pin).not.toHaveBeenCalled()
    expect(mockPrisma.operation.create).not.toHaveBeenCalled()
  } finally { setBrushStorage(new BrushStorage(directory), empty()); rmSync(directory, { recursive: true, force: true }) }
})


/** Test-only authoritative room-format injection; production create/join still
 * rejects straight rooms. The actual socket handlers/coordinator/storage run. */
async function canonicalClassroom() {
  const c = await classroom(), record = rooms.get(c.lessonId)!
  record.room.rasterVersion = 'straight-rgba8-v1'
  const dir = mkdtempSync(joinPath(tmpdir(), 'canonical-wire-'))
  const storage = new BrushStorage(dir), bytes = Buffer.alloc(64, 127), hash = createHash('sha256').update(bytes).digest('hex')
  const imported = JSON.parse(readFileSync(new URL('../../../web/src/engine/src/presets/fixtures/sourceStrokeAuthorDescriptor.compiled.json', import.meta.url), 'utf8'))
  const descriptor = { ...imported.descriptor, tip: { ...imported.descriptor.tip, mask: `asset:${hash}` } }
  const library: unknown = { schemaVersion: 1, assets: [{ id: `asset:${hash}`, size: 8, file: hash + '.bin' }], skipped: [],
    brushes: [{ name: 'Authored', source: 'fixture.kpp', warnings: [], descriptor }] }
  if (!isBrushLibrary(library)) throw Error('invalid fixture')
  storage.provision(new Map([[hash, bytes]])); setBrushStorage(storage, library)
  const begin = { layerId: 'layer-1', brush: `brush:${descriptor.id}@${descriptor.version}`, strokeId: fresh('canonical-gesture'),
    pigmentRgb8: [31, 117, 203] as const, outerResourceOpacity: .63, alphaDarken: 'creamy' as const }
  return { ...c, record, storage, library, descriptor, begin, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
function canonicalFrames(snapshot: CanonicalStrokeSnapshot, descriptor: { sourceStamp: { brush: { width: number; height: number; scale: number; angle: number } } }) {
  const brush = descriptor.sourceStamp.brush
  const extent = sourceImageTransformMetadata(brush.width, brush.height, sourcePngRasterShape(brush, { scale: 1, ratio: 1, rotation: 0 }), 0, 0)
  const recipe = { asset: snapshot.assets[0].id, brushScale: brush.scale, brushAngle: brush.angle, scale: 1, ratio: 1, rotation: 0,
    subX: 0, subY: 0, width: extent.width, height: extent.height, mirrorH: false, mirrorV: false }
  const context = { assets: snapshot.assets, primaryAsset: recipe.asset, preflightDefinition: canonicalMaterialGeometryCost, budget: CANONICAL_MATERIAL_LIMITS }
  return [0, 1].map(ordinal => {
    const material: CanonicalMaterialFrame = { profile: CANONICAL_MATERIAL_PROFILE, masked: false,
      entry: ordinal ? { phase: 'primary', group: 0 } : { phase: 'between' }, definitions: [recipe],
      draws: [{ definition: 0, role: 'primary', x: ordinal * 7 - 3, y: 5, opacity: .4, flow: .7 }],
      fences: ordinal ? [{ at: 1, kind: 'primaryEnd', group: 0 }, { at: 1, kind: 'segmentEnd', group: 0 }, { at: 1, kind: 'gestureEnd' }]
        : [{ at: 0, kind: 'segmentBegin', group: 0 }] }
    return { version: 1 as const, rasterProfile: CANONICAL_STROKE_RASTER_PROFILE, brush: snapshot.brush, strokeId: snapshot.strokeId,
      frameOrdinal: ordinal, pigmentRgb8: snapshot.pigmentRgb8, composition: snapshot.composition, materialPacked: packCanonicalMaterial(material, context) }
  })
}
describe('canonical begin/live/recorded actual socket authority (straight creation remains closed)', () => {
  it('rejects every canonical route in legacy rooms before pins, DB work or relay', async () => {
    const c = await classroom(), pin = vi.spyOn(BrushStorage.prototype, 'pin')
    try {
      const denied = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', {
        layerId: 'layer-1', brush: 'brush:imported-test@1', strokeId: 'g', pigmentRgb8: [1, 2, 3], outerResourceOpacity: 1, alphaDarken: 'creamy',
      }, resolve))
      expect(denied).toEqual({ ok: false, reason: 'invalid_operation' })
      const frame = {} as CanonicalStrokeOperation['frame']
      expect(await new Promise<CanonicalStrokeLiveResult>(resolve => c.teacher.emit('canonical_stroke_live', { layerId: 'layer-1', frame }, resolve))).toMatchObject({ ok: false })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('canonical'), type: 'canonical_stroke', userId: 'teacher', timestamp: 0, layerId: 'layer-1', frame }, resolve))).toMatchObject({ ok: false })
      expect(pin).not.toHaveBeenCalled(); expect(mockPrisma.operation.count).not.toHaveBeenCalled(); expect(mockPrisma.operation.create).not.toHaveBeenCalled()
    } finally { pin.mockRestore() }
  })
  it('pins authenticated begin snapshot then shares immutable live/recorded frames, exact retries and total seq', async () => {
    const c = await canonicalClassroom()
    try {
      const result = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      expect(result.ok).toBe(true); if (!result.ok) throw Error('begin failed')
      expect(result.snapshot.pigmentRgb8).toEqual([31, 117, 203]); expect(result.snapshot.composition.outerResourceOpacity).toBe(.63)
      expect(c.storage.library('rooms', c.lessonId).brushes).toHaveLength(1)
      const [frame0, frame1] = canonicalFrames(result.snapshot, c.descriptor)
      const live = next(c.student, 'peer_canonical_stroke_live')
      expect(await new Promise<CanonicalStrokeLiveResult>(resolve => c.teacher.emit('canonical_stroke_live', { layerId: c.begin.layerId, frame: frame0 }, resolve))).toEqual({ ok: true, duplicate: false })
      expect(await live).toMatchObject({ userId: 'teacher', frame: frame0 })
      const quiet = silent(c.student, 'peer_canonical_stroke_live', 25)
      expect(await new Promise<CanonicalStrokeLiveResult>(resolve => c.teacher.emit('canonical_stroke_live', { layerId: c.begin.layerId, frame: frame0 }, resolve))).toEqual({ ok: true, duplicate: true })
      await quiet
      const op: CanonicalStrokeOperation = { type: 'canonical_stroke', id: fresh('canonical-op'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: frame0 }
      const confirmed = next(c.student, 'operation_confirmed')
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: true, seq: 1 })
      expect(await confirmed).toEqual({ seq: 1, operation: { ...op, seq: 1 } })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: true, seq: 1, duplicate: true })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { ...op, frame: { ...frame0, pigmentRgb8: [0, 0, 0] } }, resolve))).toMatchObject({ ok: false })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { ...op, id: fresh('canonical-final'), frame: frame1 }, resolve))).toEqual({ ok: true, seq: 2 })
      await _flushPendingWrites(c.lessonId)
      expect(mockPrisma.operation.create.mock.calls.filter(call => call[0].data.type === 'canonical_stroke')).toHaveLength(2)
      expect(await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))).toMatchObject({ ok: true, recordedNext: 2 })
    } finally { c.cleanup() }
  })
  it('preserves FIFO when ordinal0 duplicate preflight awaits; ordinal1 never overtakes it', async () => {
    const c = await canonicalClassroom()
    try {
      const begin = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      if (!begin.ok) throw Error('begin failed')
      const frames = canonicalFrames(begin.snapshot, c.descriptor)
      let release!: (v: null) => void
      mockPrisma.operation.findUnique.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      const op = (i: number): CanonicalStrokeOperation => ({ type: 'canonical_stroke', id: fresh('fifo'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: frames[i] })
      const p0 = new Promise<SendResult>(resolve => c.teacher.emit('operation', op(0), resolve))
      const p1 = new Promise<SendResult>(resolve => c.teacher.emit('operation', op(1), resolve))
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(mockPrisma.operation.findUnique).toHaveBeenCalledTimes(1)
      release(null)
      expect(await p0).toEqual({ ok: true, seq: 1 }); expect(await p1).toEqual({ ok: true, seq: 2 })
    } finally { c.cleanup() }
  })
  it('ACKs and relays a canonical frame only after durable insert or verified same-ID repair', async () => {
    const c = await canonicalClassroom(), log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const begin = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      if (!begin.ok) throw Error('begin failed')
      const op: CanonicalStrokeOperation = { type: 'canonical_stroke', id: fresh('durable'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: canonicalFrames(begin.snapshot, c.descriptor)[0] }
      let reject!: (error: Error) => void
      mockPrisma.operation.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
      const settled = vi.fn(), quiet = silent(c.student, 'operation_confirmed', 40)
      const pending = new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve)); void pending.then(settled)
      await vi.waitFor(() => expect(c.record.operations).toHaveLength(1))
      await quiet; expect(settled).not.toHaveBeenCalled()
      reject(new Error('insert failed after append'))
      expect(await pending).toEqual({ ok: false, reason: 'canonical_repair_required' })
      expect(c.record.nextSeq).toBe(2)
      const confirmed = next(c.student, 'operation_confirmed')
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: true, seq: 1, duplicate: true })
      expect(await confirmed).toEqual({ seq: 1, operation: { ...op, seq: 1 } })
      expect(c.record.nextSeq).toBe(2); expect(c.record.operations).toHaveLength(1)
      expect(mockPrisma.operation.create).toHaveBeenCalledTimes(2)
    } finally { log.mockRestore(); c.cleanup() }
  })
  it('does not publish a begin on pin failure and rejects stale authority after async DB work', async () => {
    const c = await canonicalClassroom(), pin = vi.spyOn(c.storage, 'pin')
    try {
      pin.mockImplementationOnce(() => { throw Error('quota failure') })
      expect(await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))).toEqual({ ok: false, reason: 'server_error' })
      pin.mockRestore()
      const retry = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', { ...c.begin, pigmentRgb8: [7, 8, 9] }, resolve))
      expect(retry.ok).toBe(true); if (!retry.ok) throw Error('retry failed')
      expect(retry.snapshot.pigmentRgb8).toEqual([7, 8, 9]) // failed pin published no immutable gesture
      const frames = canonicalFrames(retry.snapshot, c.descriptor)
      let release!: (v: null) => void
      mockPrisma.operation.findUnique.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      const pending = new Promise<SendResult>(resolve => c.teacher.emit('operation', { type: 'canonical_stroke', id: fresh('stale'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: frames[0] }, resolve))
      await new Promise(resolve => setTimeout(resolve, 20)); c.record.sharedLockedLayerIds.add('layer-1'); release(null)
      expect(await pending).toMatchObject({ ok: false }); expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      c.record.sharedLockedLayerIds.clear()
      const retryOp: CanonicalStrokeOperation = { type: 'canonical_stroke', id: fresh('db-retry'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: frames[0] }
      mockPrisma.operation.findUnique.mockRejectedValueOnce(new Error('DB unavailable'))
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', retryOp, resolve))).toEqual({ ok: false, reason: 'server_error' })
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', retryOp, resolve))).toEqual({ ok: true, seq: 1 })
    } finally { pin.mockRestore(); c.cleanup() }
  })
  it('rehydrates a complete persisted prefix after resident replacement and deduplicates covered IDs without repinning', async () => {
    const c = await canonicalClassroom()
    try {
      const begin = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      if (!begin.ok) throw Error('begin failed')
      const frames = canonicalFrames(begin.snapshot, c.descriptor)
      const prefix = frames.map((frame, i): CanonicalStrokeOperation => ({ type: 'canonical_stroke', id: fresh('persisted'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame, seq: i + 1 }))
      rooms.set(c.lessonId, { ...c.record, operations: [], operationsById: new Map(), nextSeq: 3 })
      mockPrisma.operation.findMany.mockResolvedValue(prefix.map(data => ({ id: data.id, roomId: c.lessonId, userId: data.userId, seq: data.seq, type: data.type, layerId: data.layerId, tool: null, data })))
      const replay = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      expect(replay).toMatchObject({ ok: true, recordedNext: 2, liveNext: 2, ended: true })
      mockPrisma.operation.findUnique.mockResolvedValue({ id: prefix[0].id, roomId: c.lessonId, userId: 'teacher', seq: 1, type: 'canonical_stroke', layerId: c.begin.layerId, tool: null, data: prefix[0] })
      const pin = vi.spyOn(c.storage, 'pin')
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', prefix[0], resolve))).toEqual({ ok: true, seq: 1, duplicate: true })
      expect(pin).not.toHaveBeenCalled(); pin.mockRestore()
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(mockPrisma.operation.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{roomId:c.lessonId,seq:{gt:0,lte:2},OR:[{userId:'teacher',type:'canonical_stroke',data:{path:['frame','strokeId'],equals:c.begin.strokeId}},{type:'canonical_stroke_close',AND:[{data:{path:['targetUserId'],equals:'teacher'}},{data:{path:['strokeId'],equals:c.begin.strokeId}}]}]},orderBy:{seq:'asc'},take:64}))
    } finally { c.cleanup() }
  })
  it('rejects an incomplete bounded persisted prefix rather than granting a new ordinal0', async () => {
    const c = await canonicalClassroom()
    try {
      const begin=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',c.begin,resolve))
      if(!begin.ok)throw Error('Initial binding failed')
      const frame=canonicalFrames(begin.snapshot,c.descriptor)[1]
      const data:CanonicalStrokeOperation={id:fresh('known-tail'),userId:'teacher',timestamp:0,seq:2,type:'canonical_stroke',layerId:c.begin.layerId,frame}
      rooms.set(c.lessonId,{...c.record,operations:[],operationsById:new Map(),nextSeq:3})
      mockPrisma.operation.findMany.mockResolvedValue([{id:data.id,roomId:c.lessonId,userId:data.userId,seq:2,type:data.type,layerId:data.layerId,tool:null,data}])
      const pin=vi.spyOn(c.storage,'pin'),before=c.storage.library('rooms',c.lessonId)
      expect(await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',c.begin,resolve))).toEqual({ok:false,reason:'canonical_repair_required'})
      expect(pin).not.toHaveBeenCalled();pin.mockRestore()
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(c.storage.library('rooms',c.lessonId)).toEqual(before)
    } finally { c.cleanup() }
  })
  it('rejects persisted operation ID collisions and rechecks room identity after a delayed begin', async () => {
    const c = await canonicalClassroom()
    try {
      const begin = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      if (!begin.ok) throw Error('begin failed')
      const frames = canonicalFrames(begin.snapshot, c.descriptor)
      const op: CanonicalStrokeOperation = { type: 'canonical_stroke', id: fresh('collision'), userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame: frames[0] }
      mockPrisma.operation.findUnique.mockResolvedValue({ roomId: 'another-room', data: op })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      mockPrisma.operation.findUnique.mockResolvedValue({ roomId: c.lessonId, userId: 'another-user', seq: 1, data: { ...op, userId: 'another-user', seq: 1 } })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      mockPrisma.operation.findUnique.mockResolvedValue({ id: op.id, roomId: c.lessonId, userId: 'teacher', seq: 1, type: 'canonical_stroke', layerId: op.layerId, tool: null, data: { ...op, seq: 1, frame: { ...op.frame, pigmentRgb8: [1, 1, 1] } } })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', op, resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      let release!: (rows:import('./roomPersistence.js').CanonicalStoredOperationRow[]) => void
      mockPrisma.operation.findMany.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      const pin = vi.spyOn(c.storage, 'pin')
      const pending = new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', { ...c.begin, strokeId: 'new-stroke' }, resolve))
      await new Promise(resolve => setTimeout(resolve, 20))
      rooms.set(c.lessonId, { ...c.record }); release([])
      expect(await pending).toMatchObject({ ok: false })
      expect(pin).not.toHaveBeenCalled(); pin.mockRestore()
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
    } finally { c.cleanup() }
  })

  it('bounds queued canonical work while preserving a fresh begin and rejects packets before their authority exists', async () => {
    const c = await canonicalClassroom()
    try {
      let release!: (rows:import('./roomPersistence.js').CanonicalStoredOperationRow[]) => void
      mockPrisma.operation.findMany.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
      const pin = vi.spyOn(c.storage, 'pin')
      const requests = Array.from({ length: 9 }, (_, i) => new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', { ...c.begin, strokeId: 'bounded-' + i }, resolve)))
      expect(await requests[8]).toEqual({ ok: false, reason: 'canonical_repair_required' })
      expect(pin).not.toHaveBeenCalled()
      release([])
      expect((await Promise.all(requests.slice(0, 8))).every(r => r.ok)).toBe(true)
      pin.mockRestore()
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
    } finally { c.cleanup() }
  })

  it('keeps old pixel writers closed in authoritative straight rooms before duplicates/pin while structural edits remain allowed', async () => {
    const c = await canonicalClassroom(), pin = vi.spyOn(c.storage, 'pin')
    try {
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', stroke(fresh('old-writer'), 'teacher'), resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('zero'), type: 'layer_clear', userId: 'teacher', timestamp: 0, layerId: 'layer-1' }, resolve))).toEqual({ ok: false, reason: 'invalid_operation' })
      expect(pin).not.toHaveBeenCalled(); expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('rename'), type: 'layer_rename', userId: 'teacher', timestamp: 0, layerId: 'layer-1', name: 'Renamed' }, resolve))).toEqual({ ok: true, seq: 1 })
    } finally { pin.mockRestore(); c.cleanup() }
  })

  it('uses normal structural branch invalidation when canonical ink follows an undo', async () => {
    const c = await canonicalClassroom()
    try {
      const add = { id: fresh('new-layer'), type: 'layer_add' as const, userId: 'teacher', timestamp: 0, layerId: 'branch-layer', name: 'Branch' }
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', add, resolve))).toMatchObject({ ok: true })
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('undo-branch'), type: 'operation_undo', userId: 'teacher', timestamp: 0, targetOpId: add.id }, resolve))).toMatchObject({ ok: true })
      expect(c.record.structuralLog.find(e => e.op.id === add.id)?.state).toBe('undone')
      const begin = await new Promise<CanonicalStrokeBeginResult>(resolve => c.teacher.emit('canonical_stroke_begin', c.begin, resolve))
      if (!begin.ok) throw Error('begin failed')
      const frame = canonicalFrames(begin.snapshot, c.descriptor)[0]
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('canonical-branch'), type: 'canonical_stroke', userId: 'teacher', timestamp: 0, layerId: c.begin.layerId, frame }, resolve))).toMatchObject({ ok: true })
      expect(c.record.structuralLog.find(e => e.op.id === add.id)?.state).toBe('gone')
      expect(await new Promise<SendResult>(resolve => c.teacher.emit('operation', { id: fresh('redo-branch'), type: 'operation_redo', userId: 'teacher', timestamp: 0, targetOpId: add.id }, resolve))).toMatchObject({ ok: true })
      expect(c.record.aliveIds.has('branch-layer')).toBe(false)
    } finally { c.cleanup() }
  })

})

it('delivers durable V2 confirmation and rejoined closed undo prefix atomically through the SAME read owner',async()=>{
 const c=await canonicalClassroom()
 try{
  const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
  const descriptor=stock.rows[0].descriptor
  setBrushStorage(c.storage,{schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Auto',source:'native.kpp',warnings:[],descriptor}]})
  const begin={...c.begin,brush:`brush:${descriptor.id}@${descriptor.version}`}
  const response=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',begin,resolve))
  if(!response.ok||!('materialVersion' in response.snapshot)||response.snapshot.materialVersion!==2)throw Error('Expected V2 BEGIN')
  const s=response.snapshot,materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{at:0,kind:'gestureEnd'}]},s.material).packed
  if(s.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE)throw Error('Expected legacy raster profile in this fixture')
  const op:CanonicalStrokeOperation={type:'canonical_stroke',id:fresh('auto-cap'),userId:'teacher',timestamp:0,layerId:begin.layerId,frame:{version:1,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
  await _flushPendingWrites(c.lessonId)
  let release!:()=>void;const write=new Promise<void>(resolve=>{release=resolve});mockPrisma.operation.create.mockReturnValueOnce(write)
  const confirmed=next(c.student,'operation_confirmed'),quiet=silent(c.student,'operation_confirmed',40)
  const pending=new Promise<SendResult>(resolve=>c.teacher.emit('operation',op,resolve)),settled=vi.fn();void pending.then(settled)
  await vi.waitFor(()=>expect(c.record.operations.some(o=>o.id===op.id)).toBe(true));await quiet;expect(settled).not.toHaveBeenCalled()
  release();expect(await pending).toMatchObject({ok:true})
  const event=await confirmed
  expect(event.canonicalCapabilities?.bindings).toEqual([{operationId:op.id,sequence:event.seq,originalUserId:'teacher',capability:0}])
  if(event.operation.type!=='canonical_stroke')throw Error('Expected canonical operation')
  expect(event.operation.frame.materialPacked).toBe(materialPacked)
  expect(prepareCanonicalRecordedAttachment(event.canonicalCapabilities,[event.operation],{roomId:c.lessonId,boardEpoch:s.boardEpoch})).toHaveLength(1)
  const persisted=mockPrisma.operation.create.mock.calls.find(([request])=>request.data.id===op.id)![0].data
  mockPrisma.operation.findMany.mockImplementation(async({where})=>where.OR?.some((branch:{type?:string})=>branch.type==='canonical_stroke')?[persisted]:[])
  const undo={id:fresh('closed-source-undo'),type:'operation_undo' as const,userId:'teacher',timestamp:1,targetOpId:op.id}
  let rejectUndo!:(error:Error)=>void
  mockPrisma.operation.create.mockReturnValueOnce(new Promise<void>((_,reject)=>{rejectUndo=reject}))
  const undoConfirmed=next(c.student,'operation_confirmed'),undoQuiet=silent(c.student,'operation_confirmed',40),undoSettled=vi.fn()
  const undoPending=new Promise<SendResult>(resolve=>c.teacher.emit('operation',undo,resolve));void undoPending.then(undoSettled)
  await vi.waitFor(()=>expect(c.record.operationsById.has(undo.id)).toBe(true));await undoQuiet
  expect(undoSettled).not.toHaveBeenCalled()
  const undoSeq=c.record.operationsById.get(undo.id)!.seq!,nextSeq=c.record.nextSeq
  const log=vi.spyOn(console,'error').mockImplementation(()=>{})
  try{rejectUndo(new Error('metadata insert failed'));expect(await undoPending).toEqual({ok:false,reason:'canonical_repair_required'})}finally{log.mockRestore()}
  const failedQuiet=silent(c.student,'operation_confirmed',40);await failedQuiet
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',undo,resolve))).toEqual({ok:true,seq:undoSeq,duplicate:true})
  expect((await undoConfirmed).operation.id).toBe(undo.id)
  expect(c.record.nextSeq).toBe(nextSeq);expect(c.record.operations.filter(entry=>entry.id===undo.id)).toHaveLength(1)
  await _flushPendingWrites(c.lessonId)
  const state=next(c.student,'room_state')
  expect(await new Promise(resolve=>c.student.emit('join_room',{roomId:c.lessonId,name:'Student'},resolve))).toMatchObject({ok:true})
  const restored=await state
  if(!restored.tailOperations)throw Error('Expected legacy original tail')
  expect(restored.tailOperations.map(entry=>entry.id)).toEqual([op.id,undo.id])
  expect(restored.canonicalReadScope?.roomId).toBe(c.lessonId)
  if(!restored.canonicalReadScope)throw Error('Expected captured read scope')
  expect(prepareCanonicalRecordedAttachment(restored.canonicalCapabilities,restored.tailOperations,restored.canonicalReadScope)[0].read?.operationId).toBe(op.id)
  const redo={id:fresh('closed-source-redo'),type:'operation_redo' as const,userId:'teacher',timestamp:2,targetOpId:op.id}
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',redo,resolve))).toMatchObject({ok:true})
  expect(await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',begin,resolve))).toMatchObject({ok:true,ended:true,recordedNext:1})
  const beforeLate=c.record.nextSeq
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',{...op,id:fresh('closed-source-late'),frame:{...op.frame,frameOrdinal:1}},resolve))).toEqual({ok:false,reason:'invalid_operation'})
  expect(c.record.nextSeq).toBe(beforeLate)
  await _flushPendingWrites(c.lessonId);mockPrisma.roomParticipant.upsert.mockClear()
  const oldParticipant=c.record.participants.get('student'),beforeWrites=mockPrisma.operation.create.mock.calls.length
  mockPrisma.operation.findMany.mockResolvedValue([])
  const quietState=silent(c.student,'room_state',40)
  expect(await new Promise(resolve=>c.student.emit('join_room',{roomId:c.lessonId,name:'Must not publish'},resolve))).toEqual({ok:false,error:'server_busy'})
  await quietState
  expect(c.record.participants.get('student')).toBe(oldParticipant)
  expect(mockPrisma.roomParticipant.upsert).not.toHaveBeenCalled();expect(mockPrisma.operation.create).toHaveBeenCalledTimes(beforeWrites)
 }finally{c.cleanup()}
})

describe('join preparation is committed only by the current socket request',()=>{
 it('keeps seating and channels unchanged while A awaits; newer same-target B wins before A resumes',async()=>{
  const {lessonId,boardId,student}=await classroom()
  await _flushPendingWrites(lessonId);mockPrisma.roomParticipant.upsert.mockClear()
  let release!:(value:null)=>void
  let entered!:()=>void
  const blocked=new Promise<void>(resolve=>{entered=resolve})
  mockPrisma.roomBlock.findUnique.mockImplementationOnce(()=>{entered();return new Promise(resolve=>{release=resolve})})
  const states:string[]=[];student.on('room_state',s=>states.push(s.room.id))
  const a=new Promise(resolve=>student.emit('join_room',{roomId:boardId,name:'A'},resolve))
  await blocked
  expect(rooms.get(lessonId)!.participants.get('student')!.boardId).toBe(lessonId)
  expect(mockPrisma.roomParticipant.upsert).not.toHaveBeenCalled()
  const b=new Promise(resolve=>student.emit('join_room',{roomId:boardId,name:'B'},resolve))
  expect(await b).toMatchObject({ok:true})
  release(null)
  expect(await a).toEqual({ok:false,error:'server_busy'})
  await _flushPendingWrites(lessonId)
  expect(states).toEqual([boardId]);expect(rooms.get(lessonId)!.participants.get('student')!.name).toBe('B')
  expect(mockPrisma.roomParticipant.upsert).toHaveBeenCalledTimes(1)
 })
})
it('failed snapshot preflight keeps the original seat and writes no successful participation',async()=>{
 const {lessonId,boardId,student}=await classroom()
 await _flushPendingWrites(lessonId);mockPrisma.roomParticipant.upsert.mockClear()
 mockPrisma.roomLayerSnapshot.findMany.mockRejectedValueOnce(Error('snapshot read unavailable'))
 const states:string[]=[];student.on('room_state',s=>states.push(s.room.id))
 const result=await new Promise(resolve=>student.emit('join_room',{roomId:boardId,name:'Failed'},resolve))
 expect(result).toEqual({ok:false,error:'server_busy'})
 expect(rooms.get(lessonId)!.participants.get('student')!.boardId).toBe(lessonId)
 expect(mockPrisma.roomParticipant.upsert).not.toHaveBeenCalled();expect(states).toEqual([])
})

it('orders typed close on the SAME canonical socket queue and confirms only its durable metadata',async()=>{
 const c=await canonicalClassroom();let release:()=>void=()=>{}
 try{
  const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
  const descriptor=stock.rows[0].descriptor
  setBrushStorage(c.storage,{schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Auto',source:'native.kpp',warnings:[],descriptor}]})
  const begin={...c.begin,brush:`brush:${descriptor.id}@${descriptor.version}`},response=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',begin,resolve))
  if(!response.ok||!('materialVersion'in response.snapshot))throw Error('Expected actual V2 source')
  const s=response.snapshot
  if(s.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE)throw Error('Expected captured old profile')
  const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},s.material).packed
  const op:CanonicalStrokeOperation={type:'canonical_stroke',id:fresh('close-source'),userId:'teacher',timestamp:0,layerId:begin.layerId,frame:{version:1,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
  const request={operationId:fresh('typed-close'),layerId:op.layerId,targetUserId:'teacher',strokeId:s.strokeId,disposition:'commitPartial' as const,expectedRecordedNext:1,expectedLastFrameOpId:op.id}
  const persisted:typeof mockPrisma.operation.create.mock.calls[number][0]['data'][]=[]
  mockPrisma.operation.create.mockImplementation(async q=>{persisted.push(q.data)})
  mockPrisma.operation.findMany.mockImplementation(async({where})=>persisted.filter(row=>row.seq>where.seq.gt&&row.seq<=where.seq.lte&&(!where.OR||row.type==='canonical_stroke'||row.type==='canonical_stroke_close')))
  await _flushPendingWrites(c.lessonId)
  const frameWrite=new Promise<void>(resolve=>{release=resolve})
  mockPrisma.operation.create.mockImplementationOnce(async q=>{await frameWrite;persisted.push(q.data)})
  const frameAck=new Promise<SendResult>(resolve=>c.teacher.emit('operation',op,resolve)),closeAck=new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',request,resolve)),settled=vi.fn();void closeAck.then(settled)
  await vi.waitFor(()=>expect(c.record.operationsById.has(op.id)).toBe(true));await new Promise(resolve=>setTimeout(resolve,30))
  expect(settled).not.toHaveBeenCalled();expect(c.record.operationsById.has(request.operationId)).toBe(false)
  const confirmed:Parameters<ServerToClientEvents['operation_confirmed']>[0][]=[]
  c.student.on('operation_confirmed',payload=>confirmed.push(payload))
  release();expect(await frameAck).toMatchObject({ok:true})
  expect(await Promise.race([closeAck,new Promise(resolve=>setTimeout(()=>resolve('missing typed close ACK'),500))])).toMatchObject({ok:true})
  await vi.waitFor(()=>expect(confirmed.some(p=>p.operation.id===request.operationId)).toBe(true))
  const event=confirmed.find(p=>p.operation.id===request.operationId)!
  expect(event.operation).toMatchObject({type:'canonical_stroke_close',recordedNext:1,firstFrameOpId:op.id,lastFrameOpId:op.id,seq:event.seq})
  expect(event).not.toHaveProperty('canonicalCapabilities')
  const nextSeq=c.record.nextSeq,writes=mockPrisma.operation.create.mock.calls.length
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',request,resolve))).toEqual({ok:true,seq:event.seq,duplicate:true})
  expect(c.record.nextSeq).toBe(nextSeq);expect(mockPrisma.operation.create).toHaveBeenCalledTimes(writes)
  expect(await new Promise<SendResult>(resolve=>c.student.emit('canonical_stroke_close',request,resolve))).toMatchObject({ok:false})
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',event.operation,resolve))).toMatchObject({ok:false})
 }finally{release();await _flushPendingWrites(c.lessonId);c.cleanup()}
})

async function typedCloseClassroom(){
 const c=await canonicalClassroom()
 const {default:stock}=await import(new URL('../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts',import.meta.url).href)
 const descriptor=stock.rows[0].descriptor
 setBrushStorage(c.storage,{schemaVersion:1,assets:[],skipped:[],brushes:[{name:'Auto',source:'native.kpp',warnings:[],descriptor}]})
 const response=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',{...c.begin,brush:`brush:${descriptor.id}@${descriptor.version}`},resolve))
 if(!response.ok||!('materialVersion'in response.snapshot))throw Error('Expected actual V2 source')
 const s=response.snapshot
 if(s.rasterProfile!==CANONICAL_STROKE_RASTER_PROFILE)throw Error('Expected captured old profile')
 const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},s.material).packed
 const op:CanonicalStrokeOperation={type:'canonical_stroke',id:fresh('typed-open'),userId:'teacher',timestamp:0,layerId:c.begin.layerId,frame:{version:1,rasterProfile:s.rasterProfile,brush:s.brush,strokeId:s.strokeId,frameOrdinal:0,pigmentRgb8:s.pigmentRgb8,composition:s.composition,materialPacked}}
 const persisted:typeof mockPrisma.operation.create.mock.calls[number][0]['data'][]=[]
 await _flushPendingWrites(c.lessonId)
 mockPrisma.operation.create.mockImplementation(async q=>{persisted.push(q.data)})
 mockPrisma.operation.findMany.mockImplementation(async({where})=>persisted.filter(row=>row.seq>where.seq.gt&&row.seq<=where.seq.lte&&(!where.OR||row.type==='canonical_stroke'||row.type==='canonical_stroke_close')))
 const confirmed=next(c.student,'operation_confirmed')
 expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',op,resolve))).toMatchObject({ok:true})
 expect((await confirmed).operation.id).toBe(op.id)
 return{...c,op,request:{operationId:fresh('typed-close'),layerId:op.layerId,targetUserId:'teacher',strokeId:s.strokeId,disposition:'commitPartial' as const,expectedRecordedNext:1,expectedLastFrameOpId:op.id}}
}
it('does not ACK or relay typed close before durability and repairs its exact failed ID',async()=>{
 const c=await typedCloseClassroom();let reject:(error:Error)=>void=()=>{}
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  mockPrisma.operation.create.mockReturnValueOnce(new Promise<void>((_,r)=>{reject=r}))
  const quiet=silent(c.student,'operation_confirmed',50),settled=vi.fn(),pending=new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',c.request,resolve));void pending.then(settled)
  await vi.waitFor(()=>expect(c.record.operationsById.has(c.request.operationId)).toBe(true));await quiet;expect(settled).not.toHaveBeenCalled()
  const seq=c.record.operationsById.get(c.request.operationId)!.seq!,nextSeq=c.record.nextSeq
  reject(new Error('typed close durable failure'))
  expect(await pending).toEqual({ok:false,reason:'canonical_repair_required'});await silent(c.student,'operation_confirmed',30)
  const confirmed=next(c.student,'operation_confirmed')
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',c.request,resolve))).toEqual({ok:true,seq,duplicate:true})
  expect((await confirmed).operation.id).toBe(c.request.operationId);expect(c.record.nextSeq).toBe(nextSeq)
 }finally{reject(new Error('test cleanup'));await _flushPendingWrites(c.lessonId);log.mockRestore();c.cleanup()}
})
it('rejects the old typed close lifetime but finalizes its own server prefix after disconnect drain',async()=>{
 const unjoined=client('unjoined'),request={operationId:'none',layerId:'layer-1',targetUserId:'unjoined',strokeId:'S',disposition:'commitPartial' as const,expectedRecordedNext:1,expectedLastFrameOpId:'last'}
 expect(await new Promise<SendResult>(resolve=>unjoined.emit('canonical_stroke_close',request,resolve))).toEqual({ok:false,reason:'not_joined'})
 const c=await typedCloseClassroom();let release:(rows:unknown[])=>void=()=>{}
 try{
  const quiet=silent(c.student,'operation_confirmed',100),query=new Promise<unknown[]>(resolve=>{release=resolve})
  mockPrisma.operation.findMany.mockClear();mockPrisma.operation.findMany.mockReturnValueOnce(query)
  c.teacher.emit('canonical_stroke_close',c.request,()=>{})
  await vi.waitFor(()=>expect(mockPrisma.operation.findMany).toHaveBeenCalled())
  const frameRow=mockPrisma.operation.create.mock.calls.find(([q])=>q.data.id===c.op.id)![0].data
  const oldSocket=io.of('/').sockets.get(c.teacher.id??'')!
  c.teacher.disconnect();await vi.waitFor(()=>expect(oldSocket.connected).toBe(false));await quiet
  expect(c.record.sockets.size).toBe(2) // Original seat survives ONLY until tail finalization.
  const automatic=next(c.student,'operation_confirmed');release([frameRow])
  expect((await automatic).operation).toMatchObject({type:'canonical_stroke_close',recordedNext:1,lastFrameOpId:c.op.id})
  await vi.waitFor(()=>expect(c.record.sockets.size).toBe(1));await _flushPendingWrites(c.lessonId)
  expect(c.record.operationsById.has(c.request.operationId)).toBe(false)
 }finally{release([]);await _flushPendingWrites(c.lessonId);c.cleanup()}
})

async function mixedFullHistoryServer(format:'mixed-v2'|'mixed-indexed-v1'='mixed-v2'){
 // Replace this test's unused default server, keeping one actual backend.
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js')
 const {CANONICAL_ROOM_EXECUTION_POLICY}=await import('./canonicalExecutionPolicy.js')
 http=createServer();io=new Server(http)
 registerRoomHandlers(io as never,log,new CanonicalRoomTransport({...CANONICAL_ROOM_EXECUTION_POLICY,fullHistoryFormat:format}))
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address() as AddressInfo).port
}
it('uses trusted mixed full-history bootstrap for an actual cold stored straight board even with a high client cursor',async()=>{
 await mixedFullHistoryServer()
 const dir=mkdtempSync(joinPath(tmpdir(),'mixed-empty-context-'));setBrushStorage(new BrushStorage(dir),empty())
 try{
 const roomId=fresh('cold-straight');rows.set(roomId,row(roomId,{rasterVersion:'straight-rgba8-v1'}))
 const teacher=client('teacher'),state=next(teacher,'room_state');void state.catch(()=>{})
 const joined=await new Promise(resolve=>teacher.emit('join_room',{roomId,name:'Teacher',lastKnownSeq:999},resolve))
 expect(joined).toMatchObject({ok:true})
 const snapshot=await state
 expect(snapshot.room.rasterVersion).toBe('straight-rgba8-v1');expect(snapshot.tailOperations).toEqual([])
 expect(snapshot.canonicalHistoryBase).toMatchObject({kind:'full-room-prefix-v2',roomId,throughSeq:0,operationCount:0})
 expect(mockPrisma.operation.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{roomId,seq:{gt:0,lte:0}},orderBy:{seq:'asc'},take:64}))
 }finally{rmSync(dir,{recursive:true,force:true})}
})
it('preserves the complete mixed source/close tail on explicit bootstrap and refuses incomplete queries before seating',async()=>{
 await mixedFullHistoryServer();const c=await typedCloseClassroom()
 try{
  const reply=await new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',c.request,resolve));expect(reply.ok).toBe(true)
  rows.get(c.lessonId)!.rasterVersion='straight-rgba8-v1'
  const state=next(c.student,'room_state');void state.catch(()=>{})
  expect(await new Promise(resolve=>c.student.emit('join_room',{roomId:c.lessonId,name:'Student',lastKnownSeq:999},resolve))).toMatchObject({ok:true})
  const snapshot=await state
  if(!snapshot.tailOperations)throw Error('Expected legacy original tail')
  expect(snapshot.tailOperations.map(op=>op.id)).toEqual([c.op.id,c.request.operationId])
  expect(snapshot.canonicalHistoryBase).toMatchObject({kind:'full-room-prefix-v2',throughSeq:2,operationCount:2})
  expect(snapshot.canonicalCapabilities?.bindings).toHaveLength(1)
  const outsider=client('outsider'),noState=silent(outsider,'room_state',80)
  mockPrisma.operation.findMany.mockResolvedValue([])
  expect(await new Promise(resolve=>outsider.emit('join_room',{roomId:c.lessonId,name:'Other'},resolve))).toMatchObject({ok:false,error:'server_busy'})
  await noState;expect(c.record.participants.has('outsider')).toBe(false)
 }finally{await _flushPendingWrites(c.lessonId);c.cleanup()}
})

it('durably relays private undo/redo over a typed partial close under explicit mixed policy',async()=>{
 await mixedFullHistoryServer();const c=await typedCloseClassroom()
 try{
  const closeConfirmed=next(c.student,'operation_confirmed')
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('canonical_stroke_close',c.request,resolve))).toMatchObject({ok:true})
  expect((await closeConfirmed).operation.id).toBe(c.request.operationId)
  const undo={id:fresh('partial-close-undo'),type:'operation_undo' as const,userId:'teacher',timestamp:1,targetOpId:c.op.id}
  const undoConfirmed=next(c.student,'operation_confirmed')
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',undo,resolve))).toMatchObject({ok:true})
  expect((await undoConfirmed).operation.id).toBe(undo.id)
  const redo={...undo,id:fresh('partial-close-redo'),type:'operation_redo' as const,targetOpId:undo.id}
  const redoConfirmed=next(c.student,'operation_confirmed')
  expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',redo,resolve))).toMatchObject({ok:true})
  expect((await redoConfirmed).operation.id).toBe(redo.id)
  expect(c.record.operationsById.get(redo.id)).toMatchObject(redo)
 }finally{await _flushPendingWrites(c.lessonId);c.cleanup()}
})
it('closes the exact durable V2 prefix after its source socket disappears without pointer END',async()=>{
 const c=await typedCloseClassroom()
 try{
  const sealed=next(c.student,'operation_confirmed')
  c.teacher.disconnect()
  const event=await sealed
  expect(event.operation).toMatchObject({type:'canonical_stroke_close',targetUserId:'teacher',strokeId:c.op.frame.strokeId,recordedNext:1,firstFrameOpId:c.op.id,lastFrameOpId:c.op.id,disposition:'commitPartial'})
  expect(event.operation.id).not.toBe(c.request.operationId)
  expect(event.seq).toBe(c.op.seq===undefined?2:c.op.seq+1)
  await vi.waitFor(()=>expect(c.record.participants.has('teacher')).toBe(false))
  expect(mockPrisma.operation.create.mock.calls.filter(([q])=>q.data.type==='canonical_stroke_close')).toHaveLength(1)
 }finally{await _flushPendingWrites(c.lessonId);c.cleanup()}
})

it('waits for an accepted in-flight frame write after disconnect even when its ACK and frame relay are lost',async()=>{
 const c=await typedCloseClassroom(),prior=mockPrisma.operation.create.getMockImplementation()!
 let release=()=>{}
 try{
  const response=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',{...c.begin,brush:c.op.frame.brush},resolve))
  if(!response.ok||!('materialVersion'in response.snapshot)||response.snapshot.materialVersion!==2)throw Error('Expected actual source snapshot')
  const materialPacked=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},response.snapshot.material).packed
  const op:CanonicalStrokeOperation={...c.op,id:fresh('lost-ack-tail'),frame:{...c.op.frame,frameOrdinal:1,materialPacked}}
  mockPrisma.operation.create.mockImplementationOnce(q=>new Promise<void>(resolve=>{let released=false;release=()=>{if(released)return;released=true;Promise.resolve(prior(q)).then(()=>resolve())}}))
  c.teacher.emit('operation',op,()=>{})
  await vi.waitFor(()=>expect(c.record.operationsById.has(op.id)).toBe(true))
  const confirmed=next(c.student,'operation_confirmed');c.teacher.disconnect()
  await vi.waitFor(()=>expect(io.of('/').sockets.size).toBe(1));expect(c.record.participants.has('teacher')).toBe(true)
  await silent(c.student,'operation_confirmed',30)
  release();const event=await confirmed
  expect(event.operation).toMatchObject({type:'canonical_stroke_close',recordedNext:2,firstFrameOpId:c.op.id,lastFrameOpId:op.id})
  expect(event.seq).toBe(3);await vi.waitFor(()=>expect(c.record.participants.has('teacher')).toBe(false))
  expect(mockPrisma.operation.create.mock.calls.filter(([q])=>q.data.type==='canonical_stroke_close')).toHaveLength(1)
 }finally{release();await _flushPendingWrites(c.lessonId);c.cleanup()}
})
it('always releases the disconnected seat if indexed cleanup fails instead of emitting a guessed close',async()=>{
 const c=await typedCloseClassroom()
 try{
  mockPrisma.operation.findMany.mockRejectedValueOnce(Error('prefix query failed'))
  const left=next(c.student,'peer_left'),quiet=silent(c.student,'operation_confirmed',80)
  c.teacher.disconnect();expect(await left).toBe('teacher');await quiet
  expect(c.record.participants.has('teacher')).toBe(false);expect(c.record.sockets.size).toBe(1)
  expect(c.record.operations.filter(op=>op.type==='canonical_stroke_close')).toEqual([])
 }finally{await _flushPendingWrites(c.lessonId);c.cleanup()}
})
it('retains a last source seat until its actual close lands, then evicts the unused record',async()=>{
 const c=await typedCloseClassroom()
 try{
  c.student.disconnect();await vi.waitFor(()=>expect(c.record.sockets.size).toBe(1))
  c.teacher.disconnect()
  await vi.waitFor(()=>expect(mockPrisma.operation.create.mock.calls.some(([q])=>q.data.type==='canonical_stroke_close')).toBe(true))
  await vi.waitFor(()=>expect(isRoomResident(c.lessonId)).toBe(false))
  expect(c.record.operations.filter(op=>op.type==='canonical_stroke_close')).toHaveLength(1)
 }finally{await _flushPendingWrites(c.lessonId);c.cleanup()}
})

it('cannot let a disconnected old source seat seal or remove a same-user replacement that joined during cleanup lookup',async()=>{
 await mixedFullHistoryServer();const c=await typedCloseClassroom()
 let release:(value:unknown[])=>void=()=>{}
 try{
  const frameRow=mockPrisma.operation.create.mock.calls.find(([q])=>q.data.id===c.op.id)![0].data
  mockPrisma.operation.findMany.mockImplementationOnce(()=>new Promise<unknown[]>(resolve=>{release=resolve}))
  const quiet=silent(c.student,'operation_confirmed',200)
  c.teacher.disconnect();await vi.waitFor(()=>expect(io.of('/').sockets.size).toBe(1))
  const replacement=client('teacher');await join(replacement,c.lessonId,'Replacement')
  expect(c.record.participants.get('teacher')?.name).toBe('Replacement')
  release([frameRow]);await quiet
  await vi.waitFor(()=>expect(c.record.sockets.size).toBe(2))
  expect(c.record.participants.get('teacher')?.name).toBe('Replacement')
  expect(c.record.operations.filter(op=>op.type==='canonical_stroke_close')).toEqual([])
 }finally{release([]);await _flushPendingWrites(c.lessonId);c.cleanup()}
})

it.each([false,true])('keeps two actual socket frames ordered across a held durable insert (failure=%s)',async fail=>{
 const c=await canonicalClassroom(),log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  const begin=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',c.begin,resolve))
  if(!begin.ok)throw Error('Missing BEGIN')
  const operations=canonicalFrames(begin.snapshot,c.descriptor).map((frame):CanonicalStrokeOperation=>({type:'canonical_stroke',id:fresh('window2'),userId:'teacher',timestamp:0,layerId:c.begin.layerId,frame}))
  expect(operations).toHaveLength(2)
  let release!:(value:unknown)=>void,reject!:(error:Error)=>void
  mockPrisma.operation.create.mockImplementationOnce(()=>new Promise((resolve,fail)=>{release=resolve;reject=fail}))
  const settled=vi.fn(),first=new Promise<SendResult>(resolve=>c.teacher.emit('operation',operations[0],resolve)),second=new Promise<SendResult>(resolve=>c.teacher.emit('operation',operations[1],resolve))
  void first.then(settled);void second.then(settled)
  await vi.waitFor(()=>expect(c.record.operations).toHaveLength(1))
  await silent(c.student,'operation_confirmed',40);expect(settled).not.toHaveBeenCalled();expect(mockPrisma.operation.create).toHaveBeenCalledTimes(1)
  if(fail)reject(Error('first durable insert failed'));else release({})
  if(fail){
   expect(await first).toEqual({ok:false,reason:'canonical_repair_required'});expect(await second).toEqual({ok:false,reason:'canonical_repair_required'})
   expect(c.record.operations).toHaveLength(1);expect(c.record.nextSeq).toBe(2)
   expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',operations[0],resolve))).toMatchObject({ok:true,seq:1,duplicate:true})
   expect(await new Promise<SendResult>(resolve=>c.teacher.emit('operation',operations[1],resolve))).toMatchObject({ok:true,seq:2})
  }else{expect(await first).toMatchObject({ok:true,seq:1});expect(await second).toMatchObject({ok:true,seq:2})}
  expect(c.record.operations.map(op=>op.id)).toEqual(operations.map(op=>op.id));expect(c.record.nextSeq).toBe(3)
 }finally{log.mockRestore();c.cleanup()}
})

it('indexed policy joins with DATA-only offer then serves an actual post-seat cut0 open and terminal retry',async()=>{
 await mixedFullHistoryServer('mixed-indexed-v1')
 const dir=mkdtempSync(joinPath(tmpdir(),'indexed-empty-socket-'));setBrushStorage(new BrushStorage(dir),empty())
 mockPrisma.operation.findFirst.mockResolvedValue(null);mockPrisma.$executeRawUnsafe.mockResolvedValue(0);mockPrisma.$queryRawUnsafe.mockResolvedValue([])
 try{
  const roomId=fresh('indexed-cold');rows.set(roomId,row(roomId,{rasterVersion:'straight-rgba8-v1'}))
  const teacher=client('teacher'),state=next(teacher,'room_state');void state.catch(()=>{})
  await join(teacher,roomId,'Teacher')
  const offered=await state
  if(!offered.canonicalIndexedHistory)throw Error('Expected actual indexed offer')
  expect(Object.hasOwn(offered,'tailOperations')).toBe(false)
  expect(Object.hasOwn(offered,'canonicalHistoryBase')).toBe(false)
  expect(offered.latestSnapshotSeq).toBeNull()
  expect(rooms.get(roomId)?.operations).toEqual([])
  const offer=offered.canonicalIndexedHistory
  const opened=await new Promise<import('@grafetto/shared').CanonicalHistoryStreamRequestMap['canonical_history_stream_open'][1]>(resolve=>teacher.emit('canonical_history_stream_open',{kind:'canonical-history-open-v1',offerId:offer.offerId,roomId,boardEpoch:offer.scope.boardEpoch},resolve))
  if(!opened.ok)throw Error('Indexed post-seat open failed: '+opened.reason)
  expect(opened.value).toMatchObject({floor:0,throughSeq:0,operationCount:0})
  const request={streamId:opened.value.streamId,requestId:'actual-empty-page',afterSeq:0}
  const terminal=await new Promise<import('@grafetto/shared').CanonicalHistoryStreamRequestMap['canonical_history_stream_next'][1]>(resolve=>teacher.emit('canonical_history_stream_next',request,resolve))
  expect(terminal).toMatchObject({ok:true,value:{terminal:true,operations:[],finish:{lastSeq:0,operationCount:0}}})
  const before=mockPrisma.$queryRawUnsafe.mock.calls.length
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',request,resolve))).toEqual(terminal)
  expect(mockPrisma.$queryRawUnsafe.mock.calls.length).toBe(before)
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',{...request,afterSeq:1},resolve))).toMatchObject({ok:false,reason:'invalid_operation'})
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_select',{streamId:opened.value.streamId,requestId:'empty-undo',historyAction:'undo'},resolve))).toMatchObject({ok:true,value:null})
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_evidence',{streamId:opened.value.streamId,requestId:'unknown-root',root:{originalUserId:'teacher',strokeId:'none',layerId:'layer-1',firstOperationId:'none',firstSequence:1}},resolve))).toMatchObject({ok:false})
  const recovery=await new Promise<import('@grafetto/shared').CanonicalHistoryStreamRequestMap['canonical_history_stream_reopen'][1]>(resolve=>teacher.emit('canonical_history_stream_reopen',{mode:'recovery',offerId:offer.offerId,roomId,boardEpoch:offer.scope.boardEpoch,throughSeq:0},resolve))
  if(!recovery.ok)throw Error('Expected actual completed-cut recovery')
  expect(recovery.value.kind).toBe('canonical-indexed-history-begin-v1')
  const recoveredTerminal={streamId:recovery.value.streamId,requestId:'recovered-empty',afterSeq:0}
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',recoveredTerminal,resolve))).toMatchObject({ok:true,value:{terminal:true}})
  const followed=await new Promise<import('@grafetto/shared').CanonicalHistoryStreamRequestMap['canonical_history_stream_reopen'][1]>(resolve=>teacher.emit('canonical_history_stream_reopen',{mode:'follow',streamId:recovery.value.streamId,requestId:'follow-empty',afterSeq:0},resolve))
  if(!followed.ok)throw Error('Expected finite empty follow')
  expect(followed.value).toMatchObject({kind:'canonical-indexed-history-follow-v1',floor:0,throughSeq:0,operationCount:0})
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',{streamId:followed.value.streamId,requestId:'followed-empty',afterSeq:0},resolve))).toMatchObject({ok:true,value:{terminal:true}})
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_cancel',{streamId:followed.value.streamId,requestId:'cancel-empty'},resolve))).toMatchObject({ok:true})
  const again=await new Promise<import('@grafetto/shared').CanonicalHistoryStreamRequestMap['canonical_history_stream_reopen'][1]>(resolve=>teacher.emit('canonical_history_stream_reopen',{mode:'recovery',offerId:offer.offerId,roomId,boardEpoch:offer.scope.boardEpoch,throughSeq:0},resolve))
  if(!again.ok)throw Error('Expected recovery after finite cursor cancellation')
  const cached={streamId:again.value.streamId,requestId:'cached-auth-page',afterSeq:0}
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',cached,resolve))).toMatchObject({ok:true,value:{terminal:true}})
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_open',{kind:'canonical-history-open-v1',offerId:offer.offerId,roomId,boardEpoch:offer.scope.boardEpoch},resolve))).toMatchObject({ok:false,reason:'invalid_operation'})
  // Actual DB disappearance leaves the resident seat intact. A cache replay
  // MUST still perform fresh DB authorization instead of reusing its payload.
  rows.delete(roomId)
  expect(rooms.has(roomId)).toBe(true)
  expect(await new Promise(resolve=>teacher.emit('canonical_history_stream_next',cached,resolve))).toMatchObject({ok:false,reason:'stale_read'})
 }finally{rmSync(dir,{recursive:true,force:true})}
})

it('requires compatible minimum3 on actual texture sockets BEFORE identity/load/seat, then permits normal authenticated join',async()=>{
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js')
 const {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE:G}=await import('@grafetto/shared')
 http=createServer();io=new Server(http)
 const transport=new CanonicalRoomTransport({rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy'],primaryImageSource:'single-inverse-gray-v2',primaryTextureSource:'pressure-identity-subtract-v3'})
 registerRoomHandlers(io as never,log,transport)
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address()as AddressInfo).port
 const id=fresh('protocol-door');rows.set(id,row(id));resolveIdentity.mockClear();mockPrisma.room.findUnique.mockClear()
 for(const auth of [undefined,{drawingProtocol:'2'},{drawingProtocol:3},{drawingProtocol:'unknown'}]){
  const socket:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'protocol-author'},...auth===undefined?{}:{auth}})
  clients.push(socket)
  const refused=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol refusal timeout')),2000);socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message)})})
  socket.connect();expect(await refused).toBe('client_update_required');expect(socket.connected).toBe(false);socket.close()
 }
 expect(resolveIdentity).not.toHaveBeenCalled();expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();expect(isRoomResident(id)).toBe(false)
 const current:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'3'}})
 clients.push(current)
 const connected=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol connect timeout')),2000);current.once('connect',()=>{clearTimeout(timer);resolve()});current.once('connect_error',error=>{clearTimeout(timer);reject(error)})})
 current.connect();await connected;expect(resolveIdentity).toHaveBeenCalledTimes(1)
 const delivered=next(current,'room_state');await join(current,id,'Current');await delivered
 expect(isRoomResident(id)).toBe(true)
})

it('requires known drawing protocol4/5/6/7 before identity/load/seat, then permits normal authenticated join',async()=>{
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js')
 const {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE:G}=await import('@grafetto/shared')
 http=createServer();io=new Server(http)
 const transport=new CanonicalRoomTransport({rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy'],primaryImageSource:'single-inverse-gray-v2',primaryTextureSource:'pressure-identity-subtract-v3',texturedSource:'fixed-default-auto-texture-v4'})
 registerRoomHandlers(io as never,log,transport)
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address()as AddressInfo).port
 const id=fresh('protocol-door');rows.set(id,row(id));resolveIdentity.mockClear();mockPrisma.room.findUnique.mockClear()
 for(const auth of [undefined,{drawingProtocol:'2'},{drawingProtocol:'3'},{drawingProtocol:4},{drawingProtocol:5},{drawingProtocol:6},{drawingProtocol:7},{drawingProtocol:'10'}]){
  const socket:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'protocol-author'},...auth===undefined?{}:{auth}})
  clients.push(socket)
  const refused=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol refusal timeout')),2000);socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message)})})
  socket.connect();expect(await refused).toBe('client_update_required');expect(socket.connected).toBe(false);socket.close()
 }
 expect(resolveIdentity).not.toHaveBeenCalled();expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();expect(isRoomResident(id)).toBe(false)
 const current:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'4'}})
 clients.push(current)
 const connected=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol connect timeout')),2000);current.once('connect',()=>{clearTimeout(timer);resolve()});current.once('connect_error',error=>{clearTimeout(timer);reject(error)})})
 current.connect();await connected;expect(resolveIdentity).toHaveBeenCalledTimes(1)
 const delivered=next(current,'room_state');await join(current,id,'Current');await delivered
 expect(isRoomResident(id)).toBe(true)
 const nextVersion:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'5'}})
 clients.push(nextVersion)
 const nextConnected=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol5 connect timeout')),2000);nextVersion.once('connect',()=>{clearTimeout(timer);resolve()});nextVersion.once('connect_error',error=>{clearTimeout(timer);reject(error)})})
 nextVersion.connect();await nextConnected;expect(resolveIdentity).toHaveBeenCalledTimes(2)
 const sixth:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'6'}});clients.push(sixth);const ready6=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol6 compatibility timeout')),2000);sixth.once('connect',()=>{clearTimeout(timer);resolve()});sixth.once('connect_error',e=>{clearTimeout(timer);reject(e)})});sixth.connect();await ready6;expect(resolveIdentity).toHaveBeenCalledTimes(3)
 const seventh:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'7'}});clients.push(seventh);const ready7=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol7 compatibility timeout')),2000);seventh.once('connect',()=>{clearTimeout(timer);resolve()});seventh.once('connect_error',e=>{clearTimeout(timer);reject(e)})});seventh.connect();await ready7;expect(resolveIdentity).toHaveBeenCalledTimes(4)
})

it('requires known literal6/7 at minimum6 before identity/load/seat',async()=>{
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js')
 const {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE:G}=await import('@grafetto/shared')
 http=createServer();io=new Server(http)
 const transport=new CanonicalRoomTransport({rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy'],primaryImageSource:'single-inverse-gray-v2',primaryTextureSource:'pressure-identity-subtract-v3',softPressureTexturedSource:'pressure-soft-auto-texture-v6'})
 registerRoomHandlers(io as never,log,transport)
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address()as AddressInfo).port
 const id=fresh('protocol-door');rows.set(id,row(id));resolveIdentity.mockClear();mockPrisma.room.findUnique.mockClear()
 for(const auth of [undefined,{drawingProtocol:'2'},{drawingProtocol:'3'},{drawingProtocol:'4'},{drawingProtocol:'5'},{drawingProtocol:4},{drawingProtocol:5},{drawingProtocol:6},{drawingProtocol:7},{drawingProtocol:'10'}]){
  const socket:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'protocol-author'},...auth===undefined?{}:{auth}})
  clients.push(socket)
  const refused=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol refusal timeout')),2000);socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message)})})
  socket.connect();expect(await refused).toBe('client_update_required');expect(socket.connected).toBe(false);socket.close()
 }
 expect(resolveIdentity).not.toHaveBeenCalled();expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();expect(isRoomResident(id)).toBe(false)
 const current:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'6'}})
 clients.push(current)
 const connected=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol connect timeout')),2000);current.once('connect',()=>{clearTimeout(timer);resolve()});current.once('connect_error',error=>{clearTimeout(timer);reject(error)})})
 current.connect();await connected;expect(resolveIdentity).toHaveBeenCalledTimes(1)
 const delivered=next(current,'room_state');await join(current,id,'Current');await delivered
 expect(isRoomResident(id)).toBe(true)
 const seventh:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'7'}});clients.push(seventh)
 const ready7=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('minimum6 known7 timeout')),2000);seventh.once('connect',()=>{clearTimeout(timer);resolve()});seventh.once('connect_error',e=>{clearTimeout(timer);reject(e)})});seventh.connect();await ready7;expect(resolveIdentity).toHaveBeenCalledTimes(2)
})


it('requires literal8 on actual reader7/authorOFF protocol before identity/load/seat/room',async()=>{
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js'),{CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE:G}=await import('@grafetto/shared')
 http=createServer();io=new Server(http)
 const transport=new CanonicalRoomTransport({rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy'],texturedAutoSource:'textured-auto-material-v7',authorTexturedAutoSource:false})
 registerRoomHandlers(io as never,log,transport)
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address()as AddressInfo).port
 const id=fresh('protocol7-reader-door');rows.set(id,row(id));resolveIdentity.mockClear();mockPrisma.room.findUnique.mockClear()
 for(const auth of[undefined,{drawingProtocol:'3'},{drawingProtocol:'4'},{drawingProtocol:'5'},{drawingProtocol:'6'},{drawingProtocol:'7'},{drawingProtocol:7},{drawingProtocol:8},{drawingProtocol:'8.0'},{drawingProtocol:'10'},{drawingProtocol:'07'}]){
  const socket:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'protocol7-refused'},...auth===undefined?{}:{auth}});clients.push(socket)
  const refused=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol7 refusal timeout')),2000);socket.once('connect',()=>{clearTimeout(timer);resolve('connected')});socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message)})})
  socket.connect();expect(await refused).toBe('client_update_required');expect(socket.connected).toBe(false);socket.close()
 }
 expect(resolveIdentity).not.toHaveBeenCalled();expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();expect(isRoomResident(id)).toBe(false);expect(rooms.has(id)).toBe(false);expect(transport.requiredDrawingProtocol).toBe('8')
 const current:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'8'}});clients.push(current)
 const ready=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol7 connect timeout')),2000);current.once('connect',()=>{clearTimeout(timer);resolve()});current.once('connect_error',error=>{clearTimeout(timer);reject(error)})});current.connect();await ready;expect(resolveIdentity).toHaveBeenCalledTimes(1)
 const delivered=next(current,'room_state');await join(current,id,'Current8');const state=await delivered
 expect(isRoomResident(id)).toBe(true);expect(mockPrisma.room.findUnique).toHaveBeenCalled();expect(state).not.toHaveProperty('canonicalAuthorTexturedAutoSource')
})

it('serializes actual socket BEGIN -> empty discard -> frame without a future cleanup tombstone',async()=>{
 const c=await canonicalClassroom()
 try{
  const base=await new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',c.begin,resolve));if(!base.ok)throw Error('Expected baseline')
  let release!:(rows:import('./roomPersistence.js').CanonicalStoredOperationRow[])=>void
  mockPrisma.operation.findMany.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
  const request={...c.begin,emptyDiscardNonce:'attempt_nonce_1',strokeId:fresh('empty-discard')},pending=new Promise<CanonicalStrokeBeginResult>(resolve=>c.teacher.emit('canonical_stroke_begin',request,resolve))
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  const discarded=new Promise<import('@grafetto/shared').CanonicalStrokeDiscardEmptyResult>(resolve=>c.teacher.emit('canonical_stroke_discard_empty',{layerId:request.layerId,strokeId:request.strokeId,boardEpoch:base.snapshot.boardEpoch,emptyDiscardNonce:request.emptyDiscardNonce},resolve))
  const frame=canonicalFrames({...base.snapshot,strokeId:request.strokeId},c.descriptor)[0],op:CanonicalStrokeOperation={type:'canonical_stroke',id:fresh('discard-frame'),userId:'teacher',timestamp:0,layerId:request.layerId,frame}
  const rejected=new Promise<SendResult>(resolve=>c.teacher.emit('operation',op,resolve));release([])
  expect((await pending).ok).toBe(true);expect(await discarded).toEqual({ok:true,discarded:true});expect((await rejected).ok).toBe(false)
  expect(c.record.operations).toEqual([]);expect(mockPrisma.operation.create).not.toHaveBeenCalled()
 }finally{c.cleanup()}
})

it('requires literal9 on actual plain Tilt9 reader/authorOFF protocol before identity/load/seat/room',async()=>{
 io.close();await new Promise<void>(resolve=>http.close(()=>resolve()))
 const {CanonicalRoomTransport}=await import('./CanonicalRoomTransport.js'),{CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE:G}=await import('@grafetto/shared')
 http=createServer();io=new Server(http)
 const transport=new CanonicalRoomTransport({rasterProfile:G,allowedRecordedRasterProfiles:[G],alphaDarkenVariants:['creamy'],plainTiltSource:'plain-auto-tilt-v1',authorPlainTiltSource:false,autoSources:{defaultAuto:{coverageProfile:'neon64-f32-fma-v1',storedScale:1}}})
 registerRoomHandlers(io as never,log,transport)
 await new Promise<void>(resolve=>http.listen(0,resolve));port=(http.address()as AddressInfo).port
 const id=fresh('plain-tilt9-reader-door');rows.set(id,row(id));resolveIdentity.mockClear();mockPrisma.room.findUnique.mockClear()
 for(const auth of[undefined,{drawingProtocol:'3'},{drawingProtocol:'4'},{drawingProtocol:'5'},{drawingProtocol:'6'},{drawingProtocol:'7'},{drawingProtocol:7},{drawingProtocol:9},{drawingProtocol:'9.0'},{drawingProtocol:'8'},{drawingProtocol:'10'},{drawingProtocol:'07'}]){
  const socket:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'protocol7-refused'},...auth===undefined?{}:{auth}});clients.push(socket)
  const refused=new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol7 refusal timeout')),2000);socket.once('connect',()=>{clearTimeout(timer);resolve('connected')});socket.once('connect_error',error=>{clearTimeout(timer);resolve(error.message)})})
  socket.connect();expect(await refused).toBe('client_update_required');expect(socket.connected).toBe(false);socket.close()
 }
 expect(resolveIdentity).not.toHaveBeenCalled();expect(mockPrisma.room.findUnique).not.toHaveBeenCalled();expect(isRoomResident(id)).toBe(false);expect(rooms.has(id)).toBe(false);expect(transport.requiredDrawingProtocol).toBe('9')
 const current:Client=connect(`http://localhost:${port}`,{autoConnect:false,reconnection:false,forceNew:true,transports:['websocket'],extraHeaders:{cookie:'teacher'},auth:{drawingProtocol:'9'}});clients.push(current)
 const ready=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('protocol7 connect timeout')),2000);current.once('connect',()=>{clearTimeout(timer);resolve()});current.once('connect_error',error=>{clearTimeout(timer);reject(error)})});current.connect();await ready;expect(resolveIdentity).toHaveBeenCalledTimes(1)
 const delivered=next(current,'room_state');await join(current,id,'Current9');const state=await delivered
 expect(isRoomResident(id)).toBe(true);expect(mockPrisma.room.findUnique).toHaveBeenCalled();expect(state).not.toHaveProperty('canonicalAuthorPlainTiltSource')
})
