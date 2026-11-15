import { describe, expect, it } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'
import { OperationLog } from './OperationLog'
import { clearReplayStart } from './clearReplayStart'

const stroke = (id: string, extra: Partial<StrokeOperation> = {}): StrokeOperation => ({
  id, type: 'stroke', userId: 'alice', layerId: 'ink', timestamp: 0,
  tool: 'digitalBrush', preset: 'hard-round', color: [0, 0, 0], dabs: [],
  strokeId: id, strokeEnd: true, ...extra,
})
const clear: Operation = { id: 'clear', type: 'layer_clear', userId: 'alice', layerId: 'ink', timestamp: 0 }
function journal(ops: Operation[]) {
  const log = new OperationLog()
  ops.forEach((op, i) => log.append(op, { serverSeq: i + 1 }))
  return log
}
const start = (log: OperationLog) => clearReplayStart(log.entries, log.layerPixelOps('ink'))

describe('clearReplayStart', () => {
  it('keeps the full journal and starts raster work at the last clear of a complete prefix', () => {
    const log = journal([stroke('old'), clear, stroke('new')])
    const before = JSON.stringify(log.entries)
    expect(start(log)).toBe(1)
    expect(JSON.stringify(log.entries)).toBe(before)
    expect(log.layerPixelOps('ink').map(op => op.id)).toEqual(['old', 'clear', 'new'])
  })
  it('accepts a completed multi-chunk gesture before the clear', () => {
    expect(start(journal([stroke('a', { strokeId: 'group', strokeEnd: undefined }),
      stroke('end', { strokeId: 'group' }), clear, stroke('new')]))).toBe(2)
  })
  it('refuses missing, unconfirmed, or truncated prefixes even when a clear is present', () => {
    for (const kind of ['gap', 'unknown', 'pending', 'tail']) {
      const log = journal([stroke('old'), clear, stroke('new')])
      if (kind === 'gap') log.entries[0].serverSeq = 2
      if (kind === 'unknown') log.entries[0].serverSeq = undefined
      if (kind === 'pending') log.entries[0].pending = true
      const entries = kind === 'tail' ? log.entries.slice(1) : log.entries
      expect(clearReplayStart(entries, log.layerPixelOps('ink'))).toBe(0)
    }
  })
  it.each(['digitalBrush', 'smudge', 'marker'] as const)('refuses an open %s reservoir at clear time', tool => {
    expect(start(journal([stroke('old', { tool, strokeEnd: undefined }), clear, stroke('new')]))).toBe(0)
  })
  it('does not mistake another user pen-up for closure, or metadata for pen-up', () => {
    const opacity: Operation = { id: 'meta', type: 'layer_opacity', userId: 'alice', layerId: 'ink', timestamp: 0, opacity: .5 }
    expect(start(journal([stroke('old', { strokeEnd: undefined }), stroke('bob', { userId: 'bob' }), opacity, clear]))).toBe(0)
  })
  it('recognizes a multi-layer gesture and pen-up on its other layer', () => {
    const head = stroke('old', { strokeId: 'group', strokeEnd: undefined })
    const other = stroke('other', { layerId: 'other', strokeId: 'group', strokeEnd: undefined })
    expect(start(journal([head, other, clear]))).toBe(0)
    expect(start(journal([head, other, stroke('end', { layerId: 'other', strokeId: 'group' }), clear]))).toBe(1)
  })
  it('refuses a gesture identity reused beyond the boundary, even after END', () => {
    expect(start(journal([stroke('old', { strokeId: 'reused' }), clear, stroke('new', { strokeId: 'reused' })]))).toBe(0)
    expect(start(journal([stroke('old', { strokeId: 'reused' }), clear, stroke('new', { strokeId: 'reused', userId: 'bob' })]))).toBe(1)
  })
  it('uses an earlier done clear when the newest clear is undone, and restores old paint when both are undone', () => {
    const log = journal([stroke('old'), clear, stroke('middle'), { ...clear, id: 'clear2' }, stroke('new')])
    expect(start(log)).toBe(3)
    log.applyUndo('clear2', 'alice')
    expect(start(log)).toBe(1)
    log.applyUndo('clear', 'alice')
    expect(start(log)).toBe(0)
    log.applyRedo('clear', 'alice')
    expect(start(log)).toBe(1)
  })
  it('leaves watercolour and structural/material operations on the full replay path', () => {
    expect(start(journal([stroke('old', { tool: 'watercolor' }), clear]))).toBe(0)
    expect(start(journal([stroke('old'), clear, stroke('new', { tool: 'watercolor' })]))).toBe(0)
    const duplicate: Operation = { id: 'copy', type: 'layer_duplicate', userId: 'alice', layerId: 'ink', sourceId: 'other', timestamp: 0, name: 'copy', index: 0, parentId: null, sourceOpacity: 1, sourceVisible: true }
    expect(start(journal([duplicate, stroke('old'), clear]))).toBe(0)
  })
})
