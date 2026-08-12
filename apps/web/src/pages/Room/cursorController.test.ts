import { describe, expect, it } from 'vitest'

import { resolveCursor, transformHandleCursor, RULER_GESTURE_CURSOR, type CursorState } from './cursorController'
import { TRANSFORM_MODES, type TransformHandleKind } from './transformMath'
import { DRAWING_TOOLS, NON_DRAWING_TOOLS } from '../../stores/slices/toolSlice'

// #393: the whole point of the module is that these answers live in one
// place, so this file is the readable statement of what they are.

const base: CursorState = {
  tool: 'pencil',
  drawingTool: 'pencil',
  handHeld: false,
}
const at = (over: Partial<CursorState>) => resolveCursor({ ...base, ...over })

describe('resolveCursor', () => {
  it('previews the dab under a crosshair when a drawing tool is the one in hand', () => {
    expect(at({})).toEqual({ dabPreview: true, viewportCursor: 'crosshair' })
  })

  it('previews the dab for every drawing tool, not just the pencil', () => {
    for (const tool of DRAWING_TOOLS) {
      expect(at({ tool, drawingTool: tool }).dabPreview).toBe(true)
    }
  })

  // The reported symptom that produced this module: the brush ring stayed on
  // top of the transform gizmo, because transform was not a tool and the tool
  // was still a pencil. (#405) It is a tool now — and the pencil it would have
  // previewed is still sitting in `drawingTool`, which is exactly why that
  // field must not be what decides.
  it('shows nothing of its own during a transform, whatever was being drawn with', () => {
    expect(at({ tool: 'transform' })).toEqual({ dabPreview: false, viewportCursor: 'default' })
    expect(at({ tool: 'transform', drawingTool: 'marker' })).toEqual({ dabPreview: false, viewportCursor: 'default' })
  })

  it('drops the preview for the eyedropper but keeps the aim', () => {
    expect(at({ tool: 'eyedropper' })).toEqual({ dabPreview: false, viewportCursor: 'crosshair' })
  })

  // (#405) The ruler used to bring the preview back once its line was placed,
  // because a placed ruler left the pencil free to draw. Selecting the ruler
  // now means you are working on the ruler and cannot draw at all.
  it('keeps the aim but never the preview while the ruler is the selected tool', () => {
    expect(at({ tool: 'ruler' })).toEqual({ dabPreview: false, viewportCursor: 'crosshair' })
  })

  // (#405) The grid is the one selected tool with no canvas gesture at all
  // until #406 — so it promises nothing, not even a crosshair.
  it('offers nothing on the canvas while the grid tool is selected', () => {
    expect(at({ tool: 'grid' })).toEqual({ dabPreview: false, viewportCursor: 'default' })
  })

  // (#443) The selected hand answers from inside the switch, like every other
  // tool — it is not a rule above it any more.
  it('grabs the view with the hand selected, and drops the ring that would promise paint', () => {
    expect(at({ tool: 'hand' })).toEqual({ dabPreview: false, viewportCursor: 'grab' })
    expect(at({ tool: 'hand', drawingTool: 'marker' })).toEqual({ dabPreview: false, viewportCursor: 'grab' })
  })

  // Held Space *is* still a rule above the switch, for the reason that survived
  // #443: it lies over whatever is selected, ends nothing, and always looks the
  // same — including over an open transform session.
  it('lets held Space win over every tool — panning never touches content', () => {
    for (const tool of [...DRAWING_TOOLS, ...NON_DRAWING_TOOLS]) {
      expect(at({ handHeld: true, tool })).toEqual({ dabPreview: false, viewportCursor: 'grab' })
    }
  })

  // A visible grid is a setting, not a cursor input: it intercepts no pointer
  // events and blocks no painting, so drawing over one looks like drawing.
  // The state it would have travelled in is deliberately absent from
  // CursorState — this asserts the tool axis alone is the whole story.
  it('answers every combination — no state leaves the cursor undecided', () => {
    for (const tool of [...DRAWING_TOOLS, ...NON_DRAWING_TOOLS]) {
      for (const drawingTool of DRAWING_TOOLS) {
        for (const handHeld of [false, true]) {
          const decision = at({ tool, drawingTool, handHeld })
          expect(typeof decision.dabPreview).toBe('boolean')
          expect(['crosshair', 'grab', 'default']).toContain(decision.viewportCursor)
        }
      }
    }
  })
})

const ALL_HANDLES: TransformHandleKind[] = [
  'body', 'tl', 'tr', 'br', 'bl', 't', 'b', 'l', 'r',
  'rotate-tl', 'rotate-tr', 'rotate-bl', 'rotate-br',
]

describe('gizmo handle cursors', () => {
  it('gives opposite corners the same resize axis and both rotate zones the same glyph', () => {
    const c = (h: TransformHandleKind) => transformHandleCursor(h, 'free')
    expect(c('tl')).toBe(c('br'))
    expect(c('tr')).toBe(c('bl'))
    expect(c('t')).toBe(c('b'))
    expect(c('l')).toBe(c('r'))
    expect(c('rotate-tl')).toBe(c('rotate-br'))
  })

  it('names a cursor for every handle either gizmo can hand the pointer, in every mode', () => {
    // (#391/#392) The mode axis is why this is a function and not a record —
    // the old version could only be exhaustive over handles.
    for (const mode of TRANSFORM_MODES) {
      for (const handle of ALL_HANDLES) expect(transformHandleCursor(handle, mode)).toBeTruthy()
    }
    for (const cursor of Object.values(RULER_GESTURE_CURSOR)) expect(cursor).toBeTruthy()
  })

  it('turns a sheared edge\'s arrows across the axis that same edge stretches along', () => {
    // The whole reason the cursor follows the gesture rather than the handle:
    // in Rotate & Skew the top edge slides sideways instead of up and down.
    expect(transformHandleCursor('t', 'free')).toBe('ns-resize')
    expect(transformHandleCursor('t', 'rotateSkew')).toBe('ew-resize')
    expect(transformHandleCursor('l', 'free')).toBe('ew-resize')
    expect(transformHandleCursor('l', 'rotateSkew')).toBe('ns-resize')
  })

  it('drops the diagonal arrow on a Distort corner, which is not resizing anything', () => {
    expect(transformHandleCursor('tl', 'distort')).toBe('move')
    // Its edges are still Free transform's, so they keep saying so.
    expect(transformHandleCursor('t', 'distort')).toBe('ns-resize')
  })

  it('leaves the rotate zones alone in every mode', () => {
    for (const mode of TRANSFORM_MODES) {
      expect(transformHandleCursor('rotate-tl', mode)).toBe(transformHandleCursor('rotate-tl', 'free'))
    }
  })

  // (#405) Laying a new ruler line is an aimed gesture like painting, so it
  // must keep the viewport's own crosshair rather than switching to a grab —
  // the cursor is how you tell "this press starts a new line" from "this press
  // picks up the one that's there".
  it('separates grabbing the ruler from laying a new one', () => {
    expect(RULER_GESTURE_CURSOR.new).toBe('crosshair')
    expect(RULER_GESTURE_CURSOR.a).toBe(RULER_GESTURE_CURSOR.b)
    expect(RULER_GESTURE_CURSOR.body).not.toBe(RULER_GESTURE_CURSOR.new)
  })
})
