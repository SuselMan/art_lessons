import {expect,it,vi} from 'vitest'
import type {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import type {ILayerBuffer} from './src/buffers/ILayerBuffer'
import type {OperationLog} from './src/oplog/OperationLog'
interface Work{_puddle:PuddleRoomController;_layers:Map<string,ILayerBuffer>;_log:OperationLog;_unsettledLayers:Set<string>;_pendingRebuilds:Set<string>;_strokeId:string|null;diagnosticOpenWetUndoCache:boolean}
import {createTestEngine,makeLayerAdd,fillStroke,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd} from './testing/engineTestUtils'
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
it('does not capture an exact-history cache from physical water still awaiting accepted-order repair',async()=>{
 const{engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const e=engine as unknown as Work
 try{
  engine.appendOperation(makeLayerAdd('B','L'),'remote')
  const wet=(id:string,userId:string,seq?:number)=>({...fillStroke(userId,'L',10,10,5),id,tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:id,washId:'m70:L',timestamp:Date.now(),seq})
  engine.appendOperation(wet('prior','B',2),'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
  e._puddle.canonicalTiles(e._layers.get('L')!)
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10);simulateStrokeEnd(engine,15,10)
  const own=engine.getOperations().find(op=>op.type==='stroke'&&op.userId==='A')!
  // The incoming accepted peer op is inserted before the pending local op,
  // after that local material was already painted. Normal join-window repair
  // remains queued; this is a real public append path, not a seeded flag.
  engine.suspendDisplay() // Keep the actual accepted-order replay owed to this display batch.
  engine.appendOperation(wet('accepted-before-local','C',3),'remote')
  engine.confirmOperation(own.id,4)
  expect(e._unsettledLayers.has('L') || e._pendingRebuilds.has('L')).toBe(true)
  expect(e._log.entries.findIndex(x=>x.op.id==='accepted-before-local')).toBeLessThan(e._log.entries.findIndex(x=>x.op.id===own.id))
  e._puddle.canonicalTiles(e._layers.get('L')!) // Finish the physical goal, not journal repair.
  const layer=(e._puddle as unknown as {layers:Map<ILayerBuffer,{goalReady:boolean;dirty:boolean}>}).layers.get(e._layers.get('L')!)!
  expect(layer.goalReady).toBe(true);expect(layer.dirty).toBe(false)
  e.diagnosticOpenWetUndoCache=true
  const before=e._puddle.state.undoCaptures
  simulateStrokeStart(engine,10,12)
  expect(e._strokeId).toBeTruthy()
  expect(e._puddle.state.undoCaptures).toBe(before)
  simulateStrokeMove(engine,15,12);simulateStrokeEnd(engine,15,12);engine.resumeDisplay()
 }finally{engine.destroy()}
})
it('does not capture a source whose accepted Undo is waiting in a display-batch repair',async()=>{
 const{engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32});await paperReady(engine)
 const e=engine as unknown as Work
 try{
  engine.appendOperation(makeLayerAdd('B','L'),'remote')
  engine.appendOperation({...fillStroke('B','L',10,10,5),id:'prior',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'prior',washId:'m70:L',timestamp:Date.now(),seq:2},'remote')
  engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round');e._puddle.canonicalTiles(e._layers.get('L')!)
  engine.suspendDisplay()
  engine.appendOperation({id:'accepted-foreign-undo',type:'operation_undo',targetOpId:'prior',userId:'B',timestamp:Date.now(),seq:3},'remote')
  expect(e._pendingRebuilds.has('L')).toBe(true)
  e.diagnosticOpenWetUndoCache=true
  simulateStrokeStart(engine,10,12)
  expect(e._strokeId).toBeTruthy();expect(e._puddle.state.undoCaptures).toBe(0)
  simulateStrokeEnd(engine,10,12);engine.resumeDisplay()
 }finally{engine.destroy()}
})
