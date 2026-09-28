import { describe, expect, it } from 'vitest'

import type { BoardSummary } from '@grafetto/shared'

import {
  activeBoardPayload, boardsReducer, entryBoard, followTarget, followingAfterPick, movedOrder, teacherBoardId,
} from './boards'

const lesson: BoardSummary = { id: 'L', name: 'Still life', order: 0 }
const b2: BoardSummary = { id: 'B2', name: 'Still life 2', order: 1 }
const b3: BoardSummary = { id: 'B3', name: 'Still life 3', order: 2 }

describe('boardsReducer (#176)', () => {
  it('takes the lesson strip as authoritative and sorted', () => {
    expect(boardsReducer([b3], { type: 'lesson', boards: [b3, lesson, b2] })).toEqual([lesson, b2, b3])
  })

  it('merges a created board the owner also received over REST', () => {
    const once = boardsReducer([lesson], { type: 'board_created', board: b2 })
    const twice = boardsReducer(once, { type: 'board_created', board: b2 })
    expect(twice).toEqual([lesson, b2])
  })

  it('renames in place', () => {
    expect(boardsReducer([lesson, b2], { type: 'board_renamed', boardId: 'B2', name: 'Cube' }))
      .toEqual([lesson, { ...b2, name: 'Cube' }])
  })

  it('reorders by the full list and keeps an unnamed board after it', () => {
    const late: BoardSummary = { id: 'B4', name: 'late', order: 3 }
    const next = boardsReducer([lesson, b2, b3, late], { type: 'boards_reordered', order: ['L', 'B3', 'B2'] })
    expect(next.map(b => b.id)).toEqual(['L', 'B3', 'B2', 'B4'])
    expect(next.map(b => b.order)).toEqual([0, 1, 2, 6])
  })

  it('drops a deleted board', () => {
    expect(boardsReducer([lesson, b2], { type: 'board_deleted', boardId: 'B2' })).toEqual([lesson])
  })

  it('records a locally baked thumbnail', () => {
    const next = boardsReducer([lesson, b2], { type: 'thumbnail_baked', boardId: 'B2', at: '2026-09-23T00:00:00.000Z' })
    expect(next[1].thumbnailUpdatedAt).toBe('2026-09-23T00:00:00.000Z')
    expect(next[0].thumbnailUpdatedAt).toBeUndefined()
  })
})

describe('teacher board and the active-board payload', () => {
  it('null active means the lesson itself', () => {
    expect(teacherBoardId({ id: 'L', activeBoardId: null })).toBe('L')
    expect(teacherBoardId({ id: 'L', activeBoardId: 'B2' })).toBe('B2')
  })

  it('sends null for the lesson\'s own board', () => {
    expect(activeBoardPayload('L', 'L')).toBeNull()
    expect(activeBoardPayload('B2', 'L')).toBe('B2')
  })
})

describe('entryBoard', () => {
  it('lands on the teacher\'s board when entering by the lesson URL', () => {
    expect(entryBoard({ arrivedBoardId: 'L', enteredByBoardUrl: false, lesson: { id: 'L', activeBoardId: 'B2' } }))
      .toEqual({ target: 'B2', following: true })
    expect(entryBoard({ arrivedBoardId: 'L', enteredByBoardUrl: false, lesson: { id: 'L', activeBoardId: null } }))
      .toEqual({ target: 'L', following: true })
  })

  it('stays on the board a board URL named, following only if it is the teacher\'s', () => {
    expect(entryBoard({ arrivedBoardId: 'B3', enteredByBoardUrl: true, lesson: { id: 'L', activeBoardId: 'B2' } }))
      .toEqual({ target: 'B3', following: false })
    expect(entryBoard({ arrivedBoardId: 'B2', enteredByBoardUrl: true, lesson: { id: 'L', activeBoardId: 'B2' } }))
      .toEqual({ target: 'B2', following: true })
  })
})

describe('followTarget', () => {
  const base = { following: true, isOwner: false, lessonId: 'L', activeBoardId: 'B2', boardId: 'L', wantedBoardId: null }

  it('switches a following student to the teacher\'s board', () => {
    expect(followTarget(base)).toBe('B2')
  })

  it('stays when already there or already heading there', () => {
    expect(followTarget({ ...base, boardId: 'B2' })).toBeNull()
    expect(followTarget({ ...base, wantedBoardId: 'B2' })).toBeNull()
  })

  it('never moves the owner, a student who stopped following, or a client with no lesson yet', () => {
    expect(followTarget({ ...base, isOwner: true })).toBeNull()
    expect(followTarget({ ...base, following: false })).toBeNull()
    expect(followTarget({ ...base, lessonId: null })).toBeNull()
  })

  it('reads a null active board as the lesson\'s first', () => {
    expect(followTarget({ ...base, activeBoardId: null, boardId: 'B3' })).toBe('L')
  })
})

describe('followingAfterPick', () => {
  it('is off after picking another board and on after picking the teacher\'s', () => {
    expect(followingAfterPick('B3', 'B2')).toBe(false)
    expect(followingAfterPick('B2', 'B2')).toBe(true)
  })
})

describe('movedOrder', () => {
  const boards = [lesson, b2, b3]

  it('swaps with a neighbour', () => {
    expect(movedOrder(boards, 'B3', -1, 'L')).toEqual(['L', 'B3', 'B2'])
    expect(movedOrder(boards, 'B2', 1, 'L')).toEqual(['L', 'B3', 'B2'])
  })

  it('refuses to move the lesson, past an end, or ahead of the lesson', () => {
    expect(movedOrder(boards, 'L', 1, 'L')).toBeNull()
    expect(movedOrder(boards, 'B3', 1, 'L')).toBeNull()
    expect(movedOrder(boards, 'B2', -1, 'L')).toBeNull()
    expect(movedOrder(boards, 'nope', 1, 'L')).toBeNull()
  })
})
