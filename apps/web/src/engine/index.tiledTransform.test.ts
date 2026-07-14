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
    // removed from the tile map (eviction/paging is a separate #144 concern,
    // and #155's attempt at dropping provably-empty tiles here was reverted
    // — see _bakeTransform's own comment on why) — so tile count only ever
    // grows here, it's not itself a signal of correctness; what matters is
    // the final pixel content below.
    const dx = TILE_SIZE * 3
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, dx, 0] }]))
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, -dx, 0] }]))

    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), before)
  })

  it('#155: a small in-place nudge whose destination tile is the same as its source tile keeps the content, not just the tile', () => {
    // A tiny nudge keeps tile (0,0) as both a source and (since the dab
    // itself never leaves it) a real destination — exercises the
    // clear()-then-copyTo ordering for a tile that's simultaneously read
    // from and written to within the same bake.
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))
    const before = readTilePixels(engine, 'L', 0, 0)!

    const dx = 5, dy = 5
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, dx, dy] }]))

    const after = readTilePixels(engine, 'L', 0, 0)
    expect(after).not.toBeNull()
    expect(after!.some(v => v !== 0)).toBe(true)
    expect(after).not.toEqual(before) // genuinely moved, not just left alone (or lost)
  })

  it('#155: rotation + scale + translate (a realistic gizmo drag) does not lose content', () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 100, 100, 20))

    const angle = 0.3, s = 1.4, cx = 100, cy = 100, dx = 40, dy = -20
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const a = s * cos, b = s * sin, c = -s * sin, d = s * cos
    const e = cx - (a * cx + c * cy) + dx
    const f = cy - (b * cx + d * cy) + dy
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [a, b, c, d, e, f] }]))

    let found = false
    for (let tx = -3; tx <= 3; tx++) {
      for (let ty = -3; ty <= 3; ty++) {
        const px = readTilePixels(engine, 'L', tx, ty)
        if (px && px.some(v => v !== 0)) found = true
      }
    }
    expect(found).toBe(true)
  })

  it('#155: 11 repeated non-tile-aligned drags in a row (live-browser data-loss repro) never lose content', () => {
    // Regression for a real eviction/read race in _bakeTransform: a source
    // tile's own full tileW x tileH extent (not just its painted content) is
    // what resolveForPaint resolves destinations from, so a non-tile-aligned
    // drag always spills into a few adjacent tiles beyond the real content —
    // repeating that spillover across many drags in a row (this exact
    // 11-drag sequence, captured verbatim from a live room that lost all its
    // content mid-session) grows resident tile count fast enough to cross
    // TiledLayerBuffer's own eviction budget partway through a single bake.
    // Without suspendEviction/resumeEviction around the whole bake (see
    // _bakeTransform), resolveForPaint's own evictIfOverBudget could destroy
    // a tile still captured in `sourceTiles` moments before the blit loop
    // reads its texture — a real WebGL "attempt to use a deleted object"
    // that fails silently (wrong/missing pixels, no thrown exception) rather
    // than loudly, which is exactly what made this so easy to ship unnoticed.
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', -97, -23.75, 5.2))

    const matrices: Array<[number, number, number, number, number, number]> = [
      [1, 0, 0, 1, -444.0000343322754, 27.00000762939453],
      [1, 0, 0, 1, 561.9999885559082, -37.00000762939453],
      [1, 0, 0, 1, -276.9999694824219, -131.0000228881836],
      [1, 0, 0, 1, 293.0000305175781, 421.0000228881836],
      [1, 0, 0, 1, -271.0000228881836, -452.0000076293945],
      [1, 0, 0, 1, -441.0000228881836, 402.0000076293945],
      [1, 0, 0, 1, 387.9999923706055, -56.99996948242188],
      [1, 0, 0, 1, 236.9999885559082, -170],
      [1, 0, 0, 1, 302.0000457763672, -157.0000267028809],
      [1, 0, 0, 1, 519.0000152587891, 55],
      [1, 0, 0, 1, 285.0000381469727, 415],
    ]
    let cx = -97, cy = -23.75
    for (const [i, m] of matrices.entries()) {
      engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: m }]))
      cx += m[4]; cy += m[5]
      const { tileX, tileY } = { tileX: Math.floor(cx / TILE_SIZE), tileY: Math.floor(cy / TILE_SIZE) }
      let found = false
      for (let tx = tileX - 1; tx <= tileX + 1; tx++) {
        for (let ty = tileY - 1; ty <= tileY + 1; ty++) {
          const px = readTilePixels(engine, 'L', tx, ty)
          if (px && px.some(v => v !== 0)) found = true
        }
      }
      expect(found, `content lost after transform #${i + 1} (seq ${i + 4})`).toBe(true)
    }
  }, 120000)

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
