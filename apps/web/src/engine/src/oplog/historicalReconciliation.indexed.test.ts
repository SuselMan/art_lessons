import { expect, it } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'
import { OperationLog } from './OperationLog'
import { baselineHistoricalReconciliation } from './historicalReconciliation.baseline.testHelper'

it('indexed admission matches frozen old oracle across deterministic randomized known U/R/revoke/pending/tombstones', () => {
  let seed = 728; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let trial = 0; trial < 80; trial++) {
    const original = new OperationLog(), strokes: StrokeOperation[] = []
    for (let i = 0; i < 90; i++) {
      const userId = rnd() < .5 ? 'u' : 'v', roll = rnd()
      let op: Operation
      if (roll < .55 || !strokes.length) {
        const stroke: StrokeOperation = { id: `${trial}-s${i}`, type: 'stroke', userId, timestamp: i, layerId: 'L', tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [], strokeId: 'g' + Math.floor(rnd() * 8) }; strokes.push(stroke); op = stroke
      } else {
        const target = strokes[Math.floor(rnd() * strokes.length)]
        op = { id: `${trial}-c${i}`, type: roll < .75 ? 'operation_undo' : roll < .93 ? 'operation_redo' : 'operation_revoke', userId, timestamp: i, targetOpId: target.id }
      }
      original.append(op, i > 80 ? { pending: true } : { serverSeq: i + 1 })
      if (op.type === 'operation_undo') original.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') original.applyRedo(op.targetOpId, op.userId)
      else if (op.type === 'operation_revoke') original.revoke(op.targetOpId)
      if (rnd() < .03) original.revoke(op.id)
    }
    const clone = () => original.entries.map(e => ({ ...e, op: { ...e.op } }))
    const baselineEntries = clone(), optimizedEntries = clone(), added = original.entries.filter(() => rnd() < .12).map(e => e.op.id)
    let baselineCount = baselineEntries.filter(e => e.state === 'done' && e.op.type === 'stroke').length
    const baseline = { _entries: baselineEntries, _revision: 0, _bumpPixelOpCount(_op: Operation, delta: number) { baselineCount += delta } }
    const optimized = new OperationLog(); optimized.prependHistorical(optimizedEntries)
    // Preserve original pending bits explicitly: this test exercises reconciliation, not prepend's confirmed-only API.
    optimized.entries.forEach((e, i) => { e.pending = optimizedEntries[i].pending })
    const beforeRevision = optimized.revision
    const expected = baselineHistoricalReconciliation.call(baseline, added), actual = optimized.reconcileHistoricalGestures(added)
    expect(actual).toEqual(expected)
    if (!expected.length) {
      expect(optimized.entries).toEqual(baselineEntries); expect(optimized.pixelOpDoneCount('L')).toBe(baselineCount)
      expect(optimized.revision - beforeRevision).toBe(baseline._revision)
    } else {
      // Old oracle may mutate OTHER affected gestures before returning unresolved; atomic admission discards both candidates.
      expect(actual).toEqual(expected)
    }
  }
})
