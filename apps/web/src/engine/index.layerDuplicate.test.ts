// Engine-level tests for #449: layer_duplicate against a real PencilEngine
// with actual pixel buffers (via MockGL — see testing/mockGL.ts).
//
// The pure LayerState half lives in lib/layers.test.ts and the server's own
// aliveIds/coverage half in apps/server/src/rooms.test.ts. What only this file
// can check is the part a duplicate shares with a merge and nothing else: the
// copy's pixels have to come out identical to the source's, and they have to
// stay identical when they are *rebuilt* from the log rather than composited
// live — the from-scratch path where a checkpoint bug or a wrong opacity would
// hide silently, exactly as it would for a merge (#101's original argument).
import { describe, expect, it } from 'vitest'

import {
  checkpointCountFor, clearCheckpoints, createTestEngine, expectPixelsEqual,
  fillStroke, hasLayerBuffer, makeLayerAdd, makeLayerDelete, makeLayerDuplicate,
  readLayerPixels,
} from './testing/engineTestUtils'

describe('layer_duplicate: the copy carries the source pixels and the source survives', () => {
  it('produces a byte-identical copy without touching the source', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 6, 6, 4))
    const paintedA = readLayerPixels(engine, 'A')!
    expect(paintedA.some(v => v > 0)).toBe(true)

    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))

    // The whole difference from a merge: the source is still there.
    expect(hasLayerBuffer(engine, 'A')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A'), paintedA)
    expect(hasLayerBuffer(engine, 'A-copy')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A-copy'), paintedA)
  })

  it('leaves the copy independent — painting on one does not reach the other', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    const paintedA = readLayerPixels(engine, 'A')!

    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))
    // A stroke somewhere the source's own dab never reached, so "the source is
    // unchanged" is a real claim about these bytes rather than about an
    // overlap that happens to look the same.
    engine.appendOperation(fillStroke('user-a', 'A-copy', 12, 12, 3))

    expectPixelsEqual(readLayerPixels(engine, 'A'), paintedA)
    expect(readLayerPixels(engine, 'A-copy')).not.toEqual(paintedA)
  })
})

describe('layer_duplicate: rebuild from the log reproduces the live copy', () => {
  it('rebuilds byte-for-byte through _replayDuplicateInto when no checkpoint is available', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 5, 5, 3))
    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))

    const liveCopy = readLayerPixels(engine, 'A-copy')!
    expect(liveCopy.some(v => v > 0)).toBe(true)
    // The live path took its own immediate checkpoint (see _execDuplicateLive)
    // — which is exactly what would otherwise short-circuit the rebuild below
    // and hide the from-scratch replay path entirely.
    expect(checkpointCountFor(engine, 'A-copy')).toBe(1)

    engine.appendOperation(makeLayerDelete('user-a', ['A-copy']))
    expect(hasLayerBuffer(engine, 'A-copy')).toBe(false)

    // Forces the undo below through the from-scratch recursive replay instead
    // of the checkpoint fast path (the real trigger is checkpoint-budget
    // pressure, impractical to reach honestly on a 16x16 canvas).
    clearCheckpoints(engine)

    expect(engine.undo()?.type).toBe('layer_delete')
    expect(hasLayerBuffer(engine, 'A-copy')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A-copy'), liveCopy)
  })

  it('replays the source as it was at the duplicate, not as it is now', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))
    const liveCopy = readLayerPixels(engine, 'A-copy')!

    // The source moves on afterwards. A rebuild of the copy must not pick this
    // up: `layerPixelOps(sourceId, op.seq)` is what keeps the replay anchored
    // to the moment the duplicate happened.
    engine.appendOperation(fillStroke('user-a', 'A', 12, 12, 3))

    engine.appendOperation(makeLayerDelete('user-a', ['A-copy']))
    clearCheckpoints(engine)
    expect(engine.undo()?.type).toBe('layer_delete')

    expectPixelsEqual(readLayerPixels(engine, 'A-copy'), liveCopy)
  })

  it('duplicates a duplicate — the recursive case, rebuilt without checkpoints', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    engine.appendOperation(makeLayerDuplicate('user-a', 'C1', 'A'))
    engine.appendOperation(fillStroke('user-a', 'C1', 11, 4, 3))
    engine.appendOperation(makeLayerDuplicate('user-a', 'C2', 'C1'))

    const liveC2 = readLayerPixels(engine, 'C2')!
    expect(liveC2.some(v => v > 0)).toBe(true)

    engine.appendOperation(makeLayerDelete('user-a', ['C2']))
    clearCheckpoints(engine)
    expect(engine.undo()?.type).toBe('layer_delete')

    expectPixelsEqual(readLayerPixels(engine, 'C2'), liveC2)
  })
})

describe('layer_duplicate: undo/redo buffer lifecycle', () => {
  it('destroys only the copy on undo and recreates it with its pixels on redo', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 6, 6, 4))
    const paintedA = readLayerPixels(engine, 'A')!

    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))
    const copyPixels = readLayerPixels(engine, 'A-copy')!

    expect(engine.undo()?.type).toBe('layer_duplicate')
    expect(hasLayerBuffer(engine, 'A-copy')).toBe(false)
    // Undoing a duplicate must not disturb what it copied from — this is the
    // asymmetry with a merge, whose undo has to resurrect its sources.
    expect(hasLayerBuffer(engine, 'A')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A'), paintedA)

    expect(engine.redo()?.type).toBe('layer_duplicate')
    expect(hasLayerBuffer(engine, 'A-copy')).toBe(true)
    expectPixelsEqual(readLayerPixels(engine, 'A-copy'), copyPixels)
    expectPixelsEqual(readLayerPixels(engine, 'A'), paintedA)
  })

  it('flags the undo as structural so #263\'s confirm can gate it, and the redo as harmless', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 6, 6, 4))
    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A'))

    // Undo would remove the copy, which carries content (its own copied
    // pixels), so it is reported — same treatment as layer_add.
    expect(engine.peekUndo()).toEqual({ layerId: 'A-copy', hasOtherContent: true })

    expect(engine.undo()?.type).toBe('layer_duplicate')
    // Redo only ever re-creates, so it must not warn — getting this backwards
    // is precisely what _peekStructuralTarget's doc comment warns about.
    expect(engine.peekRedo()).toBeNull()
  })
})

describe('layer_duplicate: opacity belongs to the copy, never to its pixels', () => {
  it('does not bake the source opacity into the copied pixels', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })

    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(fillStroke('user-a', 'A', 6, 6, 4))
    const paintedA = readLayerPixels(engine, 'A')!

    // A half-transparent source. The copy's *layer* opacity becomes 0.5 (that
    // is applyContentOp's job, covered in lib/layers.test.ts) — its pixels must
    // stay exactly what the source's are, or a copy of a 50% layer would
    // display at 25%.
    engine.appendOperation(makeLayerDuplicate('user-a', 'A-copy', 'A', { sourceOpacity: 0.5 }))

    expectPixelsEqual(readLayerPixels(engine, 'A-copy'), paintedA)
  })
})
