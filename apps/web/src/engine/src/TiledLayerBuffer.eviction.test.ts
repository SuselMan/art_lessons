// #144: unit-level coverage for TiledLayerBuffer's own byte-budget eviction
// mechanics (LRU ordering, batch recovery via rebuildTile, suspend/resume),
// using a small in-memory fake TileRebuilder instead of a whole PencilEngine
// + Operation Log round-trip — that end-to-end integration (real replay via
// _makeTileRebuilder, undo/redo, checkpoints) is covered separately at the
// engine level in index.tiledEviction.test.ts. This file only ever asserts
// on TiledLayerBuffer's own public surface (tileCount/evictedTileCount/
// resolveForPaint/resolveVisible/allResident/suspendEviction/resumeEviction).
//
// Tiny tiles (8x8) plus the constructor's test-only budgetBytes override
// (see TiledLayerBuffer's own doc comment on that param) get a small,
// reachable resident-tile cap without allocating dozens of real
// multi-megabyte tiles per test.
import { describe, expect, it } from 'vitest'

import { MockGL } from '../testing/mockGL'
import { TiledLayerBuffer, type TileRebuilder } from './TiledLayerBuffer'

function gl(): WebGLRenderingContext { return new MockGL() as unknown as WebGLRenderingContext }

const TILE_W = 8
const TILE_H = 8
const TILE_BYTES = TILE_W * TILE_H * 4 // 256

function rectKey(tileX: number, tileY: number): string { return `${tileX * TILE_W},${tileY * TILE_H}` }

/** Fills a whole RGBA8 tile with one repeated byte value — MockGL only ever
 *  tracks a single per-texel scalar (see its own module docstring: "R ===
 *  G === B === A always"), so this is a valid, round-trippable "paint tag" a
 *  test can use to tell distinct tiles' content apart after eviction. */
function tag(value: number): Uint8Array {
  const px = new Uint8Array(TILE_BYTES)
  px.fill(value)
  return px
}

/** Stands in for engine/index.ts's real _makeTileRebuilder: instead of a
 *  genuine Operation Log replay, hands back whatever a test has recorded in
 *  `content` for a given tile rect — enough to prove TiledLayerBuffer's own
 *  eviction/recovery bookkeeping (which tile, when, how many rebuildTile()
 *  calls) is correct, independent of how recovery is actually implemented. */
function makeFakeRebuilder(content: Map<string, Uint8Array>): { rebuildTile: TileRebuilder; callCount: { value: number } } {
  const callCount = { value: 0 }
  const rebuildTile: TileRebuilder = () => {
    callCount.value++
    return {
      readPixels: rect => content.get(`${rect.minX},${rect.minY}`) ?? null,
      destroy: () => {},
    }
  }
  return { rebuildTile, callCount }
}

function paintTile(buf: TiledLayerBuffer, tileX: number): void {
  buf.resolveForPaint({ minX: tileX * TILE_W, minY: 0, maxX: tileX * TILE_W + 1, maxY: 1 })
}

describe('TiledLayerBuffer eviction (#144)', () => {
  it('without a rebuildTile callback, never evicts — scratch/temp-buffer behavior is unchanged', () => {
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, TILE_BYTES * 8)
    for (let i = 0; i < 13; i++) paintTile(buf, i)
    expect(buf.tileCount).toBe(13)
    expect(buf.evictedTileCount).toBe(0)
  })

  it('caps resident tile count once a rebuildTile callback is supplied, evicting the rest', () => {
    const { rebuildTile } = makeFakeRebuilder(new Map())
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)
    const total = cap + 5
    for (let i = 0; i < total; i++) paintTile(buf, i)
    expect(buf.tileCount).toBe(cap)
    expect(buf.evictedTileCount).toBe(total - cap)
  })

  it('the resident-tile floor applies regardless of the byte budget for a tiny custom canvas', () => {
    // Deliberately absurd: a byte budget smaller than even one tile. Without
    // a floor this would compute a cap of 0 and evict-then-immediately-
    // rebuild every single tile on every access — exactly the pointless
    // churn a bounded room's one-and-only tile must never suffer (see
    // TiledLayerBuffer's class docstring and MIN_RESIDENT_TILES's own
    // comment). The floor (8) must win instead.
    const { rebuildTile } = makeFakeRebuilder(new Map())
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, 1)
    for (let i = 0; i < 10; i++) paintTile(buf, i)
    expect(buf.tileCount).toBe(8)
    expect(buf.evictedTileCount).toBe(2)
  })

  it('an evicted tile is transparently recovered with correct content on the next resolveForPaint', () => {
    const content = new Map<string, Uint8Array>()
    const { rebuildTile, callCount } = makeFakeRebuilder(content)
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)

    const tile0 = buf.resolveForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })[0]
    tile0.buffer.restorePixels(tag(42))
    content.set(rectKey(0, 0), tag(42))

    // `cap` more distinct tiles push tile 0 (the least recently used) out.
    for (let i = 1; i <= cap; i++) paintTile(buf, i)
    expect(buf.evictedTileCount).toBe(1)

    const recovered = buf.resolveForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })[0]
    expect(recovered.buffer.readPixels()).toEqual(tag(42))
    // Recovering tile 0 pushes resident count back over budget by one, so
    // the trim at the end of this same resolveForPaint call evicts *some*
    // tile — but never tile 0 itself, which this call just made the most
    // recently used. One tile is evicted either way; it's simply tile 1
    // (the next-oldest) instead of tile 0 again.
    expect(buf.evictedTileCount).toBe(1)
    expect(callCount.value).toBe(1)

    // Confirm it's genuinely tile 0 that survived, not a fluke of the count
    // alone: reading it again must not trigger a second rebuildTile() call.
    buf.resolveForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    expect(callCount.value).toBe(1)
  })

  it('resolveVisible recovers an evicted tile too, but still never creates a brand-new one', () => {
    const content = new Map<string, Uint8Array>()
    const { rebuildTile } = makeFakeRebuilder(content)
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)

    buf.resolveForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    content.set(rectKey(0, 0), tag(7))
    for (let i = 1; i <= cap; i++) paintTile(buf, i)
    expect(buf.evictedTileCount).toBe(1)

    const visible = buf.resolveVisible({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    expect(visible).toHaveLength(1)
    expect(visible[0].buffer.readPixels()).toEqual(tag(7))
    // Recovering tile 0 tips resident count back over budget by one, so the
    // trim at the end of this same call evicts the next-oldest tile
    // instead (never tile 0, just made MRU) — still exactly one evicted.
    expect(buf.evictedTileCount).toBe(1)

    // A tile that was genuinely never touched still contributes nothing,
    // eviction/recovery notwithstanding — resolveVisible's original
    // never-creates-a-tile contract is unaffected by #144.
    expect(buf.resolveVisible({ minX: 999 * TILE_W, minY: 0, maxX: 999 * TILE_W + 1, maxY: 1 })).toHaveLength(0)
    expect(buf.tileCount).toBe(cap) // unchanged — no new tile was created
  })

  it('allResident recovers every evicted tile in one rebuildTile() call, not one per tile', () => {
    const content = new Map<string, Uint8Array>()
    const { rebuildTile, callCount } = makeFakeRebuilder(content)
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)

    const total = cap + 3
    for (let i = 0; i < total; i++) {
      // Tag the real buffer too, not just the fake rebuilder's recovery
      // content — a tile that never gets evicted must still show the
      // right pixels when read back below, exactly like one that does.
      const target = buf.resolveForPaint({ minX: i * TILE_W, minY: 0, maxX: i * TILE_W + 1, maxY: 1 })[0]
      target.buffer.restorePixels(tag(i + 1))
      content.set(rectKey(i, 0), tag(i + 1))
    }
    expect(buf.evictedTileCount).toBe(3) // the 3 oldest (0, 1, 2)

    const before = callCount.value
    const all = buf.allResident()
    expect(callCount.value).toBe(before + 1) // one session recovered all 3 at once
    expect(buf.evictedTileCount).toBe(0)
    expect(all).toHaveLength(total) // every tile ever touched, not just what was still resident
    for (let i = 0; i < total; i++) {
      const t = all.find(x => x.originX === i * TILE_W && x.originY === 0)
      expect(t?.buffer.readPixels()).toEqual(tag(i + 1))
    }
  })

  it('recently-touched tiles are protected from eviction (LRU), not simply FIFO by creation order', () => {
    const { rebuildTile } = makeFakeRebuilder(new Map())
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)

    for (let i = 0; i < cap; i++) paintTile(buf, i)
    expect(buf.evictedTileCount).toBe(0) // exactly at cap, nothing evicted yet

    // Touch tile 0 again via a read (resolveVisible, not a repaint) so it's
    // now the most-recently-used, not the least.
    buf.resolveVisible({ minX: 0, minY: 0, maxX: 1, maxY: 1 })

    // One more new tile must evict *some* tile, but tile 0 was just
    // refreshed — it should be tile 1 (the next-oldest untouched one).
    paintTile(buf, cap)
    expect(buf.resolveVisible({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toHaveLength(1) // tile 0 still resident
    expect(buf.evictedTileCount).toBe(1) // tile 1 was evicted instead
  })

  it('suspendEviction defers eviction until resumeEviction, which then sweeps once against the final count', () => {
    const { rebuildTile } = makeFakeRebuilder(new Map())
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)

    buf.suspendEviction()
    const total = cap + 5
    for (let i = 0; i < total; i++) paintTile(buf, i)
    expect(buf.tileCount).toBe(total) // over budget, but suspended
    expect(buf.evictedTileCount).toBe(0)

    buf.resumeEviction()
    expect(buf.tileCount).toBe(cap)
    expect(buf.evictedTileCount).toBe(total - cap)
  })

  it('clear() forgets evicted tiles too, not just resident ones', () => {
    const { rebuildTile } = makeFakeRebuilder(new Map())
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuildTile, TILE_BYTES * cap)
    for (let i = 0; i < cap + 3; i++) paintTile(buf, i)
    expect(buf.evictedTileCount).toBe(3)

    buf.clear()
    expect(buf.tileCount).toBe(0)
    expect(buf.evictedTileCount).toBe(0)
    // A tile key that was evicted before clear() must not be mistaken for
    // still-recoverable content after it — clear() means genuinely empty.
    expect(buf.resolveVisible({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toHaveLength(0)
  })
})
