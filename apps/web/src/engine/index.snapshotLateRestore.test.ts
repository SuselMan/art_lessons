import { expect, it } from 'vitest'
import { createBrushRandomStrokeId, isBrushLibrary, type BrushDescriptor, type OperationRedoOperation, type OperationUndoOperation } from '@grafetto/shared'
import { installBrushLibrary } from './brushLibrary'
import { createTestEngine, dab, makeLayerAdd, makeStroke, readLayerPixels, simulateStrokeStart, simulateStrokeMove, simulateStrokeEnd } from './testing/engineTestUtils'
import { digitalBrushFromPreset, digitalBrushPreset } from './src/presets/digitalBrushPresets'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'

it.each([false, true])('preserves a known uncovered tail immediately after late snapshot restore (pending=%s)', pending => {
  const owner = createTestEngine({ userId: 'A' }, { width: 16, height: 8 }).engine
  const reader = createTestEngine({ userId: 'A' }, { width: 16, height: 8 }).engine
  try {
    owner.setBaseLayers(['L']); reader.setBaseLayers(['L'])
    const prefix = makeStroke('A', 'L', [dab(3, 4, { size: 6, opacity: .5 })], { seq: 1 })
    const tail = makeStroke('A', 'L', [dab(12, 4, { size: 3, opacity: .5 })], { seq: 50 })
    owner.appendOperation(prefix, 'remote')
    const tiles = decodeLayerTiles(owner.bakeNetworkSnapshot('L')!, 0).tiles
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    reader.absorbHistoricalOperations([prefix])
    for (const engine of [owner, reader]) engine.appendOperation(tail, pending ? 'local' : 'remote')
    const expected = readLayerPixels(owner, 'L')
    expect(readLayerPixels(reader, 'L')).toEqual(expected)
    const operations = reader.getOperations()
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    // No undo/redo or further operation may be needed to recover held tail.
    expect(readLayerPixels(reader, 'L')).toEqual(expected)
    expect(reader.getOperations()).toEqual(operations)
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    expect(readLayerPixels(reader, 'L')).toEqual(expected)
  } finally { owner.destroy(); reader.destroy() }
})

it.each([false, true])('reconciles prefix, four tail operations and undo/redo with lateRestore=%s', lateRestore => {
  const owner = createTestEngine({ userId: 'A' }, { width: 32, height: 32 }).engine
  const reader = createTestEngine({ userId: 'reader' }, { width: 32, height: 32 }).engine
  try {
    owner.setBaseLayers(['L']); reader.setBaseLayers(['L'])
    const prefix = [1, 2].map((seq, i) => makeStroke('A', 'L', [dab(6 + i * 8, 5, { size: 6, opacity: .5 })], { seq }))
    for (const op of prefix) owner.appendOperation(op, 'remote')
    const tiles = decodeLayerTiles(owner.bakeNetworkSnapshot('L')!, 0).tiles
    if (!lateRestore) reader.restoreLayerFromSnapshot('L', tiles, 2)
    const tail = [3, 4, 5, 6].map((seq, i) => makeStroke('A', 'L', [dab(6 + i * 5, 20, { size: 6, opacity: .5 })], { seq }))
    for (const op of tail) for (const engine of [owner, reader]) engine.appendOperation(op, 'remote')
    for (const seq of [7, 9]) {
      const undo: OperationUndoOperation = { id: `undo-${seq}`, type: 'operation_undo', userId: 'A', timestamp: seq, seq, targetOpId: tail[3].id }
      const redo: OperationRedoOperation = { id: `redo-${seq + 1}`, type: 'operation_redo', userId: 'A', timestamp: seq + 1, seq: seq + 1, targetOpId: tail[3].id }
      for (const op of [undo, redo]) for (const engine of [owner, reader]) engine.appendOperation(op, 'remote')
    }
    if (lateRestore) reader.restoreLayerFromSnapshot('L', tiles, 2)
    reader.absorbHistoricalOperations(prefix)
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(owner, 'L'))
    // A future replay must not double-paint the now-retained prefix either.
    const undo: OperationUndoOperation = { id: 'undo-11', type: 'operation_undo', userId: 'A', timestamp: 11, seq: 11, targetOpId: tail[3].id }
    for (const engine of [owner, reader]) engine.appendOperation(undo, 'remote')
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(owner, 'L'))
  } finally { owner.destroy(); reader.destroy() }
})

it.each([false, true])('repairs a split brush snapshot after the full historical prefix arrives (nativeXY=%s)', nativeXY => {
  const owner = createTestEngine({ userId: 'A' }, { width: 32, height: 16 }).engine
  const reader = createTestEngine({ userId: 'reader' }, { width: 32, height: 16 }).engine
  try {
    const layer = { ...makeLayerAdd('A', 'L'), seq: 1 }
    owner.appendOperation(layer, 'remote')
    reader.setBaseLayers(['L'])
    let brush = digitalBrushFromPreset('hard-round')
    if (nativeXY) {
      const descriptor: BrushDescriptor = { ...brush, id: 'imported-000000000000000000004399', version: 143,
        tip: { kind: 'round', aspect: 1, hardness: 1, angle: 0, rotation: 'fixed', profile: { kind: 'gaussian', fade: 1e-6, antialias: false } },
        paperInteraction: 0, texture: undefined, wet: undefined, mixer: undefined, flow: 1, flowPer: 'stamp', flowSpan: undefined,
        sizeByPressure: [[0, 1], [1, 1]], flowByPressure: [[0, 1], [1, 1]], opacityByPressure: [[0, 1], [1, 1]],
        scatter: { count: 1, radius: .2, scale: 1, sizeJitter: 0, angleJitter: 0, flowJitter: 0 },
        behavior: { version: 2, sequentialRandom: { version: 1, kind: 'qt5Taus88', policy: 'scatterXY' }, scatter: { placement: 'xyUniform', bothAxes: true, countJitter: 0 } } }
      const library = { schemaVersion: 1 as const, assets: [], skipped: [], brushes: [{ name: 'Authored split snapshot', source: 'qa', warnings: [], descriptor }] }
      expect(isBrushLibrary(library)).toBe(true)
      installBrushLibrary(library)
      brush = descriptor
    }
    const preset = digitalBrushPreset(brush.id, brush.version)
    const brushRandom = { version: 1 as const, sequentialSeed: 123456, strokeSeed: 98765 }
    const strokeId = nativeXY ? createBrushRandomStrokeId('nonce43000', brushRandom) : 'gesture'
    const channels = nativeXY ? { sourceSize: 12, sourceScale: 1 } : {}
    const head = makeStroke('A', 'L', [dab(8, 8, { size: 12, opacity: .5, ...channels })], { tool: 'digitalBrush', preset, seq: 2, strokeId, ...(nativeXY ? { brushRandom } : {}) })
    // Simulate an older server snapshot that improperly cut a carried gesture.
    owner.appendOperation({ ...head, strokeEnd: true }, 'remote')
    const tiles = decodeLayerTiles(owner.bakeNetworkSnapshot('L')!, 0).tiles
    reader.restoreLayerFromSnapshot('L', tiles, 2)
    const tail = makeStroke('A', 'L', [dab(13, 8, { size: 12, opacity: .5, ...channels })], { tool: 'digitalBrush', preset, seq: 3, strokeId, strokeEnd: true, ...(nativeXY ? { brushRandom } : {}) })
    reader.appendOperation(tail, 'remote')
    // The missing seq1 must be obtained even when the brush head is available.
    reader.absorbHistoricalOperations([head])
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([{ layerId: 'L', beforeSeq: 2 }])
    expect(reader.bakeNetworkSnapshot('L')).toBeNull()
    reader.absorbHistoricalOperations([layer])
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([])
    const full = createTestEngine({ userId: 'full' }, { width: 32, height: 16 }).engine
    try {
      full.appendOperation(layer, 'remote'); full.appendOperation(head, 'remote'); full.appendOperation(tail, 'remote')
      expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(full, 'L'))
    } finally { full.destroy() }
  } finally { owner.destroy(); reader.destroy() }
})

it.each(['history', 'ack'] as const)('does not repaint a pending operation already included in a snapshot (%s)', resolution => {
  const owner = createTestEngine({ userId: 'A' }, { width: 16, height: 8 }).engine
  const reader = createTestEngine({ userId: 'A' }, { width: 16, height: 8 }).engine
  try {
    owner.setBaseLayers(['L']); reader.setBaseLayers(['L'])
    const op = makeStroke('A', 'L', [dab(8, 4, { size: 6, opacity: .5 })], { seq: 1 })
    owner.appendOperation(op, 'remote')
    reader.appendOperation(op, 'local')
    const expected = readLayerPixels(owner, 'L')
    const tiles = decodeLayerTiles(owner.bakeNetworkSnapshot('L')!, 0).tiles
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    expect(readLayerPixels(reader, 'L')).toEqual(expected)
    expect(reader.bakeNetworkSnapshot('L')).toBeNull()
    if (resolution === 'history') reader.absorbHistoricalOperations([op])
    else expect(reader.confirmOperation(op.id, 1)).toBe(true)
    expect(readLayerPixels(reader, 'L')).toEqual(expected)
  } finally { owner.destroy(); reader.destroy() }
})


it('preserves unrecorded local ink until pen-up and confirmation settle the snapshot tail', async () => {
  const owner = createTestEngine({ userId: 'owner' }, { width: 32, height: 16 }).engine
  const reader = createTestEngine({ userId: 'A' }, { width: 32, height: 16 }).engine
  try {
    for (const engine of [owner, reader]) {
      engine.setBaseLayers(['L']); engine.setActiveLayer('L')
      await engine.paperReady()
    }
    const prefix = makeStroke('owner', 'L', [dab(5, 8, { size: 6, opacity: .5 })], { seq: 1 })
    owner.appendOperation(prefix, 'remote')
    const tiles = decodeLayerTiles(owner.bakeNetworkSnapshot('L')!, 0).tiles
    simulateStrokeStart(reader, 20, 8, { pressure: 1 })
    simulateStrokeMove(reader, 24, 8, { pressure: 1 })
    const live = readLayerPixels(reader, 'L')
    reader.restoreLayerFromSnapshot('L', tiles, 1)
    expect(readLayerPixels(reader, 'L')).toEqual(live)
    expect(reader.bakeNetworkSnapshot('L')).toBeNull()
    simulateStrokeEnd(reader, 26, 8, { pressure: 1 })
    const local = reader.getOperations().find(op => op.type === 'stroke')!
    owner.appendOperation({ ...local, seq: 2 }, 'remote')
    expect(reader.confirmOperation(local.id, 2)).toBe(true)
    expect(readLayerPixels(reader, 'L')).toEqual(readLayerPixels(owner, 'L'))
  } finally { owner.destroy(); reader.destroy() }
})
