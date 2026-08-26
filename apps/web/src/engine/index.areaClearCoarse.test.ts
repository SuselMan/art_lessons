// (#503) An `area_clear` has to reach the LOD pyramid, not just the fine
// tiles it erases.
//
// The buffer-level half of this — that resolveExistingForPaint marks what it
// hands back and resolveVisible does not — lives in
// src/TiledLayerBuffer.coarse.test.ts. This file is the consequence: erase a
// region while the camera is far enough out that the composite draws from a
// coarse level, and read what actually comes out. Before the fix the erased
// pixels were still there, and stayed there until someone zoomed in far
// enough to fall back to the fine tiles.
//
// Worth stating because the issue was found on a bounded room: this predates
// bounded rooms getting a pyramid at all (#470). Infinite rooms have had one
// since #365, so they have had this bug for as long as `area_clear` has
// existed — it just needs a zoom nobody draws at to be visible.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, fillStroke, makeAreaClear, makeLayerAdd, readCompositePixels,
} from './testing/engineTestUtils'
import { COARSE_FACTORS } from './src/tileMath'

const RADIUS = 15

/** How much ink the composite actually shows. Alpha alone: MockGL keeps one
 *  scalar per texel and replicates it across channels (see its docstring), so
 *  any channel would do and alpha is the honest one to name. */
function inkedPixels(pixels: Uint8Array): number {
  let n = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) n++
  return n
}

function paintedEngine() {
  const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
  engine.appendOperation(makeLayerAdd('user-a', 'L'))
  engine.appendOperation(fillStroke('user-a', 'L', 0, 0, RADIUS))
  engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
  return engine
}

/** A rectangle comfortably around the painted dab. */
function coveringSelection(): { points: number[] } {
  const r = RADIUS * 2
  return { points: [-r, -r, r, -r, r, r, -r, r] }
}

describe('area_clear and the coarse level (#503)', () => {
  it('erases from what a zoomed-out frame actually draws', () => {
    const engine = paintedEngine()
    // Exactly at the coarsest level's own threshold: coarseFactorFor picks a
    // level while `factor <= 1 / scale`, so this is the zoom that reads the
    // pyramid rather than the fine tiles.
    engine.setInfiniteCamera(0, 0, 1 / COARSE_FACTORS[COARSE_FACTORS.length - 1], 0)

    const before = inkedPixels(readCompositePixels(engine))
    expect(before).toBeGreaterThan(0) // otherwise the erase below proves nothing

    engine.appendOperation(makeAreaClear('user-a', 'L', coveringSelection()))
    expect(inkedPixels(readCompositePixels(engine))).toBe(0)
  })

  it('erases at 1:1 as well, where no level is involved', () => {
    // The half that always worked, kept so a future change that fixes the
    // zoomed-out case by breaking the ordinary one cannot pass.
    const engine = paintedEngine()
    engine.setInfiniteCamera(0, 0, 1, 0)

    expect(inkedPixels(readCompositePixels(engine))).toBeGreaterThan(0)
    engine.appendOperation(makeAreaClear('user-a', 'L', coveringSelection()))
    expect(inkedPixels(readCompositePixels(engine))).toBe(0)
  })
})
