import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {installBrushLibrary} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {CanonicalWashLayerCoordinator} from './src/dabs/CanonicalWashLayerCoordinator'
import {createTestEngine} from './testing/engineTestUtils'
import type {ServerToClientEvents} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
function original(){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:8,canvasHeight:8,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>true})
}
const descriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const preset='brush:'+descriptor.id+'@'+descriptor.version
const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
const pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=original(),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:8,pageHeight:8,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
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
it('shows real local pointer ink after BEGIN while preserving an empty journal until original confirmation',async()=>{
 let resolve!:(value:CanonicalStrokeBeginResult)=>void,request!:CanonicalStrokeBegin
 const begin=vi.fn((r:CanonicalStrokeBegin)=>{request=r;return new Promise<CanonicalStrokeBeginResult>(done=>{resolve=done})}),{engine,operations}=await harness(begin)
 try{
  expect((await engine.prepareBrush(preset)).status).toBe('ready')
  const preparedBytes=engine['_brushMipCache'].reservedBytes,draw=vi.spyOn(engine['gl'],'drawArrays'),entries=engine['_log'].entries
  const down=packet(1,100);engine['_onStart'](down);down.x=999;down.timeStamp=999;engine['_onMove'](packet(4,110));engine['_onEnd'](packet(4,120))
  expect(begin).toHaveBeenCalledTimes(1);expect(operations).toEqual([]);expect(draw).not.toHaveBeenCalled();expect(engine.hasActiveCanonicalAuthor()).toBe(true)
  resolve(verdict(request));await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  expect(operations.every(op=>op.type==='canonical_stroke'&&op.seq===undefined)).toBe(true);expect(engine['_log'].entries).toBe(entries);expect(entries).toHaveLength(0);await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000});expect(draw).toHaveBeenCalled();expect(engine['_canonicalLayerOwner']?.derived).toBeDefined();expect(engine['_canonicalLayerOwner']?.coordinator?.checkpointReady).toBe(false)
  expect(engine['_authorProducer']).toBeUndefined();expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(preparedBytes)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})
it('cancels queued pointer packets and aborts BEGIN without publishing stale late results',async()=>{
 let resolve!:(value:CanonicalStrokeBeginResult)=>void,request!:CanonicalStrokeBegin,signal!:AbortSignal
 const {engine,operations}=await harness((r,lifetime)=>{request=r;signal=lifetime.signal;return new Promise(done=>{resolve=done})})
 try{
  await engine.prepareBrush(preset);const preparedBytes=engine['_brushMipCache'].reservedBytes
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(4,110));engine.setTool('pencil')
  expect(signal.aborted).toBe(true);expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(engine['_authorInput'].pending).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(preparedBytes)
  resolve(verdict(request));await Promise.resolve();expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('rejects a non-native size before BEGIN/jobs and keeps every legacy writer closed with the author service present',async()=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin)=>verdict(r)),{engine,operations}=await harness(begin)
 try{
  await engine.prepareBrush(preset);engine.setSize(20);const before=engine['_brushMipCache'].reservedBytes
  expect(()=>engine['_onStart'](packet(1,100))).toThrow('not prepared/fixed');expect(begin).not.toHaveBeenCalled();expect(engine['_authorInput'].pending).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(before)
  expect(()=>engine.clear()).toThrow('read-only');expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy()}
})
it('rejects a mismatched BEGIN without emitting frames and releases all queued input/state charges',async()=>{
 const {engine,operations}=await harness(async request=>{const result=verdict(request);if(!result.ok)throw Error('fixture');return{...result,snapshot:{...result.snapshot,descriptorSha256:'f'.repeat(64)}}})
 try{
  await engine.prepareBrush(preset);const before=engine['_brushMipCache'].reservedBytes
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(4,110));engine['_onEnd'](packet(4,120))
  await vi.waitFor(()=>expect(engine['_authorInputError']).toBeDefined());expect(engine['_authorInput'].pending).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy()}
})
it('poisons an emitted prefix on tool change and requests repair only after all author/layer ownership retires',async()=>{
 const {engine,operations}=await harness(async request=>verdict(request)),repair=vi.fn(()=>{expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)})
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110))
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const entries=engine['_log'].entries,count=operations.length;engine.setTool('pencil')
  expect(repair).toHaveBeenCalledTimes(1);expect(repair.mock.results[0].type).toBe('return');expect(engine['_log'].entries).toBe(entries);expect(operations).toHaveLength(count);expect(engine['_canonicalPixelsReady']).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('refuses an active size sensor in the installed source before kernel preparation or BEGIN',async()=>{
 const selected=stock.rows.find(row=>row.index===8)!.descriptor as unknown as BrushDescriptor
 expect(selected.sourceStamp!.options.find(option=>option.id==='Size')!.checked).toBe(true)
 const begin=vi.fn(async(r:CanonicalStrokeBegin)=>verdict(r)),{engine}=await harness(begin,selected)
 try{
  const draw=vi.spyOn(engine['gl'],'drawArrays'),compile=vi.spyOn(engine['gl'],'createProgram'),bytes=engine['_brushMipCache'].reservedBytes
  await expect(engine.prepareBrush('brush:'+selected.id+'@'+selected.version)).rejects.toThrow('transform/sensor')
  expect(compile).not.toHaveBeenCalled();expect(draw).not.toHaveBeenCalled();expect(begin).not.toHaveBeenCalled();expect(engine['_brushMipCache'].reservedBytes).toBe(bytes)
 }finally{engine.destroy()}
})
it('closes a bounded captured input overflow before emitting and releases every pending CPU job',async()=>{
 const begin=vi.fn(()=>new Promise<CanonicalStrokeBeginResult>(()=>{})),{engine,operations}=await harness(begin)
 let release:(()=>void)|undefined
 try{
  await engine.prepareBrush(preset);const prepared=engine['_brushMipCache'].reservedBytes
  engine['_onStart'](packet(1,100));const occupied=engine['_brushMipCache'].reservedBytes
  const extra=engine['_brushMipCache'].budgetBytes-occupied-500;release=engine['_brushMipCache'].reserve(extra)
  expect(()=>engine['_onMove'](packet(4,110))).toThrow('budget');expect(engine['_authorInput'].pending).toBe(false);expect(engine['_authorProducer']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(prepared+extra);expect(operations).toEqual([]);expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{release?.();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('retires an older partially emitted stroke whose UP is dropped when a newer queued stroke is cancelled',async()=>{
 const {engine,operations}=await harness(async request=>verdict(request)),repair=vi.fn(()=>{expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)})
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110))
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  engine['_onMove'](packet(200,120));expect(engine['_authorInput'].pending).toBe(true)
  engine['_onEnd'](packet(200,130));engine['_onStart'](packet(1,140));const count=operations.length
  engine.setTool('pencil')
  expect(engine['_authorInput'].pending).toBe(false);expect(operations).toHaveLength(count);expect(repair).toHaveBeenCalledTimes(1);expect(repair.mock.results[0].type).toBe('return');expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('refuses the stale initial empty recovery cut after author emission even before a confirmed delivery arrives',async()=>{
 const {engine,operations}=await harness(async request=>verdict(request)),repair=vi.fn()
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const entries=engine['_log'].entries,scene=engine['_glSceneGeneration'],lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true)
  engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false);engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(repair).toHaveBeenCalledTimes(1));expect(engine['_glSceneGeneration']).toBe(scene);expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_log'].entries).toBe(entries);expect(entries).toHaveLength(0);expect(await engine.exportPNG()).toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('refuses the actual gamma-correction consumer on an installed source before preparation or BEGIN',async()=>{
 const selected:BrushDescriptor={...descriptor,id:'imported-222222222222222222222222',behavior:{...descriptor.behavior!,rendering:{...descriptor.behavior!.rendering!,gammaCorrect:true}}}
 const begin=vi.fn(async(r:CanonicalStrokeBegin)=>verdict(r)),{engine}=await harness(begin,selected)
 try{
  const allocate=vi.spyOn(engine['gl'],'createProgram'),before=engine['_brushMipCache'].reservedBytes
  await expect(engine.prepareBrush('brush:'+selected.id+'@'+selected.version)).rejects.toThrow('color-effect')
  expect(begin).not.toHaveBeenCalled();expect(allocate).not.toHaveBeenCalled();expect(engine['_authorInput'].pending).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(before)
 }finally{engine.destroy()}
})

it('promotes actual outgoing envelopes after UP and selection change without another source upload or CPU author',async()=>{
 let signal!:AbortSignal
 const h=await harness(async(request,lifetime)=>{signal=lifetime.signal;return verdict(request)}),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(operations.length).toBeGreaterThan(0);expect(engine['_log'].entries).toHaveLength(0);expect(signal.aborted).toBe(true)
  const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator!,prepass=owner.prepass
  expect(coordinator.presentationReady).toBe(true);expect(coordinator.checkpointReady).toBe(false)
  const uploads=vi.spyOn(engine['gl'],'texSubImage2D'),programs=vi.spyOn(engine['gl'],'createProgram')
  engine.setPencil('another-selection')
  for(let i=0;i<operations.length;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  expect(owner.coordinator).toBe(coordinator);expect(owner.prepass).toBe(prepass)
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(engine['_log'].entries.map(e=>e.op.id)).toEqual(operations.map(op=>op.id))
  expect(uploads).not.toHaveBeenCalled();expect(programs).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it.each(['resume','cancel']as const)('holds one encoded envelope under actual eight-frame local pressure and %s',async outcome=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 const originalStep=engine['_stepCanonicalLayer'],originalEnqueue=CanonicalWashLayerCoordinator.prototype.tryEnqueueLocal
 let hold=true
 const attempts:{operation:CanonicalStrokeOperation;accepted:boolean}[]=[]
 engine['_stepCanonicalLayer']=job=>{if(hold)engine['_scheduleCanonicalRebuild'](job);else originalStep.call(engine,job)}
 vi.spyOn(CanonicalWashLayerCoordinator.prototype,'tryEnqueueLocal').mockImplementation(function(this:CanonicalWashLayerCoordinator,author,operation){const accepted=originalEnqueue.call(this,author,operation);attempts.push({operation,accepted});return accepted})
 const repair=vi.fn(()=>{expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)})
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(200,110));engine['_onEnd'](packet(200,120))
  await vi.waitFor(()=>expect(attempts.some(a=>!a.accepted)).toBe(true),{timeout:5000})
  const waiting=attempts.find(a=>!a.accepted)!.operation
  expect(operations.some(op=>op.id===waiting.id)).toBe(false);expect(engine['_canonicalLayerOwner']?.coordinator?.queuedFrameCount).toBe(8)
  expect(attempts.filter(a=>!a.accepted).every(a=>a.operation===waiting)).toBe(true)
  if(outcome==='cancel'){
   engine.setTool('pencil');expect(repair).toHaveBeenCalledTimes(1);expect(repair.mock.results[0].type).toBe('return');expect(engine['_authorInput'].pending).toBe(false)
   expect(operations.some(op=>op.id===waiting.id)).toBe(false);expect(engine['_log'].entries).toHaveLength(0)
  }else{
   hold=false
   await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
   await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
   expect(attempts.filter(a=>a.accepted&&a.operation===waiting)).toHaveLength(1)
   expect(operations.filter(op=>op.id===waiting.id)).toHaveLength(1)
   expect(new Set(operations.map(op=>op.id)).size).toBe(operations.length)
   expect(engine['_log'].entries).toHaveLength(0);expect(repair).not.toHaveBeenCalled()
  }
 }finally{hold=false;engine['_stepCanonicalLayer']=originalStep;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('retires admitted local work before repair if its first RebuildJob wake throws before Outbox emission',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h,error=Error('local job schedule failed')
 const originalSchedule=engine['_scheduleCanonicalRebuild']
 const repair=vi.fn(()=>{expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)})
 engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset)
  engine['_scheduleCanonicalRebuild']=()=>{throw error}
  engine['_onStart'](packet(1,100))
  await vi.waitFor(()=>expect(engine['_authorInputError']).toBe(error),{timeout:5000})
  expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalPixelsReady']).toBe(false)
  expect(engine['_canonicalRecoveryDirty']).toBe(true);expect(repair).toHaveBeenCalledTimes(1);expect(repair.mock.results[0].type).toBe('return')
  expect(engine['_authorInput'].pending).toBe(false);expect(engine['_rebuildJobs'].size).toBe(0)
 }finally{engine['_scheduleCanonicalRebuild']=originalSchedule;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('retires an active pointer author before external repair after an actual local GPU draw fails',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h,error=Error('local deposition GPU failed')
 const observed:{cpu:number;inputPending:boolean;owner:boolean;jobs:number;reason:unknown}[]=[]
 engine['_onCanonicalRecoveryRequired']=reason=>{observed.push({cpu:engine['_brushMipCache'].reservedBytes,inputPending:engine['_authorInput'].pending,owner:!!engine['_canonicalLayerOwner'],jobs:engine['_rebuildJobs'].size,reason})}
 try{
  await engine.prepareBrush(preset)
  vi.spyOn(engine['_canonicalLayerOwner']!.composite,'drawSource').mockImplementation(()=>{throw error})
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(200,110))
  await vi.waitFor(()=>expect(observed.length).toBe(1),{timeout:5000})
  expect(observed).toEqual([{cpu:0,inputPending:false,owner:false,jobs:0,reason:error}]);expect(engine.hasActiveCanonicalAuthor()).toBe(false)
  expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_log'].entries).toHaveLength(0)
  expect(operations.every(op=>op.seq===undefined)).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})

it('defers repair until active FIFO next unwinds after accepted executor metadata fails owner recheck',async()=>{
 const h=await harness(async request=>verdict(request)),{engine}=h,error=Error('accepted local metadata became stale')
 const original=engine['_assertCanonicalLayerCurrent']
 const observed:{cpu:number;holds:number;pending:boolean;reason:unknown}[]=[]
 let injected=false
 engine['_onCanonicalRecoveryRequired']=reason=>{observed.push({cpu:engine['_brushMipCache'].reservedBytes,holds:engine['_canonicalSourceLifetimeHolds'],pending:engine['_authorInput'].pending,reason})}
 try{
  await engine.prepareBrush(preset)
  engine['_assertCanonicalLayerCurrent']=owner=>{
   original.call(engine,owner)
   const lane=owner.coordinator
   // During the accepted-work/post-enqueue check the executor has its new
   // frame, while the SAME coordinator has not yet published the queue slot.
   if(!injected&&lane?.['entries'].some(e=>e.local&&e.executor.pendingFrameCount>lane.queuedFrameCount)){injected=true;throw error}
  }
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(200,110))
  await vi.waitFor(()=>expect(observed.length).toBe(1),{timeout:5000})
  expect(injected).toBe(true);expect(observed).toEqual([{cpu:0,holds:0,pending:false,reason:error}]);expect(engine.hasActiveCanonicalAuthor()).toBe(false)
  expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine['_assertCanonicalLayerCurrent']=original;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})
