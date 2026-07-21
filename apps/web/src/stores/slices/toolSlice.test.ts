import { describe, expect, it, beforeEach } from 'vitest'

import { useRoomStore, resetRoomStore } from '../roomStore'

// #245 follow-up: lastDrawingTool lets a "return to drawing" toggle
// (eraser/smudge off, FloatingToolPanel's top button) go back to whichever
// of pencil/liner was actually active, instead of assuming pencil — a real
// gap once liner became a second real drawing tool. resetRoomStore() is the
// store's own intended test-isolation mechanism (see its own doc comment in
// roomStore.ts) since useRoomStore is a module-level singleton, not
// per-test state.
describe('lastDrawingTool (#245 follow-up)', () => {
  beforeEach(() => { resetRoomStore() })

  it('starts on pencil, matching the initial tool', () => {
    expect(useRoomStore.getState().lastDrawingTool).toBe('pencil')
  })

  it('follows setTool when switching to liner', () => {
    useRoomStore.getState().setTool('liner')
    expect(useRoomStore.getState().lastDrawingTool).toBe('liner')
  })

  it('does not change when switching to eraser or smudge', () => {
    useRoomStore.getState().setTool('liner')
    useRoomStore.getState().setTool('eraser')
    expect(useRoomStore.getState().tool).toBe('eraser')
    expect(useRoomStore.getState().lastDrawingTool).toBe('liner')

    useRoomStore.getState().setTool('smudge')
    expect(useRoomStore.getState().lastDrawingTool).toBe('liner')
  })

  it('remembers pencil across an eraser detour, via the functional-updater form', () => {
    useRoomStore.getState().setTool(t => (t === 'eraser' ? 'pencil' : 'eraser'))
    expect(useRoomStore.getState().tool).toBe('eraser')
    expect(useRoomStore.getState().lastDrawingTool).toBe('pencil')

    // The real toggle-off pattern (Room/index.tsx): return to
    // lastDrawingTool, not a hardcoded 'pencil'.
    const { lastDrawingTool, setTool } = useRoomStore.getState()
    setTool(t => (t === 'eraser' ? lastDrawingTool : 'eraser'))
    expect(useRoomStore.getState().tool).toBe('pencil')
  })

  it('remembers liner across an eraser detour, via the real toggle-off pattern', () => {
    useRoomStore.getState().setTool('liner')
    useRoomStore.getState().setTool('eraser')

    const { lastDrawingTool, setTool } = useRoomStore.getState()
    setTool(t => (t === 'eraser' ? lastDrawingTool : 'eraser'))
    expect(useRoomStore.getState().tool).toBe('liner')
  })
})
