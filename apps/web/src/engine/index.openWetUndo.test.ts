import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,fillStroke,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
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
async function setup(enabled:boolean,ready=true){
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('B','L'),'remote')
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
