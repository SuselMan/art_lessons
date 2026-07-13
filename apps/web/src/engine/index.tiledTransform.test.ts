// Engine-level regression test for #133/#142: transforming a layer's
// content past its visible page must relocate it onto whichever tile(s) it
// now covers — created on demand — with nothing lost, no matter how far the
// transform moves it. True for infinite-canvas rooms since #133 (tiles are
// TILE_SIZE, tileMath.ts) and, since #142, for bounded (fixed-canvas) rooms
// too (tiles are the room's own canvas size instead — see _makeLayerBuffer's
// docstring in engine/index.ts) — BoundedLayerBuffer's old single-buffer,
// silently-clipping behavior is gone.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform,
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

  it('#142: a bounded (fixed-canvas) layer_transform is no longer destructive either — content dragged off the visible page survives on an adjacent (canvas-sized) tile and comes back intact', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    const before = readTilePixels(engine, 'L', 0, 0, 16, 16)!
    expect(before.some(v => v !== 0)).toBe(true)

    // A bounded room's own tile size is its canvas size (#142, see
    // _makeLayerBuffer) — dx=16 is exactly one full page-width off, landing
    // squarely on the adjacent tile rather than straddling a boundary.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 16, 0] }]))

    // Gone from the visible page (correct — it really did move off it)...
    const originAfter = readTilePixels(engine, 'L', 0, 0, 16, 16)
    if (originAfter) expect(originAfter.every(v => v === 0)).toBe(true)
    // ...but not destroyed: it's sitting on the next tile over, not merely
    // dropped. (Can't cross-check this against an independently-painted
    // reference the way the infinite-canvas tests above do — real pointer-
    // driven painting is clamped to the visible page for bounded rooms,
    // #142, so a reference stroke could never reach world x=20 the way this
    // transform does; the round-trip restore below is the real proof.)
    const adjacent = readTilePixels(engine, 'L', 1, 0, 16, 16)
    expect(adjacent).not.toBeNull()
    expect(adjacent!.some(v => v !== 0)).toBe(true)

    // And moving it back by the exact inverse restores the page bit-for-bit.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, -16, 0] }]))
    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0, 16, 16), before)
  })

  it('#142: undo after a bounded-room off-page transform restores the pre-transform content exactly, same as the infinite-canvas case', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    const before = readTilePixels(engine, 'L', 0, 0, 16, 16)!

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 32, 0] }]))
    expect(engine.undo()?.type).toBe('layer_transform')

    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0, 16, 16), before)
  })
})
