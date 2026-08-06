import { describe, expect, it } from 'vitest'

import { resolveCursor, transformHandleCursor, RULER_HANDLE_CURSOR, type CursorState } from './cursorController'
import { TRANSFORM_MODES, type TransformHandleKind } from './transformMath'

// #393: the whole point of the module is that these answers live in one
// place, so this file is the readable statement of what they are.

const base: CursorState = {
  tool: 'pencil',
  handActive: false,
  overlayMode: 'none',
  rulerPlaced: false,
  gridActive: false,
}
const at = (over: Partial<CursorState>) => resolveCursor({ ...base, ...over })

describe('resolveCursor', () => {
  it('previews the dab under a crosshair when a drawing tool is all that is on', () => {
    expect(at({})).toEqual({ dabPreview: true, viewportCursor: 'crosshair' })
  })

  it('previews the dab for every drawing tool, not just the pencil', () => {
    for (const tool of ['pencil', 'eraser', 'smudge', 'liner', 'marker', 'charcoal'] as const) {
      expect(at({ tool }).dabPreview).toBe(true)
    }
  })

  // The reported symptom: the brush ring stayed on top of the transform
  // gizmo, because transform is not a tool and the tool was still a pencil.
  it('shows nothing of its own during a transform, whatever the tool is', () => {
    expect(at({ overlayMode: 'transform' })).toEqual({ dabPreview: false, viewportCursor: 'default' })
    expect(at({ overlayMode: 'transform', tool: 'marker' })).toEqual({ dabPreview: false, viewportCursor: 'default' })
  })

  it('drops the preview for the eyedropper but keeps the aim', () => {
    expect(at({ overlayMode: 'eyedropper' })).toEqual({ dabPreview: false, viewportCursor: 'crosshair' })
  })

  it('drops the preview while a ruler is being placed and brings it back once it is', () => {
    expect(at({ overlayMode: 'ruler', rulerPlaced: false }))
      .toEqual({ dabPreview: false, viewportCursor: 'crosshair' })
    // A placed ruler is a guide strokes snap against, not a mode that stops
    // drawing — so the preview is back.
    expect(at({ overlayMode: 'ruler', rulerPlaced: true }))
      .toEqual({ dabPreview: true, viewportCursor: 'crosshair' })
  })

  it('grabs the view with the hand, and drops the ring that would promise paint', () => {
    expect(at({ handActive: true })).toEqual({ dabPreview: false, viewportCursor: 'grab' })
  })

  it('lets the hand win over every overlay mode — panning never touches content', () => {
    for (const overlayMode of ['transform', 'eyedropper', 'ruler'] as const) {
      expect(at({ handActive: true, overlayMode })).toEqual({ dabPreview: false, viewportCursor: 'grab' })
    }
  })

  // The grid is the one overlay that must NOT touch the cursor: it intercepts
  // no pointer events and blocks no painting.
  it('leaves the cursor completely alone for the construction grid', () => {
    expect(at({ gridActive: true })).toEqual(at({ gridActive: false }))
    expect(at({ gridActive: true, overlayMode: 'transform' })).toEqual(at({ overlayMode: 'transform' }))
    expect(at({ gridActive: true, handActive: true })).toEqual(at({ handActive: true }))
  })

  it('answers every combination — no state leaves the cursor undecided', () => {
    for (const overlayMode of ['none', 'eyedropper', 'ruler', 'transform'] as const) {
      for (const handActive of [false, true]) {
        for (const rulerPlaced of [false, true]) {
          const decision = at({ overlayMode, handActive, rulerPlaced })
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
    for (const cursor of Object.values(RULER_HANDLE_CURSOR)) expect(cursor).toBeTruthy()
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
})
