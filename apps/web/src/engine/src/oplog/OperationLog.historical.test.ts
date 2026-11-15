import { describe, expect, it } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'

import { OperationLog } from './OperationLog'

const stroke = (id: string, userId = 'A', strokeId = id): StrokeOperation => ({
  id, type: 'stroke', userId, timestamp: 1, layerId: 'L', strokeId,
  tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [],
})
const control = (id: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke', targetOpId = 'a', userId = 'A'): Operation => ({
  id, type, targetOpId, userId, timestamp: 1,
})
function apply(log: OperationLog, op: Operation) {
  log.append(op)
  if (op.type === 'operation_undo') log.applyUndo(op.targetOpId, op.userId)
  else if (op.type === 'operation_redo') log.applyRedo(op.targetOpId, op.userId)
  else if (op.type === 'operation_revoke') log.revoke(op.targetOpId)
}
const ids = (log: OperationLog, cut?: number) => log.layerPixelOps('L', cut).map(op => op.id)

describe('historical source prefix', () => {
  it('ignores future Undo and the new action that removes its redo branch', () => {
    const log = new OperationLog()
    apply(log, stroke('a'))
    apply(log, control('u', 'operation_undo'))
    apply(log, stroke('b'))
    expect(ids(log)).toEqual(['b'])
    expect(ids(log, 1)).toEqual(['a'])
    expect(ids(log, 2)).toEqual([])
    expect(log.pixelOpDoneCount('L')).toBe(1)
  })
  it('keeps an earlier Undo despite future Redo', () => {
    const log = new OperationLog()
    apply(log, stroke('a')); apply(log, control('u', 'operation_undo'))
    apply(log, control('r', 'operation_redo'))
    expect(ids(log, 2)).toEqual([])
    expect(ids(log, 3)).toEqual(['a'])
  })
  it('ignores future teacher revoke, but honours one inside the cut', () => {
    const log = new OperationLog()
    apply(log, stroke('a')); apply(log, control('v', 'operation_revoke', 'a', 'teacher'))
    expect(ids(log, 1)).toEqual(['a'])
    expect(ids(log, 2)).toEqual([])
  })
  it('handles future Undo targeting a different chunk of the same gesture', () => {
    const log = new OperationLog()
    apply(log, stroke('a', 'A', 'gesture')); apply(log, stroke('b', 'A', 'gesture'))
    apply(log, control('u', 'operation_undo', 'b'))
    expect(ids(log, 1)).toEqual(['a'])
    expect(ids(log, 2)).toEqual(['a', 'b'])
    expect(ids(log)).toEqual([])
  })
  it('preserves resolved states whose controls are outside the known history', () => {
    const log = new OperationLog()
    apply(log, stroke('a')); log.applyUndo('a', 'A')
    expect(ids(log, 1)).toEqual([])
    log.revoke('a')
    expect(ids(log, 1)).toEqual([])
  })
  it('does not attribute a later chunk state to an earlier gesture control', () => {
    const log = new OperationLog()
    apply(log, stroke('a', 'A', 'gesture')); apply(log, control('u', 'operation_undo'))
    apply(log, stroke('b', 'A', 'gesture')); log.applyUndo('b', 'A')
    expect(ids(log, 3)).toEqual([])
  })
  it('does not let unauthorized or backwards controls suppress resolved-state fallback', () => {
    for (const backwards of [false, true]) {
      const log = new OperationLog()
      if (backwards) apply(log, control('u', 'operation_undo'))
      apply(log, stroke('a')); log.applyUndo('a', 'A')
      if (!backwards) apply(log, control('u', 'operation_undo', 'a', 'B'))
      expect(ids(log, log.entries.length)).toEqual([])
    }
  })
  it('invalidates cached prefixes on state changes, append and confirmation', () => {
    const log = new OperationLog()
    log.append(stroke('a'), { pending: true })
    const first = log.historicalPrefix(1)
    expect(log.historicalPrefix(1)).toBe(first)
    log.confirm('a', 10)
    expect(log.historicalPrefix(1)).not.toBe(first)
    log.applyUndo('a', 'A')
    expect(ids(log, 1)).toEqual([])
    apply(log, control('u', 'operation_undo'))
    expect(ids(log, 1)).toEqual(['a'])
    expect(first.layerPixelOps('L').map(op => op.id)).toEqual(['a'])
  })
})
