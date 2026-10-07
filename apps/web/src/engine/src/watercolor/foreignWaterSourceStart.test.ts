import { describe, expect, it } from 'vitest'
import { packDabs, strokeDabs, type Dab, type Operation } from '@grafetto/shared'
import type { LogEntry } from '../oplog/OperationLog'
import { foreignWaterSourceStart } from './foreignWater'

const stroke = (id: string, gesture = id, layerId = 'L'): Operation => ({ id, type: 'stroke', userId: 'u', timestamp: 0, layerId, tool: 'watercolor', preset: 'normal:100:100:PB29:round', color: [0, 0, 0], dabs: [], strokeId: gesture }) as Operation
const entry = (op: Operation, state: LogEntry['state'] = 'done'): LogEntry => ({ op, state })
const clear = (id: string, layerId = 'L'): Operation => ({ id, type: 'layer_clear', userId: 'u', timestamp: 0, layerId })
const dry: Operation = { id: 'dry', type: 'paper_dry', userId: 'u', timestamp: 0 }

// Executes the actual old decode/reset order with a real packed-dab decoder.
// The candidate changes only where that unchanged forward loop begins.
function collect(entries: LogEntry[], gesture: string | undefined, layer: string | undefined, optimized: boolean) {
  let decodeCalls = 0
  const output: Array<{ id: string; dabs: Dab[] }> = []
  for (let i = optimized ? foreignWaterSourceStart(entries, gesture, layer) : 0; i < entries.length; i++) {
    const e = entries[i], op = e.op
    if (gesture && op.type === 'stroke' && op.strokeId === gesture) break
    if (e.state !== 'done') continue
    if (op.type === 'paper_dry' || (op.type === 'layer_clear' && op.layerId === layer)) output.length = 0
    if (op.type !== 'stroke' || op.tool !== 'watercolor' || op.layerId !== layer) continue
    decodeCalls++
    output.push({ id: op.id, dabs: strokeDabs(op) })
  }
  return { output, decodeCalls }
}

describe('foreign source discarded-prefix decoding', () => {
  it('keeps packed doubles/order exact while avoiding discarded decoder calls', () => {
    const d = { x: 1.125, y: -2.25, size: 8, pressure: 0.2, angle: 0.7, aspectRatio: 2, tiltX: 0, tiltY: 0, opacity: 1, t: 0 } as Dab
    const packed = (id: string) => entry({ ...stroke(id), dabs: undefined, dabsPacked: packDabs([d]) } as Operation)
    const entries = [packed('a'), entry(clear('clear')), packed('b'), entry(dry), packed('c'), packed('d'), entry(stroke('current'))]
    const old = collect(entries, 'current', 'L', false), next = collect(entries, 'current', 'L', true)
    expect(next.output).toEqual(old.output)
    expect(next.output.map(s => s.id)).toEqual(['c', 'd'])
    expect(old.decodeCalls).toBe(4)
    expect(next.decodeCalls).toBe(2)
    expect(collect(entries, 'current', 'L', true).output).toEqual(old.output)
  })
  it('does not use undone/gone resets, other-layer clear, or resets after first current chunk', () => {
    const entries = [entry(stroke('a')), entry(clear('undone'), 'undone'), entry(dry, 'gone'), entry(clear('other', 'B')), entry(stroke('g1', 'g'), 'undone'), entry(dry), entry(stroke('g2', 'g'))]
    expect(foreignWaterSourceStart(entries, 'g', 'L')).toBe(0)
    expect(collect(entries, 'g', 'L', true)).toEqual(collect(entries, 'g', 'L', false))
  })
  it('re-evaluates current log states on undo/redo without cache or mutation', () => {
    const entries = [entry(stroke('a')), entry(clear('clear')), entry(stroke('b'))]
    expect(foreignWaterSourceStart(entries, undefined, 'L')).toBe(2)
    entries[1].state = 'undone'
    expect(foreignWaterSourceStart(entries, undefined, 'L')).toBe(0)
    entries[1].state = 'done'
    expect(foreignWaterSourceStart(entries, undefined, 'L')).toBe(2)
    expect(foreignWaterSourceStart(entries, undefined, 'B')).toBe(0)
    expect(foreignWaterSourceStart([], undefined, undefined)).toBe(0)
  })
  it('matches the old returned sequence for every mixed state/reset/current-layer case', () => {
    const ops = [stroke('a'), clear('c'), stroke('b', 'b', 'B'), dry, stroke('g1', 'g'), clear('late'), stroke('g2', 'g'), stroke('end')]
    for (let code = 0; code < 3 ** ops.length; code++) {
      let n = code
      const entries = ops.map(op => { const state = (['done', 'undone', 'gone'] as const)[n % 3]; n = Math.floor(n / 3); return entry(op, state) })
      const before = JSON.stringify(entries)
      for (const gesture of [undefined, 'g', 'missing']) for (const layer of [undefined, 'L', 'B']) expect(collect(entries, gesture, layer, true).output).toEqual(collect(entries, gesture, layer, false).output)
      expect(JSON.stringify(entries)).toBe(before)
    }
  })
})
