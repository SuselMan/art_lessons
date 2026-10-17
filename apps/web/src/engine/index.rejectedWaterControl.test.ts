import {expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,makeStroke,dab,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
import type {Operation} from '@grafetto/shared'
import type {OperationLog} from './src/oplog/OperationLog'
import type {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import type {ILayerBuffer} from './src/buffers/ILayerBuffer'
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
interface State{_log:OperationLog;_puddle:PuddleRoomController;_layers:Map<string,ILayerBuffer>;_rebuildJobs:Map<string,{timer:ReturnType<typeof setTimeout>}>;_stepRebuildJob(job:unknown):void}
const state=(engine:ReturnType<typeof createTestEngine>['engine'])=>engine as unknown as State
function drain(engine:ReturnType<typeof createTestEngine>['engine']){
 const s=state(engine)
 for(let i=0;i<100 && s._rebuildJobs.size;i++)for(const job of [...s._rebuildJobs.values()]){clearTimeout(job.timer);s._stepRebuildJob(job)}
 expect(s._rebuildJobs.size).toBe(0)
}
function water(engine:ReturnType<typeof createTestEngine>['engine']){
 const s=state(engine),snapshot=s._puddle.capture(s._layers.get('L')!)!
 expect(snapshot).not.toBeNull()
 return Object.keys(snapshot.tiles[0].bufs).sort().flatMap(key=>Array.from(snapshot.tiles[0].bufs[key as keyof typeof snapshot.tiles[0]['bufs']]!.pixels))
}
for(const acceptance of ['ack','page'] as const)it(`late authoritative ${acceptance} repairs water eligibility when a later Undo masks raw state`,async()=>{
 const engine=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 const reference=createTestEngine({userId:'observer',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 await paperReady(engine);await paperReady(reference)
 const add={...makeLayerAdd('B','L'),seq:1}
 const a=makeStroke('A','L',[dab(8,8,{size:12,opacity:1})],{id:'water-a',tool:'watercolor',preset:'normal:100:0:PB29:round:wc@m70-r2-v1',strokeId:'a',washId:'m70:L',seq:2,timestamp:100})
 const b=makeStroke('B','L',[dab(13,8,{size:6,opacity:1})],{id:'wet-b',tool:'watercolor',preset:'normal:40:60:PB29:round:wc@m70-r2-v1',strokeId:'b',washId:'m70:L',seq:4,timestamp:200})
 try{
  engine.appendOperation(add,'remote');engine.appendOperation(a,'remote');engine.undo();drain(engine)
  const u1=engine.getOperations().find(op=>op.type==='operation_undo')!
  engine.discardOperation(u1.id);drain(engine)
  engine.appendOperation(b,'remote');engine.undo();drain(engine)
  const u2=engine.getOperations().find(op=>op.type==='operation_undo')!
  engine.confirmOperation(u2.id,5);drain(engine)
  expect(state(engine)._log.watercolorEffectiveOperations().some(op=>op.id===a.id)).toBe(true)
  if(acceptance==='ack')expect(engine.confirmOperation(u1.id,3)).toBe(true)
  else engine.absorbHistoricalOperations([{...u1,seq:3}])
  drain(engine)
  expect(state(engine)._log.entries.find(e=>e.op.id===a.id)?.state).toBe('undone')
  expect(state(engine)._log.watercolorEffectiveOperations().some(op=>op.id===a.id)).toBe(false)
  for(const op of [add,a,{...u1,seq:3},b,{...u2,seq:5}] as Operation[]){reference.appendOperation(op,'remote');drain(reference)}
  const actual=water(engine),expected=water(reference)
  expect(actual.length).toBe(expected.length)
  expect(actual.every((v,i)=>v===expected[i])).toBe(true)
  const bounds=(engine:ReturnType<typeof createTestEngine>['engine'])=>{const s=state(engine);return s._puddle.capture(s._layers.get('L')!)!.storageBounds}
  expect(bounds(engine)).toEqual(bounds(reference))
 }finally{engine.destroy();reference.destroy()}
})

it('rejecting a middle held chunk preserves its accepted sibling and continued tail exactly after UP',async()=>{
 const engine=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 const reference=createTestEngine({userId:'observer',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32}).engine
 await paperReady(engine);await paperReady(reference)
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round');engine.setSize(4)
  const flush=()=>{(engine as unknown as {_flushStrokeChunk():void})._flushStrokeChunk()}
  simulateStrokeStart(engine,4,4);simulateStrokeMove(engine,8,4);flush()
  const first=engine.getOperations().find(op=>op.type==='stroke')!
  engine.confirmOperation(first.id,2)
  simulateStrokeMove(engine,28,28);flush()
  const middle=engine.getOperations().filter(op=>op.type==='stroke').at(-1)!
  expect(middle.id).not.toBe(first.id)
  expect(engine.discardOperation(middle.id)).toBe(true)
  expect(state(engine)._rebuildJobs.size).toBe(0)
  simulateStrokeMove(engine,8,24);simulateStrokeEnd(engine,5,24);drain(engine)
  const tail=engine.getOperations().filter(op=>op.type==='stroke').at(-1)!
  expect(tail.id).not.toBe(first.id)
  expect(tail.id).not.toBe(middle.id)
  engine.confirmOperation(tail.id,3);drain(engine)
  expect(state(engine)._log.entries.find(e=>e.op.id===middle.id)?.goneReason).toBe('reject')
  expect(state(engine)._log.doneOperations().filter(op=>op.type==='stroke').map(op=>op.id)).toEqual([first.id,tail.id])
  for(const [index,op]of engine.getOperations().entries()){reference.appendOperation({...op,seq:index+1},'remote');drain(reference)}
  expect(water(engine)).toEqual(water(reference))
  const a=state(engine),b=state(reference)
  expect(a._puddle.capture(a._layers.get('L')!)!.storageBounds).toEqual(b._puddle.capture(b._layers.get('L')!)!.storageBounds)
 }finally{engine.destroy();reference.destroy()}
})
