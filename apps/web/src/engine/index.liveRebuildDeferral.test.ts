import {expect,it} from 'vitest'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
import {createTestEngine,paperReady,dab,makeLayerAdd,makeStroke,readTilePixels,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
function fixture(){
 const {engine}=createTestEngine({userId:'A',size:5},{width:32,height:32})
 engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 const old=makeStroke('A','L',[dab(4,4,{size:5,opacity:1})],{seq:2})
 engine.appendOperation(old,'remote');engine.setActiveLayer('L')
 return{engine,old}
}
const roi=(pixels:Uint8Array|null)=>Array.from((pixels??new Uint8Array(4096)).slice((26*32+24)*4,(26*32+29)*4))
for(const ending of ['commit','cancel','disconnect'] as const)it(`replay preserves a held foreign pencil until ${ending}, then resolves the journal exactly`,()=>{
 const {engine}=fixture()
 const dabs=[dab(26,26,{size:5,opacity:1,pressure:1})]
 try{
  engine.appendPeerLiveDabs('C',{strokeId:'held',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],packetSeq:0,dabs})
  const streamed=readTilePixels(engine,'L',0,0,32,32)!.slice()
  expect(roi(streamed).some(v=>v>0)).toBe(true)
  engine.undo()
  expect(roi(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(roi(streamed))
  if(ending!=='cancel'){
   engine.endPeerLiveStroke('C',ending==='commit'?'held':undefined)
   engine.appendOperation(makeStroke('C','L',dabs,{strokeId:'held',color:[0,0,0],seq:4}),'remote')
   expect(roi(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(roi(streamed))
   const replay=decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels
   expect(Array.from(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(Array.from(replay))
  }else{
   engine.endPeerLiveStroke('C','held',true)
   expect((readTilePixels(engine,'L',0,0,32,32)??new Uint8Array(4096)).every(v=>v===0)).toBe(true)
  }
 }finally{engine.destroy()}
})
it('an own held pencil keeps its physical tail until UP records it',async()=>{
 const {engine}=fixture()
 await paperReady(engine)
 engine.setTool('pencil')
 try{
  simulateStrokeStart(engine,24,26);simulateStrokeMove(engine,26,26)
  const streamed=readTilePixels(engine,'L',0,0,32,32)!.slice()
  engine.undo()
  expect(roi(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(roi(streamed))
  simulateStrokeEnd(engine,26,26)
  expect(roi(readTilePixels(engine,'L',0,0,32,32)!).some(v=>v>0)).toBe(true)
  const replay=decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels
  expect(Array.from(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(Array.from(replay))
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
 }finally{engine.destroy()}
})
it('a different layer still rebuilds immediately while foreign input is held',()=>{
 const {engine}=fixture()
 try{
  engine.appendOperation({...makeLayerAdd('B','K'),seq:3},'remote')
  const other=makeStroke('B','K',[dab(4,4,{size:5,opacity:1})],{seq:4})
  engine.appendOperation(other,'remote')
  engine.appendPeerLiveDabs('C',{strokeId:'held',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],packetSeq:0,dabs:[dab(26,26,{size:5,opacity:1})]})
  const held=roi(readTilePixels(engine,'L',0,0,32,32))
  engine.appendOperation({id:'undo-other',type:'operation_undo',targetOpId:other.id,userId:'B',timestamp:0,seq:5},'remote')
  expect((readTilePixels(engine,'K',0,0,32,32)??new Uint8Array(4096)).every(v=>v===0)).toBe(true)
  expect(roi(readTilePixels(engine,'L',0,0,32,32))).toEqual(held)
 }finally{engine.destroy()}
})
