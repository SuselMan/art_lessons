import { expect, it, vi } from 'vitest'
import type { Operation, StrokeOperation } from '@grafetto/shared'
import { createTestEngine, fillStroke, readLayerPixels } from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/oplog/snapshotCodec'
const control=(targetOpId:string,userId:string,seq:number,type:'operation_undo'|'operation_redo'='operation_undo'):Operation=>({
  id:type+seq,targetOpId,userId,seq,timestamp:seq,type,
})

it('invalidates a covered earlier chunk when Undo targets its later sibling',()=>{
  const source=createTestEngine({userId:'A'},{width:16,height:16}).engine
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  source.setBaseLayers(['L']);reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'first',seq:1,strokeId:'one-gesture'}
  const dry:Operation={id:'boundary',type:'paper_dry',userId:'D',seq:2,timestamp:2}
  const later={...fillStroke('A','L',12,12,3),id:'later',seq:3,strokeId:'one-gesture'}
  try{
    source.appendOperation(first,'remote');source.appendOperation(dry,'remote')
    const snapshot=source.bakeNetworkSnapshot('L')!
    reader.restoreLayerFromSnapshot('L',decodeLayerTiles(snapshot,0).tiles,2)
    reader.absorbHistoricalOperations([first,dry])
    source.appendOperation(later,'remote');reader.appendOperation(later,'remote')
    const undo=control('later','A',4)
    source.appendOperation(undo,'remote');reader.appendOperation(undo,'remote')
    expect(reader['_log'].entries.filter(e=>e.op.type==='stroke').map(e=>e.state)).toEqual(['undone','undone'])
    expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(false)
    expect(readLayerPixels(reader,'L')).toEqual(readLayerPixels(source,'L'))
  }finally{reader.destroy();source.destroy()}
})

it('keeps a covered sibling snapshot when only the later chunk is teacher-revoked',()=>{
  const source=createTestEngine({userId:'A'},{width:16,height:16}).engine
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  source.setBaseLayers(['L']);reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'revoke-first',seq:1,strokeId:'revoke-gesture'}
  const dry:Operation={id:'revoke-dry',type:'paper_dry',userId:'D',seq:2,timestamp:2}
  const later={...fillStroke('A','L',12,12,3),id:'revoke-later',seq:3,strokeId:'revoke-gesture'}
  try{
    source.appendOperation(first,'remote');source.appendOperation(dry,'remote')
    reader.restoreLayerFromSnapshot('L',decodeLayerTiles(source.bakeNetworkSnapshot('L')!,0).tiles,2)
    reader.absorbHistoricalOperations([first,dry])
    source.appendOperation(later,'remote');reader.appendOperation(later,'remote')
    const revoke:Operation={id:'teacher-revoke',type:'operation_revoke',targetOpId:later.id,userId:'teacher',seq:4,timestamp:4}
    source.appendOperation(revoke,'remote');reader.appendOperation(revoke,'remote')
    expect(reader['_log'].entries.find(e=>e.op.id===first.id)?.state).toBe('done')
    expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(true)
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([])
    expect(readLayerPixels(reader,'L')).toEqual(readLayerPixels(source,'L'))
  }finally{reader.destroy();source.destroy()}
})

it('invalidates an earlier cross-layer eraser sibling covered by another layer snapshot',()=>{
  const source=createTestEngine({userId:'A'},{width:16,height:16}).engine
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  source.setBaseLayers(['L','other']);reader.setBaseLayers(['L','other'])
  const base={...fillStroke('B','L',8,8,6),id:'base-L',seq:1}
  const other={...fillStroke('B','other',8,8,6),id:'base-other',seq:2}
  const first:StrokeOperation={...fillStroke('A','L',4,4,2),id:'erase-first',seq:3,tool:'eraser',strokeId:'cross-erase'}
  const dry:Operation={id:'erase-dry',type:'paper_dry',userId:'D',seq:4,timestamp:4}
  const later:StrokeOperation={...fillStroke('A','other',12,12,2),id:'erase-later',seq:5,tool:'eraser',strokeId:'cross-erase'}
  try{
    for(const op of [base,other,first,dry])source.appendOperation(op,'remote')
    reader.appendOperation(other,'remote')
    reader.restoreLayerFromSnapshot('L',decodeLayerTiles(source.bakeNetworkSnapshot('L')!,0).tiles,4)
    reader.absorbHistoricalOperations([base,first,dry])
    source.appendOperation(later,'remote');reader.appendOperation(later,'remote')
    const undo=control(later.id,'A',6)
    source.appendOperation(undo,'remote');reader.appendOperation(undo,'remote')
    expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(false)
    expect(readLayerPixels(reader,'L')).toEqual(readLayerPixels(source,'L'))
    expect(readLayerPixels(reader,'other')).toEqual(readLayerPixels(source,'other'))
  }finally{reader.destroy();source.destroy()}
})


it('limits grouped invalidation to same-author chunks before the control in journal order', () => {
  const engine = createTestEngine({ userId: 'reader' }, { width: 16, height: 16 }).engine
  engine.setBaseLayers(['L', 'other'])
  try {
    const first = { ...fillStroke('A', 'L', 4, 4, 2), id: 'old', seq: 100, strokeId: 'same' }
    const log = engine['_log']
    log.append(first, { serverSeq: 100 })
    const cause = control(first.id, 'A', 200)
    log.append(cause, { serverSeq: 200 }); log.applyUndo(first.id, 'A')
    log.append({ ...first, id: 'future', seq: 300, layerId: 'other' }, { serverSeq: 300 })
    log.append({ ...first, id: 'other-author', seq: 400, userId: 'B' }, { serverSeq: 400 })
    const invalidate = vi.spyOn(engine['_snapshotIO'], 'invalidateCoveredHistory')
    engine['_noteSnapshotHistoryMutation'](log.entries[0].op, cause)
    expect(invalidate.mock.calls.map(call => call[1])).toEqual(['old'])
  } finally { engine.destroy() }
})

it('rebuilds an already-painted prefix when only the named tail chunk was skipped by batch replay', async () => {
  const { engine } = createTestEngine({ userId: 'reader' }, { width: 16, height: 16 })
  engine.setBaseLayers(['L'])
  const first = { ...fillStroke('A', 'L', 4, 4, 3), id: 'prefix', seq: 1, strokeId: 'G' }
  const later = { ...fillStroke('A', 'L', 12, 12, 3), id: 'tail', seq: 3, strokeId: 'G' }
  try {
    await engine.restoreHistoricalOperations([first])
    const before = readLayerPixels(engine, 'L')
    expect(before?.some(value => value > 0)).toBe(true)
    engine.setUnpaintedInBatch(new Set([later.id]))
    engine.appendOperation(later, 'remote')
    engine.appendOperation(control(later.id, 'A', 4), 'remote')
    engine.setUnpaintedInBatch(null)
    expect(readLayerPixels(engine, 'L')?.every(value => value === 0) ?? true).toBe(true)
  } finally { engine.destroy() }
})
