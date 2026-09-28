import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { JoinResult, LessonState, Operation, Room, ServerToClientEvents } from '@grafetto/shared'

import { resetRoomStore, useRoomStore } from '../../../stores/roomStore'
import { createRoomStateHandler, type RoomStateDeps } from './roomStateHandler'

/** (#493) Where a `room_state` takes this client, one arrival at a time.
 *  Each branch of the handler is a routing decision that until now only a
 *  live server could reach: land on the teacher's board, drop a superseded
 *  turn, enter a board (or be evacuated off one), stash for an engine not
 *  yet built, open an empty room at once, or catch a standing engine up. */

type RoomState = Parameters<ServerToClientEvents['room_state']>[0]

function lesson(activeBoardId: string | null = null): LessonState {
  return {
    id: 'L', boards: [{ id: 'L', name: 'Cube', order: 0 }, { id: 'B2', name: 'Cube 2', order: 1 }],
    activeBoardId, assignments: [], activeAssignmentId: null, spotlightBoardId: null,
    classVisibility: 'teacher_only', handsRaised: [],
  }
}

function room(id: string, patch: Partial<Room> = {}): Room {
  return {
    id, name: 'Cube', paper: 'flat', infinite: false, canvasWidth: 1754, canvasHeight: 2480,
    hasPassword: false, accessMode: 'anyone_with_link', ownerId: 'owner', createdAt: '2026-09-25T00:00:00Z',
    ...patch,
  }
}

function state(boardId: string, patch: Partial<RoomState> = {}): RoomState {
  return {
    room: room(boardId), latestSnapshotSeq: null, tailOperations: [], participants: [],
    palette: ['#123456'], frozen: false, lesson: lesson(), ...patch,
  }
}

const tailOp = (seq: number): Operation => ({
  id: `op${seq}`, type: 'layer_add', userId: 'x', timestamp: 0, layerId: `l${seq}`, name: 'Layer', seq,
})

interface FakeEngine { name: string }

function setup(patch: Partial<RoomStateDeps<FakeEngine>> = {}) {
  const joins: { data: { roomId: string }; ack: (r: JoinResult) => void }[] = []
  const engine: FakeEngine = { name: 'engine' }
  const deps: RoomStateDeps<FakeEngine> = {
    id: 'L', isCreator: false,
    replaceUrl: vi.fn(),
    joinRoom: (data, ack) => { joins.push({ data, ack }) },
    joinCredentials: () => ({ name: 'Ann' }),
    applyIdentity: vi.fn(),
    reportJoinFailure: vi.fn(),
    requestFullResync: vi.fn(),
    maybeFollow: vi.fn(),
    enterBoard: vi.fn(),
    awaitPaper: vi.fn(async () => true),
    markJoinRestoreDone: vi.fn(),
    setRoomContentReady: vi.fn(),
    clearRestoreFailure: vi.fn(),
    restoreCatchup: vi.fn(async () => {}),
    socketBoardRef: { current: null },
    wantedBoardRef: { current: null },
    firstRoomStateReceivedRef: { current: true },
    awaitingSeededBoardStateRef: { current: false },
    pendingSnapshotRef: { current: null },
    latestKnownSeqRef: { current: 0 },
    isOwnerRef: { current: false },
    engineRef: { current: engine },
    snapshotGateRef: { current: { restoreStarted: vi.fn() } },
    ...patch,
  }
  return { deps, joins, engine, handle: createRoomStateHandler(deps) }
}

beforeEach(() => { resetRoomStore() })

describe('the lesson half', () => {
  it('lands in the store whichever board this is for, and records where the socket is', async () => {
    const { deps, handle } = setup()
    useRoomStore.getState().setBoardId('B2')
    await handle(state('B2', { frozen: true, lesson: lesson('B2') }))
    const s = useRoomStore.getState()
    expect(s.lessonId).toBe('L')
    expect(s.activeBoardId).toBe('B2')
    expect(s.palette).toEqual(['#123456'])
    expect(s.roomFrozen).toBe(true)
    expect(deps.socketBoardRef.current).toBe('B2')
  })
})

describe('the first room_state', () => {
  it('learns the lesson’s config — a joiner only', async () => {
    const joiner = setup({ firstRoomStateReceivedRef: { current: false } })
    await joiner.handle(state('L'))
    expect(useRoomStore.getState().room?.id).toBe('L')

    resetRoomStore()
    const creator = setup({ firstRoomStateReceivedRef: { current: false }, isCreator: true })
    await creator.handle(state('L'))
    expect(useRoomStore.getState().room).toBeNull()
  })

  it('rewrites a board link in the address bar to the lesson’s', async () => {
    const { deps, handle } = setup({ firstRoomStateReceivedRef: { current: false }, id: 'B2' })
    await handle(state('B2', { room: room('B2', { lessonId: 'L' }) }))
    expect(deps.replaceUrl).toHaveBeenCalledWith('/room/L')
  })

  // The lesson URL seats a join on the first board; the teacher may be on
  // another. That one's room_state is the one that builds the engine.
  it('asks for the teacher’s board instead of building on the one it was seated on', async () => {
    const { deps, joins, handle } = setup({ firstRoomStateReceivedRef: { current: false } })
    await handle(state('L', { lesson: lesson('B2') }))
    expect(joins[0].data).toMatchObject({ roomId: 'B2', name: 'Ann' })
    expect(deps.wantedBoardRef.current).toBe('B2')
    expect(deps.socketBoardRef.current).toBeNull()
    expect(deps.enterBoard).not.toHaveBeenCalled()
    expect(useRoomStore.getState().following).toBe(true)
  })

  it('falls back to the board it was seated on when the teacher’s refuses it', async () => {
    const { deps, joins, handle } = setup({ firstRoomStateReceivedRef: { current: false } })
    await handle(state('L', { lesson: lesson('B2') }))
    joins[0].ack({ ok: false, error: 'not_found' })
    expect(deps.reportJoinFailure).toHaveBeenCalled()
    expect(deps.wantedBoardRef.current).toBeNull()
    expect(deps.requestFullResync).toHaveBeenCalledOnce()
  })
})

describe('a room_state for another board', () => {
  it('enters it when it is the one asked for', async () => {
    const { deps, handle } = setup({ wantedBoardRef: { current: 'B2' } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('B2'))
    expect(deps.enterBoard).toHaveBeenCalledWith('B2', expect.objectContaining({ palette: ['#123456'] }))
    expect(deps.maybeFollow).toHaveBeenCalled()
  })

  // Two quick turns: the state for the one actually wanted is on its way.
  it('drops a turn that has been superseded', async () => {
    const { deps, handle } = setup({ wantedBoardRef: { current: 'B3' } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('B2'))
    expect(deps.enterBoard).not.toHaveBeenCalled()
  })

  // Never asked to leave: the server moved us off a deleted board, and the
  // board the student picked is gone with it.
  it('puts an evacuated student back to following — never the teacher', async () => {
    const student = setup()
    useRoomStore.getState().setBoardId('B2')
    useRoomStore.getState().setFollowing(false)
    await student.handle(state('L'))
    expect(useRoomStore.getState().following).toBe(true)
    expect(student.deps.enterBoard).toHaveBeenCalled()

    resetRoomStore()
    const teacher = setup({ isOwnerRef: { current: true } })
    useRoomStore.getState().setBoardId('B2')
    useRoomStore.getState().setFollowing(false)
    await teacher.handle(state('L'))
    expect(useRoomStore.getState().following).toBe(false)
  })
})

describe('a room_state for the board already held', () => {
  it('stashes the creator’s first state for an engine that does not exist yet', async () => {
    const { deps, handle } = setup({ awaitingSeededBoardStateRef: { current: true }, engineRef: { current: null } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('L', { tailOperations: [tailOp(3)] }))
    expect(deps.pendingSnapshotRef.current?.tailOperations).toHaveLength(1)
    expect(deps.restoreCatchup).not.toHaveBeenCalled()
  })

  // A genuinely new room has nothing to restore — only the paper to wait for.
  it('opens a brand-new room once the paper is in, without a restore', async () => {
    const { deps, handle } = setup({ awaitingSeededBoardStateRef: { current: true } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('L'))
    expect(deps.awaitPaper).toHaveBeenCalled()
    expect(deps.markJoinRestoreDone).toHaveBeenCalled()
    expect(deps.setRoomContentReady).toHaveBeenCalledWith(true)
    expect(deps.restoreCatchup).not.toHaveBeenCalled()
  })

  // The creator reloading a room with history on it looks exactly like the
  // case above but for the payload — and must restore, not open blank.
  it('restores a creator’s reload that does carry history', async () => {
    const { deps, handle } = setup({ awaitingSeededBoardStateRef: { current: true } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('L', { latestSnapshotSeq: 20 }))
    expect(deps.restoreCatchup).toHaveBeenCalled()
  })

  it('catches a reconnect up from what it had before this tail', async () => {
    const { deps, engine, handle } = setup({ latestKnownSeqRef: { current: 10 } })
    useRoomStore.getState().setBoardId('L')
    await handle(state('L', { tailOperations: [tailOp(11), tailOp(12)] }))
    expect(deps.setRoomContentReady).toHaveBeenCalledWith(false)
    expect(deps.snapshotGateRef.current.restoreStarted).toHaveBeenCalled()
    expect(deps.clearRestoreFailure).toHaveBeenCalled()
    expect(deps.latestKnownSeqRef.current).toBe(12)
    expect(deps.restoreCatchup).toHaveBeenCalledWith(engine, expect.objectContaining({ latestSnapshotSeq: null }), 10, 'L')
    expect(deps.wantedBoardRef.current).toBeNull()
  })

  it('leaves the room closed when the paper failed', async () => {
    const { deps, handle } = setup({ awaitPaper: vi.fn(async () => false) })
    useRoomStore.getState().setBoardId('L')
    await handle(state('L'))
    expect(deps.restoreCatchup).not.toHaveBeenCalled()
    expect(deps.setRoomContentReady).not.toHaveBeenCalledWith(true)
  })
})
