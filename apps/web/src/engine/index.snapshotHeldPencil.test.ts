import {expect,it} from 'vitest'
import {createTestEngine,dab,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,readTilePixels} from './testing/engineTestUtils'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
for(const restore of [false,true])it(`restore ${restore}: an ordinary pencil gesture agrees with replay after UP`,async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32,size:5},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.setActiveLayer('L');engine.setTool('pencil')
 try{
  simulateStrokeStart(engine,4,8);simulateStrokeMove(engine,10,8)
  expect(readTilePixels(engine,'L',0,0,32,32)!.some(v=>v>0)).toBe(true)
  if(restore)engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}],1)
  simulateStrokeMove(engine,20,8);simulateStrokeEnd(engine,24,8)
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
  const replay=decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels
  expect(readTilePixels(engine,'L',0,0,32,32)!.every((value,i)=>value===replay[i])).toBe(true)
 }finally{engine.destroy()}
})
for(const cancelled of [false,true])it(`a snapshot repairs an uncommitted peer pencil when it ${cancelled?'cancels':'commits'}`,async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 const dabs=[dab(8,8,{size:5,opacity:1,pressure:1})]
 try{
  engine.appendPeerLiveDabs('C',{strokeId:'peer-held',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],packetSeq:0,dabs})
  expect(readTilePixels(engine,'L',0,0,32,32)!.some(v=>v>0)).toBe(true)
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}],1)
  engine.endPeerLiveStroke('C','peer-held',cancelled)
  if(!cancelled)engine.appendOperation({id:'peer-op',type:'stroke',userId:'C',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],strokeId:'peer-held',timestamp:Date.now(),dabs,seq:2},'remote')
  const encoded=engine.bakeLayerByFullReplay('L')
  const replay=encoded?decodeLayerTiles(encoded,0).tiles[0].pixels:new Uint8Array(4096)
  expect((readTilePixels(engine,'L',0,0,32,32)??new Uint8Array(4096)).every((v,i)=>v===replay[i])).toBe(true)
 }finally{engine.destroy()}
})
