import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StrokeOperation } from '@grafetto/shared'

// (#176, ADR 014) The in-memory half of boards: a board's record carries
// content, its lesson's record carries everything social, and the two are
// loaded, joined and evicted on different rules. Prisma is mocked the way
// roomSnapshots.test.ts mocks it, because the only way a board ever becomes
// resident is `ensureRoomLoaded` reading its row — there is no `createBoard`
// in this module on purpose (boardRoutes.ts writes the row, the next join
// cold-loads it), so the tests go through the same door production does.
const mockPrisma = vi.hoisted(() => ({
  room: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
  roomPalette: { findUnique: vi.fn(), upsert: vi.fn() },
  roomLayerState: { findUnique: vi.fn() },
  assignment: { findMany: vi.fn() },
  roomLayerSnapshot: { groupBy: vi.fn() },
  operation: { create: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
}))
vi.mock('./prisma.js', () => ({ prisma: mockPrisma }))

const {
  _flushPendingWrites, addPaletteColor, createRoom, getOperationRejectReason, getParticipant, getResidentRoomStats,
  getRoomBacklog, getRoomGate, getRoomSnapshot, isRoomResident, joinRoom, leaveRoom, releaseRoomIfUnused,
} = await import('./rooms.js')
const { ensureRoomLoaded } = await import('./roomLoader.js')
const {
  isRoomFrozen, setParticipantFrozen, setRoomClosed, setRoomFrozen, setRoomTools,
} = await import('./ownerControls.js')
const {
  getLessonBoards, noteBoardCreated, noteBoardDeleted, noteBoardRenamed, noteBoardsReordered, setActiveBoard,
} = await import('./classroom.js')

/** What `prisma.room.findUnique` hands back for a row this test seeded. Shaped
 *  as the Prisma row `ensureRoomLoaded` reads, thumbnail relation included. */
type DbRoom = {
  id: string; name: string; paper: string; paperColor: string | null; infinite: boolean
  canvasWidth: number | null; canvasHeight: number | null; passwordHash: string | null
  accessMode: 'anyone_with_link' | 'invite_only'; enabledTools: string[]; closedAt: Date | null
  parentRoomId: string | null; ownerId: string; createdAt: Date; thumbnail: null
  lessonId: string | null; boardOrder: number; activeBoardId: string | null
}

const rows = new Map<string, DbRoom>()

function dbRoom(id: string, overrides: Partial<DbRoom> = {}): DbRoom {
  return {
    id, name: id, paper: 'coarse', paperColor: null, infinite: false, canvasWidth: 1240, canvasHeight: 1754,
    passwordHash: null, accessMode: 'anyone_with_link', enabledTools: [], closedAt: null, parentRoomId: null,
    ownerId: 'teacher', createdAt: new Date('2026-09-23T10:00:00Z'), thumbnail: null,
    lessonId: null, boardOrder: 0, activeBoardId: null,
    ...overrides,
  }
}

let nextId = 0
const touchedIds: string[] = []
function freshId(prefix: string): string {
  const id = `${prefix}-${nextId++}`
  touchedIds.push(id)
  return id
}

/** A live lesson, created the way `create_room` creates one: resident, with
 *  `teacher` seated as owner on its own first board. */
function makeLesson(): string {
  const id = freshId('lesson')
  createRoom(
    { id, name: 'Still life', paper: 'coarse', infinite: false, canvasWidth: 1240, canvasHeight: 1754 },
    undefined, 'teacher', 'Teacher', sock('teacher'),
  )
  rows.set(id, dbRoom(id))
  return id
}

/** A board row of `lessonId`, cold-loaded into memory. */
async function makeBoard(lessonId: string, overrides: Partial<DbRoom> = {}): Promise<string> {
  const id = freshId('board')
  rows.set(id, dbRoom(id, { lessonId, boardOrder: 1, name: 'Board 2', ...overrides }))
  expect(await ensureRoomLoaded(id)).toBe(true)
  return id
}

function sock(userId: string, suffix = ''): string {
  return `sock-${userId}${suffix}`
}

function stroke(userId: string, layerId = 'layer-1'): StrokeOperation {
  return {
    id: `op-${nextId++}`, type: 'stroke', userId, timestamp: 0,
    layerId, tool: 'pencil', preset: 'HB', color: [0.14, 0.14, 0.17], dabs: [],
  }
}

beforeEach(() => {
  for (const model of Object.values(mockPrisma)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset()
  }
  rows.clear()
  mockPrisma.room.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null)
  // The strip query a lesson's cold load runs (rooms.ts's loadBoardSummaries):
  // the lesson row and every row pointing at it, in boardOrder.
  mockPrisma.room.findMany.mockImplementation(async ({ where }: { where: { OR: [{ id: string }, { lessonId: string }] } }) => {
    const lessonId = where.OR[0].id
    return [...rows.values()]
      .filter(r => r.id === lessonId || r.lessonId === lessonId)
      .sort((a, b) => a.boardOrder - b.boardOrder)
  })
  mockPrisma.roomLayerState.findUnique.mockResolvedValue(null)
  mockPrisma.assignment.findMany.mockResolvedValue([])
  mockPrisma.roomLayerSnapshot.groupBy.mockResolvedValue([])
  mockPrisma.operation.findMany.mockResolvedValue([])
  mockPrisma.operation.aggregate.mockResolvedValue({ _max: { seq: null } })
  mockPrisma.operation.groupBy.mockResolvedValue([])
  mockPrisma.roomPalette.findUnique.mockResolvedValue({ colors: ['#111111'] })
})

afterEach(async () => {
  // Same drain as rooms.test.ts: fire-and-forget writes must settle inside
  // the test that made them.
  await Promise.all(touchedIds.splice(0).map(_flushPendingWrites))
})

describe('loading a board', () => {
  it('loads the lesson first, so a board is never resident without it', async () => {
    const lessonId = freshId('lesson')
    rows.set(lessonId, dbRoom(lessonId, { passwordHash: 'hash', accessMode: 'invite_only' }))
    const boardId = freshId('board')
    rows.set(boardId, dbRoom(boardId, { lessonId }))

    expect(await ensureRoomLoaded(boardId)).toBe(true)

    expect(isRoomResident(lessonId)).toBe(true)
    expect(isRoomResident(boardId)).toBe(true)
    // And the gate answers for the lesson, whichever id it was asked about.
    expect(getRoomGate(boardId)).toEqual({ ownerId: 'teacher', accessMode: 'invite_only', lessonId })
  })

  it('is not found when the lesson is gone from Postgres', async () => {
    const boardId = freshId('board')
    rows.set(boardId, dbRoom(boardId, { lessonId: 'lesson-deleted' }))

    expect(await ensureRoomLoaded(boardId)).toBe(false)
    expect(isRoomResident(boardId)).toBe(false)
  })

  it('seeds no palette row for a board — the palette is the lesson\'s', async () => {
    const lessonId = makeLesson()
    // The lesson's own seed is queued, not written: let it land before
    // counting, or it is what the assertion below sees.
    await _flushPendingWrites(lessonId)
    mockPrisma.roomPalette.findUnique.mockClear()
    mockPrisma.roomPalette.upsert.mockClear()

    await makeBoard(lessonId)

    expect(mockPrisma.roomPalette.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.roomPalette.upsert).not.toHaveBeenCalled()
  })

  it('reloads a lesson that was evicted from under a still-resident board', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))
    // Something recorded on the board keeps its own eviction deferred behind
    // that write; the lesson has nothing pending and goes at once.
    const { recordOperation } = await import('./rooms.js')
    recordOperation(boardId, stroke('student'))
    leaveRoom(lessonId, 'teacher', sock('teacher'))
    leaveRoom(boardId, 'student', sock('student'))
    expect(isRoomResident(lessonId)).toBe(false)
    expect(isRoomResident(boardId)).toBe(true)

    expect(await ensureRoomLoaded(boardId)).toBe(true)

    expect(isRoomResident(lessonId)).toBe(true)
  })
})

describe('joining a board', () => {
  it('seats the participant in the lesson, on that board, and persists the lesson\'s row', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)

    const result = joinRoom(boardId, 'student', 'Alice', sock('student'))

    expect(result).toEqual({
      ok: true, lessonId, previousBoardId: undefined,
      participant: expect.objectContaining({ userId: 'student', role: 'member', boardId }),
    })
    // Visible from either id: being in the lesson is being in every board.
    expect(getParticipant(boardId, 'student')?.boardId).toBe(boardId)
    expect(getParticipant(lessonId, 'student')?.boardId).toBe(boardId)
    expect(getParticipant(boardId, 'teacher')?.boardId).toBe(lessonId)
    // No RoomParticipant row under the board's id, ever.
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.roomParticipant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_userId: { roomId: lessonId, userId: 'student' } },
    }))
    expect(mockPrisma.roomParticipant.upsert).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { roomId_userId: { roomId: boardId, userId: 'student' } },
    }))
  })

  it('gives the owner their role on any board of their lesson', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)

    const result = joinRoom(boardId, 'teacher', 'Teacher', sock('teacher', '-2'))

    expect(result).toMatchObject({ ok: true, participant: { role: 'owner', boardId } })
  })

  it('switching boards keeps the seat and reports where the person came from', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    const first = joinRoom(lessonId, 'student', 'Alice', sock('student'))

    const switched = joinRoom(boardId, 'student', 'Alice', sock('student'))

    expect(switched).toMatchObject({ ok: true, lessonId, previousBoardId: lessonId, participant: { boardId } })
    // Same person, same colour: a cursor that changed colour on every page
    // turn would be unrecognisable.
    expect(switched.ok && first.ok && switched.participant.color).toBe(first.ok && first.participant.color)
    expect(getRoomSnapshot(lessonId)?.participants.filter(p => p.userId === 'student')).toHaveLength(1)
  })

  it('room_state on a board lists the lesson\'s roster and the lesson\'s social fields', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))
    setRoomClosed(lessonId, '2026-09-23T12:00:00.000Z')
    setRoomTools(lessonId, ['pencil'])
    setRoomFrozen(lessonId, true)

    const state = getRoomSnapshot(boardId)

    expect(state?.participants.map(p => [p.userId, p.boardId])).toEqual([['teacher', lessonId], ['student', boardId]])
    expect(state?.frozen).toBe(true)
    expect(state?.room).toMatchObject({
      id: boardId, name: 'Board 2', lessonId,
      closedAt: '2026-09-23T12:00:00.000Z', enabledTools: ['pencil'],
    })
    expect(state?.palette).toEqual(getRoomSnapshot(lessonId)?.palette)
  })
})

describe('gates resolve against the lesson', () => {
  it('a closed lesson rejects drawing on every board, the owner included', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))
    setRoomClosed(boardId, '2026-09-23T12:00:00.000Z')

    expect(getOperationRejectReason(boardId, 'student', stroke('student'))).toBe('room_closed')
    expect(getOperationRejectReason(boardId, 'teacher', stroke('teacher'))).toBe('room_closed')
    expect(getOperationRejectReason(lessonId, 'teacher', stroke('teacher'))).toBe('room_closed')
  })

  it('room-wide and per-participant freeze set through any board bind every board', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))

    expect(setRoomFrozen(boardId, true)).toBe(true)
    expect(isRoomFrozen(lessonId)).toBe(true)
    expect(getOperationRejectReason(lessonId, 'student', stroke('student'))).toBe('room_frozen')
    expect(getOperationRejectReason(boardId, 'teacher', stroke('teacher'))).toBeNull()

    setRoomFrozen(boardId, false)
    expect(setParticipantFrozen(boardId, 'student', true)).toMatchObject({ userId: 'student', frozen: true })
    expect(getOperationRejectReason(boardId, 'student', stroke('student'))).toBe('participant_frozen')
    expect(getOperationRejectReason(lessonId, 'student', stroke('student'))).toBe('participant_frozen')
  })

  it('the toolset and palette written through a board land on the lesson', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)

    expect(setRoomTools(boardId, ['pencil'])).toEqual(['pencil'])
    expect(getRoomSnapshot(lessonId)?.room.enabledTools).toEqual(['pencil'])
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: lessonId }, data: { enabledTools: ['pencil'] } })
    expect(mockPrisma.room.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: boardId } }))

    const palette = addPaletteColor(boardId, '#abcdef')
    expect(palette).toContain('#abcdef')
    expect(getRoomSnapshot(lessonId)?.palette).toBe(palette)
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.roomPalette.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: lessonId } }))
    expect(mockPrisma.roomPalette.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: boardId } }))
  })
})

describe('eviction', () => {
  it('drops a board the moment nobody is on it, while the lesson stays live', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))

    // Back to the lesson's own board: the board is empty, the person is not gone.
    joinRoom(lessonId, 'student', 'Alice', sock('student'))

    expect(isRoomResident(boardId)).toBe(false)
    expect(isRoomResident(lessonId)).toBe(true)
    expect(getParticipant(lessonId, 'student')).toBeDefined()
  })

  it('keeps a lesson whose own board is empty while someone draws on another board', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))
    leaveRoom(lessonId, 'teacher', sock('teacher'))

    expect(isRoomResident(lessonId)).toBe(true)
    expect(getRoomBacklog(lessonId)?.participants).toBe(0)
    expect(getRoomBacklog(boardId)?.participants).toBe(1)
    // Not idle in the memory gate's eyes either: releasing it is a no-op.
    const { idle } = getResidentRoomStats()
    releaseRoomIfUnused(lessonId)
    expect(isRoomResident(lessonId)).toBe(true)
    expect(getResidentRoomStats().idle).toBe(idle)
  })

  it('takes the boards along when the lesson empties', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))

    leaveRoom(boardId, 'student', sock('student'))
    expect(isRoomResident(boardId)).toBe(false)
    leaveRoom(lessonId, 'teacher', sock('teacher'))
    await _flushPendingWrites(lessonId)

    expect(isRoomResident(lessonId)).toBe(false)
    expect(isRoomResident(boardId)).toBe(false)
  })

  it('a stale socket\'s disconnect neither unseats the person nor empties their board', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student'))
    joinRoom(boardId, 'student', 'Alice', sock('student', '-reconnect'))

    expect(leaveRoom(boardId, 'student', sock('student'))).toBe(false)

    expect(isRoomResident(boardId)).toBe(true)
    expect(getParticipant(lessonId, 'student')).toBeDefined()
  })

  it('a superseded tab still counts as being on its board until it disconnects', async () => {
    // Tab 1 on the board; tab 2 (same person) takes the seat over on the
    // lesson's own board. Tab 1 is still a live socket on the board, and the
    // board must stay for it — it goes only when tab 1 actually disconnects.
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    joinRoom(boardId, 'student', 'Alice', sock('student', '-tab1'))
    joinRoom(lessonId, 'student', 'Alice', sock('student', '-tab2'))

    expect(isRoomResident(boardId)).toBe(true)
    expect(getRoomBacklog(boardId)?.participants).toBe(1)

    expect(leaveRoom(boardId, 'student', sock('student', '-tab1'))).toBe(false)

    expect(isRoomResident(boardId)).toBe(false)
    expect(getParticipant(lessonId, 'student')?.boardId).toBe(lessonId)
  })
})

describe('the strip and the active board', () => {
  it('cold-loads the strip with the lesson first, and room_state carries it from any board', async () => {
    const lessonId = freshId('lesson')
    rows.set(lessonId, dbRoom(lessonId, { name: 'Still life', activeBoardId: null }))
    const boardId = freshId('board')
    rows.set(boardId, dbRoom(boardId, { lessonId, boardOrder: 1, name: 'Page 2' }))
    await ensureRoomLoaded(boardId)
    joinRoom(boardId, 'teacher', 'Teacher', sock('teacher'))

    const expected = {
      id: lessonId, activeBoardId: null,
      boards: [{ id: lessonId, name: 'Still life', order: 0 }, { id: boardId, name: 'Page 2', order: 1 }],
      assignments: [], activeAssignmentId: null, spotlightBoardId: null, classVisibility: 'teacher_only', handsRaised: [],
    }
    expect(getRoomSnapshot(boardId)?.lesson).toEqual(expected)
    expect(getRoomSnapshot(lessonId)?.lesson).toEqual(expected)
    expect(getLessonBoards(boardId)).toEqual(expected.boards)
  })

  it('a created lesson is a one-board strip', () => {
    const lessonId = makeLesson()
    expect(getRoomSnapshot(lessonId)?.lesson).toEqual({
      id: lessonId, activeBoardId: null, boards: [{ id: lessonId, name: 'Still life', order: 0 }],
      assignments: [], activeAssignmentId: null, spotlightBoardId: null, classVisibility: 'teacher_only', handsRaised: [],
    })
  })

  it('setActiveBoard persists on the lesson row and spells the first board as null', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    noteBoardCreated(lessonId, { id: boardId, name: 'Board 2', order: 1 })

    expect(setActiveBoard(boardId, boardId)).toBe(boardId)
    expect(getRoomSnapshot(lessonId)?.lesson.activeBoardId).toBe(boardId)
    // Overlaid onto the board's own room too, so a client reads it either way.
    expect(getRoomSnapshot(boardId)?.room.activeBoardId).toBe(boardId)
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.room.update).toHaveBeenCalledWith({ where: { id: lessonId }, data: { activeBoardId: boardId } })

    // Naming the lesson itself means "the first board" and is stored as null.
    expect(setActiveBoard(lessonId, lessonId)).toBeNull()
    expect(getRoomSnapshot(lessonId)?.lesson.activeBoardId).toBeNull()
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.room.update).toHaveBeenLastCalledWith({ where: { id: lessonId }, data: { activeBoardId: null } })
  })

  it('setActiveBoard refuses a board that is not in this lesson, and changes nothing', async () => {
    const lessonId = makeLesson()
    const other = makeLesson()
    mockPrisma.room.update.mockClear()

    expect(setActiveBoard(lessonId, other)).toBe(false)
    expect(setActiveBoard(lessonId, 'never-existed')).toBe(false)
    expect(setActiveBoard('no-such-lesson', null)).toBe(false)

    expect(getRoomSnapshot(lessonId)?.lesson.activeBoardId).toBeNull()
    await _flushPendingWrites(lessonId)
    expect(mockPrisma.room.update).not.toHaveBeenCalled()
  })

  it('the CRUD mirrors keep the strip and the resident boards in step', async () => {
    const lessonId = makeLesson()
    const boardId = await makeBoard(lessonId)
    const second = freshId('board')

    noteBoardCreated(lessonId, { id: boardId, name: 'Board 2', order: 1 })
    noteBoardCreated(lessonId, { id: second, name: 'Board 3', order: 2 })
    expect(getLessonBoards(lessonId)?.map(b => b.id)).toEqual([lessonId, boardId, second])

    noteBoardRenamed(lessonId, boardId, 'Sketches')
    expect(getLessonBoards(lessonId)?.[1]).toEqual({ id: boardId, name: 'Sketches', order: 1 })
    expect(getRoomSnapshot(boardId)?.room.name).toBe('Sketches')

    noteBoardsReordered(lessonId, [lessonId, second, boardId])
    expect(getLessonBoards(lessonId)?.map(b => [b.id, b.order])).toEqual([[lessonId, 0], [second, 1], [boardId, 2]])
    expect(getRoomSnapshot(boardId)?.room.boardOrder).toBe(2)

    setActiveBoard(lessonId, boardId)
    expect(noteBoardDeleted(lessonId, boardId)).toEqual({ wasActive: true })
    expect(getLessonBoards(lessonId)?.map(b => b.id)).toEqual([lessonId, second])
    expect(getRoomSnapshot(lessonId)?.lesson.activeBoardId).toBeNull()
    expect(isRoomResident(boardId)).toBe(false)
    expect(isRoomResident(lessonId)).toBe(true)

    // The lesson itself is never "deleted" through this: it stays on the
    // strip and in memory.
    expect(noteBoardDeleted(lessonId, lessonId)).toEqual({ wasActive: false })
    expect(isRoomResident(lessonId)).toBe(true)
    expect(getLessonBoards(lessonId)?.map(b => b.id)).toEqual([lessonId, second])
  })
})
