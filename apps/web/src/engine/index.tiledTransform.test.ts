// Engine-level regression test for #133: on a FIXED canvas, transforming a
// layer's content past the buffer edge destructively clips it — the buffer
// has no pixels beyond its own fixed width/height, so anything the matrix
// moves out there is simply never written anywhere and is gone the instant
// the bake commits. On an INFINITE canvas, the same drag must instead just
// relocate the content onto whichever tile(s) it now covers — created on
// demand — with nothing lost, no matter how far the transform moves it.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform, readLayerPixels,
  readTilePixels, residentTileCount,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

describe('infinite canvas: transform bake never clips content (#133)', () => {
  it('translating content two tiles to the right lands it intact on the destination tile, matching a reference painted directly there', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))
    expect(residentTileCount(engine, 'L')).toBe(1)

    // Moves the dab from tile (0,0) to well inside tile (2,0) — on a fixed
    // canvas sized anywhere near today's real room presets, this is exactly
    // the kind of drag that would silently clip.
    const dx = TILE_SIZE * 2
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, dx, 0] }]))

    const { engine: refEngine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    refEngine.appendOperation(fillStroke('user-a', 'L', 100 + dx, 100, 20))

    expectPixelsEqual(readTilePixels(engine, 'L', 2, 0), readTilePixels(refEngine, 'L', 2, 0))
    // Nothing was left behind on the original tile.
    const origTile = readTilePixels(engine, 'L', 0, 0)
    if (origTile) expect(origTile.every(v => v === 0)).toBe(true)
  })

  it('translating out two tiles and then back by the exact inverse restores the original content bit-for-bit — nothing was ever dropped', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))
    const before = readTilePixels(engine, 'L', 0, 0)!

    // Note: a vacated tile stays resident-but-empty rather than being
    // removed from the tile map (eviction/paging is a separate Phase 2
    // concern) — so tile count only ever grows here, it's not itself a
    // signal of correctness; what matters is the final pixel content below.
    const dx = TILE_SIZE * 3
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, dx, 0] }]))
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, -dx, 0] }]))

    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), before)
  })

  it('undo after a far-off-tile transform restores the pre-transform content exactly, same as the bounded-canvas case', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))
    const before = readTilePixels(engine, 'L', 0, 0)!

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, TILE_SIZE * 4, 0] }]))
    expect(engine.undo()?.type).toBe('layer_transform')

    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), before)
  })

  it('scaling content 2x so the result straddles a tile boundary distributes it correctly across both tiles it now spans', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Centered exactly on the tile(0,0)/tile(1,0) boundary; scaling 2x about
    // the origin moves the center to the tile(1,0)/tile(2,0) boundary
    // instead, with double the radius — still straddling, just one
    // boundary further out.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 100, 10))

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [2, 0, 0, 2, 0, 0] }]))

    const left = readTilePixels(engine, 'L', 1, 0)
    const right = readTilePixels(engine, 'L', 2, 0)
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    expect(left!.some(v => v !== 0)).toBe(true)
    expect(right!.some(v => v !== 0)).toBe(true)
  })

  it('a bounded (fixed-canvas) layer_transform is completely unaffected — content moved off the fixed buffer is still clipped exactly as before (this is the deliberate, unchanged fixed-canvas behavior — not a regression)', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 100, 0] }]))
    const pixels = readLayerPixels(engine, 'L')!
    // Moved entirely off a 16x16 buffer — every pixel is transparent.
    expect(pixels.every(v => v === 0)).toBe(true)
  })
})
