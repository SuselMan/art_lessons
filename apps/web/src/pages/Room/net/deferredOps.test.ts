import { describe, expect, it } from 'vitest'

import type { LayerAddOperation, Operation, OperationUndoOperation } from '@grafetto/shared'

import { drainDeferredOps } from './deferredOps'

function undo(id: string, targetOpId: string): OperationUndoOperation {
  return { id, type: 'operation_undo', userId: 'peer', timestamp: 0, targetOpId }
}

function layerAdd(id: string): LayerAddOperation {
  return { id, type: 'layer_add', userId: 'peer', timestamp: 0, layerId: `L-${id}`, name: 'Layer' }
}

describe('drainDeferredOps', () => {
  it('applies the ops whose target is now known, in arrival order, and keeps the rest', () => {
    const known = new Set(['a', 'c'])
    const applied: string[] = []
    const { stillDeferred, appliedAny } = drainDeferredOps(
      [undo('u1', 'c'), undo('u2', 'b'), undo('u3', 'a')],
      id => known.has(id),
      op => applied.push(op.id),
    )
    expect(applied).toEqual(['u1', 'u3'])
    expect(stillDeferred.map(op => op.id)).toEqual(['u2'])
    expect(appliedAny).toBe(true)
  })

  it('sees what an earlier entry of the same pass just made known', () => {
    const known = new Set(['a'])
    const { stillDeferred } = drainDeferredOps(
      [undo('u1', 'a'), undo('u2', 'u1')],
      id => known.has(id),
      op => known.add(op.id),
    )
    expect(stillDeferred).toEqual([])
  })

  it('never releases an operation that has no target', () => {
    const queue: Operation[] = [layerAdd('x')]
    const { stillDeferred, appliedAny } = drainDeferredOps(queue, () => true, () => {})
    expect(stillDeferred).toEqual(queue)
    expect(appliedAny).toBe(false)
  })
})
