import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LessonState } from '@grafetto/shared'

import { resetRoomStore, useRoomStore } from '../../stores/roomStore'
import { createBoardEventHandlers, type BoardEventDeps } from './boardEvents'

/** (#493) The board and class handlers, called the way the socket calls them.
 *  Everything they touch is the store and a handful of refs, so the page turn
 *  and following can be driven here without a socket or a browser. */

function lesson(patch: Partial<LessonState> = {}): LessonState {
  return {
    id: 'L', boards: [{ id: 'L', name: 'Cube', order: 0 }, { id: 'B2', name: 'Cube 2', order: 1 }],
    activeBoardId: null, assignments: [], activeAssignmentId: null, spotlightBoardId: null,
    classVisibility: 'teacher_only', handsRaised: [],
    ...patch,
  }
}

function setup(overrides: Partial<BoardEventDeps> = {}) {
  const deps = {
    maybeFollow: vi.fn(),
    wantedBoardRef: { current: null as string | null },
    socketBoardRef: { current: null as string | null },
    boardIdRef: { current: 'L' as string | null },
    setRoomContentReady: vi.fn(),
    isOwnerRef: { current: false },
    ...overrides,
  }
  return { deps, on: createBoardEventHandlers(deps) }
}

beforeEach(() => {
  resetRoomStore()
  const s = useRoomStore.getState()
  s.setUserId('me')
  s.setLesson(lesson())
  s.setBoardId('L')
  s.setFollowing(false)
})

describe('board_deleted', () => {
  it('drops a page turn heading to the deleted board and unblocks the canvas', () => {
    const { deps, on } = setup({ wantedBoardRef: { current: 'B2' } })
    on.board_deleted({ boardId: 'B2' })

    expect(deps.wantedBoardRef.current).toBeNull()
    // Back to where the server says the socket is: the board already shown.
    expect(deps.socketBoardRef.current).toBe('L')
    expect(deps.setRoomContentReady).toHaveBeenCalledWith(true)
    expect(useRoomStore.getState().boards.map(b => b.id)).toEqual(['L'])
    expect(deps.maybeFollow).toHaveBeenCalled()
  })

  it('leaves a turn to some other board alone', () => {
    const { deps, on } = setup({ wantedBoardRef: { current: 'L' } })
    on.board_deleted({ boardId: 'B2' })

    expect(deps.wantedBoardRef.current).toBe('L')
    expect(deps.setRoomContentReady).not.toHaveBeenCalled()
    expect(deps.maybeFollow).toHaveBeenCalled()
  })
})

describe('board_renamed', () => {
  // The lesson's name is its first board's, so renaming that board renames
  // the lesson in the header; renaming any other leaves the header alone.
  it('renames the header too when the board is the lesson’s own, and only then', () => {
    useRoomStore.getState().setRoomInfo({
      id: 'L', name: 'Cube', paper: 'flat', infinite: false, width: 1024, height: 1024, accessMode: 'anyone_with_link',
    })
    const { on } = setup()

    on.board_renamed({ boardId: 'B2', name: 'Torus' })
    expect(useRoomStore.getState().boards.find(b => b.id === 'B2')?.name).toBe('Torus')
    expect(useRoomStore.getState().room?.name).toBe('Cube')

    on.board_renamed({ boardId: 'L', name: 'Sphere' })
    expect(useRoomStore.getState().boards.find(b => b.id === 'L')?.name).toBe('Sphere')
    expect(useRoomStore.getState().room?.name).toBe('Sphere')
  })
})

describe('lesson_state', () => {
  it('turns following back on for a student when the teacher hands out a round', () => {
    const { deps, on } = setup()
    on.lesson_state({ lesson: lesson({ activeAssignmentId: 'A1' }) })
    expect(useRoomStore.getState().following).toBe(true)
    expect(deps.maybeFollow).toHaveBeenCalled()
  })

  it('turns it on when the board this client is on has gone out of sight', () => {
    useRoomStore.getState().setBoardId('B2')
    const { on } = setup()
    on.lesson_state({ lesson: lesson({ boards: [{ id: 'L', name: 'Cube', order: 0 }] }) })
    expect(useRoomStore.getState().following).toBe(true)
  })

  it('leaves a hand-picked board alone for anything else', () => {
    const { on } = setup()
    on.lesson_state({ lesson: lesson({ classVisibility: 'class' }) })
    expect(useRoomStore.getState().following).toBe(false)
    expect(useRoomStore.getState().classVisibility).toBe('class')
  })

  it('never makes the teacher follow — by the ref, or by the roster alone', () => {
    const byRef = setup({ isOwnerRef: { current: true } })
    byRef.on.lesson_state({ lesson: lesson({ activeAssignmentId: 'A1' }) })
    expect(useRoomStore.getState().following).toBe(false)

    // The roster can name this client the teacher before a render has
    // refreshed the ref — the case isTeacherIn exists for.
    useRoomStore.getState().applyParticipantAction({
      type: 'room_state',
      participants: [{ userId: 'me', name: 'Me', role: 'owner', color: '#000', frozen: false, boardId: 'L' }],
    })
    const byRoster = setup()
    byRoster.on.lesson_state({ lesson: lesson({ activeAssignmentId: 'A2' }) })
    expect(useRoomStore.getState().following).toBe(false)
  })
})

describe('the rest are the store', () => {
  it('moves the teacher’s marker and asks whether to follow', () => {
    const { deps, on } = setup()
    on.active_board_changed({ boardId: 'B2' })
    expect(useRoomStore.getState().activeBoardId).toBe('B2')
    expect(deps.maybeFollow).toHaveBeenCalled()
  })

  it('keeps the strip in step with created, reordered and re-thumbnailed boards', () => {
    const { on } = setup()
    on.board_created({ board: { id: 'B3', name: 'Cube 3', order: 2 } })
    on.boards_reordered({ order: ['B3', 'L', 'B2'] })
    on.board_thumbnail_updated({ boardId: 'B3', updatedAt: '2026-09-25T00:00:00Z' })
    const boards = useRoomStore.getState().boards
    expect(boards.map(b => b.id)).toEqual(['B3', 'L', 'B2'])
    expect(boards[0].thumbnailUpdatedAt).toBe('2026-09-25T00:00:00Z')
  })

  it('records a raised hand', () => {
    const { on } = setup()
    on.participant_hand_changed({ userId: 'x', raised: true })
    expect(useRoomStore.getState().handsRaised).toContain('x')
  })
})
