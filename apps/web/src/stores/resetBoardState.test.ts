import { beforeEach, describe, expect, it } from 'vitest'

import { makeInitialLayerState } from './slices/layerSlice'
import { resetBoardState, resetRoomStore, useRoomStore } from './roomStore'

// (#176, ADR 014 §4) A page turn resets what belongs to the board and keeps
// what belongs to the person and the lesson. The split is the whole point of
// the function, so each side is asserted explicitly.
describe('resetBoardState (#176)', () => {
  beforeEach(() => { resetRoomStore() })

  function dirtyEverything() {
    const s = useRoomStore.getState()
    // Lesson (roomSlice) — survives.
    s.setUserId('teacher')
    s.setPalette(['#123456'])
    s.setLesson({ id: 'L', boards: [{ id: 'L', name: 'Cube', order: 0 }, { id: 'B2', name: 'Cube 2', order: 1 }], activeBoardId: 'B2',
      assignments: [], activeAssignmentId: null, spotlightBoardId: null, classVisibility: 'teacher_only', handsRaised: [] })
    s.setBoardId('B2')
    s.setFollowing(false)
    s.applyParticipantAction({ type: 'peer_joined', participant: { userId: 'x', name: 'X', role: 'member', color: '#fff', frozen: false, boardId: 'L' } })
    // Tool in hand (toolSlice) — survives.
    s.setTool('charcoal')
    s.setToolSetting('pencil', 'size', 33)
    // Content — reset.
    s.setLayerStateLocal({ ...makeInitialLayerState(), selectedIds: ['layer-1'] })
    s.setSoloIds(['layer-1'])
    s.setStrokeActive(true)
    s.setSelection({ points: [0, 0, 10, 0, 10, 10] })
    // Person-level view state inside the content slices — survives.
    s.setViewport({ cx: 10, cy: 20, zoom: 2, angle: 1 })
    s.setRotationLocked(true)
    s.setAnnotationMode(true)
  }

  it('clears the board\'s content and gestures', () => {
    dirtyEverything()
    resetBoardState()
    const s = useRoomStore.getState()
    expect(s.layerState.selectedIds).toEqual([])
    expect(s.soloIds).toEqual([])
    expect(s.strokeActive).toBe(false)
    expect(s.selection).toBeNull()
    expect(s.annotations.order).toEqual([])
  })

  it('keeps the lesson, the strip, who is following and the tool in hand', () => {
    dirtyEverything()
    resetBoardState()
    const s = useRoomStore.getState()
    expect(s.userId).toBe('teacher')
    expect(s.palette).toEqual(['#123456'])
    expect(s.lessonId).toBe('L')
    expect(s.boardId).toBe('B2')
    expect(s.boards.map(b => b.id)).toEqual(['L', 'B2'])
    expect(s.activeBoardId).toBe('B2')
    expect(s.following).toBe(false)
    expect(s.participants.map(p => p.userId)).toEqual(['x'])
    expect(s.tool).toBe('charcoal')
    expect(s.toolSettings.pencil.size).toBe(33)
  })

  it('keeps the camera, the rotation lock and the annotation rail', () => {
    dirtyEverything()
    resetBoardState()
    const s = useRoomStore.getState()
    expect(s.viewport).toEqual({ cx: 10, cy: 20, zoom: 2, angle: 1 })
    expect(s.rotationLocked).toBe(true)
    expect(s.annotationMode).toBe(true)
  })

  it('leaves the action functions as the same references', () => {
    const before = useRoomStore.getState().setLayerStateLocal
    resetBoardState()
    expect(useRoomStore.getState().setLayerStateLocal).toBe(before)
  })

  it('is what resetRoomStore is not: entering a lesson wipes the strip too', () => {
    dirtyEverything()
    resetRoomStore()
    const s = useRoomStore.getState()
    expect(s.lessonId).toBeNull()
    expect(s.boardId).toBeNull()
    expect(s.boards).toEqual([])
    expect(s.following).toBe(true)
  })
})
