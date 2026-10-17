import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,fillStroke,dab,makeStroke,paperReady,readTilePixels,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
import type {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import type {OperationLog} from './src/oplog/OperationLog'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
const wet=(id:string,layerId:string,seq:number)=>({...fillStroke('B',layerId,8,8,4),id,seq,tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:id,washId:`m70:${layerId}`,timestamp:Date.now()})
async function setup(){
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {_puddle:PuddleRoomController;_opQueue:unknown[];_log:OperationLog;_strokeId:string|null;_puddleStrokeRelease:unknown;_flushOpQueue():void}
 return{engine,state}
}
it('a hidden restoration batch applies its post-Dry tail before resume returns',async()=>{
 const {engine,state}=await setup()
 try{
  engine.suspendDisplay()
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.appendOperation(wet('before','L',2),'remote')
  engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now(),seq:3},'remote')
  engine.appendOperation(makeStroke('B','L',[dab(27,27,{size:5,opacity:1,pressure:1})],{seq:4}),'remote')
  engine.appendOperation(wet('after','L',5),'remote')
  engine.resumeDisplay()
  const pixels=readTilePixels(engine,'L',0,0,32,32)!
  expect.soft(Array.from(pixels.slice((27*32+25)*4,(27*32+30)*4)).some(v=>v>0)).toBe(true)
  expect.soft(state._opQueue).toHaveLength(0)
  expect.soft(state._log.entries.map(e=>e.serverSeq)).toEqual([1,2,3,4,5])
  const target=(engine as unknown as {_layers:Map<string,Parameters<PuddleRoomController['canonicalTiles']>[0]>})._layers.get('L')!
  const canonical=state._puddle.canonicalTiles(target)![0].buffer.readPixels()
  const replay=decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels
  expect(Array.from(canonical)).toEqual(Array.from(replay))
 }finally{engine.destroy()}
})
it('finishing a hidden Dry leaves the other layer wet',async()=>{
 const {engine,state}=await setup()
 try{
  engine.suspendDisplay()
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.appendOperation({...makeLayerAdd('B','K'),seq:2},'remote')
  engine.appendOperation(wet('L-before','L',3),'remote')
  engine.appendOperation(wet('K-before','K',4),'remote')
  engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now(),seq:5},'remote')
  engine.appendOperation(makeStroke('B','L',[dab(27,27,{size:5,opacity:1,pressure:1})],{seq:6}),'remote')
  engine.resumeDisplay()
  const layers=(engine as unknown as {_layers:Map<string,Parameters<PuddleRoomController['hasMaterial']>[0]>})._layers
  expect(state._puddle.hasMaterial(layers.get('L')!)).toBe(false)
  expect(state._puddle.hasMaterial(layers.get('K')!)).toBe(true)
  expect(state._opQueue).toHaveLength(0)
 }finally{engine.destroy()}
})
for(const dryLayer of ['L','K'])it(`a suspended reconnect preserves held input and FIFO when Dry targets ${dryLayer}`,async()=>{
 const {engine,state}=await setup()
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.appendOperation({...makeLayerAdd('B','K'),seq:2},'remote')
  engine.appendOperation(wet('L-before','L',3),'remote')
  engine.appendOperation(wet('K-before','K',4),'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,14,10)
  const strokeId=state._strokeId,release=state._puddleStrokeRelease
  expect(strokeId).toBeTruthy();expect(release).toBeTruthy()
  engine.suspendDisplay()
  engine.appendOperation({id:'held-dry',type:'paper_dry',userId:'B',layerId:dryLayer,timestamp:Date.now(),seq:5},'remote')
  const marker=makeStroke('C','L',[dab(27,27,{size:5,opacity:1,pressure:1})],{id:'queued-marker',seq:6})
  engine.appendOperation(marker,'remote')
  engine.resumeDisplay()
  expect(state._strokeId).toBe(strokeId)
  expect(state._puddleStrokeRelease).toBe(release)
  if(dryLayer==='K'){
   expect(state._log.entries.some(e=>e.op.id===marker.id)).toBe(false)
   expect((state._opQueue as Array<{op:{id:string}}>).at(-1)?.op.id).toBe(marker.id)
  }else expect(state._log.entries.find(e=>e.op.id===marker.id)?.serverSeq).toBe(6)
  simulateStrokeEnd(engine,14,10)
  state._puddle.finishDrying();state._flushOpQueue()
  expect(state._opQueue).toHaveLength(0)
  expect(state._log.entries.find(e=>e.op.id===marker.id)?.serverSeq).toBe(6)
 }finally{engine.destroy()}
})
it('ordinary live Dry retains its asynchronous animation and queued tail',async()=>{
 const {engine,state}=await setup()
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.appendOperation(wet('before','L',2),'remote')
  engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now(),seq:3},'remote')
  engine.appendOperation(makeStroke('B','L',[dab(27,27,{size:5,opacity:1,pressure:1})],{seq:4}),'remote')
  expect(state._puddle.state.drying).toBe(true)
  expect(state._opQueue).toHaveLength(1)
  expect(state._log.entries.map(e=>e.serverSeq)).toEqual([1,2,3])
 }finally{engine.destroy()}
})
