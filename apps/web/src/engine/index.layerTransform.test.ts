// Engine-level integration tests for #120: layer_transform (translate/scale/
// rotate baked into a layer's own buffer). Two things specifically worth
// nailing down with a *real* PencilEngine (via MockGL — see testing/mockGL.ts),
// not just type-checking the shared shape:
//
//   1. The transform actually moves pixels where the matrix says it should —
//      verified against an independent reference painted directly at the
//      expected position, the same "ground truth" pattern
//      index.structuralUndo.test.ts already uses for merge/undo.
//   2. One operation transforming several layers undoes/redoes them all
//      together as a single atomic step (the whole point of #120's "one
//      operation for the group, not a group of operations" design) — not as
//      independent per-layer undo steps.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerTransform, readLayerPixels,
} from './testing/engineTestUtils'

describe('layer_transform: bakes an affine transform into layer content', () => {
  it('translates a layer\'s content by an exact pixel offset, matching a reference painted directly at the shifted position', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))

    // Pure integer translate — the mock's nearest-neighbor resample lands
    // exactly on source pixel centers for an integer offset (no bilinear
    // ambiguity to account for), so this should match a reference painted
    // directly at (12, 4) byte-for-byte.
    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }]))

    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'L'))
    refEngine.appendOperation(fillStroke('user-a', 'L', 12, 4, 3))

    expectPixelsEqual(readLayerPixels(engine, 'L'), readLayerPixels(refEngine, 'L'))
  })

  it('undo restores the pre-transform content exactly', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'L'))
    engine.appendOperation(fillStroke('user-a', 'L', 4, 4, 3))
    const before = readLayerPixels(engine, 'L')!

    engine.appendOperation(makeLayerTransform('user-a', [{ layerId: 'L', matrix: [1, 0, 0, 1, 8, 0] }]))
    expect(readLayerPixels(engine, 'L')).not.toEqual(before)

    expect(engine.undo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'L'), before)
  })
})

describe('layer_transform: multi-layer atomicity (#120)', () => {
  it('one operation transforming two layers undoes/redoes both together, not independently', () => {
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.appendOperation(makeLayerAdd('user-a', 'B'))
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3))
    engine.appendOperation(fillStroke('user-a', 'B', 4, 4, 3))
    const beforeA = readLayerPixels(engine, 'A')!
    const beforeB = readLayerPixels(engine, 'B')!

    engine.appendOperation(makeLayerTransform('user-a', [
      { layerId: 'A', matrix: [1, 0, 0, 1, 8, 0] }, // A moves right
      { layerId: 'B', matrix: [1, 0, 0, 1, 0, 8] }, // B moves down
    ]))

    const { engine: refA } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refA.appendOperation(makeLayerAdd('user-a', 'A'))
    refA.appendOperation(fillStroke('user-a', 'A', 12, 4, 3))
    expectPixelsEqual(readLayerPixels(engine, 'A'), readLayerPixels(refA, 'A'))

    const { engine: refB } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
    refB.appendOperation(makeLayerAdd('user-a', 'B'))
    refB.appendOperation(fillStroke('user-a', 'B', 4, 12, 3))
    expectPixelsEqual(readLayerPixels(engine, 'B'), readLayerPixels(refB, 'B'))

    // A single undo() call must revert BOTH layers in one step — if this
    // only reverted one of them, the log would have split what should be
    // one transaction into two, exactly the bug #120's design (one op for
    // the whole group) was chosen to rule out.
    expect(engine.undo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'A'), beforeA)
    expectPixelsEqual(readLayerPixels(engine, 'B'), beforeB)

    expect(engine.redo()?.type).toBe('layer_transform')
    expectPixelsEqual(readLayerPixels(engine, 'A'), readLayerPixels(refA, 'A'))
    expectPixelsEqual(readLayerPixels(engine, 'B'), readLayerPixels(refB, 'B'))
  })
})
