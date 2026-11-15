import { expect, it } from 'vitest'
import type { Operation } from '@grafetto/shared'
import { createTestEngine, fillStroke, readLayerPixels } from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

const control = (id: string, type: 'operation_undo' | 'operation_redo' | 'operation_revoke', targetOpId: string, seq?: number): Operation =>
  ({ id, type, targetOpId, userId: 'A', timestamp: 100, ...(seq === undefined ? {} : { seq }) })

for (const type of ['operation_undo', 'operation_redo', 'operation_revoke'] as const) {
  for (const controlFirst of [false, true]) {
    it(`retains a partial snapshot already including ${type}, controlFirst=${controlFirst}`, () => {
      const source = createTestEngine({ userId: 'A' }, { width: 16, height: 16 }).engine
      const reader = createTestEngine({ userId: 'reader' }, { width: 16, height: 16 }).engine
      source.setBaseLayers(['L']); reader.setBaseLayers(['L'])
      const base = { ...fillStroke('B', 'L', 4, 4, 3), id: 'unrelated-base', seq: 1 }
      const target = { ...fillStroke('A', 'L', 12, 12, 3), id: 'target', seq: 3 }
      const prior = control('prior-undo', 'operation_undo', target.id, 4)
      const cause = control('covered-cause', type, target.id, type === 'operation_redo' ? 5 : 4)
      try {
        source.appendOperation(base, 'remote'); source.appendOperation(target, 'remote')
        if (type === 'operation_redo') source.appendOperation(prior, 'remote')
        source.appendOperation(cause, 'remote')
        reader.restoreLayerFromSnapshot('L', decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0).tiles, 5)
        const before = readLayerPixels(reader, 'L')!.slice()
        const targetPage = type === 'operation_redo' ? [target, prior] : [target]
        if (controlFirst) { reader.absorbHistoricalOperations([cause]); reader.absorbHistoricalOperations(targetPage) }
        else { reader.absorbHistoricalOperations(targetPage); reader.absorbHistoricalOperations([cause]) }
        expect(reader['_log'].entries.find(e => e.op.id === target.id)?.state)
          .toBe(type === 'operation_redo' ? 'done' : type === 'operation_revoke' ? 'gone' : 'undone')
        expect(reader.pendingSnapshotHistoryRepairs()).toEqual([])
        expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(true)
        expect(readLayerPixels(reader, 'L')).toEqual(before)
        expect(reader.bakeNetworkSnapshot('L')).not.toBeNull()
      } finally { source.destroy(); reader.destroy() }
    })
  }
}

it.each(['pending', 'later', 'unknown'] as const)('still quarantines a %s control after the bitmap boundary', mode => {
  const reader = createTestEngine({ userId: 'A' }, { width: 16, height: 16 }).engine
  reader.setBaseLayers(['L'])
  try {
    const pixels = new Uint8Array(16 * 16 * 4); pixels[3] = 255
    reader.restoreLayerFromSnapshot('L', [{ originX: 0, originY: 0, width: 16, height: 16, pixels }], 5)
    const target = { ...fillStroke('A', 'L', 12, 12, 3), id: 'later-target', seq: 3 }
    reader.absorbHistoricalOperations([target])
    reader.appendOperation(control('later-control', 'operation_undo', target.id, mode === 'later' ? 6 : undefined), mode === 'pending' ? 'local' : 'remote')
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([{ layerId: 'L', beforeSeq: 6 }])
    expect(reader.bakeNetworkSnapshot('L')).toBeNull()
  } finally { reader.destroy() }
})

it('uses original server sequence, not the small local index', () => {
  const reader = createTestEngine({ userId: 'reader' }, { width: 16, height: 16 }).engine
  reader.setBaseLayers(['L'])
  try {
    const pixels = new Uint8Array(16 * 16 * 4); pixels[3] = 255
    reader.restoreLayerFromSnapshot('L', [{ originX: 0, originY: 0, width: 16, height: 16, pixels }], 100)
    const target = { ...fillStroke('A', 'L', 12, 12, 3), id: 'target-90', seq: 90 }
    reader.absorbHistoricalOperations([target])
    reader.absorbHistoricalOperations([control('cause-101', 'operation_undo', target.id, 101)])
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([{ layerId: 'L', beforeSeq: 101 }])
  } finally { reader.destroy() }
})

it.each(['unknown', 'unrelated', 'rejected'] as const)('handles a newer %s control while hydrating a baked Undo', mode => {
  const reader = createTestEngine({ userId: 'A' }, { width: 16, height: 16 }).engine
  reader.setBaseLayers(['L', 'other'])
  try {
    const pixels = new Uint8Array(16 * 16 * 4); pixels[3] = 255
    reader.restoreLayerFromSnapshot('L', [{ originX: 0, originY: 0, width: 16, height: 16, pixels }], 5)
    const target = { ...fillStroke('A', 'L', 12, 12, 3), id: 'covered-target', seq: 3 }
    reader.absorbHistoricalOperations([target])
    const other = { ...fillStroke('A', 'other', 8, 8, 3), id: 'known-other', seq: 6 }
    if (mode === 'unrelated') reader.appendOperation(other, 'remote')
    const newer = control('newer-control', 'operation_undo', mode === 'unrelated' ? other.id : 'unknown-target', mode === 'rejected' ? undefined : 7)
    reader.appendOperation(newer, mode === 'rejected' ? 'local' : 'remote')
    if (mode === 'rejected') expect(reader.discardOperation(newer.id)).toBe(true)
    reader.absorbHistoricalOperations([control('baked-undo', 'operation_undo', target.id, 4)])
    expect(reader.isSnapshotHistoryRepairPending('L')).toBe(mode === 'unknown')
    expect(reader.bakeNetworkSnapshot('L') === null).toBe(mode === 'unknown')
  } finally { reader.destroy() }
})

it('keeps both cross-layer gesture snapshots when their grouped Undo is already baked', () => {
  const source = createTestEngine({ userId: 'A' }, { width: 16, height: 16 }).engine
  const reader = createTestEngine({ userId: 'reader' }, { width: 16, height: 16 }).engine
  source.setBaseLayers(['L', 'other']); reader.setBaseLayers(['L', 'other'])
  try {
    const bases = ['L', 'other'].map((layer, i) => ({ ...fillStroke('B', layer, 4, 4, 3), id: `base-${layer}`, seq: i + 1 }))
    const chunks = ['L', 'other'].map((layer, i) => ({ ...fillStroke('A', layer, 12, 12, 3), id: `chunk-${layer}`, seq: i + 3, strokeId: 'cross-layer' }))
    const undo = control('group-undo', 'operation_undo', chunks[1].id, 5)
    for (const op of [...bases, ...chunks, undo]) source.appendOperation(op, 'remote')
    for (const layer of ['L', 'other']) reader.restoreLayerFromSnapshot(layer, decodeLayerTiles(source.bakeNetworkSnapshot(layer)!, 0).tiles, 6)
    reader.absorbHistoricalOperations(chunks)
    reader.absorbHistoricalOperations([undo])
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([])
    for (const layer of ['L', 'other']) {
      expect(reader['_checkpoints'].hasSnapshotFor(layer)).toBe(true)
      expect(readLayerPixels(reader, layer)).toEqual(readLayerPixels(source, layer))
    }
  } finally { source.destroy(); reader.destroy() }
})
