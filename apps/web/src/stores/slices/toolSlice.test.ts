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

// The mirror image of the block above, for the floating panel's second slot:
// it shows and returns to whichever of eraser/smudge/eyedropper was last in
// hand, so "hold the slot, pick the smudge" makes the slot mean the smudge
// from then on. Kept in the store rather than in the panel because the left
// toolbar and the hotkeys select these tools too, and a slot that only
// remembered its own choices would go stale the moment the same choice was
// made a foot to the left.
describe('lastSecondaryTool', () => {
  beforeEach(() => { resetRoomStore() })

  it('starts on the eraser — the slot means what it always meant until moved', () => {
    expect(useRoomStore.getState().lastSecondaryTool).toBe('eraser')
  })

  it('follows setTool across all three of its members', () => {
    for (const tool of ['smudge', 'eyedropper', 'eraser'] as const) {
      useRoomStore.getState().setTool(tool)
      expect(useRoomStore.getState().lastSecondaryTool).toBe(tool)
    }
  })

  it('is left alone by the drawing tools, so the slot survives a stroke', () => {
    useRoomStore.getState().setTool('smudge')
    for (const tool of ['pencil', 'charcoal', 'liner', 'marker'] as const) {
      useRoomStore.getState().setTool(tool)
      expect(useRoomStore.getState().lastSecondaryTool).toBe('smudge')
    }
  })

  // The eyedropper hands the canvas back to `drawingTool` the moment it has
  // taken a colour (#405), so the selection moves on by itself — the slot has
  // to go on showing the eyedropper anyway, or sampling twice in a row would
  // mean going back to the full chrome for the second one.
  it('still names the eyedropper after it has returned the canvas', () => {
    useRoomStore.getState().setTool('liner')
    useRoomStore.getState().setTool('eyedropper')

    const { drawingTool, setTool } = useRoomStore.getState()
    setTool(drawingTool)
    expect(useRoomStore.getState().tool).toBe('liner')
    expect(useRoomStore.getState().lastSecondaryTool).toBe('eyedropper')
  })

  it('is left alone while a tool from neither slot is selected', () => {
    useRoomStore.getState().setTool('eyedropper')
    for (const tool of ['ruler', 'transform', 'grid', 'hand'] as const) {
      useRoomStore.getState().setTool(tool)
      expect(useRoomStore.getState().lastSecondaryTool).toBe('eyedropper')
    }
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

// (#443) The hand joined that selection. It had been the one exception —
// a boolean in viewportSlice, lit *beside* the selected tool — and the
// exception is what made the toolbar unreadable: two buttons on at once, with
// no rule on screen saying which one the next press would use.
describe('the hand is an ordinary member of the selection (#443)', () => {
  beforeEach(() => { resetRoomStore() })

  it('is a non-drawing tool, so it can never reach the operation log', () => {
    // The half of ADR 007 §5 that #443 did *not* change: the hand paints
    // nothing, so it must stay out of `ToolType` — which is exactly what
    // NON_DRAWING_TOOLS membership guarantees (see its doc comment).
    expect(NON_DRAWING_TOOLS).toContain('hand')
    expect(isDrawingTool('hand')).toBe(false)
  })

  it('replaces the selected tool rather than sitting on top of it', () => {
    useRoomStore.getState().setTool('charcoal')
    useRoomStore.getState().setTool('hand')
    expect(useRoomStore.getState().tool).toBe('hand')
  })

  it('is put down by selecting anything else', () => {
    useRoomStore.getState().setTool('hand')
    useRoomStore.getState().setTool('ruler')
    expect(useRoomStore.getState().tool).toBe('ruler')
  })

  // Same guarantee every other non-drawing tool gets: the engine, the brush
  // cursor and the sound keep a real tool configured while the hand is up, and
  // `H` pressed twice lands back on it.
  it('keeps the drawing tool underneath, and H twice returns to it', () => {
    useRoomStore.getState().setTool('marker')
    useRoomStore.getState().setTool('hand')
    expect(useRoomStore.getState().drawingTool).toBe('marker')

    const { drawingTool, setTool } = useRoomStore.getState()
    setTool(prev => (prev === 'hand' ? drawingTool : 'hand'))
    expect(useRoomStore.getState().tool).toBe('marker')
  })
})
