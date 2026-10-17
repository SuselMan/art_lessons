import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,fillStroke,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,readTilePixels,dab,makeStroke} from './testing/engineTestUtils'
import type {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import type {ILayerBuffer} from './src/buffers/ILayerBuffer'
import type {OperationLog} from './src/oplog/OperationLog'
import type {PaperWetness} from './src/paper/paperWetness'
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
interface State {
 diagnosticOpenWetUndoCache:boolean
 _puddle:PuddleRoomController
 _layers:Map<string,ILayerBuffer>
 _log:OperationLog
 _flushStrokeChunk():void
 _paperWet:PaperWetness
 _rebuildLayerOrDefer(id:string):void
}
async function setup(enabled:boolean,ready=true,dryBase=false){
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('B','L'),'remote')
 if(dryBase)engine.appendOperation(fillStroke('B','L',27,27,7),'remote')
 engine.appendOperation({...fillStroke('B','L',10,10,5),id:'prior',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'prior',washId:'m70:L',timestamp:Date.now()},'remote')
 const state=engine as unknown as State
 if(ready)state._puddle.canonicalTiles(state._layers.get('L')!)
 state.diagnosticOpenWetUndoCache=enabled
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 return{engine,state}
}
function draw(engine:ReturnType<typeof createTestEngine>['engine']){
 simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10);simulateStrokeEnd(engine,15,10)
}
it('fast Undo restores wet interaction for the next live stroke, without replaying the source or computing a new target',async()=>{
 const {engine,state}=await setup(true)
 try{
  const before=state._paperWet.captureLayer('L')
  expect(before.length).toBeGreaterThan(0)
  draw(engine)
  expect(state._puddle.state.undoCaptures).toBe(1)
  const confirmed=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  engine.confirmOperation(confirmed.id,3)
  const computations=state._puddle.state.computations,rebuild=vi.spyOn(state,'_rebuildLayerOrDefer')
  expect(engine.undo()?.type).toBe('stroke')
  expect(state._puddle.state.undoHits).toBe(1)
  expect(state._puddle.state.computations).toBe(computations)
  expect(rebuild).not.toHaveBeenCalled()
  expect(state._paperWet.captureLayer('L')).toEqual(before)
  expect(state._paperWet.anyWetNear('L',10,10,5,performance.now())).toBe(true)
  draw(engine)
  const next=engine.getOperations().filter(op=>op.type==='stroke' && op.userId==='A').at(-1)!
  expect(next.type==='stroke' && next.wet && /[1-9a-f]/.test(next.wet)).toBeTruthy()
 }finally{engine.destroy()}
})
it('Redo deliberately takes ordinary replay after consuming a fast Undo cache',async()=>{
 const {engine,state}=await setup(true)
 try{
  draw(engine);engine.undo()
  const replay=vi.spyOn(state,'_rebuildLayerOrDefer')
  engine.redo()
  expect(replay).toHaveBeenCalledWith('L')
  expect(state._puddle.state.undoHits).toBe(1)
 }finally{engine.destroy()}
})
it('foreign Dry after the gesture forbids restoring an older wet state',async()=>{
 const {engine,state}=await setup(true)
 try{
  draw(engine)
  const own=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  engine.confirmOperation(own.id,3)
  engine.appendOperation({id:'foreign-dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now(),seq:4},'remote')
  state._puddle.finishDrying()
  const replay=vi.spyOn(state,'_rebuildLayerOrDefer')
  engine.undo()
  expect(state._puddle.state.undoHits).toBe(0)
  expect(replay).toHaveBeenCalledWith('L')
  expect(engine.getOperations().some(op=>op.id==='foreign-dry')).toBe(true)
 }finally{engine.destroy()}
})
for(const [name,enabled,ready]of [['default disabled',false,true],['goal not ready',true,false]] as const)
 it(`keeps ordinary Undo when ${name}, without computing a goal on DOWN`,async()=>{
  const {engine,state}=await setup(enabled,ready)
  try{
   const before=state._puddle.state.computations
   draw(engine)
   expect(state._puddle.state.undoCaptures).toBe(0)
   expect(state._puddle.state.computations).toBe(before)
   const replay=vi.spyOn(state,'_rebuildLayerOrDefer')
   engine.undo()
   expect(state._puddle.state.undoHits).toBe(0)
   expect(replay).toHaveBeenCalledWith('L')
  }finally{engine.destroy()}
 })


it('rejects a retained zero-pigment source under its original ID after a foreign dependent stroke',async()=>{
 const {engine,state}=await setup(true)
 try{
  draw(engine)
  const own=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  if(own.type!=='stroke')throw new Error('Expected recorded watercolor gesture')
  engine.confirmOperation(own.id,3)
  engine.appendOperation({...own,id:'foreign',userId:'C',strokeId:'foreign',timestamp:Date.now(),seq:4},'remote')
  expect(engine.getOperations().some(op=>op.id==='foreign')).toBe(true)
  const replay=vi.spyOn(state,'_rebuildLayerOrDefer')
  engine.undo()
  expect(state._puddle.state.undoHits).toBe(0)
  expect(replay).toHaveBeenCalledWith('L')
  const retained=state._log.watercolorEffectiveOperations().find(op=>op.id===own.id)!
  expect(retained.type==='stroke' && retained.preset).toContain(':80:0:')
 }finally{engine.destroy()}
})
it('a whole physical gesture split into multiple chunks restores the state before its first chunk',async()=>{
 const {engine,state}=await setup(true)
 try{
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10)
  state._flushStrokeChunk()
  simulateStrokeMove(engine,18,12);simulateStrokeEnd(engine,18,12)
  const chunks=engine.getOperations().filter(op=>op.type==='stroke' && op.userId==='A')
  expect(chunks.length).toBeGreaterThan(1)
  expect(new Set(chunks.map(op=>op.type==='stroke' && op.strokeId)).size).toBe(1)
  engine.undo()
  expect(state._puddle.state.undoCaptures).toBe(1)
  expect(state._puddle.state.undoHits).toBe(1)
  expect(engine.getOperations().filter(op=>op.type==='stroke' && op.userId==='A')).toHaveLength(0)
 }finally{engine.destroy()}
})
it('a fast Undo stays ready through its server ACK and subsequent animation frames',async()=>{
 const {engine,state}=await setup(true)
 try{
  draw(engine)
  const own=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  engine.confirmOperation(own.id,3)
  state._puddle.canonicalTiles(state._layers.get('L')!)
  const before=state._puddle.state.computations
  engine.undo()
  const undo=engine.getOperations().find(op=>op.type==='operation_undo')!
  engine.confirmOperation(undo.id,4)
  const controller=state._puddle as unknown as {frame(at:number):void}
  controller.frame(performance.now()+16)
  controller.frame(performance.now()+32)
  expect(state._puddle.state.undoHits).toBe(1)
  expect(state._puddle.state.computations).toBe(before)
 }finally{engine.destroy()}
})

it('fast Undo preserves foreign pencil ink that has streamed but has no journal operation yet',async()=>{
 const {engine,state}=await setup(true)
 try{
  draw(engine)
  const own=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  engine.confirmOperation(own.id,3)
  state._puddle.canonicalTiles(state._layers.get('L')!)
  const before=readTilePixels(engine,'L',0,0,32,32)!.slice()
  engine.appendPeerLiveDabs('C',{strokeId:'held-pencil',layerId:'L',tool:'pencil',preset:'HB',color:[0,0,0],packetSeq:0,dabs:[dab(27,27,{size:5,opacity:1,pressure:1})]})
  const streamed=readTilePixels(engine,'L',0,0,32,32)!.slice()
  expect(streamed.some((v,i)=>v!==before[i])).toBe(true)
  const roi=(bytes:Uint8Array)=>Array.from(bytes.slice((27*32+25)*4,(27*32+30)*4))
  engine.undo()
  expect(roi(readTilePixels(engine,'L',0,0,32,32)!)).toEqual(roi(streamed))
  expect(state._puddle.state.undoHits).toBe(0)
 }finally{engine.destroy()}
})

it('fast Undo preserves foreign live erasing of the dry substrate before its operation arrives',async()=>{
 const {engine,state}=await setup(true,true,true)
 try{
  draw(engine)
  const own=engine.getOperations().find(op=>op.type==='stroke' && op.userId==='A')!
  engine.confirmOperation(own.id,10)
  state._puddle.canonicalTiles(state._layers.get('L')!)
  const material=()=>state._puddle.capture(state._layers.get('L')!)!.tiles[0].bufs.original!.pixels
  const before=material().slice()
  engine.appendPeerLiveDabs('C',{strokeId:'held-eraser',layerId:'L',tool:'eraser',preset:'HB',color:[0,0,0],packetSeq:0,dabs:[dab(27,27,{size:9,opacity:1,pressure:1})]})
  const streamed=material().slice()
  expect(streamed.some((v,i)=>v!==before[i])).toBe(true)
  const roi=(bytes:Uint8Array)=>Array.from(bytes.slice((27*32+25)*4,(27*32+30)*4))
  engine.undo()
  expect(roi(material())).toEqual(roi(streamed))
  expect(state._puddle.state.undoHits).toBe(0)
  const work=state as unknown as {_unsettledLayers:Set<string>;_wash:{endedAt:number}|null;_settleLayers():void;_rebuildJobs:Map<string,{timer:ReturnType<typeof setTimeout>}>;_stepRebuildJob(job:unknown):void}
  expect(work._unsettledLayers.has('L')).toBe(true)
  engine.appendOperation(makeStroke('C','L',[dab(27,27,{size:9,opacity:1,pressure:1})],{tool:'eraser',strokeId:'held-eraser',seq:12}),'remote')
  if(work._wash)work._wash.endedAt=-Infinity // Exercise the existing settle after its joining window.
  work._settleLayers()
  for(let i=0;i<100 && work._rebuildJobs.size;i++)for(const job of [...work._rebuildJobs.values()]){clearTimeout(job.timer);work._stepRebuildJob(job)}
  expect(work._unsettledLayers.has('L')).toBe(false)
  expect(roi(material())).toEqual(roi(streamed))
 }finally{engine.destroy()}
})
