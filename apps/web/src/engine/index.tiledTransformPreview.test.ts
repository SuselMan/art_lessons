// Engine-level integration tests for #139: previewLayerTransform (the live
// gizmo drag/scale/rotate preview, #120) generalized to multiple source/
// destination tiles. Before this fix it unconditionally no-op'd for
// infinite-canvas engines, and even ignoring that early return it assumed
// exactly one source buffer (`const [{ buffer }] = source.allResident()`) —
// wrong for any layer spanning more than one tile.
//
// index.tiledTransform.test.ts already proves the *committed* bake
// (_bakeTransform) is tile-aware and never clips content; these tests prove
// the *live, uncommitted* preview matches it: same multi-tile destination
// resolution, same stitching from every overlapping source tile, and (the
// most important guarantee) pixel-identical to what _bakeTransform actually
// commits once the drag ends — not just "a plausible-looking preview".
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform, readLayerPixels,
  readTilePixels, readTransformPreviewTiles, residentTileCount,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

describe('previewLayerTransform: multi-tile live preview (#139)', () => {
  it('a tile-straddling source stages one preview tile per source tile, not just the first one the old code happened to grab', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Centered exactly on the tile(0,0)/tile(1,0) boundary — same fixture
    // index.tiledStroke.test.ts uses to prove a straddling dab paints into
    // both tiles.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))
    expect(residentTileCount(engine, 'L')).toBe(2)

    // Identity transform: content doesn't move, so the live preview should
    // reproduce both source tiles exactly, at their own original origins.
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 0, 0] }])

    const tiles = readTransformPreviewTiles(engine, 'L')
    expect(tiles.length).toBe(2)
    const byX = [...tiles].sort((a, b) => a.originX - b.originX)
    expect(byX[0]).toMatchObject({ originX: 0, originY: 0 })
    expect(byX[1]).toMatchObject({ originX: TILE_SIZE, originY: 0 })

    expectPixelsEqual(byX[0].pixels, readTilePixels(engine, 'L', 0, 0))
    expectPixelsEqual(byX[1].pixels, readTilePixels(engine, 'L', 1, 0))
  })

  it('translating a tile-straddling layer resolves destination tiles from the transformed content\'s world bounds, matching directly-painted reference content', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))

    const dx = TILE_SIZE
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, dx, 0] }])

    // Content that spanned tile(0,0)/tile(1,0) now spans tile(1,0)/tile(2,0).
    const tiles = readTransformPreviewTiles(engine, 'L')
    expect(tiles.length).toBe(2)
    const byX = [...tiles].sort((a, b) => a.originX - b.originX)
    expect(byX[0].originX).toBe(TILE_SIZE)
    expect(byX[1].originX).toBe(TILE_SIZE * 2)

    // Independent ground truth: a fresh engine with the same content painted
    // directly at the shifted position, no transform involved at all.
    const { engine: refEngine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    refEngine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE + dx, 500, 40))

    expectPixelsEqual(byX[0].pixels, readTilePixels(refEngine, 'L', 1, 0))
    expectPixelsEqual(byX[1].pixels, readTilePixels(refEngine, 'L', 2, 0))

    // The preview must never mutate the real layer — still exactly the two
    // source tiles it started with, none of the (possibly nonexistent yet)
    // destination tiles leaked into the real tile map just from previewing.
    expect(residentTileCount(engine, 'L')).toBe(2)
  })

  it('the live preview is pixel-identical to what _bakeTransform actually commits once the drag ends — not just plausible-looking', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))

    const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, TILE_SIZE * 3, 0]
    engine.previewLayerTransform([{ layerId: 'L', matrix }])
    const previewTiles = readTransformPreviewTiles(engine, 'L')
    expect(previewTiles.length).toBeGreaterThan(1)

    // Commit for real, exactly as Room does on gizmo release.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix }]))
    engine.clearLayerTransformPreview()

    for (const { originX, originY, pixels } of previewTiles) {
      const tx = originX / TILE_SIZE, ty = originY / TILE_SIZE
      expectPixelsEqual(pixels, readTilePixels(engine, 'L', tx, ty))
    }
  })

  it('a degenerate (zero-scale) transform clears the preview to nothing rather than leaving stale tiles', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))

    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 0, 0] }])
    expect(readTransformPreviewTiles(engine, 'L').length).toBe(2)

    engine.previewLayerTransform([{ layerId: 'L', matrix: [0, 0, 0, 0, 0, 0] }])
    expect(readTransformPreviewTiles(engine, 'L')).toEqual([])
  })

  it('clearLayerTransformPreview tears down every tile of a multi-tile preview, not just one', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))

    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 0, 0] }])
    expect(readTransformPreviewTiles(engine, 'L').length).toBe(2)

    engine.clearLayerTransformPreview()
    expect(readTransformPreviewTiles(engine, 'L')).toEqual([])
  })

  it('a bounded (fixed-canvas) layer still gets a correct single-tile preview, unaffected by the multi-tile generalization', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))

    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }])
    const tiles = readTransformPreviewTiles(engine, 'L')
    expect(tiles.length).toBe(1)
    expect(tiles[0]).toMatchObject({ originX: 0, originY: 0 })

    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    refEngine.appendOperation(fillStroke('user-a', 'L', 12, 4, 3))
    expectPixelsEqual(tiles[0].pixels, readLayerPixels(refEngine, 'L'))
  })

  it('an infinite-canvas engine no longer no-ops previewLayerTransform (the old unconditional early return is gone)', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))

    expect(readTransformPreviewTiles(engine, 'L')).toEqual([])
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 50, 0] }])
    expect(readTransformPreviewTiles(engine, 'L').length).toBeGreaterThan(0)
  })
})
