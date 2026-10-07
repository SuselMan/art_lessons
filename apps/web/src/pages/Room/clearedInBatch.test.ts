import { describe, expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { clearedInBatch } from './clearedInBatch'

const stroke = (id: string, gesture = id, layerId = 'L', tool = 'watercolor'): Extract<Operation, { type: 'stroke' }> =>
  ({ id, type: 'stroke', userId: 'u', timestamp: 0, layerId, tool, preset: 'normal:100:60:PB29:round', color: [0, 0, 0], dabs: [], strokeId: gesture }) as Extract<Operation, { type: 'stroke' }>
const clear = (id = 'clear', layerId = 'L'): Operation => ({ id, type: 'layer_clear', layerId, userId: 'u', timestamp: 0 })
const seq = (ops: Operation[]): Operation[] => ops.map((o, i) => ({ ...o, seq: i + 1 }))
const plan = (ops: Operation[]) => [...clearedInBatch(seq(ops), ['L', 'B'])].sort()

describe('conservative clear-prefix elision', () => {
  it('omits only overwritten strokes and leaves the ordered journal untouched', () => {
    const ops = seq([stroke('a'), stroke('b'), clear(), stroke('c')])
    const before = JSON.stringify(ops)
    expect([...clearedInBatch(ops, ['L'])]).toEqual(['a', 'b'])
    expect(JSON.stringify(ops)).toBe(before)
  })
  it('never removes a gesture chunk whose sibling survives the clear', () => {
    expect(plan([stroke('a', 'same'), stroke('b'), clear(), stroke('c', 'same')])).toEqual(['b'])
  })
  it('keeps another layer and another author with the same gesture id independent', () => {
    expect(plan([stroke('a', 'g'), stroke('b', 'b', 'B'), clear(), { ...stroke('c', 'g'), userId: 'v' }])).toEqual(['a'])
  })
  it('supports multiple irreversible clears and retained paper-dry barriers', () => {
    const dry: Operation = { id: 'dry', type: 'paper_dry', userId: 'u', timestamp: 0 }
    expect(plan([stroke('a'), clear('c1'), stroke('b'), dry, clear('c2'), stroke('d')])).toEqual(['a', 'b'])
  })
  it('allows undo of an omitted stroke without omitting the undo operation', () => {
    expect(plan([stroke('a'), { id: 'u', type: 'operation_undo', userId: 'u', timestamp: 0, targetOpId: 'a' }, clear()])).toEqual(['a'])
  })
  it('refuses undo of clear, unknown history targets, redo and revocation', () => {
    for (const type of ['operation_undo', 'operation_redo', 'operation_revoke'] as const) {
      expect(plan([stroke('a'), clear(), { id: 'history', type, userId: 'u', timestamp: 0, targetOpId: 'clear' }])).toEqual([])
    }
    expect(plan([stroke('a'), { id: 'u', type: 'operation_undo', userId: 'u', timestamp: 0, targetOpId: 'unknown' }, clear()])).toEqual([])
  })
  it('rejects every tool outside the known watercolor-only read contract', () => {
    for (const tool of ['smudge', 'pencil', 'eraser', 'unknown']) expect(plan([stroke('a'), stroke('read', 'read', 'B', tool), clear()])).toEqual([])
  })
  it('rejects copy/merge/image/area/transform and all unknown structural readers', () => {
    for (const type of ['layer_duplicate', 'layer_merge', 'image_import', 'area_paste', 'area_transform', 'layer_transform', 'layer_add']) {
      expect(plan([stroke('a'), { id: 'read', type, userId: 'u', timestamp: 0 } as Operation, clear()])).toEqual([])
    }
  })
  it('refuses missing/gapped/reordered seq, duplicate ids and unknown layers', () => {
    const ops = seq([stroke('a'), clear()])
    expect(clearedInBatch(ops.map(o => ({ ...o, seq: undefined })), ['L']).size).toBe(0)
    expect(clearedInBatch(ops.map(o => ({ ...o, seq: o.seq! + 1 })), ['L']).size).toBe(0)
    expect(clearedInBatch([...ops].reverse(), ['L']).size).toBe(0)
    expect(clearedInBatch(seq([stroke('a'), clear('a')]), ['L']).size).toBe(0)
    expect(clearedInBatch(ops, ['B']).size).toBe(0)
  })
  it('preserves a shared wash crossing the clear and rejects missing gesture metadata', () => {
    expect(plan([{ ...stroke('a'), washId: 'w' }, clear(), { ...stroke('b'), washId: 'w' }])).toEqual([])
    expect(plan([{ ...stroke('a'), strokeId: undefined }, clear()])).toEqual([])
  })

})
