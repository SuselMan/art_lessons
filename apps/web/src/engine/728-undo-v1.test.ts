import { expect, it, vi } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { createTestEngine, makeLayerAdd, makeStroke } from './testing/engineTestUtils'
import { OperationLog } from './src/oplog/OperationLog'

// MockGL cannot validate watercolor pixels. These integration regressions
// check history and snapshot eligibility, which must not depend on a GPU.
it('layer dry and its undo/redo leave another participant layer wet', async () => {
  const {engine} = createTestEngine({userId: 'A'})
  const internal = engine as unknown as {_log: OperationLog; _snapshotQuiet(id: string): boolean}
  const now = Date.now()
  try {
    engine.appendOperation(makeLayerAdd('A', 'L'), 'remote')
    engine.appendOperation(makeLayerAdd('A', 'B'), 'remote')
    for (const layerId of ['L', 'B']) internal._log.append(makeStroke('B', layerId, [], {
      id: 'water-' + layerId, tool: 'watercolor', preset: 'normal:100:0', timestamp: now,
    }))
    const dry: Operation = {id: 'dry-L', type: 'paper_dry', layerId: 'L', userId: 'A', timestamp: now}
    engine.appendOperation(dry, 'remote')
    expect(internal._snapshotQuiet('L')).toBe(true)
    expect(internal._snapshotQuiet('B')).toBe(false)
    engine.appendOperation({id: 'undo-dry', type: 'operation_undo', targetOpId: dry.id, userId: 'A', timestamp: now}, 'remote')
    expect(internal._snapshotQuiet('L')).toBe(false)
    expect(internal._snapshotQuiet('B')).toBe(false)
    engine.appendOperation({id: 'redo-dry', type: 'operation_redo', targetOpId: dry.id, userId: 'A', timestamp: now}, 'remote')
    await vi.waitFor(() => expect(internal._snapshotQuiet('L')).toBe(true))
    expect(internal._snapshotQuiet('B')).toBe(false)
  } finally {engine.destroy()}
})

it('dry is a selectable own undo action even after a later foreign mark', () => {
  const {engine} = createTestEngine({userId: 'A'})
  const internal = engine as unknown as {_log: OperationLog}
  try {
    engine.appendOperation(makeLayerAdd('A', 'L'), 'remote')
    const dry: Operation = {id: 'dry-L', type: 'paper_dry', layerId: 'L', userId: 'A', timestamp: 1000}
    engine.appendOperation(dry, 'remote')
    engine.appendOperation(makeStroke('B', 'L', [], {id: 'foreign', timestamp: 2000}), 'remote')
    expect(engine.undo()?.id).toBe(dry.id)
    expect(internal._log.entries.find(e => e.op.id === 'foreign')?.state).toBe('done')
    expect(engine.redo()?.id).toBe(dry.id)
  } finally {engine.destroy()}
})
