import {expect,it} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,readTilePixels} from './testing/engineTestUtils'

it('an ordinary held pencil remains visible when a live snapshot arrives, until its operation can repair',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32,size:5},{width:32,height:32})
 await paperReady(engine)
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote');engine.setActiveLayer('L');engine.setTool('pencil')
  simulateStrokeStart(engine,4,8);simulateStrokeMove(engine,10,8)
  const before=readTilePixels(engine,'L',0,0,32,32)!.slice()
  expect(before.some(value=>value>0)).toBe(true)
  const installation=engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}],1)
  expect(installation).toBeInstanceOf(Promise)
  expect(engine.takeSnapshotRestoreAudit()).toEqual([])
  expect(readTilePixels(engine,'L',0,0,32,32)).toEqual(before)
  simulateStrokeMove(engine,20,8);simulateStrokeEnd(engine,24,8)
  await installation
  expect(engine.takeSnapshotRestoreAudit()).toHaveLength(1)
 }finally{engine.destroy()}
})

for(const release of ['end','cancel','disconnect','reset'] as const)it(`a peer held preview defers installation only until physical ${release}, not final ACK`,async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32});await paperReady(engine)
 const {dab}=await import('./testing/engineTestUtils')
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.appendPeerLiveDabs('C',{strokeId:'held',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],packetSeq:0,dabs:[dab(8,8,{size:5,opacity:1,pressure:1})]})
  const before=readTilePixels(engine,'L',0,0,32,32)!.slice()
  const installation=engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}],1)
  expect(installation).toBeInstanceOf(Promise);expect(readTilePixels(engine,'L',0,0,32,32)).toEqual(before)
  expect(engine.takeSnapshotRestoreAudit()).toEqual([])
  if(release==='reset')engine.resetPeerLiveStrokes()
  else engine.endPeerLiveStroke('C',release==='disconnect'?undefined:'held',release==='cancel')
  await installation
  expect(engine.takeSnapshotRestoreAudit()).toHaveLength(1)
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(0)
 }finally{engine.destroy()}
})

for(const retire of ['signal','supersede','delete','resize','destroy','context'] as const)it(`retiring deferred snapshot by ${retire} rejects completion without installed audit`,async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32});await paperReady(engine)
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote');engine.setActiveLayer('L');engine.setTool('pencil')
  simulateStrokeStart(engine,4,8);simulateStrokeMove(engine,10,8)
  if(retire==='delete')engine.setBaseLayers(['L'])
  const controller=new AbortController(),tiles=[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}]
  const installation=engine.restoreLayerFromSnapshot('L',tiles,1,controller.signal) as Promise<void>
  const settled=installation.then(()=>null,error=>error as Error)
  const pending=(engine as unknown as {_deferredSnapshotInstalls:Map<string,{tiles:unknown}>})._deferredSnapshotInstalls.get('L')!
  if(retire==='signal')controller.abort()
  if(retire==='supersede'){
   const replacement=engine.restoreLayerFromSnapshot('L',tiles,2,controller.signal)
   controller.abort();await expect(replacement).rejects.toMatchObject({name:'AbortError'})
  }
  if(retire==='delete')engine.setBaseLayers([])
  if(retire==='resize')engine.resizeCanvas(33,33)
  if(retire==='destroy')engine.destroy()
  if(retire==='context')(engine as unknown as {_handleContextLost(e:Event):void})._handleContextLost(new Event('webglcontextlost',{cancelable:true}))
  expect((await settled)?.name).toBe('AbortError')
  expect(pending.tiles).toBeNull()
  expect(engine.takeSnapshotRestoreAudit()).toEqual([])
 }finally{engine.destroy()}
})
it('only the latest pending snapshot installs; no coverage or audit is published while held',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32});await paperReady(engine)
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote');engine.setActiveLayer('L');engine.setTool('pencil')
  simulateStrokeStart(engine,4,8);simulateStrokeMove(engine,10,8)
  const tiles=[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}]
  const old=engine.restoreLayerFromSnapshot('L',tiles,1) as Promise<void>
  const settled=old.then(()=>null,error=>error as Error)
  const latest=engine.restoreLayerFromSnapshot('L',tiles,2)
  expect((await settled)?.name).toBe('AbortError')
  expect(engine['_snapshots'].isCovered('L',1)).toBe(false)
  expect(engine.takeSnapshotRestoreAudit()).toEqual([])
  simulateStrokeEnd(engine,20,8);await latest
  expect(engine['_snapshots'].isCovered('L',2)).toBe(true)
  expect(engine.takeSnapshotRestoreAudit()).toHaveLength(1)
 }finally{engine.destroy()}
})
