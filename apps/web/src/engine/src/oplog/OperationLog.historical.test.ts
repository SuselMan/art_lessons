import { describe, expect, it } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'

import { OperationLog } from './OperationLog'

function stroke(id: string, userId = 'A', seq = 1, strokeId = id): StrokeOperation {
  return { id, type: 'stroke', userId, seq, timestamp: seq, layerId: 'L', strokeId,
    tool: 'pencil', preset: 'HB', color: [0, 0, 0], dabs: [] }
}
function apply(log: OperationLog, op: Operation): void {
  log.append(op, { serverSeq: op.seq })
  if (op.type === 'operation_undo') log.applyUndo(op.targetOpId, op.userId)
  else if (op.type === 'operation_redo') log.applyRedo(op.targetOpId, op.userId)
  else if (op.type === 'operation_revoke') log.revoke(op.targetOpId)
}
const control = (id: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke', seq: number, targetOpId = 'a', userId = 'A'): Operation => ({
  id, type, seq, targetOpId, userId, timestamp: seq,
})

describe('historical union refold', () => {
  it('replays a held undo and following layer dry against its late target', () => {
    const log = new OperationLog()
    apply(log, stroke('b', 'B', 3)); apply(log, control('undo', 'operation_undo', 4))
    apply(log, { id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 5, seq: 5, layerId: 'L' })
    const added = log.absorbHistorical([stroke('a', 'A', 2)])
    expect(added.map(op => op.id)).toEqual(['a'])
    expect(log.entries.map(e => [e.op.id, e.serverSeq])).toEqual([['a', 2], ['b', 3], ['undo', 4], ['dry', 5]])
    expect(log.entries[0]).toMatchObject({ state: 'gone', goneReason: 'branch' })
    expect(log.doneOperations().map(op => op.id)).toEqual(['b', 'undo', 'dry'])
    expect(log.pixelOpDoneCount('L')).toBe(1)
    expect(log.absorbHistorical([stroke('a', 'A', 2)])).toEqual([])
  })

  it('replays held undo/redo in their server order', () => {
    const log = new OperationLog()
    apply(log, control('undo', 'operation_undo', 3)); apply(log, control('redo', 'operation_redo', 4))
    log.absorbHistorical([stroke('a', 'A', 2)])
    expect(log.entries[0]).toMatchObject({ state: 'done' })
    expect(log.pixelOpDoneCount('L')).toBe(1)
  })

  it('replays a held teacher revoke and does not invent redo', () => {
    const log = new OperationLog()
    apply(log, control('revoke', 'operation_revoke', 3, 'a', 'teacher'))
    log.absorbHistorical([stroke('a', 'A', 2)])
    expect(log.entries[0]).toMatchObject({ state: 'gone', goneReason: 'revoke' })
    expect(log.pixelOpDoneCount('L')).toBe(0)
    expect(log.redoTarget('A')).toBeNull()
  })

  it('keeps pending locals last and preserves subsequent confirmation', () => {
    const log = new OperationLog()
    apply(log, control('undo', 'operation_undo', 4))
    log.append(stroke('pending', 'C'), { pending: true })
    log.absorbHistorical([stroke('a', 'A', 2), stroke('b', 'B', 3)])
    expect(log.entries.map(e => e.op.id)).toEqual(['a', 'b', 'undo', 'pending'])
    expect(log.entries.at(-1)).toMatchObject({ pending: true })
    expect(log.entries.map(e => e.op.seq)).toEqual([0, 1, 2, 3])
    expect(log.isPending('pending')).toBe(true)
    expect(log.pixelOpDoneCount('L')).toBe(2)
    expect(log.confirm('pending', 5)?.op.id).toBe('pending')
    expect(log.entries.at(-1)).toMatchObject({ pending: false, serverSeq: 5 })
  })

  it('applies a control target alias to every known chunk of a gesture', () => {
    const log = new OperationLog()
    apply(log, control('undo', 'operation_undo', 4, 'a2'))
    log.absorbHistorical([stroke('a1', 'A', 1, 'gesture'), stroke('a2', 'A', 2, 'gesture')])
    expect(log.entries.slice(0, 2).map(e => e.state)).toEqual(['undone', 'undone'])
    expect(log.pixelOpDoneCount('L')).toBe(0)
  })

  it('does not resurrect an old removed entry if its control is outside the known window', () => {
    const log = new OperationLog()
    apply(log, stroke('a', 'A', 3)); log.revoke('a')
    log.absorbHistorical([stroke('older', 'B', 1)])
    expect(log.entries.find(e => e.op.id === 'a')).toMatchObject({ state: 'gone', goneReason: 'revoke' })
    expect(log.pixelOpDoneCount('L')).toBe(1)
  })

  it('keeps existing coalesced identities and does not coalesce additional history', () => {
    const log = new OperationLog()
    const opacity = (id: string, seq: number): Operation => ({ id, type: 'layer_opacity', userId: 'A', layerId: 'L', timestamp: seq, seq, opacity: 0.5 })
    apply(log, opacity('held1', 2)); apply(log, opacity('held2', 3))
    expect(log.entries.map(e => e.op.id)).toEqual(['held2'])
    log.absorbHistorical([opacity('old', 1)])
    expect(log.entries.map(e => e.op.id)).toEqual(['old', 'held2'])
    expect(log.entries.map(e => e.serverSeq)).toEqual([1, 3])
  })
})

it('resolves layer drying undo/redo when the drying operation arrives later', () => {
  const dry: Operation = { id: 'dry', type: 'paper_dry', layerId: 'L', userId: 'A', timestamp: 2, seq: 2 }
  const log = new OperationLog()
  apply(log, control('undoDry', 'operation_undo', 3, 'dry'))
  log.absorbHistorical([dry])
  expect(log.entries[0]).toMatchObject({ state: 'undone' })
  apply(log, control('redoDry', 'operation_redo', 4, 'dry'))
  expect(log.entries[0]).toMatchObject({ state: 'done' })
  expect(log.undoTarget('A')?.id).toBe('dry')
  expect(log.pixelOpDoneCount('L')).toBe(0)
})

describe('pixel history at a structural copy cut', () => {
  it('keeps paint before future undo and dry branching redo', () => {
    const log = new OperationLog()
    apply(log, stroke('a'))
    const cut = log.entries[0].op.seq! + 1
    apply(log, control('undo', 'operation_undo', 3))
    apply(log, { id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 4, layerId: 'L' })
    expect(log.entries[0].state).toBe('gone')
    expect(log.layerPixelOps('L')).toEqual([])
    expect(log.layerPixelOps('L', cut).map(op => op.id)).toEqual(['a'])
  })
  it('keeps an undone prefix when later redo restores paint', () => {
    const log = new OperationLog()
    apply(log, stroke('a')); apply(log, control('undo', 'operation_undo', 3))
    const cut = log.entries.at(-1)!.op.seq! + 1
    apply(log, control('redo', 'operation_redo', 4))
    expect(log.layerPixelOps('L').map(op => op.id)).toEqual(['a'])
    expect(log.layerPixelOps('L', cut)).toEqual([])
  })
  it('preserves historical dry state despite future undo of that dry', () => {
    const log = new OperationLog()
    apply(log, { id: 'dry', type: 'paper_dry', userId: 'A', timestamp: 1, layerId: 'L' })
    const cut = log.entries[0].op.seq! + 1
    apply(log, control('undo', 'operation_undo', 3, 'dry'))
    expect(log.entries[0].state).toBe('undone')
    expect(log.historicalPrefix(cut).entries[0].state).toBe('done')
  })
  it('does not import future protected water into earlier copy', () => {
    const log = new OperationLog()
    const wet = (id: string, userId: string): StrokeOperation => ({ ...stroke(id, userId),
      tool: 'watercolor', washId: 'm70:L', preset: 'normal:80:60:PB29:round:wc@m70-r2-v1',
      dabs: [{ x: 0, y: 0, size: 10, aspectRatio: 1, angle: 0, opacity: 1, pressure: 1,
        tiltX: 0, tiltY: 0, t: 0 }] })
    apply(log, wet('a', 'A'))
    const cut = log.entries[0].op.seq! + 1
    apply(log, wet('b', 'B')); apply(log, control('undo', 'operation_undo', 3))
    expect((log.layerPixelOps('L')[0] as StrokeOperation).preset.split(':')[2]).toBe('0')
    const historical = log.layerPixelOps('L', cut) as StrokeOperation[]
    expect(historical.map(op => op.id)).toEqual(['a'])
    expect(historical[0].preset.split(':')[2]).toBe('60')
  })
  it('recognizes future controls on another gesture chunk', () => {
    const log = new OperationLog()
    log.append(stroke('a', 'A', 1, 'gesture'), {}, false)
    log.append(stroke('a2', 'A', 2, 'gesture'), {}, false)
    const cut = log.entries.at(-1)!.op.seq! + 1
    apply(log, control('undo', 'operation_undo', 3, 'a2'))
    expect(log.layerPixelOps('L', cut).map(op => op.id)).toEqual(['a', 'a2'])
  })
  it('preserves manual resolved states without original controls', () => {
    const log = new OperationLog()
    apply(log, stroke('a'))
    const cut = log.entries[0].op.seq! + 1
    log.applyUndo('a', 'A')
    expect(log.layerPixelOps('L', cut)).toEqual([])
  })
})

it('invalidates cached prefixes after state and original control changes', () => {
  const log = new OperationLog()
  apply(log, stroke('a'))
  const cut = log.entries[0].op.seq! + 1
  const first = log.historicalPrefix(cut)
  expect(log.historicalPrefix(cut)).toBe(first)
  log.applyUndo('a', 'A')
  expect(log.historicalPrefix(cut)).not.toBe(first)
  expect(log.layerPixelOps('L', cut)).toEqual([])
  apply(log, control('undo', 'operation_undo', 3))
  expect(log.layerPixelOps('L', cut).map(op => op.id)).toEqual(['a'])
})

it('ignores a future teacher revoke at the copy cut', () => {
  const log = new OperationLog()
  apply(log, stroke('a'))
  const cut = log.entries[0].op.seq! + 1
  apply(log, control('revoke', 'operation_revoke', 3, 'a', 'teacher'))
  expect(log.layerPixelOps('L')).toEqual([])
  expect(log.layerPixelOps('L', cut).map(op => op.id)).toEqual(['a'])
})
