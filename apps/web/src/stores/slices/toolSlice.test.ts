import { describe, expect, it, beforeEach } from 'vitest'

import { useRoomStore, resetRoomStore } from '../roomStore'
import { DRAWING_TOOLS, NON_DRAWING_TOOLS, isDrawingTool } from './toolSlice'

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

  // #252: marker joined pencil/liner as a PrimaryDrawingTool (own color
  // field, real drawing tool) — same "return to drawing" behavior liner
  // already gets above.
  it('follows setTool when switching to marker, and remembers it across an eraser detour', () => {
    useRoomStore.getState().setTool('marker')
    expect(useRoomStore.getState().lastDrawingTool).toBe('marker')

    useRoomStore.getState().setTool('eraser')
    expect(useRoomStore.getState().lastDrawingTool).toBe('marker')

    const { lastDrawingTool, setTool } = useRoomStore.getState()
    setTool(t => (t === 'eraser' ? lastDrawingTool : 'eraser'))
    expect(useRoomStore.getState().tool).toBe('marker')
  })
})

// (#405) One tool is selected at a time, and the four that paint nothing are
// members of that one selection rather than modes laid over a drawing tool.
// `drawingTool` is what makes that possible without the engine, the brush
// cursor and the sound losing track of what they are configured with.
describe('one selected tool (#405)', () => {
  beforeEach(() => { resetRoomStore() })

  it('separates the two lists cleanly — nothing is in both, nothing in neither', () => {
    for (const tool of DRAWING_TOOLS) expect(isDrawingTool(tool)).toBe(true)
    for (const tool of NON_DRAWING_TOOLS) expect(isDrawingTool(tool)).toBe(false)
  })

  it('holds a non-drawing tool as the selection like any other', () => {
    useRoomStore.getState().setTool('ruler')
    expect(useRoomStore.getState().tool).toBe('ruler')
  })

  it('remembers the drawing tool underneath, so the engine keeps a real tool', () => {
    useRoomStore.getState().setTool('charcoal')
    useRoomStore.getState().setTool('transform')
    expect(useRoomStore.getState().tool).toBe('transform')
    expect(useRoomStore.getState().drawingTool).toBe('charcoal')
  })

  // What the eyedropper goes back to after taking a colour. Deliberately not
  // lastDrawingTool: if the eraser was in hand, the eraser is what returns.
  it('remembers the eraser as the drawing tool, unlike lastDrawingTool', () => {
    useRoomStore.getState().setTool('liner')
    useRoomStore.getState().setTool('eraser')
    useRoomStore.getState().setTool('eyedropper')

    const { drawingTool, lastDrawingTool } = useRoomStore.getState()
    expect(drawingTool).toBe('eraser')
    expect(lastDrawingTool).toBe('liner')
  })

  // The real "press the same button again" pattern (Room's selectTool).
  it('hands the canvas back to the drawing tool when the same tool is picked twice', () => {
    useRoomStore.getState().setTool('marker')
    useRoomStore.getState().setTool('ruler')

    const { drawingTool, setTool } = useRoomStore.getState()
    setTool(prev => (prev === 'ruler' ? drawingTool : 'ruler'))
    expect(useRoomStore.getState().tool).toBe('marker')
  })

  it('leaves lastDrawingTool alone while a non-drawing tool is selected', () => {
    useRoomStore.getState().setTool('marker')
    for (const tool of NON_DRAWING_TOOLS) {
      useRoomStore.getState().setTool(tool)
      expect(useRoomStore.getState().lastDrawingTool).toBe('marker')
    }
  })
})
