// Engine-level integration tests for infinite-canvas (tiled) painting (#133
// Phase 1) — a stroke whose dabs straddle a tile boundary must paint
// correctly into every tile it touches, and painting far from the origin
// must not require (or disturb) any tile near it.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, fillStroke, makeLayerAdd, readLayerPixels, readTilePixels, residentTileCount,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

describe('infinite canvas: tile-straddling strokes (#133)', () => {
  it('a dab painted well inside one tile only creates that one tile', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))

    expect(residentTileCount(engine, 'L')).toBe(1)
    expect(readTilePixels(engine, 'L', 0, 0)).not.toBeNull()
  })

  it('a dab straddling a vertical tile boundary paints into both tiles, with content on each side', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Centered exactly on the boundary between tile (0,0) and (1,0), radius
    // big enough to spill well into both.
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, 500, 40))

    expect(residentTileCount(engine, 'L')).toBe(2)
    const left = readTilePixels(engine, 'L', 0, 0)!
    const right = readTilePixels(engine, 'L', 1, 0)!
    expect(left).not.toBeNull()
    expect(right).not.toBeNull()
    // Rightmost column of the left tile (nearest the boundary) should have
    // received paint; leftmost column of the right tile likewise.
    const w = TILE_SIZE
    const leftEdgeAlpha = left[((500 * w) + (w - 1)) * 4 + 3]
    const rightEdgeAlpha = right[(500 * w + 0) * 4 + 3]
    expect(leftEdgeAlpha).toBeGreaterThan(0)
    expect(rightEdgeAlpha).toBeGreaterThan(0)
  })

  it('a dab straddling a tile corner touches all four surrounding tiles', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE, TILE_SIZE, 40))

    expect(residentTileCount(engine, 'L')).toBe(4)
    for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      expect(readTilePixels(engine, 'L', tx, ty)).not.toBeNull()
    }
  })

  it('painting near the origin and painting far away (crossing many tile boundaries) both work independently', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 10, 10, 5))
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE * 5 + 10, TILE_SIZE * -3 + 10, 5))

    expect(residentTileCount(engine, 'L')).toBe(2)
    expect(readTilePixels(engine, 'L', 0, 0)).not.toBeNull()
    expect(readTilePixels(engine, 'L', 5, -3)).not.toBeNull()
    // Nothing in between was ever touched/allocated.
    expect(readTilePixels(engine, 'L', 2, -1)).toBeNull()
  })

  it('a bounded (fixed-canvas) engine paints normally — one resident tile the size of its own canvas (#142)', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 8, 8, 3))
    // Tile-backed like every layer now (#142), just with a tile the size of
    // its own canvas (16x16) rather than TILE_SIZE — a stroke well inside
    // the page still resolves to exactly the one origin-(0,0) tile.
    expect(residentTileCount(engine, 'L')).toBe(1)
    expect(readLayerPixels(engine, 'L')).not.toBeNull()
  })

  it('#142: a bounded-room stroke near the page edge stays clamped to the one visible-page tile — no adjacent tiles spawned for brush overflow', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    // Dab center right at the corner, radius well past every edge — a real
    // pointer can click exactly here (the corner is on-page), but the
    // brush's own radius overhangs off all four sides. Without clamping
    // (_dabsWorldBounds, bounded-only), this would resolve — and lazily
    // create — up to 9 full canvas-sized tiles (the 3x3 grid straddling the
    // corner) just to hold a few overflow pixels that could never become
    // visible again through normal use.
    engine.appendOperation(fillStroke('user-a', 'L', 0, 0, 6))
    expect(residentTileCount(engine, 'L')).toBe(1)
    expect(readTilePixels(engine, 'L', 0, 0, 16, 16)!.some(v => v !== 0)).toBe(true)
  })

  it('an infinite-canvas layer_merge composites tiled sources into a tiled target at matching tile positions', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', TILE_SIZE + 50, 50, 20))
    engine.appendOperation(fillStroke('user-a', 'B', 50, 50, 20))

    engine.appendOperation({
      id: 'merge-1', type: 'layer_merge', userId: 'user-a', timestamp: Date.now(),
      layerId: 'M', name: 'Merged', sources: [{ id: 'B', opacity: 1 }, { id: 'A', opacity: 1 }],
      parentId: null, index: 0,
    })

    expect(residentTileCount(engine, 'M')).toBe(2)
    expect(readTilePixels(engine, 'M', 0, 0)).not.toBeNull()
    expect(readTilePixels(engine, 'M', 1, 0)).not.toBeNull()
  })
})
