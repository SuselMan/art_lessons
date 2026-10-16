import {expect,it,vi} from 'vitest'
import type {Operation,StrokeOperation} from '@grafetto/shared'
import {createTestEngine,fillStroke,readLayerPixels} from './testing/engineTestUtils'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
import type {OperationLog} from './src/oplog/OperationLog'
import type {CheckpointStore} from './src/oplog/checkpointStore'

const wet=(id:string,userId:string,seq:number):StrokeOperation=>({id,userId,seq,timestamp:seq,type:'stroke',layerId:'L',
  strokeId:id,washId:'m70:L',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',color:[0,0,1],
  dabs:[{x:4,y:4,size:10,aspectRatio:1,angle:0,opacity:1,pressure:1,tiltX:0,tiltY:0,t:0}]})
const control=(targetOpId:string,userId:string,seq:number,type:'operation_undo'|'operation_redo'='operation_undo'):Operation=>({
  id:type+seq,targetOpId,userId,seq,timestamp:seq,type,
})

it('keeps a cold protected-water snapshot quarantined until its missing original prefix arrives',()=>{
  const {engine}=createTestEngine({userId:'reader'},{width:16,height:16})
  engine.setBaseLayers(['L'])
  // Only coverage/material bookkeeping is under test. Fluid pixels require GPU;
  // the render seam is intercepted rather than pretending MockGL solves pigment.
  const state=engine as unknown as {_log:OperationLog;_checkpoints:CheckpointStore;_rebuildLayer(id:string):void}
  const rebuild=vi.spyOn(state,'_rebuildLayer').mockImplementation(()=>{})
  const a=wet('a','A',1),b=wet('b','B',2),c=wet('c','C',3)
  const aUndo=control('a','A',4)
  const dry:Operation={id:'dry',type:'paper_dry',userId:'D',layerId:'L',seq:5,timestamp:5}
  const pixels=new Uint8Array(16*16*4);pixels[3]=255
  try{
    engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:16,height:16,pixels}],5)
    // The cold client knows dependencies and A's undo, but not A's original.
    engine.absorbHistoricalOperations([b,c,aUndo,dry])
    engine.appendOperation(control('b','B',6),'remote')
    expect(engine.pendingSnapshotHistoryRepairs()).toEqual([{layerId:'L',beforeSeq:2}])
    expect(state._checkpoints.hasSnapshotFor('L')).toBe(true)
    expect(engine.bakeNetworkSnapshot('L')).toBeNull()
    expect(rebuild).not.toHaveBeenCalled()
    engine.appendOperation(control('b','B',7,'operation_redo'),'remote')
    engine.appendOperation(control('c','C',8),'remote')
    engine.appendOperation(control('dry','D',9),'remote')
    expect(engine.isSnapshotHistoryRepairPending('L')).toBe(true)
    engine.absorbHistoricalOperations([a])
    expect(engine.pendingSnapshotHistoryRepairs()).toEqual([])
    expect(state._checkpoints.hasSnapshotFor('L')).toBe(false)
    expect(rebuild).toHaveBeenCalledWith('L')
    const material=()=>state._log.watercolorEffectiveOperations().filter((op):op is StrokeOperation=>op.type==='stroke')
    expect(material().find(op=>op.id==='a')?.preset.split(':')[2]).toBe('0')
    engine.appendOperation(control('b','B',10),'remote')
    expect(material().some(op=>op.id==='a')).toBe(false)
    expect(material()).toEqual([])
  }finally{rebuild.mockRestore();engine.destroy()}
})


it('invalidates a covered earlier chunk when Undo targets its later sibling',()=>{
  const source=createTestEngine({userId:'A'},{width:16,height:16}).engine
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  source.setBaseLayers(['L']);reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'first',seq:1,strokeId:'one-gesture'}
  const dry:Operation={id:'boundary',type:'paper_dry',userId:'D',layerId:'L',seq:2,timestamp:2}
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

it('keeps snapshot pixels authoritative when a late control was already baked into that snapshot',()=>{
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'baked-undo-target',seq:3}
  const undo=control(first.id,'A',4)
  try{
    // Snapshot5 already includes Undo4, and global sequences1/2 are not loaded.
    const baked=new Uint8Array(16*16*4);baked[3]=255 // unrelated older ink
    reader.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:16,height:16,pixels:baked}],5)
    expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(true)
    reader.absorbHistoricalOperations([first])
    reader.absorbHistoricalOperations([undo])
    expect(reader['_log'].entries.find(e=>e.op.id===first.id)?.state).toBe('undone')
    expect(reader['_checkpoints'].hasSnapshotFor('L')).toBe(true)
    expect(reader.pendingSnapshotHistoryRepairs()).toEqual([])
  }finally{reader.destroy()}
})

it('keeps a covered sibling snapshot when only the later chunk is teacher-revoked',()=>{
  const source=createTestEngine({userId:'A'},{width:16,height:16}).engine
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  source.setBaseLayers(['L']);reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'revoke-first',seq:1,strokeId:'revoke-gesture'}
  const dry:Operation={id:'revoke-dry',type:'paper_dry',userId:'D',layerId:'L',seq:2,timestamp:2}
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
  const dry:Operation={id:'erase-dry',type:'paper_dry',userId:'D',layerId:'L',seq:4,timestamp:4}
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

it('fails closed for old hydration controls if a newer unknown foreign control is known',()=>{
  const reader=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  reader.setBaseLayers(['L'])
  const first={...fillStroke('A','L',4,4,3),id:'uncertain-target',seq:3}
  try{
    const pixels=new Uint8Array(16*16*4);pixels[3]=255
    reader.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:16,height:16,pixels}],5)
    reader.absorbHistoricalOperations([first])
    reader.appendOperation(control('unknown-foreign','B',6),'remote')
    reader.absorbHistoricalOperations([control(first.id,'A',4)])
    expect(reader.pendingSnapshotHistoryRepairs()).not.toEqual([])
    expect(reader.bakeNetworkSnapshot('L')).toBeNull()
  }finally{reader.destroy()}
})

it('limits explicit grouped invalidation to same-author chunks existing before its cause',()=>{
  const engine=createTestEngine({userId:'reader'},{width:16,height:16}).engine
  engine.setBaseLayers(['L','other'])
  try{
    const first={...fillStroke('A','L',4,4,2),id:'old',seq:1,strokeId:'same'}
    const log=engine['_log']
    log.append(first,{serverSeq:1},false)
    const cause=control(first.id,'A',2)
    log.append(cause,{serverSeq:2},false);log.applyUndo(first.id,'A')
    log.append({...first,id:'future',seq:3,layerId:'other'},{serverSeq:3},false)
    log.append({...first,id:'other-author',seq:4,userId:'B'},{serverSeq:4},false)
    const invalidate=vi.spyOn(engine['_snapshotIO'],'invalidateCoveredHistory')
    engine['_noteSnapshotHistoryMutation'](log.entries[0].op,cause)
    expect(invalidate.mock.calls.map(call=>call[1])).toEqual(['old'])
  }finally{engine.destroy()}
})
