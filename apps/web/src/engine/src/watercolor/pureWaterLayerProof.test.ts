import { describe, expect, it } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'
import { pureWaterLayerProof } from './pureWaterLayerProof'
import type { LogEntry } from '../oplog/OperationLog'
const water = (overrides: Partial<StrokeOperation> = {}): StrokeOperation => ({ id: 'water', type: 'stroke', userId: 'a', timestamp: 0, layerId: 'L', tool: 'watercolor', preset: 'normal:100:0:PB29:round', color: [0,0,1], dabs: [], ...overrides })
const entry = (op: Operation, state: LogEntry['state'] = 'done'): LogEntry => ({ op, state })
const clear: Operation = { id: 'clear', type: 'layer_clear', userId: 'a', timestamp: 1, layerId: 'L' }
const pigment = water({ id: 'paint', preset: 'normal:100:100:PB29:round' })
describe('conservative zero-pigment layer proof', () => {
  it('permits fresh layer and repeated water but not a restored unknown prefix', () => {
    expect(pureWaterLayerProof([], 'L', false, false)).toBe(true)
    expect(pureWaterLayerProof([entry(water()), entry(water({ id: 'w2' }))], 'L', false, false)).toBe(true)
    expect(pureWaterLayerProof([entry(water())], 'L', true, false)).toBe(false)
  })
  it('does not confuse pure water over paint or PaperDry with pigment removal', () => {
    const dry: Operation = { id: 'dry', type: 'paper_dry', userId: 'a', timestamp: 1 }
    expect(pureWaterLayerProof([entry(pigment), entry(dry), entry(water())], 'L', false, false)).toBe(false)
  })
  it('only a done clear resets provenance; undo/revoke/redo retain their meaning', () => {
    expect(pureWaterLayerProof([entry(pigment), entry(clear)], 'L', false, false)).toBe(true)
    expect(pureWaterLayerProof([entry(clear)], 'L', true, false)).toBe(false)
    for (const state of ['undone', 'gone'] as const) expect(pureWaterLayerProof([entry(pigment), entry(clear, state)], 'L', false, false)).toBe(false)
    expect(pureWaterLayerProof([entry(pigment), entry(clear), entry(pigment)], 'L', false, false)).toBe(false)
    expect(pureWaterLayerProof([entry(pigment, 'undone'), entry(water())], 'L', false, false)).toBe(true)
  })
  it('rejects pending/live pigment and non-water pixel writes, ignores unrelated layers', () => {
    expect(pureWaterLayerProof([{ ...entry(pigment), pending: true }], 'L', false, false)).toBe(false)
    expect(pureWaterLayerProof([entry(water())], 'L', false, true)).toBe(false)
    expect(pureWaterLayerProof([entry(water({ tool: 'pencil', preset: 'HB' }))], 'L', false, false)).toBe(false)
    expect(pureWaterLayerProof([entry(pigment), entry({ ...clear, layerId: 'other' })], 'L', false, false)).toBe(false)
    expect(pureWaterLayerProof([entry(water({ layerId: 'other', preset: pigment.preset }))], 'L', false, false)).toBe(true)
  })
})
