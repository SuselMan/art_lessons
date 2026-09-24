import { describe, expect, it } from 'vitest'

import type { BoardSummary } from '@grafetto/shared'

import { followDestination, followTarget } from './boards'
import {
  classGrid, followChip, isForeignPersonalBoard, neighbourInGrid, ownBoardIn, stripBoards,
} from './classMode'

const lesson: BoardSummary = { id: 'L', name: 'Cube', order: 0 }
const page2: BoardSummary = { id: 'P2', name: 'Cube 2', order: 1 }
const alice1: BoardSummary = { id: 'A1', name: 'Alice', order: 0, assignmentId: 'R1', ownerId: 'alice' }
const bob1: BoardSummary = { id: 'B1', name: 'Bob', order: 0, assignmentId: 'R1', ownerId: 'bob' }
const alice2: BoardSummary = { id: 'A2', name: 'Alice', order: 0, assignmentId: 'R2', ownerId: 'alice' }
const boards = [lesson, page2, alice1, bob1, alice2]

describe('class mode on the client (#595)', () => {
  it('keeps personal boards out of the strip', () => {
    expect(stripBoards(boards).map(b => b.id)).toEqual(['L', 'P2'])
  })

  it('finds a student\'s board in an assignment, and nothing where the class is with the teacher', () => {
    expect(ownBoardIn(boards, 'R1', 'alice')?.id).toBe('A1')
    expect(ownBoardIn(boards, 'R2', 'bob')).toBeUndefined()
    expect(ownBoardIn(boards, null, 'alice')).toBeUndefined()
  })

  it('orders the grid raised hands first, then by name, and walks it round', () => {
    const tiles = classGrid(boards, 'R1', new Set(['bob']), ['bob'])
    expect(tiles.map(t => [t.board.id, t.present, t.handRaised])).toEqual([['B1', true, true], ['A1', false, false]])
    expect(neighbourInGrid(tiles, 'B1', 1)).toBe('A1')
    expect(neighbourInGrid(tiles, 'A1', 1)).toBe('B1')
    expect(neighbourInGrid(tiles, 'B1', -1)).toBe('A1')
    expect(neighbourInGrid(classGrid(boards, 'R2', new Set(), []), 'A2', 1)).toBeNull()
    expect(classGrid(boards, null, new Set(), [])).toEqual([])
  })

  it('follows the spotlight first, then the student\'s own board in the round, then the teacher', () => {
    const base = { lessonId: 'L', activeBoardId: 'P2' }
    expect(followDestination({ ...base, spotlightBoardId: 'B1', ownAssignmentBoardId: 'A2' })).toBe('B1')
    expect(followDestination({ ...base, spotlightBoardId: null, ownAssignmentBoardId: 'A2' })).toBe('A2')
    expect(followDestination({ ...base, spotlightBoardId: null, ownAssignmentBoardId: null })).toBe('P2')
    expect(followDestination({ lessonId: 'L', activeBoardId: null, spotlightBoardId: null, ownAssignmentBoardId: null })).toBe('L')
  })

  it('a following student on the teacher\'s board is sent to their own when a round starts', () => {
    const input = { following: true, isOwner: false, lessonId: 'L', activeBoardId: null, boardId: 'L', wantedBoardId: null }
    expect(followTarget(input)).toBeNull()
    expect(followTarget({ ...input, ownAssignmentBoardId: 'A2' })).toBe('A2')
    expect(followTarget({ ...input, boardId: 'A2', ownAssignmentBoardId: 'A2' })).toBeNull()
    // The teacher never follows, class mode or not.
    expect(followTarget({ ...input, isOwner: true, ownAssignmentBoardId: 'A2' })).toBeNull()
  })

  it('words the chip after where following would lead', () => {
    const chip = (destination: string, spotlightBoardId: string | null, own: string | null) =>
      followChip({ destination, spotlightBoardId, ownAssignmentBoardId: own, boards })
    expect(chip('B1', 'B1', 'A2')).toEqual({ kind: 'spotlight', name: 'Bob' })
    expect(chip('A2', null, 'A2')).toEqual({ kind: 'ownWork' })
    expect(chip('P2', null, null)).toEqual({ kind: 'teacher', name: 'Cube 2' })
  })

  it('a classmate\'s board is read-only for a student and not for the teacher or its owner', () => {
    expect(isForeignPersonalBoard(alice1, 'bob', false)).toBe(true)
    expect(isForeignPersonalBoard(alice1, 'alice', false)).toBe(false)
    expect(isForeignPersonalBoard(alice1, 'teacher', true)).toBe(false)
    expect(isForeignPersonalBoard(lesson, 'bob', false)).toBe(false)
  })
})
