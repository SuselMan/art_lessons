import { describe, expect, it } from 'vitest'

import type { Operation } from '@grafetto/shared'

import { undoneInBatch } from './undoneInBatch'

const stroke = (id: string, strokeId: string, userId = 'u'): Operation =>
  ({ id, type: 'stroke', userId, timestamp: 0, layerId: 'L', tool: 'watercolor', preset: 'p', color: [0, 0, 0], dabs: [], strokeId }) as unknown as Operation
const undo = (id: string, targetOpId: string): Operation => ({ id, type: 'operation_undo', userId: 'u', timestamp: 0, targetOpId }) as Operation
const redo = (id: string, targetOpId: string): Operation => ({ id, type: 'operation_redo', userId: 'u', timestamp: 0, targetOpId }) as Operation

describe('undoneInBatch (#536 §17.49)', () => {
  it('takes every chunk of the undone gesture, and nothing else', () => {
    const ops = [stroke('a', 'g1'), stroke('b1', 'g2'), stroke('b2', 'g2'), undo('u1', 'b2'), stroke('c', 'g3')]
    expect([...undoneInBatch(ops)].sort()).toEqual(['b1', 'b2'])
  })

  it('leaves out what the batch redoes afterwards', () => {
    const ops = [stroke('a', 'g1'), undo('u1', 'a'), redo('r1', 'a')]
    expect(undoneInBatch(ops).size).toBe(0)
  })

  it('ignores an undo whose target is not in the batch', () => {
    expect(undoneInBatch([undo('u1', 'older')]).size).toBe(0)
  })

  it('does not take another author\'s chunks that share a strokeId', () => {
    const ops = [stroke('a', 'g1', 'u'), stroke('x', 'g1', 'v'), undo('u1', 'a')]
    expect([...undoneInBatch(ops)]).toEqual(['a'])
  })
})
