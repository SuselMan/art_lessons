import { describe, expect, it } from 'vitest'

import type { LessonState } from '@grafetto/shared'

import { PLACEHOLDER_INFINITE_CANVAS_SIZE, toLessonConfig, toRoomConfig } from './roomConfig'

/** (#493) The single point a room enters the client. */

const base = {
  id: 'B2', name: 'Cube 2', paper: 'flat' as const, paperColor: undefined, infinite: false,
  canvasWidth: 1754, canvasHeight: 2480,
}

describe('toRoomConfig', () => {
  it('takes the canvas size as the page size', () => {
    expect(toRoomConfig(base)).toMatchObject({ width: 1754, height: 2480, infinite: false })
  })

  it('gives an infinite room the placeholder size', () => {
    const c = toRoomConfig({ ...base, infinite: true, canvasWidth: undefined, canvasHeight: undefined })
    expect(c.width).toBe(PLACEHOLDER_INFINITE_CANVAS_SIZE)
    expect(c.height).toBe(PLACEHOLDER_INFINITE_CANVAS_SIZE)
  })

  // (#460) Mirrors the server's own default for the row about to exist.
  it('falls back to a link-open room when the access mode is not known yet', () => {
    expect(toRoomConfig(base).accessMode).toBe('anyone_with_link')
    expect(toRoomConfig({ ...base, accessMode: 'invite_only' }).accessMode).toBe('invite_only')
  })
})

describe('toLessonConfig', () => {
  // (#176) The config describes the lesson: its id and its own board's name,
  // whichever board's room_state arrived first.
  it('carries the lesson’s id and name, not the arriving board’s', () => {
    const lesson: LessonState = {
      id: 'L', boards: [{ id: 'L', name: 'Cube', order: 0 }, { id: 'B2', name: 'Cube 2', order: 1 }],
      activeBoardId: null, assignments: [], activeAssignmentId: null, spotlightBoardId: null,
      classVisibility: 'teacher_only', handsRaised: [],
    }
    const c = toLessonConfig(base, lesson)
    expect(c.id).toBe('L')
    expect(c.name).toBe('Cube')
    expect(c.width).toBe(1754)
  })
})
