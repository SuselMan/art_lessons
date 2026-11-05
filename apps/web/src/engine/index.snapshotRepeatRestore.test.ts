import { expect, it } from 'vitest'
import type { OperationUndoOperation, OperationRedoOperation } from '@grafetto/shared'
import { createTestEngine, dab, makeStroke, readLayerPixels } from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

it.each([[false, false], [true, false], [true, true]])('does not repaint a backfilled snapshot prefix after repeated restore (duplicatePage=%s, legacyPage=%s)', (duplicatePage, legacyPage) => {
  const source = createTestEngine({ userId: 'A' }, { width: 16, height: 8 }).engine
  const reader = createTestEngine({ userId: 'reader' }, { width: 16, height: 8 }).engine
  try {
    source.setBaseLayers(['L']); reader.setBaseLayers(['L'])
    const prefix = makeStroke('A', 'L', [dab(3, 4, { size: 6, opacity: .5 })], { seq: 1 })
    const tail = makeStroke('A', 'L', [dab(12, 4, { size: 3, opacity: .5 })], { seq: 50 })
    source.appendOperation(prefix, 'remote')
    const tiles = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0).tiles
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    reader.absorbHistoricalOperations([{ ...prefix, ...(legacyPage ? { seq: undefined } : {}) }])
    source.appendOperation(tail, 'remote'); reader.appendOperation(tail, 'remote')
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(source, 'L'))
    // A second concurrent restore replaces the checkpoint after the first
    // backfill has already landed. A duplicate page may contain no new IDs.
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    if(duplicatePage) reader.absorbHistoricalOperations([prefix])
    const undo: OperationUndoOperation = { id: 'repeat-undo', type: 'operation_undo', userId: 'A', timestamp: 51, seq: 51, targetOpId: tail.id }
    source.appendOperation(undo, 'remote'); reader.appendOperation(undo, 'remote')
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(source, 'L'))
    const redo: OperationRedoOperation = { id: 'repeat-redo', type: 'operation_redo', userId: 'A', timestamp: 52, seq: 52, targetOpId: tail.id }
    source.appendOperation(redo, 'remote'); reader.appendOperation(redo, 'remote')
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(source, 'L'))
  } finally { source.destroy(); reader.destroy() }
})
