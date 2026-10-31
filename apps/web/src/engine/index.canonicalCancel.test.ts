import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {parseCanonicalStrokeCloseOperation,CANONICAL_STROKE_RASTER_PROFILE,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {installBrushLibrary} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {CanonicalWashLayerCoordinator} from './src/dabs/CanonicalWashLayerCoordinator'
import {createTestEngine} from './testing/engineTestUtils'
import type {ServerToClientEvents} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
function original(width=8){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:width,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true})
}
const descriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const preset='brush:'+descriptor.id+'@'+descriptor.version
const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
const pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor,width=8){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=original(width),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:width,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil('brush:'+selected.id+'@'+selected.version);engine.setSize(40);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,operations,p,snapshots}
}
function confirmed(h:Awaited<ReturnType<typeof harness>>,op:Operation,seq:number){
 if(op.type!=='canonical_stroke')throw Error('Expected outgoing source frame')
 const snapshot=h.snapshots.get(op.frame.strokeId);if(!snapshot)throw Error('Missing actual accepted BEGIN snapshot')
 const operation:CanonicalStrokeOperation={...op,seq}
 const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:op.userId,capability:0}]},[operation],h.p.canonicalRead.scope)[0]
 const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing original confirmed delivery')
 return input
}
it('hands off exactly one partial close on pointer cancellation and accepts the original recorded prefix and seal',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h,repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const frames=operations.slice(),owner=engine['_canonicalLayerOwner']
  expect(frames.length).toBeGreaterThan(0)
  engine['_onEnd']({...packet(5,120),cancelled:true});engine['_onEnd']({...packet(5,121),cancelled:true})
  expect(operations).toHaveLength(frames.length+1)
  const close=operations.at(-1)!
  if(close.type!=='canonical_stroke_close')throw Error('Missing partial close')
  expect(close.recordedNext).toBe(frames.length);expect(close.firstFrameOpId).toBe(frames[0].id);expect(close.lastFrameOpId).toBe(frames.at(-1)!.id)
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(repair).not.toHaveBeenCalled()
  for(let i=0;i<frames.length;i++)engine.appendOriginalRecorded(confirmed(h,frames[i],i+1))
  const input=attachCanonicalRecordedDelivery({operation:parseCanonicalStrokeCloseOperation({...close,seq:frames.length+1})},h.p.canonicalRead.scope)
  if(!('delivery'in input))throw Error('Missing seal delivery')
  engine.appendOriginalRecorded(input)
  await vi.waitFor(()=>expect(owner?.coordinator).toBeUndefined(),{timeout:5000})
  expect(engine['_log'].entries.map(e=>e.op.id)).toEqual(operations.map(op=>op.id));expect(repair).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not emit close before BEGIN produced any frame',async()=>{
 const {engine,operations}=await harness(()=>new Promise(()=>{}))
 try{await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onEnd']({...packet(1,110),cancelled:true});expect(operations).toEqual([]);expect(engine.hasActiveCanonicalAuthor()).toBe(false)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not emit close after the actual author gesture end',async()=>{
 const {engine,operations}=await harness(async r=>verdict(r))
 try{await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onEnd'](packet(1,110));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false));const count=operations.length;engine['_onEnd']({...packet(1,120),cancelled:true});expect(operations).toHaveLength(count);expect(operations.every(op=>op.type==='canonical_stroke')).toBe(true)}finally{engine.destroy()}
})
it('seals only handed-off frames while one later encoded envelope waits under actual coordinator pressure',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h,step=engine['_stepCanonicalLayer'],enqueue=CanonicalWashLayerCoordinator.prototype.tryEnqueueLocal
 let hold=true,waiting:CanonicalStrokeOperation|undefined
 engine['_stepCanonicalLayer']=job=>{if(hold)engine['_scheduleCanonicalRebuild'](job);else step.call(engine,job)}
 vi.spyOn(CanonicalWashLayerCoordinator.prototype,'tryEnqueueLocal').mockImplementation(function(this:CanonicalWashLayerCoordinator,author,op){const accepted=enqueue.call(this,author,op);if(!accepted)waiting=op;return accepted})
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(200,110))
  await vi.waitFor(()=>expect(waiting).toBeDefined(),{timeout:5000})
  const count=operations.length;expect(count).toBe(8);expect(waiting?.frame.frameOrdinal).toBe(count)
  engine['_onEnd']({...packet(200,120),cancelled:true})
  const close=operations.at(-1)!
  if(close.type!=='canonical_stroke_close')throw Error('Missing close')
  expect(close.recordedNext).toBe(count);expect(close.lastFrameOpId).toBe(operations[count-1].id);expect(operations.some(op=>op.id===waiting?.id)).toBe(false)
  expect(engine['_canonicalLayerOwner']).toBeDefined();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{hold=false;engine['_stepCanonicalLayer']=step;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it.each(['none','error','undefined'] as const)('handles cancellation reentry from frame callback, callback throws=%s',outcome=>{
 return(async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h,repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 engine['_onLocalOperation']=op=>{
  operations.push(op)
  if(op.type==='canonical_stroke'){
   engine['_onEnd']({...packet(1,110),cancelled:true})
   if(outcome==='undefined')throw undefined
   if(outcome==='error')throw Error('handoff callback failed')
  }
 }
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false))
  expect(operations.filter(op=>op.type==='canonical_stroke')).toHaveLength(1)
  if(outcome!=='none'){expect(operations).toHaveLength(1);expect(repair).toHaveBeenCalledOnce();expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
  else{expect(operations.filter(op=>op.type==='canonical_stroke_close')).toHaveLength(1);expect(repair).not.toHaveBeenCalled();expect(engine['_canonicalLayerOwner']).toBeDefined()}
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
 })()
})
it('poisons the layer if the close handoff callback throws after normal cancellation',async()=>{
 const {engine,operations}=await harness(async r=>verdict(r)),repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  engine['_onLocalOperation']=op=>{operations.push(op);if(op.type==='canonical_stroke_close')throw Error('close handoff failed')}
  expect(()=>engine['_onEnd']({...packet(1,110),cancelled:true})).toThrow('close handoff failed')
  expect(operations.filter(op=>op.type==='canonical_stroke_close')).toHaveLength(1)
  expect(repair).toHaveBeenCalledOnce();expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy()}
})

it('finishes the same executor cold target admission after matching confirmations and a partial seal',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h,repair=vi.fn(),step=engine['_stepCanonicalLayer']
 let clock=0,hold=false,cold=true
 const now=vi.spyOn(performance,'now').mockImplementation(()=>clock)
 const owner=engine['_canonicalLayerOwner']!,prepare=owner.stable.preparePaintTargetRects.bind(owner.stable)
 vi.spyOn(owner.stable,'preparePaintTargetRects').mockImplementation(rects=>{const plan=prepare(rects);if(cold){cold=false;clock+=5}return plan})
 engine['_onCanonicalRecoveryRequired']=repair
 engine['_stepCanonicalLayer']=job=>{
  if(hold){engine['_scheduleCanonicalRebuild'](job);return}
  step.call(engine,job)
  if([...owner.stable['retainedTargets'].values()].some(e=>!e.buffer))hold=true
 }
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110))
  await vi.waitFor(()=>expect(hold).toBe(true))
  expect(owner.coordinator!['work']).toBeUndefined()
  expect(owner.coordinator!['entries'][0].targetPlan).toBeUndefined()
  expect(owner.coordinator!['entries'][0].ownership).toBeUndefined()
  engine['_onEnd']({...packet(5,120),cancelled:true})
  const frames=operations.filter(op=>op.type==='canonical_stroke'),close=operations.at(-1)!
  if(close.type!=='canonical_stroke_close')throw Error('Missing close')
  for(let i=0;i<frames.length;i++)engine.appendOriginalRecorded(confirmed(h,frames[i],i+1))
  const input=attachCanonicalRecordedDelivery({operation:parseCanonicalStrokeCloseOperation({...close,seq:frames.length+1})},h.p.canonicalRead.scope)
  if(!('delivery'in input))throw Error('Missing delivery')
  engine.appendOriginalRecorded(input);expect(owner.coordinator!['dirty'].size).toBe(0)
  hold=false
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(repair).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{hold=false;engine['_stepCanonicalLayer']=step;now.mockRestore();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not confuse an undefined handoff failure with an absent cancellation sentinel',async()=>{
 const {engine}=await harness(async r=>verdict(r)),repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 engine['_onLocalOperation']=()=>{throw undefined}
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100))
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledOnce())
  expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(0)
 }finally{engine.destroy()}
})

it('does not present an earlier raw wash over its partially committed stable pixels when a later local gesture is unconfirmed',async()=>{
 const h=await harness(async r=>verdict(r),descriptor,1025),{engine,operations}=h,step=engine['_stepCanonicalLayer'],owner=engine['_canonicalLayerOwner']!
 let clock=0,hold=false,partial=false
 const now=vi.spyOn(performance,'now').mockImplementation(()=>clock),draw=owner.composite.drawSource.bind(owner.composite)
 vi.spyOn(owner.composite,'drawSource').mockImplementation((request,frame)=>{
  const result=draw(request,frame)
  if(request.source.kind==='straightRgba8'&&[...owner.stable['tiles'].values()].some(buffer=>buffer.texture===request.target.texture))clock+=5
  return result
 })
 engine['_stepCanonicalLayer']=job=>{
  if(hold){engine['_scheduleCanonicalRebuild'](job);return}
  step.call(engine,job)
  const first=owner.coordinator?.['entries'][0]
  if(!partial&&first?.ownership&&first.tile>0){partial=true;hold=true}
 }
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1020,100));engine['_onEnd'](packet(1020,110))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const firstFrames=operations.slice()
  for(let i=0;i<firstFrames.length;i++)engine.appendOriginalRecorded(confirmed(h,firstFrames[i],i+1))
  await vi.waitFor(()=>expect(partial).toBe(true),{timeout:5000})
  const coordinator=owner.coordinator!,entry=coordinator['entries'][0],raw=entry.ownership!.tiles[0].view.texture
  expect(entry.committed).toBe(false);expect(entry.tile).toBe(1)
  engine['_onStart'](packet(1020,200));engine['_onEnd'](packet(1020,210));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  expect(operations.length).toBeGreaterThan(firstFrames.length)
  expect(coordinator['entries'].some(e=>e.firstSequence===undefined)).toBe(true)
  const replay=vi.spyOn(owner.composite,'drawSource'),job=owner.job!,schedule=vi.spyOn(engine['_authorTasks'],'schedule')
  replay.mockClear();hold=false
  await vi.waitFor(()=>expect(owner.orderParked).toBe(true))
  expect(owner.job).toBe(job);expect(owner.wake).toBeUndefined();expect(coordinator.presentationReady).toBe(false)
  expect(coordinator.checkpointReady).toBe(false);expect(coordinator.pending).toBe(true);expect(await engine.exportPNG()).toBeNull()
  const calls=schedule.mock.calls.length
  // One event-loop interval proves this is parked, not a polling render loop.
  await new Promise(resolve=>setTimeout(resolve,30))
  expect(schedule).toHaveBeenCalledTimes(calls)
  const duplicate=replay.mock.calls.filter(([request])=>request.source.kind==='straightRgba8'&&request.source.view.texture===raw)
  expect(duplicate).toHaveLength(0)
  expect(engine.hasActiveCanonicalAuthor()).toBe(false)
  const second=operations.slice(firstFrames.length)
  engine.appendOriginalRecorded(confirmed(h,second[0],firstFrames.length+1))
  expect(owner.job).toBe(job);expect(owner.orderParked).toBe(false);expect(owner.wake).toBeDefined()
  await vi.waitFor(()=>expect(entry.committed).toBe(true),{timeout:5000})
  for(let i=1;i<second.length;i++)engine.appendOriginalRecorded(confirmed(h,second[i],firstFrames.length+i+1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(engine['_log'].entries.map(e=>e.op.id)).toEqual(operations.map(op=>op.id));expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{hold=false;engine['_stepCanonicalLayer']=step;now.mockRestore();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
