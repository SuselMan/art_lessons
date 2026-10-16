import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine,makeLayerAdd,fillStroke,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,readTilePixels} from './testing/engineTestUtils'
import type {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import type {ILayerBuffer} from './src/buffers/ILayerBuffer'
import {decodeLayerTiles} from './src/oplog/snapshotCodec'
import type {CheckpointStore} from './src/oplog/checkpointStore'
import type {OperationLog} from './src/oplog/OperationLog'
// Native GLSL accuracy belongs to hardware QA; exercise real journal, scratch,
// CPU readback/restore and controller ownership without a simulated fluid solver.
vi.mock('./src/watercolor/puddle/PuddleTarget',()=>({createNativePuddleTarget:()=>({state:{done:true},resetFromScratch(){},step(){},dry(){},cancel(){},destroy(){},buffers:()=>({p:{},c:{},coverage:{}})})}))
vi.mock('./src/watercolor/puddle/PuddlePresentation',()=>({createPuddlePresentation:()=>({invalidate(){},destroy(){},reset(){},setTarget(){},acceptInput(){},tick:()=>({copyTo(){}})})}))
afterEach(()=>{vi.restoreAllMocks()})
it('three authors can cycle eight wet layers, miss CPU cache and reopen without recording replay operations',async()=>{
 const {engine}=createTestEngine({userId:'observer',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_puddle:PuddleRoomController;_layers:Map<string,ILayerBuffer>;_log:OperationLog;_rehydrateM70Source(target:ILayerBuffer,before?:string):unknown}
 // Force every parked byte array out, retaining only the journal marker.
 const controller=state._puddleFor()
 Object.defineProperty((controller as unknown as {residency:unknown}).residency,'byteBudget',{value:0})
 const miss=vi.spyOn(state,'_rehydrateM70Source')
 try {
  for(let i=0;i<8;i++){
   const author=['A','B','C'][i%3],layerId=`L${i}`
   engine.appendOperation(makeLayerAdd(author,layerId),'remote')
   const stroke=fillStroke(author,layerId,10,10,3)
   engine.appendOperation({...stroke,id:`wet${i}`,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:`g${i}`,washId:`m70:${layerId}`,timestamp:100},'remote')
   expect(controller.state.residentLayers).toBeLessThanOrEqual(2)
  }
  expect(controller.state.layers).toBe(8)
  const before=engine.getOperations().length
  const stroke=fillStroke('B','L0',12,12,3)
  engine.appendOperation({...stroke,id:'incoming',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'new',washId:'m70:L0',timestamp:101},'remote')
  expect(miss).toHaveBeenCalledWith(state._layers.get('L0'),'incoming')
  expect(engine.getOperations()).toHaveLength(before+1)
  expect(state._log.entries.filter(e=>e.op.id==='incoming')).toHaveLength(1)
  expect(controller.state.layers).toBe(8)
  expect(controller.state.residentLayers).toBeLessThanOrEqual(2)
 } finally {engine.destroy()}
})

it('journal reconstruction uses current retained-water projection, excluding both its pigment and incoming operation',async()=>{
 const {engine}=createTestEngine({userId:'observer',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_layers:Map<string,ILayerBuffer>;_log:OperationLog;_applyPixelOp(...args:unknown[]):void}
 const controller=state._puddleFor()
 Object.defineProperty((controller as unknown as {residency:unknown}).residency,'byteBudget',{value:0})
 const stroke=(author:string,layerId:string,id:string)=>({...fillStroke(author,layerId,10,10,3),id,tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:id,washId:`m70:${layerId}`,timestamp:100})
 try {
  for(const id of ['L0','L1','L2'])engine.appendOperation(makeLayerAdd('A',id),'remote')
  engine.appendOperation(stroke('A','L0','source'),'remote')
  engine.appendOperation(stroke('B','L0','consumer'),'remote')
  engine.appendOperation(stroke('B','L1','other1'),'remote')
  engine.appendOperation(stroke('C','L2','other2'),'remote')
  // Explicitly exercise a cold resolver state rather than the warm layer.
  state._log.applyUndo('source','A')
  const apply=vi.spyOn(state,'_applyPixelOp')
  engine.appendOperation(stroke('C','L0','incoming'),'remote')
  const replayed=apply.mock.calls.map(call=>call[2] as {id:string;preset:string})
  expect(replayed.map(op=>op.id)).toEqual(['source','consumer'])
  expect(replayed[0].preset).toContain(':80:0:')
  expect(engine.getOperations().filter(op=>op.id==='incoming')).toHaveLength(1)
  expect(controller.state.residentLayers).toBeLessThanOrEqual(2)
 }finally{engine.destroy()}
})

it('a CPU miss replays over the validated packed snapshot baseline, retaining its dry substrate',async()=>{
 const {engine}=createTestEngine({userId:'observer',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_layers:Map<string,ILayerBuffer>;_checkpoints:CheckpointStore}
 const controller=state._puddleFor()
 Object.defineProperty((controller as unknown as {residency:unknown}).residency,'byteBudget',{value:0})
 const baseline=new Uint8Array(32*32*4).fill(77)
 try {
  engine.appendOperation({...makeLayerAdd('A','L0'),seq:1},'remote')
  engine.restoreLayerFromSnapshot('L0',[{originX:0,originY:0,width:32,height:32,pixels:baseline}],1)
  for(let i=0;i<3;i++){
   const layer=`L${i}`
   if(i)engine.appendOperation({...makeLayerAdd('A',layer),seq:2+i*2},'remote')
   const op={...fillStroke('A',layer,10,10,3),id:`tail${i}`,seq:3+i*2,tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:`tail${i}`,washId:`m70:${layer}`,timestamp:100}
   engine.appendOperation(op,'remote')
  }
  const op={...fillStroke('B','L0',10,10,3),id:'incoming',seq:9,tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'incoming',washId:'m70:L0',timestamp:101}
  engine.appendOperation(op,'remote')
  const saved=controller.capture(state._layers.get('L0')!)!
  expect(saved.tiles[0].bufs.original!.pixels).toEqual(baseline)
  expect(engine.isSnapshotHistoryRepairPending('L0')).toBe(false)
  for(let i=1;i<=2;i++)engine.appendOperation({...op,layerId:`L${i}`,id:`extra${i}`,strokeId:`extra${i}`,washId:`m70:L${i}`,seq:10+i,timestamp:102},'remote')
  const cp=state._checkpoints.all().find(cp=>cp.layerId==='L0' && cp.fromSnapshot)!
  cp.canonicalValid=()=>false
  expect(()=>engine.appendOperation({...op,id:'wait-history',strokeId:'wait-history',seq:13,timestamp:103},'remote')).not.toThrow()
  expect(engine.isSnapshotHistoryRepairPending('L0')).toBe(true)
  expect(engine.getOperations().filter(op=>op.id==='wait-history')).toHaveLength(1)
 }finally{engine.destroy()}
})

it('cancelled sliced replay runs its generator finally before destroying the resident material',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('A','L'),'remote')
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_startRebuildJob(id:string):void;_cancelRebuildJob(id:string):void;
  _rebuildJobs:Map<string,{fresh:ILayerBuffer;timer:ReturnType<typeof setTimeout>;part:unknown}>}
 state._startRebuildJob('L')
 const job=state._rebuildJobs.get('L')!
 clearTimeout(job.timer)
 const controller=state._puddleFor(), profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const source=controller.source(job.fresh,'partial',profile,1,'',{pin:true})
 const final=vi.fn()
 function* pending(){try{yield 1}finally{source.release();final()}}
 const work=pending();work.next();job.part={opId:'partial',work,dabs:[]}
 expect(()=>state._cancelRebuildJob('L')).not.toThrow()
 expect(final).toHaveBeenCalledTimes(1)
 expect(controller.state.residentLayers).toBe(0)
 engine.destroy()
})

it('context loss releases the physical-input lease and removes its unrecorded gesture before material teardown',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('A','L'),'remote')
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_layers:Map<string,ILayerBuffer>;_puddleStrokeRelease:(()=>void)|null;
  _strokeId:string|null;_strokeLayerId:string|null;_handleContextLost(event:Event):void}
 const controller=state._puddleFor(),profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const source=controller.source(state._layers.get('L')!,'physical',profile,1,'',{pin:true})
 state._puddleStrokeRelease=source.release;state._strokeId='unrecorded';state._strokeLayerId='L'
 expect(()=>state._handleContextLost({preventDefault(){}} as Event)).not.toThrow()
 expect(state._strokeId).toBeNull();expect(state._strokeLayerId).toBeNull()
 expect(controller.state.layers).toBe(0)
 expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(0)
 engine.destroy()
})


it('finishes and records the local physical tail before an optimistic clear, releasing its source lease',async()=>{
 const emitted:string[]=[]
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onLocalOperation:op=>emitted.push(op.type)},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('A','L'),'remote');engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 try{
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10)
  expect(()=>engine.appendOperation({id:'clear',type:'layer_clear',userId:'A',layerId:'L',timestamp:101},'local')).not.toThrow()
  expect(emitted).toEqual(['stroke','layer_clear'])
  const state=engine as unknown as {_strokeId:string|null;_puddleStrokeRelease:unknown}
  expect(state._strokeId).toBeNull();expect(state._puddleStrokeRelease).toBeNull()
  simulateStrokeEnd(engine,15,10)
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
 }finally{engine.destroy()}
})

it('holds a confirmed remote clear until physical UP, preserving its fixed server order',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('A','L'),'remote');engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_opQueue:unknown[];_flushOpQueue():void;_strokeId:string|null}
 try{
  simulateStrokeStart(engine,10,10)
  engine.appendOperation({id:'remote-clear',type:'layer_clear',userId:'B',layerId:'L',timestamp:101,seq:2},'remote')
  expect(state._opQueue).toHaveLength(1);expect(state._strokeId).not.toBeNull()
  simulateStrokeEnd(engine,15,10);state._flushOpQueue()
  expect(state._opQueue).toHaveLength(0)
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(1)
 }finally{engine.destroy()}
})

it('a physical DOWN explicitly cancels one suspended replay lease and schedules its journal rebuild on UP',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 for(const id of ['L0','L1','L2'])engine.appendOperation(makeLayerAdd('A',id),'remote')
 engine.setActiveLayer('L0');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_startRebuildJob(id:string):void;_rebuildLayerOrDefer(id:string):void;
  _puddleRebuildAtPenUp:Set<string>;_rebuildJobs:Map<string,{fresh:ILayerBuffer;timer:ReturnType<typeof setTimeout>;part:unknown}>}
 const controller=state._puddleFor(),profile={ink:true,normalizeDeposit:true} as Parameters<typeof controller.source>[2]
 const cancelled=vi.fn()
 try{
  for(const id of ['L1','L2']){
   state._startRebuildJob(id);const job=state._rebuildJobs.get(id)!;clearTimeout(job.timer)
   const source=controller.source(job.fresh,id,profile,1,'',{pin:true})
   function* pending(){try{yield 1}finally{source.release();cancelled(id)}}
   const work=pending();work.next();job.part={opId:id,work,dabs:[]}
  }
  expect(()=>simulateStrokeStart(engine,10,10)).not.toThrow()
  expect(cancelled).toHaveBeenCalledExactlyOnceWith('L1')
  expect(state._puddleRebuildAtPenUp.has('L1')).toBe(true)
  const rebuild=vi.spyOn(state,'_rebuildLayerOrDefer')
  simulateStrokeEnd(engine,15,10)
  expect(rebuild).toHaveBeenCalledWith('L1')
  expect(state._puddleRebuildAtPenUp.size).toBe(0)
 }finally{engine.destroy()}
})


for(const active of ['dry','Lbad'])it(`refuses live eraser atomically before gesture state when ${active==='dry'?'a through-layer target':'its active target'} needs material backfill`,async()=>{
 const request=vi.fn()
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32,onSnapshotHistoryRepairNeeded:request},{width:32,height:32})
 await paperReady(engine)
 const state=engine as unknown as {_puddleFor():PuddleRoomController;_checkpoints:CheckpointStore;_strokeId:string|null}
 try{
  for(const id of ['dry','Lbad','L1','L2'])engine.appendOperation(makeLayerAdd('A',id),'remote')
  engine.appendOperation(fillStroke('A','dry',10,10,7),'remote')
  engine.restoreLayerFromSnapshot('Lbad',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096).fill(77)}],1)
  const controller=state._puddleFor()
  Object.defineProperty((controller as unknown as {residency:unknown}).residency,'byteBudget',{value:0})
  for(const [i,layerId]of ['Lbad','L1','L2'].entries())engine.appendOperation({...fillStroke('B',layerId,10,10,3),id:`wet${i}`,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:`wet${i}`,washId:`m70:${layerId}`,timestamp:100,seq:10+i},'remote')
  state._checkpoints.all().find(cp=>cp.layerId==='Lbad' && cp.fromSnapshot)!.canonicalValid=()=>false
  engine.setActiveLayer(active);engine.setTool('eraser');engine.setEraseThroughLayers(['Lbad'])
  const before=readTilePixels(engine,'dry',0,0,32,32),count=engine.getOperations().length
  expect(()=>simulateStrokeStart(engine,10,10)).not.toThrow()
  simulateStrokeMove(engine,15,10);simulateStrokeEnd(engine,15,10)
  expect(state._strokeId).toBeNull()
  expect(engine.getOperations()).toHaveLength(count)
  expect(readTilePixels(engine,'dry',0,0,32,32)).toEqual(before)
  expect(engine.isSnapshotHistoryRepairPending('Lbad')).toBe(true)
  expect(request).toHaveBeenCalledTimes(1)
 }finally{engine.destroy()}
})


for(const author of ['A','B'])it(`${author==='A'?'own':'remote'} Undo during held M70 input defers only that layer rebuild until UP`,async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation(makeLayerAdd('B','L'),'remote')
 engine.appendOperation({...fillStroke(author,'L',10,10,3),id:'prior',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'prior',washId:'m70:L',timestamp:Date.now()},'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_puddleRebuildAtPenUp:Set<string>;_puddleStrokeRelease:unknown;_rebuildLayer(id:string):void;_rebuildJobs:Map<string,unknown>}
 try{
  simulateStrokeStart(engine,10,10)
  const rebuild=vi.spyOn(state,'_rebuildLayer')
  expect(()=>engine.appendOperation({id:'undo',type:'operation_undo',userId:author,targetOpId:'prior',timestamp:Date.now()},author==='A'?'local':'remote')).not.toThrow()
  expect(state._puddleRebuildAtPenUp.has('L')).toBe(true)
  expect(rebuild).not.toHaveBeenCalledWith('L')
  expect(state._puddleStrokeRelease).toBeTruthy()
  simulateStrokeEnd(engine,15,10)
  expect(state._puddleStrokeRelease).toBeNull()
  expect(rebuild).toHaveBeenCalledWith('L')
 }finally{engine.destroy()}
})
it('Undo Dry while the pen is held defers wet epoch reconstruction until its lease ends',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine);engine.appendOperation(makeLayerAdd('B','L'),'remote')
 engine.appendOperation({id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now()},'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_puddleRebuildAtPenUp:Set<string>;_puddleStrokeRelease:unknown}
 try{
  simulateStrokeStart(engine,10,10)
  expect(()=>engine.appendOperation({id:'undo-dry',type:'operation_undo',userId:'B',targetOpId:'dry',timestamp:Date.now()},'remote')).not.toThrow()
  expect(state._puddleRebuildAtPenUp.has('L')).toBe(true)
  simulateStrokeEnd(engine,15,10)
  expect(state._puddleStrokeRelease).toBeNull()
 }finally{engine.destroy()}
})
it('structural Undo cancels only the unrecorded physical tail before deleting its source; later MOVE/UP do nothing',async()=>{
 const cancel=vi.fn()
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onLiveStrokeEnd:cancel},{width:32,height:32})
 await paperReady(engine);const add=makeLayerAdd('B','L');engine.appendOperation(add,'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_flushStrokeChunk():void;_strokeId:string|null;_puddleStrokeRelease:unknown;_layers:Map<string,unknown>}
 try{
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10);state._flushStrokeChunk()
  const count=engine.getOperations().filter(op=>op.type==='stroke').length
  expect(count).toBeGreaterThan(0)
  const physical=state._strokeId
  expect(()=>engine.appendOperation({id:'undo-layer',type:'operation_undo',userId:'B',targetOpId:add.id,timestamp:Date.now()},'remote')).not.toThrow()
  expect(cancel).toHaveBeenCalledWith(physical,true)
  expect(state._puddleStrokeRelease).toBeNull();expect(state._strokeId).toBeNull();expect(state._layers.has('L')).toBe(false)
  simulateStrokeMove(engine,20,10);simulateStrokeEnd(engine,20,10)
  expect(engine.getOperations().filter(op=>op.type==='stroke')).toHaveLength(count)
 }finally{engine.destroy()}
})

it('a remote Undo on a different layer clears its pixels immediately while the M70 input source remains leased',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 for(const id of ['held','other'])engine.appendOperation(makeLayerAdd('B',id),'remote')
 engine.appendOperation({...fillStroke('B','other',10,10,4),id:'other-stroke'},'remote')
 engine.setActiveLayer('held');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_puddleStrokeRelease:unknown;_puddleRebuildAtPenUp:Set<string>}
 try{
  expect(readTilePixels(engine,'other',0,0,32,32)!.some(v=>v>0)).toBe(true)
  simulateStrokeStart(engine,10,10)
  expect(()=>engine.appendOperation({id:'undo-other',type:'operation_undo',userId:'B',targetOpId:'other-stroke',timestamp:Date.now()},'remote')).not.toThrow()
  const after=readTilePixels(engine,'other',0,0,32,32)
  expect(after===null || after.every(v=>v===0)).toBe(true)
  expect(state._puddleStrokeRelease).toBeTruthy()
  expect(state._puddleRebuildAtPenUp.has('other')).toBe(false)
  simulateStrokeEnd(engine,15,10)
 }finally{engine.destroy()}
})

it('reconnect display suspension cannot force a queued remote clear through a held material lease',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine);engine.appendOperation(makeLayerAdd('B','L'),'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_opQueue:unknown[];_puddleStrokeRelease:unknown;_flushOpQueue():void}
 try{
  simulateStrokeStart(engine,10,10)
  engine.appendOperation({id:'reconnect-clear',type:'layer_clear',userId:'B',layerId:'L',timestamp:Date.now(),seq:2},'remote')
  expect(state._opQueue).toHaveLength(1)
  expect(()=>engine.suspendDisplay()).not.toThrow()
  expect(state._opQueue).toHaveLength(1)
  expect(state._puddleStrokeRelease).toBeTruthy()
  engine.resumeDisplay()
  simulateStrokeEnd(engine,15,10);state._flushOpQueue()
  expect(state._opQueue).toHaveLength(0)
  expect(engine.getOperations().some(op=>op.id==='reconnect-clear')).toBe(true)
 }finally{engine.destroy()}
})


for(const source of ['local','remote'] as const)it(`a ${source} marker cannot overtake the blocked queue head during reconnect suspension`,async()=>{
 const applied:string[]=[]
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onQueuedOperationApplied:op=>applied.push(op.id)},{width:32,height:32})
 await paperReady(engine);engine.appendOperation(makeLayerAdd('B','L'),'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_opQueue:unknown[];_flushOpQueue():void;_log:OperationLog}
 try{
  simulateStrokeStart(engine,10,10)
  engine.appendOperation({id:'clear-head',type:'layer_clear',userId:'B',layerId:'L',timestamp:Date.now(),seq:2},'remote')
  engine.suspendDisplay()
  engine.appendOperation({...makeLayerAdd(source==='local'?'A':'B','marker'),id:'marker-op'},source)
  expect(state._opQueue).toHaveLength(2)
  expect(state._log.entries.some(entry=>entry.op.id==='marker-op')).toBe(false)
  engine.resumeDisplay();simulateStrokeEnd(engine,15,10);state._flushOpQueue()
  expect(applied).toEqual(['clear-head','marker-op'])
  expect(engine.getOperations().some(op=>op.id==='marker-op')).toBe(true)
 }finally{engine.destroy()}
})

it('a public snapshot handover must not let the pre-reconnect wet goal overwrite its authoritative pixels on later Dry',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.appendOperation({...fillStroke('B','L',10,10,3),id:'accepted-wet',seq:2,tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'accepted-wet',washId:'m70:L',timestamp:Date.now()},'remote')
 const state=engine as unknown as {_puddle:PuddleRoomController}
 const authoritative=new Uint8Array(4096).fill(77)
 try{
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:authoritative}],3)
  expect(readTilePixels(engine,'L',0,0,32,32)!.every((value,i)=>value===authoritative[i])).toBe(true)
  engine.appendOperation({id:'later-dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:Date.now(),seq:4},'remote')
  state._puddle.finishDrying()
  expect(readTilePixels(engine,'L',0,0,32,32)!.every((value,i)=>value===authoritative[i])).toBe(true)
 }finally{engine.destroy()}
})

for(const alreadyBaked of [false,true])it(`snapshot handover preserves pending local ink and ${alreadyBaked?'late ACK removes duplicate coverage':'uses confirmed room sequence instead of its local index'}`,async()=>{
 const emitted:string[]=[]
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onLocalOperation:op=>emitted.push(op.id)},{width:32,height:32})
 await paperReady(engine);engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 const prior=fillStroke('B','L',10,10,4)
 engine.appendOperation({...prior,id:'prefix',seq:2,dabs:prior.dabs!.map(dab=>({...dab,opacity:.3}))},'remote')
 const prefix=readTilePixels(engine,'L',0,0,32,32)!.slice()
 engine.setActiveLayer('L')
 const state=engine as unknown as {_log:OperationLog;_checkpoints:CheckpointStore}
 try{
  simulateStrokeStart(engine,22,22);simulateStrokeMove(engine,25,22);simulateStrokeEnd(engine,25,22)
  const once=readTilePixels(engine,'L',0,0,32,32)!.slice()
  expect(once.some((v,i)=>v!==prefix[i])).toBe(true)
  const pending=state._log.entries.find(entry=>entry.pending && entry.op.type==='stroke')!
  const id=pending.op.id,seq=alreadyBaked?3:2
  const bitmap=alreadyBaked?once:prefix
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:bitmap}],seq)
  expect(state._log.entries.find(entry=>entry.op.id===id)?.pending).toBe(true)
  const cp=state._checkpoints.all().find(cp=>cp.fromSnapshot && cp.layerId==='L')!
  expect(cp.covered?.has('prefix')).toBe(true)
  expect(cp.covered?.has(id)).toBe(false)
  expect(emitted.filter(opId=>opId===id)).toHaveLength(1)
  if(alreadyBaked)engine.confirmOperation(id,3)
  expect(readTilePixels(engine,'L',0,0,32,32)!.every((value,i)=>value===once[i])).toBe(true)
  expect(decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels.every((value,i)=>value===once[i])).toBe(true)
 }finally{engine.destroy()}
})
it('snapshot handover cancels a held wet tail while retaining its already accepted chunk for replay over the new substrate',async()=>{
 const cancelled=vi.fn(),emitted:string[]=[]
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onLiveStrokeEnd:cancelled,onLocalOperation:op=>emitted.push(op.id)},{width:32,height:32})
 await paperReady(engine);engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_log:OperationLog;_strokeId:string|null;_flushStrokeChunk():void;_layers:Map<string,ILayerBuffer>;_puddle:PuddleRoomController;
  _rebuildJobs:Map<string,{timer:ReturnType<typeof setTimeout>}>;_stepRebuildJob(job:unknown):void}
 try{
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10);state._flushStrokeChunk();simulateStrokeMove(engine,18,12)
  const physical=state._strokeId,id=state._log.entries.find(e=>e.pending && e.op.type==='stroke')!.op.id
  const bitmap=new Uint8Array(4096).fill(77)
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:bitmap}],1)
  expect(cancelled).toHaveBeenCalledWith(physical,true)
  expect(state._strokeId).toBeNull()
  simulateStrokeMove(engine,20,12);simulateStrokeEnd(engine,20,12)
  for(let n=0;n<20 && state._rebuildJobs.size;n++)for(const job of [...state._rebuildJobs.values()]){clearTimeout(job.timer);state._stepRebuildJob(job)}
  expect(state._rebuildJobs.size).toBe(0)
  expect(state._log.entries.find(e=>e.op.id===id)?.pending).toBe(true)
  expect(emitted).toEqual([id])
  const saved=state._puddle.capture(state._layers.get('L')!)!
  expect(saved.tiles[0].bufs.original!.pixels.every(value=>value===77)).toBe(true)
 }finally{engine.destroy()}
})

it('after forced reconnect drain and server confirmation, the held UP stroke survives the earlier remote clear exactly as full replay',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine);engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.setActiveLayer('L');engine.setTool('watercolor');engine.setPencil('normal:80:60:PB29:round')
 const state=engine as unknown as {_log:OperationLog;_flushOpQueue():void;_layers:Map<string,ILayerBuffer>;_puddle:PuddleRoomController;
  _rebuildJobs:Map<string,{timer:ReturnType<typeof setTimeout>}>;_stepRebuildJob(job:unknown):void}
 try{
  simulateStrokeStart(engine,10,10);simulateStrokeMove(engine,15,10)
  engine.appendOperation({id:'clear-before-up',type:'layer_clear',userId:'B',layerId:'L',seq:2,timestamp:Date.now()},'remote')
  engine.suspendDisplay();engine.resumeDisplay()
  simulateStrokeEnd(engine,18,12);state._flushOpQueue()
  const own=state._log.entries.find(e=>e.pending && e.op.type==='stroke')!
  engine.confirmOperation(own.op.id,3)
  for(let n=0;n<20 && state._rebuildJobs.size;n++)for(const job of [...state._rebuildJobs.values()]){clearTimeout(job.timer);state._stepRebuildJob(job)}
  expect(state._rebuildJobs.size).toBe(0)
  const actual=state._puddle.canonicalTiles(state._layers.get('L')!)[0].buffer.readPixels()
  const oracle=decodeLayerTiles(engine.bakeLayerByFullReplay('L')!,0).tiles[0].pixels
  expect(actual.some(value=>value>0)).toBe(true)
  expect(actual.every((value,i)=>value===oracle[i])).toBe(true)
 }finally{engine.destroy()}
})

it('a snapshot cannot silently resurrect an already pending Undo of its covered confirmed prefix',async()=>{
 const {engine}=createTestEngine({userId:'B',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine);engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.appendOperation({...fillStroke('B','L',10,10,4),id:'covered-paint',seq:2},'remote')
 const painted=readTilePixels(engine,'L',0,0,32,32)!.slice()
 const state=engine as unknown as {_log:OperationLog}
 try{
  engine.undo()
  const undo=state._log.entries.find(e=>e.op.type==='operation_undo')!
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:painted}],2)
  const pixels=readTilePixels(engine,'L',0,0,32,32)
  expect(pixels===null || pixels.every(v=>v===0)).toBe(true)
  expect(state._log.isPending(undo.op.id)).toBe(true)
  expect(engine.isSnapshotHistoryRepairPending('L')).toBe(false) // Full confirmed prefix was already held.
 }finally{engine.destroy()}
})
it('an unknown-sequence accepted wet tail requires history repair instead of guessing snapshot coverage',async()=>{
 const request=vi.fn()
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:32,pageHeight:32,onSnapshotHistoryRepairNeeded:request},{width:32,height:32})
 await paperReady(engine);engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote')
 engine.appendOperation({...fillStroke('B','L',10,10,3),id:'unknown-wet',tool:'watercolor',preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'unknown-wet',washId:'m70:L',timestamp:Date.now()},'remote')
 try{
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096).fill(77)}],3)
  expect(engine.isSnapshotHistoryRepairPending('L')).toBe(true)
  expect(engine.getOperations().some(op=>op.id==='unknown-wet')).toBe(true)
  expect(engine.bakeNetworkSnapshot('L')).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
 }finally{engine.destroy()}
})
it('metadata-only history completes a quarantined snapshot prefix without admitting duplicate operations',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32},{width:32,height:32})
 await paperReady(engine)
 const add={...makeLayerAdd('B','L'),seq:1}
 const wet={...fillStroke('B','L',10,10,3),id:'unknown-wet',tool:'watercolor' as const,preset:'normal:80:60:PB29:round:wc@m70-r2-v1',strokeId:'unknown-wet',washId:'m70:L',timestamp:Date.now()}
 engine.appendOperation(add,'remote');engine.appendOperation(wet,'remote')
 try{
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096).fill(77)}],2)
  expect(engine.isSnapshotHistoryRepairPending('L')).toBe(true)
  engine.absorbHistoricalOperations([{...add,seq:1},{...wet,seq:2}])
  const work=engine as unknown as {_rebuildJobs:Map<string,{timer:ReturnType<typeof setTimeout>}>;_stepRebuildJob(job:unknown):void}
  for(let i=0;i<100 && work._rebuildJobs.size;i++)for(const job of [...work._rebuildJobs.values()]){clearTimeout(job.timer);work._stepRebuildJob(job)}
  expect(engine.isSnapshotHistoryRepairPending('L')).toBe(false)
  const state=engine as unknown as {_log:OperationLog}
  expect(state._log.entries).toHaveLength(2)
  expect(state._log.entries.find(entry=>entry.op.id===wet.id)?.serverSeq).toBe(2)
 }finally{engine.destroy()}
})
