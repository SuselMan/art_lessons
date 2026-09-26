import { describe, expect, it } from 'vitest'

import type { Operation } from '@grafetto/shared'

import { groupEndsInBatch, undoneInBatch } from './undoneInBatch'

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

describe('groupEndsInBatch (#536 §17.50)', () => {
  const wc = (id: string, strokeId: string, washId?: string): Operation =>
    ({ ...(stroke(id, strokeId) as object), ...(washId ? { washId } : {}) }) as Operation
  it('marks the last operation of every wash, and of every gesture without one', () => {
    const ops = [wc('a1', 'g1', 'w1'), wc('b1', 'g2', 'w2'), wc('a2', 'g3', 'w1'), wc('c1', 'g4'), wc('c2', 'g4')]
    expect([...groupEndsInBatch(ops, new Set())].sort()).toEqual(['a2', 'b1', 'c2'])
  })
  it('does not count a stroke the batch leaves undone', () => {
    const ops = [wc('a1', 'g1', 'w1'), wc('a2', 'g2', 'w1')]
    expect([...groupEndsInBatch(ops, new Set(['a2']))]).toEqual(['a1'])
  })
})
