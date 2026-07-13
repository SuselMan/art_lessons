// Engine-level integration tests for infinite-canvas camera-relative
// on-screen rendering (#133 Phase 1, the piece that makes tiled content
// actually visible — see setInfiniteCamera/resizeCanvas/_runCompositeInfinite
// in engine/index.ts). Fixed-canvas rooms never call setInfiniteCamera/
// resizeCanvas at all — see index.recompositeCache.test.ts for their
// unaffected on-screen compositing path.
import { describe, expect, it } from 'vitest'

import { createTestEngine, fillStroke, makeLayerAdd, readCompositePixels } from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

// Reads one texel's alpha out of a readCompositePixels() Uint8Array
// (RGBA8, row-major, top-down — same convention _display() itself uses).
function alphaAt(pixels: Uint8Array, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4 + 3]
}

describe('infinite canvas: camera-relative on-screen composite (#133)', () => {
  it('content painted at world origin appears centered on screen when the camera looks at the origin', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 15))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setInfiniteCamera(0, 0, 1, 0)

    const pixels = readCompositePixels(engine)
    // Screen center (32,32) should show paint; a far corner should not.
    expect(alphaAt(pixels, 64, 32, 32)).toBeGreaterThan(0)
    expect(alphaAt(pixels, 64, 2, 2)).toBe(0)
  })

  it('panning the camera moves where the same world content appears on screen', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 0, 15))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    engine.setInfiniteCamera(100, 0, 1, 0)
    const centered = readCompositePixels(engine)
    expect(alphaAt(centered, 64, 32, 32)).toBeGreaterThan(0)

    // Camera now looks at world origin instead — the same content (still at
    // world (100,0)) should have moved off-center on screen (in fact clean
    // off this 64px-wide canvas entirely), not stayed put.
    engine.setInfiniteCamera(0, 0, 1, 0)
    const panned = readCompositePixels(engine)
    expect(alphaAt(panned, 64, 32, 32)).toBe(0)
  })

  it('content resolves from whichever tile(s) the visible world rect currently covers, straddling a tile boundary included', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Straddles the tile(0,0)/tile(1,0) boundary.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 0, 15))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setInfiniteCamera(TILE_SIZE, 0, 1, 0)

    const pixels = readCompositePixels(engine)
    expect(alphaAt(pixels, 64, 32, 32)).toBeGreaterThan(0)
  })

  it('zooming in makes the same world content appear larger on screen (covers more of a fixed screen offset)', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 5))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])

    engine.setInfiniteCamera(0, 0, 1, 0)
    const atZoom1 = readCompositePixels(engine)
    engine.setInfiniteCamera(0, 0, 4, 0)
    const atZoom4 = readCompositePixels(engine)

    // 10px offset from center: not covered at zoom 1 (radius ~5px*multiplier
    // is small), but covered once zoomed in 4x (same world content now
    // spans a much larger screen footprint).
    expect(alphaAt(atZoom1, 64, 32 + 10, 32)).toBe(0)
    expect(alphaAt(atZoom4, 64, 32 + 10, 32)).toBeGreaterThan(0)
  })

  it('resizeCanvas changes the canvas/composite size and re-centers the same camera correctly', () => {
    const { engine, canvas } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 15))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    engine.setInfiniteCamera(0, 0, 1, 0)

    engine.resizeCanvas(128, 128)
    expect(canvas.width).toBe(128)
    expect(canvas.height).toBe(128)

    // Camera state itself didn't change, but the screen center did (canvas
    // grew) — re-supplying the same camera params re-derives the new
    // center correctly (this mirrors what a real ResizeObserver-driven
    // caller does: resize, then re-set the camera).
    engine.setInfiniteCamera(0, 0, 1, 0)
    const pixels = readCompositePixels(engine)
    expect(alphaAt(pixels, 128, 64, 64)).toBeGreaterThan(0)
  })

  it('adjacent tiles show no 1px seam at a fractional zoom (#140)', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Fully covers the visible window around the tile(0,*)/tile(1,*)
    // boundary at world x=TILE_SIZE — wy=500 (mid-tile) keeps the visible
    // window clear of any tile-ROW boundary, isolating the x-seam.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 60))
    engine.setCompositeOrder([{ id: 'L', opacity: 1 }])
    // zoom=1.01 with the camera this far from the boundary is not a special
    // case — plenty of zoom/pan combinations reproduce the old independent-
    // rounding bug; these particular numbers were found by search (see
    // _drawTileComposite's docstring) and are known to make the old code's
    // rounded tile0-right-edge (38) land one pixel short of the rounded
    // tile1-left-edge (39), leaving screen column 38 painted by neither tile.
    engine.setInfiniteCamera(1017.5, 500, 1.01, 0)

    const pixels = readCompositePixels(engine)
    for (let x = 30; x <= 45; x++) {
      expect(alphaAt(pixels, 64, x, 32)).toBeGreaterThan(0)
    }
  })

  it('a bounded (fixed-canvas) engine never touches setInfiniteCamera/resizeCanvas — resizeCanvas is a guarded no-op there', () => {
    const { engine, canvas } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.resizeCanvas(999, 999)
    expect(canvas.width).toBe(16)
    expect(canvas.height).toBe(16)
  })
})
