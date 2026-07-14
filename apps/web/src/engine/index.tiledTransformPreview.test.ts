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
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform,
  readTilePixels, readTransformPreviewTextureIds, readTransformPreviewTiles, residentTileCount,
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

  it('a bounded (fixed-canvas) layer gets a correct preview, spanning a second (#142) tile if the transform pushes its own tile bounds past the page edge', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 10, 4, 5))

    // #142: previewLayerTransform (like _bakeTransform) transforms the
    // *source tile's own bounding box* (the whole 16x16 page here, not just
    // the dab's painted extent) — translating it +8 pushes its right edge
    // from x=16 to x=24, past this bounded room's own (16-wide) tile
    // boundary, so the preview now legitimately spans two page-sized tiles
    // (origin (0,0) and (16,0)) instead of only ever one. The dab itself
    // (shifted center x=18, radius 5: world x in [13,23]) straddles that
    // same boundary, so both tiles get real, non-empty content to compare.
    const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, 8, 0]
    engine.previewLayerTransform([{ layerId: 'L', matrix }])
    const previewTiles = readTransformPreviewTiles(engine, 'L')
    expect(previewTiles.length).toBe(2)
    const byX = [...previewTiles].sort((a, b) => a.originX - b.originX)
    expect(byX[0]).toMatchObject({ originX: 0, originY: 0 })
    expect(byX[1]).toMatchObject({ originX: 16, originY: 0 })

    // Ground truth: _bakeTransform's own already-correct committed result —
    // not an independently-painted reference, since real pointer-driven
    // painting is clamped to the visible page for bounded rooms (#142; see
    // _dabsWorldBounds) and couldn't reach world x=18 directly the way this
    // transform does.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix }]))
    engine.clearLayerTransformPreview()
    expectPixelsEqual(byX[0].pixels, readTilePixels(engine, 'L', 0, 0, 16, 16))
    expectPixelsEqual(byX[1].pixels, readTilePixels(engine, 'L', 1, 0, 16, 16))
  })

  it('an infinite-canvas engine no longer no-ops previewLayerTransform (the old unconditional early return is gone)', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))

    expect(readTransformPreviewTiles(engine, 'L')).toEqual([])
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 50, 0] }])
    expect(readTransformPreviewTiles(engine, 'L').length).toBeGreaterThan(0)
  })

  // Perf regression found testing on a real (underpowered) device: dragging
  // a gizmo made everything stutter and then hang. Root cause — every
  // previewLayerTransform call (one per pointermove, easily 60+/s on a pen
  // digitizer) unconditionally destroyed and recreated every scratch
  // AccumulationBuffer, a real GPU texture+framebuffer allocation up to a
  // full page's worth of bytes for a bounded room — GPU alloc/dealloc churn
  // at pointer-event frequency. Fixed by reusing a tile's existing buffer
  // (keyed by world origin) across frames whenever the tile set a drag
  // touches hasn't changed, which is the overwhelmingly common case.
  it('perf: repeated previewLayerTransform calls for the same tile set reuse the existing scratch buffers instead of reallocating them every frame', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 13, 8, 5))

    // (#155 Tier 2) Positioned and sized so its *real painted content*
    // (not just the tile's whole extent, which is all resolveForPaint used
    // to reason about pre-Tier-2 — see _bakeTransform's own doc comment)
    // reaches right up to the page's own right edge — nominally [8,18],
    // clamped to [8,16] by _dabsWorldBounds' bounded-room clamp (pointer
    // input can't paint past the visible page, same reasoning as ever).
    // Translating by dx=1..5 keeps that real content straddling the
    // (0,0)/(16,0) tile boundary throughout ([9,17] through [13,21]) —
    // exactly the "same two-tile set held across several drag frames" case
    // this fix targets (a real single-tile drag would only ever touch one
    // tile for small movements; this fixture starts right at the boundary
    // on purpose so every frame below needs both).
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 1, 0] }])
    const first = readTransformPreviewTextureIds(engine, 'L')
    expect(first.size).toBe(2)

    // Simulate several more drag frames — small incremental translations,
    // same two-tile set throughout.
    for (let dx = 2; dx <= 5; dx++) {
      engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, dx, 0] }])
    }
    const later = readTransformPreviewTextureIds(engine, 'L')
    expect(later.size).toBe(2)
    expect(later.get('0,0')).toBe(first.get('0,0'))
    expect(later.get('16,0')).toBe(first.get('16,0'))

    // A transform that genuinely changes the tile set (content no longer
    // reaches back to the origin tile at all) must still free the one no
    // longer needed and allocate the new one — reuse must never paper over
    // a real, necessary change.
    engine.previewLayerTransform([{ layerId: 'L', matrix: [1, 0, 0, 1, 32, 0] }])
    const afterTileChange = readTransformPreviewTextureIds(engine, 'L')
    expect(afterTileChange.size).toBe(1)
    expect(afterTileChange.has('0,0')).toBe(false)
    expect(afterTileChange.has('32,0')).toBe(true)
  })
})
