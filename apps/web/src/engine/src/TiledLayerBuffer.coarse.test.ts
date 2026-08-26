// (#365) The reduced-resolution pyramid — one buffer per F x F block of
// fine tiles at each level F, so a view zoomed far enough out costs one draw
// call per block instead of F² of them.
//
// The interesting property is not "a coarse tile exists" but *when* fine
// content gets folded into it. Fold too early (before the caller has written)
// and the coarse level is permanently one operation stale; fold too late
// (after the fine tile has been evicted) and the write is lost outright, and
// neither failure is visible until someone zooms out. So most of this file is
// about ordering.
import { describe, expect, it } from 'vitest'

import { MockGL } from '../testing/mockGL'
import { TiledLayerBuffer, type TileDownsampler, type TileRebuilder } from './TiledLayerBuffer'
import { COARSE_FACTORS } from './tileMath'

function gl(): WebGLRenderingContext { return new MockGL() as unknown as WebGLRenderingContext }

const TILE_W = 8
const TILE_H = 8
const TILE_BYTES = TILE_W * TILE_H * 4
// Exercised against the coarsest level; the finer ones fold by the same code
// with a different factor, and which level the composite picks is engine-level
// behaviour covered in index.tiledMipmaps.test.ts.
const FACTOR = COARSE_FACTORS[COARSE_FACTORS.length - 1]
const COARSE_WORLD = TILE_W * FACTOR

function recordingDownsampler() {
  const folds: Array<{ x: number; y: number; w: number; h: number }> = []
  const downsample: TileDownsampler = (_src, _dst, x, y, w, h) => { folds.push({ x, y, w, h }) }
  return { downsample, folds }
}

function rebuilder(): TileRebuilder {
  return () => ({ readPixels: () => new Uint8Array(TILE_BYTES).fill(7), destroy: () => {} })
}

function paintFineTile(buf: TiledLayerBuffer, tileX: number): void {
  buf.resolveForPaint({ minX: tileX * TILE_W, minY: 0, maxX: tileX * TILE_W + 1, maxY: 1 })
}

const wholeWorld = { minX: -COARSE_WORLD * 2, minY: -COARSE_WORLD * 2, maxX: COARSE_WORLD * 2, maxY: COARSE_WORLD * 2 }

describe('TiledLayerBuffer coarse level (#365)', () => {
  it('has none at all without a downsampler, and says so distinguishably', () => {
    // Null rather than [] is the contract: bounded rooms and scratch buffers
    // need the composite to fall back to fine tiles, not to conclude the
    // layer is empty and draw nothing.
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H)
    paintFineTile(buf, 0)
    expect(buf.resolveCoarse(wholeWorld, FACTOR)).toBeNull()
  })

  it('folds a painted tile into a coarse tile, and reports it at its world extent', () => {
    const { downsample } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)

    const targets = buf.resolveCoarse(wholeWorld, FACTOR)!
    expect(targets).toHaveLength(1)
    expect(targets[0].originX).toBe(0)
    expect(targets[0].originY).toBe(0)
    // A coarse tile's buffer is fine-tile-sized but stands for COARSE_FACTOR
    // times that much world — the composite has to place it by the latter.
    expect(buf.coarseWorldSize(FACTOR)).toEqual({ w: COARSE_WORLD, h: COARSE_WORLD })
  })

  it('does not fold a tile before its caller has written to it', () => {
    // resolveForPaint hands back a target the caller is about to paint into.
    // Folding at that moment would bank the pre-paint content and clear the
    // mark, leaving the coarse level permanently one operation behind.
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    expect(folds).toHaveLength(0)

    // (#367) One fold, not one per level: only the level actually being
    // drawn catches up. The others stay owed until something asks for them.
    buf.resolveCoarse(wholeWorld, FACTOR)
    expect(folds).toHaveLength(1)
  })

  it('folds only once for a tile that has not changed since', () => {
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    for (let frame = 0; frame < 5; frame++) buf.resolveCoarse(wholeWorld, FACTOR)
    expect(folds).toHaveLength(1)
  })

  it('folds again after the tile is painted again', () => {
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    buf.resolveCoarse(wholeWorld, FACTOR)
    paintFineTile(buf, 0)
    buf.resolveCoarse(wholeWorld, FACTOR)
    expect(folds).toHaveLength(2)
  })

  it('folds a tile before eviction can destroy it', () => {
    // The ordering that would otherwise lose content silently: paint a tile,
    // then paint enough others to push it out of the budget before anything
    // has asked for the coarse level. Its contribution must already be in.
    const { downsample, folds } = recordingDownsampler()
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuilder(), TILE_BYTES * cap, downsample)
    for (let i = 0; i < cap + 4; i++) paintFineTile(buf, i)

    expect(buf.evictedTileCount).toBeGreaterThan(0)
    // (#367) Only the tiles actually evicted were folded — the ones still
    // resident keep owing until a level is drawn. What must not happen is a
    // tile being destroyed while it still owes.
    expect(folds.length).toBeGreaterThanOrEqual(buf.evictedTileCount)
  })

  it('places each fine tile in its own slot, including negative coordinates', () => {
    // Floor division, not truncation: tiles -1 and 0 belong to different
    // coarse tiles, and -1 must land in the *last* slot of the one to the
    // left rather than at a negative offset.
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    buf.resolveForPaint({ minX: -TILE_W, minY: 0, maxX: -TILE_W + 1, maxY: 1 })
    buf.resolveCoarse(wholeWorld, FACTOR)

    // Tile -1 must land in the *last* column of the level tile to its left —
    // the case truncating division would fold onto tile 0 instead.
    const slot = TILE_W / FACTOR
    expect(folds).toEqual([{ x: (FACTOR - 1) * slot, y: 0, w: slot, h: slot }])
  })

  it('separates content either side of the coarse boundary', () => {
    const { downsample } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    buf.resolveForPaint({ minX: -TILE_W, minY: 0, maxX: -TILE_W + 1, maxY: 1 })

    const targets = buf.resolveCoarse(wholeWorld, FACTOR)!
    expect(targets.map(t => t.originX).sort((a, b) => a - b)).toEqual([-COARSE_WORLD, 0])
  })

  it('folds nothing at all while no level is being drawn (#367)', () => {
    // The regression this issue is about: painting used to fold into every
    // level on every write, which put a mip-chain rebuild and three quad
    // draws per touched tile into every frame of every stroke — at any zoom,
    // including the 100% where no level is read.
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    for (let frame = 0; frame < 20; frame++) paintFineTile(buf, frame % 3)
    expect(folds).toHaveLength(0)
  })

  it('catches a level up only when that level is asked for (#367)', () => {
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)

    buf.resolveCoarse(wholeWorld, COARSE_FACTORS[0])
    expect(folds).toHaveLength(1)

    // A different level still owes the same tile, and pays when reached —
    // which is what keeps the levels correct despite the lazy fold.
    buf.resolveCoarse(wholeWorld, COARSE_FACTORS[1])
    expect(folds).toHaveLength(2)
  })

  it('settles a tile with every level before evicting it, not just the drawn one (#367)', () => {
    // Deferring is only safe while the tile is still around to fold. Once its
    // texture is destroyed the debt can never be paid, so eviction is the one
    // place that cannot be lazy.
    const { downsample, folds } = recordingDownsampler()
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuilder(), TILE_BYTES * cap, downsample)
    for (let i = 0; i < cap + 4; i++) paintFineTile(buf, i)

    expect(buf.evictedTileCount).toBeGreaterThan(0)
    // Each evicted tile paid every level on its way out.
    expect(folds.length).toBeGreaterThanOrEqual(buf.evictedTileCount * COARSE_FACTORS.length)
  })

  it('folds a tile written through resolveExistingForPaint (#503)', () => {
    // `area_clear` erases inside whatever tiles already exist and must not
    // create any, so it cannot go through resolveForPaint — and going through
    // resolveVisible, which is the read resolver, left the erase out of every
    // level. The layer then kept showing the erased content at low zoom and
    // dropped it only on zooming in.
    const { downsample, folds } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    buf.resolveCoarse(wholeWorld, FACTOR)
    expect(folds).toHaveLength(1)

    const targets = buf.resolveExistingForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    expect(targets).toHaveLength(1)
    buf.resolveCoarse(wholeWorld, FACTOR)
    expect(folds).toHaveLength(2)
  })

  it('creates nothing for a region resolveExistingForPaint finds empty (#503)', () => {
    // The half of resolveVisible worth keeping: an erase over untouched
    // ground must not leave permanently blank tiles behind it.
    const { downsample } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    expect(buf.resolveExistingForPaint({ minX: 0, minY: 0, maxX: 1, maxY: 1 })).toHaveLength(0)
    expect(buf.allResident()).toHaveLength(0)
  })

  it('re-owes every level for a tile recovered from eviction (#503)', () => {
    // A recovered tile is rebuilt by replaying the log, not by copying back
    // what was folded on the way out — so "it paid its debt before eviction"
    // stops being a statement about the pixels the levels now hold. Cheap to
    // re-owe (one quad draw at the next fold), silently wrong not to.
    const { downsample, folds } = recordingDownsampler()
    const cap = 8
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, rebuilder(), TILE_BYTES * cap, downsample)
    for (let i = 0; i < cap + 4; i++) paintFineTile(buf, i)
    expect(buf.evictedTileCount).toBeGreaterThan(0)

    // Counted per level, not in total: an eviction settles a tile's debt to
    // every *other* level on its way out, and those folds would otherwise be
    // read as this level catching up. A level's slot size is what names it.
    const slot = TILE_W / FACTOR
    const foldsHere = (): number => folds.filter(f => f.w === slot).length

    // Settle everything currently owed, so what follows is only the recovery's.
    buf.resolveCoarse(wholeWorld, FACTOR)
    const settled = foldsHere()

    // Tile 0 was painted first, so it is the one the LRU dropped first.
    buf.resolveVisible({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
    buf.resolveCoarse(wholeWorld, FACTOR)
    expect(foldsHere()).toBeGreaterThan(settled)
  })

  it('drops the coarse level on clear(), so a wiped layer cannot keep showing content', () => {
    const { downsample } = recordingDownsampler()
    const buf = new TiledLayerBuffer(gl(), TILE_W, TILE_H, undefined, undefined, downsample)
    paintFineTile(buf, 0)
    expect(buf.resolveCoarse(wholeWorld, FACTOR)).toHaveLength(1)

    buf.clear()
    expect(buf.resolveCoarse(wholeWorld, FACTOR)).toHaveLength(0)
  })
})
