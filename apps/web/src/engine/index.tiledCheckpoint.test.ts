// Engine-level integration tests for infinite-canvas (tiled) undo
// checkpointing (#137) — before this, TiledLayerBuffer layers never took a
// checkpoint at all (_maybeCheckpoint/_takeCheckpoint were bounded-only) and
// always did a full from-scratch op-log replay on every undo/redo/rebuild.
// This mirrors index.structuralUndo.test.ts's bounded-mode checkpoint-
// boundary test, but with a tile-straddling stroke position so a checkpoint
// spans two tiles, plus a case specific to tiled mode: a tile that doesn't
// exist yet at checkpoint time.
import { describe, expect, it } from 'vitest'

import {
  checkpointCountFor, createTestEngine, dab, expectPixelsClose, expectPixelsEqual, fillStroke,
  makeLayerAdd, makeStroke, readTilePixels, residentTileCount,
} from './testing/engineTestUtils'
import { TILE_SIZE } from './src/tileMath'

const CHECKPOINT_INTERVAL = 20

describe('infinite canvas: tile-aware undo checkpointing (#137)', () => {
  it('an infinite-canvas layer now takes checkpoints too, unlike before when it never did', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    const strokeAt = (): ReturnType<typeof makeStroke> =>
      makeStroke('user-a', 'L', [dab(50, 50, { size: 6, pressure: 1, opacity: 0.2 })])

    for (let i = 0; i < CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeAt())
    // Checkpointing is deferred off the stroke-completion path (#121) — flush
    // the pending macrotask so the checkpoint actually bakes.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(checkpointCountFor(engine, 'L')).toBe(1)
  })

  it('undoing below a checkpoint boundary forces full replay, redoing past it reuses the checkpoint — same as bounded mode, but across two tiles', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))

    // Centered on the tile(0,0)/tile(1,0) boundary so every stroke touches
    // both tiles — the checkpoint this test depends on must snapshot both.
    const strokeAt = (): ReturnType<typeof makeStroke> =>
      makeStroke('user-a', 'L', [dab(TILE_SIZE, 500, { size: 60, pressure: 1, opacity: 0.2 })])

    const totalStrokes = CHECKPOINT_INTERVAL + 5 // 25: crosses one checkpoint boundary
    for (let i = 0; i < CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeAt())
    await new Promise(resolve => setTimeout(resolve, 0))
    for (let i = 0; i < totalStrokes - CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeAt())

    expect(checkpointCountFor(engine, 'L')).toBe(1)
    expect(residentTileCount(engine, 'L')).toBe(2)
    const leftAt25 = readTilePixels(engine, 'L', 0, 0)!
    const rightAt25 = readTilePixels(engine, 'L', 1, 0)!

    // Independent ground truth: a fresh engine painting only the first 15
    // strokes, no checkpoint involved at all (15 < CHECKPOINT_INTERVAL).
    const { engine: refEngine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    for (let i = 0; i < totalStrokes - 10; i++) refEngine.appendOperation(strokeAt())
    const leftRef15 = readTilePixels(refEngine, 'L', 0, 0)
    const rightRef15 = readTilePixels(refEngine, 'L', 1, 0)

    // Undo 10 strokes (25 -> 15), crossing back below the op #20 checkpoint —
    // it must be rejected outright (opIds.length 20 > done-ops length 15),
    // falling back to a full from-scratch replay of both tiles.
    for (let i = 0; i < 10; i++) expect(engine.undo()?.type).toBe('stroke')
    expectPixelsEqual(readTilePixels(engine, 'L', 0, 0), leftRef15)
    expectPixelsEqual(readTilePixels(engine, 'L', 1, 0), rightRef15)
    expect(checkpointCountFor(engine, 'L')).toBe(1) // untouched, not evicted

    // Redo all 10 back — done-prefix reaches the checkpoint's 20 op ids
    // again, so it must revalidate and be reused for the last 5 redos.
    for (let i = 0; i < 10; i++) expect(engine.redo()?.type).toBe('stroke')
    // One 8-bit quantize/dequantize round-trip at the checkpoint boundary —
    // inherent to any 8-bit-texture-backed snapshot, not a bug (see the
    // bounded-mode version of this test for the same tolerance rationale).
    expectPixelsClose(readTilePixels(engine, 'L', 0, 0), leftAt25, 2)
    expectPixelsClose(readTilePixels(engine, 'L', 1, 0), rightAt25, 2)
    expect(checkpointCountFor(engine, 'L')).toBe(1)
  })

  it('a tile that only starts existing after a checkpoint is still correctly recreated when later replay restores through that checkpoint', async () => {
    const { engine } = createTestEngine({ userId: 'user-a', infinite: true }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    const strokeNear = (): ReturnType<typeof makeStroke> =>
      makeStroke('user-a', 'L', [dab(50, 50, { size: 6, pressure: 1, opacity: 0.2 })])

    for (let i = 0; i < CHECKPOINT_INTERVAL; i++) engine.appendOperation(strokeNear())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(checkpointCountFor(engine, 'L')).toBe(1)
    expect(residentTileCount(engine, 'L')).toBe(1) // only tile(0,0) — the checkpoint only ever saw this one

    // A stroke far away creates a brand-new tile the checkpoint above never
    // recorded (see _takeCheckpoint's docstring: not retroactively added).
    engine.appendOperation(fillStroke('user-a', 'L', TILE_SIZE * 5 + 10, 10, 5))
    expect(residentTileCount(engine, 'L')).toBe(2)
    const farTileBefore = readTilePixels(engine, 'L', 5, 0)!

    // Force a full rebuild through _rebuildLayer -> _replayInto (same path
    // undo/redo/reconnect use): must restore tile(0,0) from the checkpoint
    // and still correctly recreate tile(5,0) from the one post-checkpoint op
    // that painted it, rather than losing it or erroring.
    engine.undo()
    engine.redo()
    expect(residentTileCount(engine, 'L')).toBe(2)
    expectPixelsEqual(readTilePixels(engine, 'L', 5, 0), farTileBefore)
  })
})
