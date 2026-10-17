import {expect,it} from 'vitest'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
import {createTestEngine,makeLayerAdd,makeStroke,dab,readTilePixels} from './testing/engineTestUtils'
it('backfilling an unrelated older operation cannot reapply a rejected optimistic Undo',()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.appendOperation({...makeLayerAdd('B','L'),seq:2},'remote')
 const stroke=makeStroke('A','L',[dab(8,8,{size:7,opacity:1,pressure:1})],{seq:3})
 engine.appendOperation(stroke,'remote')
 try{
  const accepted=readTilePixels(engine,'L',0,0,16,16)!.slice()
  expect(accepted.some(v=>v>0)).toBe(true)
  engine.undo()
  const undo=engine.getOperations().find(op=>op.type==='operation_undo')!
  expect(engine.discardOperation(undo.id)).toBe(true)
  expect(readTilePixels(engine,'L',0,0,16,16)!.every((v,i)=>v===accepted[i])).toBe(true)
  engine.absorbHistoricalOperations([{...makeLayerAdd('B','K'),seq:1}])
  expect.soft(engine.getOperations().some(op=>op.id===stroke.id)).toBe(true)
  expect.soft(engine.bakeLayerByFullReplay('L')).not.toBeNull()
  expect.soft((readTilePixels(engine,'L',0,0,16,16)??new Uint8Array(1024)).every((v,i)=>v===accepted[i])).toBe(true)
 }finally{engine.destroy()}
})
for(const kind of ['undo','redo','revoke','branched-undo','authoritative-page','late-ack'] as const)it(`rejection repair respects ${kind} and authoritative acceptance`,()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.appendOperation({...makeLayerAdd('B','L'),seq:2},'remote')
 const stroke=makeStroke('A','L',[dab(5,5,{size:5,opacity:1,pressure:1})],{seq:3})
 engine.appendOperation(stroke,'remote')
 try{
  const accepted=readTilePixels(engine,'L',0,0,16,16)!.slice()
  if(kind==='revoke')engine.appendOperation({id:'rejected-revoke',type:'operation_revoke',userId:'A',timestamp:Date.now(),targetOpId:stroke.id})
  else{
   engine.undo()
   if(kind==='redo'){
    const undo=engine.getOperations().find(op=>op.type==='operation_undo')!
    engine.confirmOperation(undo.id,4);engine.redo()
   }
  }
  const control=engine.getOperations().filter(op=>op.type.startsWith('operation_')).at(-1)!
  if(kind==='branched-undo'){
   const next=makeStroke('A','L',[dab(12,12,{size:3,opacity:1})],{id:'new-accepted'})
   engine.appendOperation(next);engine.confirmOperation(next.id,4)
  }
  expect(engine.discardOperation(control.id)).toBe(true)
  expect(engine.getOperations().some(op=>op.id===stroke.id)).toBe(kind!=='redo')
  if(kind==='authoritative-page')engine.absorbHistoricalOperations([{...control,seq:4}])
  if(kind==='late-ack')expect(engine.confirmOperation(control.id,4)).toBe(true)
  const shouldHaveStroke=kind!=='redo' && kind!=='authoritative-page' && kind!=='late-ack'
  engine.absorbHistoricalOperations([{...makeLayerAdd('B','K'),seq:1}])
  expect(engine.getOperations().some(op=>op.id===stroke.id)).toBe(shouldHaveStroke)
  const pixels=readTilePixels(engine,'L',0,0,16,16)??new Uint8Array(1024)
  if(kind==='branched-undo')expect(pixels[(5*16+5)*4]).toBe(accepted[(5*16+5)*4])
  else expect(pixels.every((v,i)=>v===(shouldHaveStroke?accepted[i]:0))).toBe(true)
 }finally{engine.destroy()}
})
it('a rejected Redo preserves an imported undone state whose original Undo lies outside the history window',()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.appendOperation({...makeLayerAdd('B','L'),seq:2},'remote')
 const stroke=makeStroke('A','L',[dab(8,8,{size:7,opacity:1})],{id:'legacy-undone',seq:1})
 const log=(engine as unknown as {_log:import('./src/oplog/OperationLog').OperationLog})._log
 log.prependHistorical([{op:stroke,state:'undone',serverSeq:1}])
 try{
  engine.redo()
  expect(readTilePixels(engine,'L',0,0,16,16)!.some(v=>v>0)).toBe(true)
  const redo=engine.getOperations().find(op=>op.type==='operation_redo')!
  expect(engine.discardOperation(redo.id)).toBe(true)
  expect.soft(log.layerPixelOps('L')).toHaveLength(0)
  expect.soft((readTilePixels(engine,'L',0,0,16,16)??new Uint8Array(1024)).every(v=>v===0)).toBe(true)
 }finally{engine.destroy()}
})
it('rejecting a new pending action preserves imported legacy redo and its pixels',()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 const log=(engine as unknown as {_log:import('./src/oplog/OperationLog').OperationLog})._log
 const original=makeStroke('A','L',[dab(5,5,{size:5,opacity:1,pressure:1})],{id:'legacy-original'})
 try{
  log.prependHistorical([{op:original,state:'undone',serverSeq:2}])
  const rejected=makeStroke('A','L',[dab(11,11,{size:3,opacity:1,pressure:1})],{id:'new-rejected'})
  engine.appendOperation(rejected)
  expect(engine.discardOperation(rejected.id)).toBe(true)
  expect(log.redoTarget('A')?.id).toBe(original.id)
  engine.redo()
  const pixels=readTilePixels(engine,'L',0,0,16,16)!
  expect(pixels.some(v=>v>0)).toBe(true)
  const replay=engine.bakeLayerByFullReplay('L')!
  expect(replay).not.toBeNull()
  const replayPixels=decodeLayerTiles(replay,0).tiles[0].pixels
  expect(pixels.every((v,i)=>v===replayPixels[i])).toBe(true)
  expect(log.pixelOpDoneCount('L')).toBe(1)
  expect(log.historicalPrefix(100).pixelOpDoneCount('L')).toBe(1)
 }finally{engine.destroy()}
})
it('a rejected pending control cannot quarantine an already baked historical control forever',()=>{
 const {engine}=createTestEngine({userId:'reader',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.setBaseLayers(['L'])
 const original=makeStroke('A','L',[dab(5,5,{size:5,opacity:1})],{id:'covered-original',seq:3})
 try{
  const pixels=new Uint8Array(16*16*4);pixels[3]=255
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:16,height:16,pixels}],5)
  const restored=readTilePixels(engine,'L',0,0,16,16)!.slice()
  engine.absorbHistoricalOperations([original])
  const rejected={id:'rejected-unknown',type:'operation_undo' as const,userId:'reader',targetOpId:'unknown',timestamp:6}
  engine.appendOperation(rejected);engine.discardOperation(rejected.id)
  engine.absorbHistoricalOperations([{id:'already-baked-undo',type:'operation_undo',userId:'A',targetOpId:original.id,seq:4,timestamp:4}])
  expect(engine.pendingSnapshotHistoryRepairs()).toEqual([])
  expect(readTilePixels(engine,'L',0,0,16,16)).toEqual(restored)
 }finally{engine.destroy()}
})
it('snapshot restore attributes an undone stroke to its accepted baked Undo rather than a later rejected duplicate',()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:16,pageHeight:16},{width:16,height:16})
 engine.setBaseLayers(['L'])
 const original=makeStroke('A','L',[dab(5,5,{size:5,opacity:1})],{id:'cause-original',seq:3})
 try{
  engine.absorbHistoricalOperations([original])
  const rejected={id:'cause-rejected-undo',type:'operation_undo' as const,userId:'A',targetOpId:original.id,timestamp:6}
  engine.appendOperation(rejected);engine.discardOperation(rejected.id)
  const pixels=new Uint8Array(16*16*4);pixels[3]=255
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:16,height:16,pixels}],5)
  engine.absorbHistoricalOperations([original]) // Repeated authoritative page proves snapshot coverage.
  engine.absorbHistoricalOperations([{id:'cause-baked-undo',type:'operation_undo',userId:'A',targetOpId:original.id,seq:4,timestamp:4}])
  expect(engine.pendingSnapshotHistoryRepairs()).toEqual([])
  expect(engine['_checkpoints'].hasSnapshotFor('L')).toBe(true)
 }finally{engine.destroy()}
})
