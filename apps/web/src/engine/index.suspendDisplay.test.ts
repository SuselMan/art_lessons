// Engine-level tests for #147: suspendDisplay()/resumeDisplay() let a caller
// replaying many historical operations in a row (initial room join,
// reconnect — see Room/index.tsx) skip the full composite+paper-blend that
// several appendOperation branches (stroke/layer_clear/layer_delete/
// layer_transform/layer_merge) and undo/redo/revoke's _applyHistoryChange
// would otherwise each trigger individually, deferring to exactly one
// _display() at the end instead.
//
// The risk worth testing: this must be purely a *when* optimization, never a
// *what* one — final pixel content after resumeDisplay() must be identical to
// applying the exact same operations one at a time with no suspension at all,
// for every operation type that calls _display(), not just strokes. Every
// test here sets a real setCompositeOrder (mirroring how index.
// recompositeCache.test.ts verifies the split-cache) so the comparison
// actually exercises real, visible pixel content rather than two empty
// composites trivially matching each other.
import { describe, expect, it } from 'vitest'

import type { CompositeItem } from './index'
import {
  createTestEngine, expectPixelsEqual, fillStroke, makeLayerAdd, makeLayerMerge, makeLayerTransform,
  readCompositePixels,
} from './testing/engineTestUtils'

describe('#147 suspendDisplay/resumeDisplay: batch replay never changes final pixel content', () => {
  it('a batch of layer_add + stroke + layer_transform + undo, applied under suspendDisplay, matches the same ops applied one at a time with no suspension', () => {
    const order: CompositeItem[] = [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }]
    const buildOps = () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
      const addA = makeLayerAdd('user-a', 'A')
      const addB = makeLayerAdd('user-a', 'B')
      const strokeA = fillStroke('user-a', 'A', 4, 4, 3)
      const strokeB = fillStroke('user-a', 'B', 10, 10, 2)
      const transform = makeLayerTransform('user-a', [{ layerId: 'A', matrix: [1, 0, 0, 1, 2, 0] }])
      return { engine, ops: [addA, addB, strokeA, strokeB, transform] }
    }

    const ref = buildOps()
    for (const op of ref.ops) ref.engine.appendOperation(op, 'remote')
    ref.engine.setCompositeOrder(order)
    const undoRef = { id: 'u1', type: 'operation_undo' as const, userId: 'user-a', timestamp: 0, targetOpId: ref.ops[4].id }
    ref.engine.appendOperation(undoRef, 'remote')
    const refPixels = readCompositePixels(ref.engine)
    expect(refPixels.some(v => v > 0)).toBe(true) // sanity: this test actually exercises real content

    const batch = buildOps()
    batch.engine.suspendDisplay()
    for (const op of batch.ops) batch.engine.appendOperation(op, 'remote')
    batch.engine.setCompositeOrder(order)
    const undoBatch = { id: 'u1', type: 'operation_undo' as const, userId: 'user-a', timestamp: 0, targetOpId: batch.ops[4].id }
    batch.engine.appendOperation(undoBatch, 'remote')
    batch.engine.resumeDisplay()
    const batchPixels = readCompositePixels(batch.engine)

    expectPixelsEqual(batchPixels, refPixels)
  })

  it('a batch including layer_clear and layer_merge matches the unsuspended reference too', () => {
    const buildOps = () => {
      const { engine } = createTestEngine({ userId: 'user-a' }, { width: 16, height: 16 })
      const addA = makeLayerAdd('user-a', 'A')
      const addB = makeLayerAdd('user-a', 'B')
      const strokeA = fillStroke('user-a', 'A', 4, 4, 3)
      const strokeB = fillStroke('user-a', 'B', 10, 10, 2)
      const clearB = { id: 'c1', type: 'layer_clear' as const, userId: 'user-a', timestamp: 0, layerId: 'B' }
      const strokeB2 = fillStroke('user-a', 'B', 6, 6, 2)
      const merge = makeLayerMerge('user-a', 'AB', [{ id: 'A', opacity: 1 }, { id: 'B', opacity: 1 }])
      return { engine, ops: [addA, addB, strokeA, strokeB, clearB, strokeB2, merge] }
    }
    const order: CompositeItem[] = [{ id: 'AB', opacity: 1 }]

    const ref = buildOps()
    for (const op of ref.ops) ref.engine.appendOperation(op, 'remote')
    ref.engine.setCompositeOrder(order)
    const refPixels = readCompositePixels(ref.engine)
    expect(refPixels.some(v => v > 0)).toBe(true)

    const batch = buildOps()
    batch.engine.suspendDisplay()
    for (const op of batch.ops) batch.engine.appendOperation(op, 'remote')
    batch.engine.setCompositeOrder(order)
    batch.engine.resumeDisplay()
    const batchPixels = readCompositePixels(batch.engine)

    expectPixelsEqual(batchPixels, refPixels)
  })

  it('nested suspendDisplay calls only resume once the matching number of resumeDisplay calls land', () => {
    const order: CompositeItem[] = [{ id: 'A', opacity: 1 }]
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.setCompositeOrder(order)

    engine.suspendDisplay()
    engine.suspendDisplay()
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3), 'remote')
    engine.resumeDisplay() // still suspended (outer call not yet resumed)
    engine.resumeDisplay() // now settles
    const settled = readCompositePixels(engine)

    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'A'))
    refEngine.setCompositeOrder(order)
    refEngine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3), 'remote')
    const refPixels = readCompositePixels(refEngine)

    expect(refPixels.some(v => v > 0)).toBe(true)
    expectPixelsEqual(settled, refPixels)
  })

  it('resumeDisplay without a prior suspendDisplay is a harmless no-op (depth never goes negative), and a real suspend/resume afterward still works', () => {
    const order: CompositeItem[] = [{ id: 'A', opacity: 1 }]
    const { engine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('user-a', 'A'))
    engine.setCompositeOrder(order)
    expect(() => engine.resumeDisplay()).not.toThrow()

    engine.suspendDisplay()
    engine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3), 'remote')
    engine.resumeDisplay()

    const { engine: refEngine } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
    refEngine.appendOperation(makeLayerAdd('user-a', 'A'))
    refEngine.setCompositeOrder(order)
    refEngine.appendOperation(fillStroke('user-a', 'A', 4, 4, 3), 'remote')

    const pixels = readCompositePixels(engine)
    expect(pixels.some(v => v > 0)).toBe(true)
    expectPixelsEqual(pixels, readCompositePixels(refEngine))
  })
})
