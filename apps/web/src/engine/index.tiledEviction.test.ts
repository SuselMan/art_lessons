// Engine-level integration tests for infinite-canvas tile eviction (#144) —
// before this, TiledLayerBuffer never evicted a resident tile once created
// (see its own pre-#144 docstring), so a room's GPU memory grew unboundedly
// with the number of distinct tiles its layers had ever touched. This
// exercises the real, end-to-end path: PencilEngine's own _makeTileRebuilder
// (engine/index.ts), which recovers an evicted tile by replaying that
// layer's pixel ops (via the exact same _replayInto/_bestCheckpoint
// machinery undo/redo/reconnect already use) into a scratch TiledLayerBuffer
// and extracting the one tile asked about — not TiledLayerBuffer's own
// eviction/LRU/budget bookkeeping in isolation, which
// src/TiledLayerBuffer.eviction.test.ts already covers with a fake
// rebuilder.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, evictedTileCount, expectPixelsEqual, makeLayerAdd, makeStroke, readTilePixels,
  residentTileCount,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

// Matches TiledLayerBuffer's own unexported budget constants — 128MB byte
// budget / (TILE_SIZE^2 * 4 bytes/texel) = 32 resident tiles for an
// infinite-canvas room (see TiledLayerBuffer.ts's TILE_BUDGET_BYTES/
// MIN_RESIDENT_TILES doc comments). Not imported: same precedent as
// CHECKPOINT_INTERVAL below and in index.tiledCheckpoint.test.ts — a
// deliberately private tuning constant, not something tests should depend on
// directly.
const MAX_RESIDENT_TILES = 32

/** One stroke, positioned in a distinct tile per `i` (tiles are TILE_SIZE
 *  apart on the x axis, y fixed) — same shape every time so any two tiles'
 *  content only differs by *which* tile it landed on, never by the stroke
 *  itself, which is exactly what makes "does tile i still look like tile i
 *  did right after painting it" a meaningful check. */
function strokeForTile(i: number): ReturnType<typeof makeStroke> {
  return makeStroke('user-a', 'L', [dab(i * TILE_SIZE + 50, 50, { size: 20, pressure: 1, opacity: 0.5 })])
}

describe('infinite canvas: byte-budget tile eviction (#144)', () => {
  it('resident tile count stays capped once more distinct tiles than the budget allows have been painted', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    const total = MAX_RESIDENT_TILES + 5
    for (let i = 0; i < total; i++) engine.appendOperation(strokeForTile(i))

    expect(residentTileCount(engine, 'L')).toBe(MAX_RESIDENT_TILES)
    expect(evictedTileCount(engine, 'L')).toBe(total - MAX_RESIDENT_TILES)
  })

  it('an evicted tile is transparently rebuilt with its original content on the next read', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    engine.appendOperation(strokeForTile(0))
    const before = readTilePixels(engine, 'L', 0, 0)!

    // Enough distinct new tiles to push tile 0 (the least recently used)
    // out — none of these overlap tile 0's own world rect.
    for (let i = 1; i <= MAX_RESIDENT_TILES; i++) engine.appendOperation(strokeForTile(i))
    expect(evictedTileCount(engine, 'L')).toBeGreaterThan(0)

    // readTilePixels goes through allResident(), which must transparently
    // recover tile 0 (destroyed GPU texture, replayed back from the
    // Operation Log) rather than return null/blank/stale content.
    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), before)
  })

  it('eviction does not corrupt other tiles — a scattered sample of earlier tiles all still match independent ground truth after eviction', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    const total = MAX_RESIDENT_TILES + 8
    for (let i = 0; i < total; i++) engine.appendOperation(strokeForTile(i))
    expect(evictedTileCount(engine, 'L')).toBeGreaterThan(0)

    // Independent ground truth: for each sampled tile, a fresh engine that
    // only ever painted *that one* stroke — isolated from this test's own
    // eviction/replay machinery entirely, so a passing comparison really
    // does confirm "eviction didn't corrupt this tile's content," not just
    // "this test's own bookkeeping is internally consistent."
    const sampleIndices = [0, 1, 5, Math.floor(total / 2), total - 1]
    for (const i of sampleIndices) {
      const { engine: refEngine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
      refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
      refEngine.appendOperation(strokeForTile(i))
      const reference = readTilePixels(refEngine, 'L', i, 0)
      expectPixelsEqual(readTilePixels(engine, 'L', i, 0), reference)
    }
  })

  it('a bounded room’s single tile is never evicted, even across many strokes (no pointless churn)', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 64, height: 64 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    for (let i = 0; i < 50; i++) {
      engine.appendOperation(makeStroke('user-a', 'L', [dab(32, 32, { size: 10, pressure: 1, opacity: 0.05 })]))
    }
    expect(residentTileCount(engine, 'L')).toBe(1)
    expect(evictedTileCount(engine, 'L')).toBe(0)
  })

  it('undo/redo (a full-layer rebuild) settles back at the same budget without corrupting content', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    const total = MAX_RESIDENT_TILES + 3
    for (let i = 0; i < total; i++) engine.appendOperation(strokeForTile(i))
    expect(evictedTileCount(engine, 'L')).toBeGreaterThan(0)
    const before = readTilePixels(engine, 'L', 0, 0)!

    // _rebuildLayer/_replayInto (undo of the last stroke, then redo) briefly
    // recreates every tile the layer's done history has ever touched —
    // suspendEviction/resumeEviction (see _replayInto) must settle the
    // resident count back at the same budget afterward, not leave it
    // permanently over budget or thrash mid-replay.
    expect(engine.undo()?.type).toBe('stroke')
    expect(engine.redo()?.type).toBe('stroke')

    expect(residentTileCount(engine, 'L')).toBe(MAX_RESIDENT_TILES)
    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), before)
  })
})
