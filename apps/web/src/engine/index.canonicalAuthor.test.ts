import markerFixture from './src/presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {prepareSourceSeededDefaultAutoDab} from './src/presets/sourceDefaultAutoDab'
import {afterEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,type CanonicalStrokeRasterProfile,CANONICAL_STROKE_RASTER_PROFILE,isBrushLibrary,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,canonicalImageSourceBinding,canonicalImagePipeSourceBinding,canonicalSourceComposition,parseCanonicalStrokeCloseOperation,decodeCanonicalStrokeFrame,prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import mappedGaussian from '../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.mapped.native'
import basic6Image from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import mountainsImage from './src/presets/fixtures/sourceImagePipe/mountains.native.json'
import graphiteImage from './src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import {installBrushLibrary,installBrushPixels} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {SourceStrokeAuthor} from './src/presets/sourceStrokeAuthor'
import {CanonicalWashLayerCoordinator} from './src/dabs/CanonicalWashLayerCoordinator'
import {AccumulationBuffer} from './src/buffers/AccumulationBuffer'
import {snapshotContextStorage} from './src/buffers/ContextStorageOwner'
import * as brushGlBatch from './src/dabs/BrushGlBatch'
import {createTestEngine} from './testing/engineTestUtils'
import type {ServerToClientEvents} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
afterEach(()=>vi.restoreAllMocks())
function original(isCurrent=()=>true,page={width:8,height:8},profile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:page.width,canvasHeight:page.height,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},...(profile===CANONICAL_STROKE_RASTER_PROFILE?{}:{canonicalAuthorRasterProfile:profile}),canonicalReadScope:{roomId:'room',boardEpoch:2,...(profile===CANONICAL_STROKE_RASTER_PROFILE?{}:{allowedRasterProfiles:[profile]})},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent})
}
const descriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const preset='brush:'+descriptor.id+'@'+descriptor.version
const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
const pin=canonicalDefaultAutoSourceBinding(descriptor,sha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:sha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor,isCurrent=()=>true,page={width:8,height:8},profile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=original(isCurrent,page,profile),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:page.width,pageHeight:page.height,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
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

it('refuses Ratio dynamics before kernel preparation or BEGIN',async()=>{
 const base=stock.rows.find(row=>row.index===8)!.descriptor as unknown as BrushDescriptor
 const selected:BrushDescriptor={...base,id:base.id+'a',sourceStamp:{...base.sourceStamp!,options:base.sourceStamp!.options.map(option=>option.id==='Ratio'?{...option,checked:true}:option)}}
 expect(selected.sourceStamp!.options.find(option=>option.id==='Ratio')!.checked).toBe(true)
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

it('keeps an already presented open local wash unchanged on matching original confirmations, then displays the stable END handoff',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator!
  expect(operations.length).toBeGreaterThan(0);expect(coordinator.publishedPresentationReady).toBe(true)
  const revision=coordinator.completedPresentationRevision,display=vi.fn(engine['_displayIfNotSuspended'].bind(engine)),invalidate=vi.fn(engine['_invalidateSplitCache'].bind(engine))
  engine['_displayIfNotSuspended']=display;engine['_invalidateSplitCache']=invalidate
  const count=operations.length
  for(let i=0;i<count;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(owner.coordinator).toBe(coordinator);expect(coordinator.completedPresentationRevision).toBe(revision)
  expect(display).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled()
  expect(engine['_log'].entries).toHaveLength(count)
  engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  for(let i=count;i<operations.length;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(display).toHaveBeenCalled();expect(invalidate).toHaveBeenCalled();expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('still displays when original order reverses two actually prepared local washes',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset)
  for(let n=0;n<2;n++){
   engine['_onStart'](packet(1+n,100+n*100));engine['_onMove'](packet(5+n,110+n*100));engine['_onEnd'](packet(5+n,120+n*100))
   await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
   await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  }
  const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator!,revision=coordinator.completedPresentationRevision
  const ids=[...new Set(operations.filter(op=>op.type==='canonical_stroke').map(op=>op.frame.strokeId))]
  expect(ids).toHaveLength(2)
  const first=operations.filter(op=>op.type==='canonical_stroke'&&op.frame.strokeId===ids[0]),second=operations.filter(op=>op.type==='canonical_stroke'&&op.frame.strokeId===ids[1])
  const display=vi.fn(engine['_displayIfNotSuspended'].bind(engine));engine['_displayIfNotSuspended']=display
  for(let i=0;i<second.length;i++)engine.appendOriginalRecorded(confirmed(h,second[i],i+1))
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(owner.coordinator).toBe(coordinator);expect(coordinator.completedPresentationRevision).toBeGreaterThan(revision);expect(display).toHaveBeenCalled()
  for(let i=0;i<first.length;i++)engine.appendOriginalRecorded(confirmed(h,first[i],second.length+i+1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function actualBasic5(){
 const row=mappedGaussian.rows.find(r=>r.index===7);if(!row)throw Error('Missing actual mapped Basic5 SizeOpacity')
 const candidate:unknown={schemaVersion:1,brushes:[{descriptor:row.descriptor,name:'Basic5',source:'native.kpp',warnings:[]}],assets:[],skipped:[]}
 if(!isBrushLibrary(candidate))throw Error('Invalid real Basic5 metadata')
 installBrushLibrary(candidate)
 const brush=candidate.brushes[0].descriptor,data=brush.sourceStamp
 if(data?.version!==2||data.source.kind==='image')throw Error('Expected real auto source')
 return{preset:'brush:'+brush.id+'@'+brush.version,diameter:data.source.diameter}
}
it('grows the SAME warm workspace from actual Basic2 to Basic5 after a durable completed stroke without recompiling composite',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset)
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false))
  for(const [index,op] of operations.entries())engine.appendOriginalRecorded(confirmed(h,op,index+1))
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Missing actual owner')
  const journal=engine['_log'].entries,revision=engine['_log'].revision,stable=owner.stable,composite=owner.composite,prepass=owner.prepass,resources=composite.preparedResources(),oldWidth=owner.mask.width,epoch=owner.prepass.preparedCapacity().epoch,compile=vi.spyOn(engine['gl'],'createProgram')
  const {preset:newPreset,diameter}=actualBasic5()
  engine.setPencil(newPreset);engine.setSize(diameter)
  expect(await engine.prepareBrush(newPreset)).toEqual({status:'ready'})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite);expect(owner.stable).toBe(stable)
  expect(owner.mask.width).toBeGreaterThan(oldWidth);expect(owner.prepass.preparedCapacity().epoch).not.toBe(epoch);expect(composite.preparedResources()).toEqual(resources)
  expect(compile).not.toHaveBeenCalled() // Both prepass and composite shaders stay warm.
  expect(engine['_log'].entries).toBe(journal);expect(engine['_log'].revision).toBe(revision);expect(engine['_canonicalExportReady']()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('rejects growth while a real unconfirmed local wash is retained, preserving its owner, program and original prefix',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h,repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false))
  const coordinator=owner.coordinator,author=engine['_canonicalPreparedAuthor'],journal=engine['_log'].entries,resources=owner.prepass.preparedResources(),reset=vi.spyOn(owner.prepass,'reset'),bytes=engine['_brushMipCache'].reservedBytes,next=actualBasic5()
  engine.setPencil(next.preset);engine.setSize(next.diameter)
  await expect(engine.prepareBrush(next.preset)).rejects.toThrow('workspace busy')
  expect(reset).not.toHaveBeenCalled();expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.coordinator).toBe(coordinator);expect(owner.prepass.preparedResources()).toEqual(resources);expect(engine['_canonicalPreparedAuthor']).toBe(author)
  expect(engine['_log'].entries).toBe(journal);expect(engine['_brushMipCache'].reservedBytes).toBe(bytes);expect(repair).not.toHaveBeenCalled()
  for(const [index,op] of operations.entries())engine.appendOriginalRecorded(confirmed(h,op,index+1))
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  expect(await engine.prepareBrush(next.preset)).toEqual({status:'ready'});expect(engine['_canonicalLayerOwner']).toBe(owner)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('keeps the complete previous workspace and author ready after growth allocation failure and permits retry',async()=>{
 const {engine}=await harness(async request=>verdict(request))
 try{
  await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  const stable=owner.stable,journal=engine['_log'].entries,composite=owner.composite.preparedResources(),error=new Error('growth allocation'),next=actualBasic5(),allocate=vi.spyOn(engine['gl'],'createTexture').mockImplementationOnce(()=>{throw error})
  engine.setPencil(next.preset);engine.setSize(next.diameter)
  await expect(engine.prepareBrush(next.preset)).rejects.toBe(error)
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.stable).toBe(stable);expect(engine['_log'].entries).toBe(journal);expect(owner.prepared).toBe(true);expect(engine['_canonicalPreparedAuthor']).toBeDefined();expect(owner.prepass.isReady()).toBe(true);expect(owner.composite.preparedResources()).toEqual(composite)
  expect(await engine.prepareBrush(next.preset)).toEqual({status:'ready'});expect(allocate).toHaveBeenCalled();expect(owner.composite.preparedResources()).toEqual(composite)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not publish ready when the original lifetime expires after actual larger prepass allocation',async()=>{
 let current=true
 const {engine}=await harness(async request=>verdict(request),descriptor,()=>current)
 try{
  await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  const prepare=owner.prepass.prepareCapacityUpdate.bind(owner.prepass),composite=owner.composite.preparedResources(),next=actualBasic5()
  vi.spyOn(owner.prepass,'prepareCapacityUpdate').mockImplementationOnce((...args)=>{const result=prepare(...args);current=false;return result})
  engine.setPencil(next.preset);engine.setSize(next.diameter)
  await expect(engine.prepareBrush(next.preset)).rejects.toThrow()
  expect(owner.prepared).toBe(true);expect(engine['_canonicalPreparedAuthor']).toBeDefined();expect(owner.prepass.isReady()).toBe(true);expect(owner.composite.preparedResources()).toEqual(composite)
  current=true;expect(await engine.prepareBrush(next.preset)).toEqual({status:'ready'})
 }finally{current=true;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('requires the same idle boundary on explicit retry after a failed growth, before touching any still-owned workspace',async()=>{
 const {engine}=await harness(async request=>verdict(request))
 try{
  await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  const next=actualBasic5(),error=new Error('first allocation'),composite=owner.composite.preparedResources(),journal=engine['_log'].entries
  vi.spyOn(engine['gl'],'createTexture').mockImplementationOnce(()=>{throw error})
  engine.setPencil(next.preset);engine.setSize(next.diameter);await expect(engine.prepareBrush(next.preset)).rejects.toBe(error)
  expect(owner.prepared).toBe(true)
  // Actual existing admission seam creates the same coordinator/derived owner;
  // a retry cannot assume the preserved ready workspace has no active cycle.
  expect(engine['_ensureCanonicalLayerCoordinator'](owner)).toBe(owner.coordinator)
  const derived=owner.derived,reset=vi.spyOn(owner.prepass,'reset');expect(derived).toBeDefined()
  await expect(engine.prepareBrush(next.preset)).rejects.toThrow('workspace busy')
  expect(reset).not.toHaveBeenCalled();expect(owner.derived).toBe(derived);expect(owner.composite.preparedResources()).toEqual(composite);expect(engine['_log'].entries).toBe(journal)
  expect(engine['_retireCanonicalLayerCycle'](owner,false)).toEqual([])
  expect(await engine.prepareBrush(next.preset)).toEqual({status:'ready'})
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('prewarms the SAME one-tile stable and pooled raw targets before ready without BEGIN or a coordinator, then first physical work reuses them',async()=>{
 const begin=vi.fn(async request=>verdict(request)),{engine,operations}=await harness(begin)
 try{
  const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  const journal=engine['_log'].entries,revision=engine['_log'].revision,pool=engine['_ribbonScratchPool']
  await engine.prepareBrush(preset)
  expect(owner.stable.tileCount).toBe(1);expect(pool.bytes).toEqual({live:0,free:8*8*4})
  expect(begin).not.toHaveBeenCalled();expect(operations).toEqual([]);expect(owner.coordinator).toBeUndefined();expect(owner.derived).toBeUndefined();expect(owner.job).toBeUndefined();expect(owner.outstanding).toBe(0)
  const stable=owner.stable.gpuAllocationSnapshot()[0].buffer,raw=pool.gpuAllocationSnapshot().find(row=>row.state==='free')?.buffer
  expect(raw).toBeDefined();expect(raw).not.toBe(stable)
  const allocate=vi.spyOn(engine['gl'],'createTexture'),targets:unknown[]=[],scratches:unknown[]=[],coldTarget=vi.fn(),coldScratch=vi.fn(),prepareTargets=owner.stable.preparePaintTargetRects.bind(owner.stable),prepareScratch=pool.prepareAcquisition.bind(pool)
  vi.spyOn(owner.stable,'preparePaintTargetRects').mockImplementation(rects=>{const plan=prepareTargets(rects);return{...plan,take(index){const before=allocate.mock.calls.length,target=plan.take(index);if(allocate.mock.calls.length!==before)coldTarget();return target},takeResident(index){const target=plan.takeResident(index);if(target)targets.push(target.buffer);return target}}})
  let scratchPlans=0
  vi.spyOn(pool,'prepareAcquisition').mockImplementation(requests=>{const plan=prepareScratch(requests),first=++scratchPlans===1;return{...plan,take(index){const before=allocate.mock.calls.length,buffer=plan.take(index);if(first&&allocate.mock.calls.length!==before)coldScratch();return buffer},takeResident(index){const buffer=plan.takeResident(index);if(first&&buffer)scratches.push(buffer);return buffer}}})
  expect(engine['_log'].entries).toBe(journal);expect(engine['_log'].revision).toBe(revision)
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(scratches).toContain(raw),{timeout:5000})
  expect(targets).toContain(stable);expect(coldTarget).not.toHaveBeenCalled();expect(coldScratch).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_ribbonScratchPool'].bytes).toEqual({live:0,free:0})}
})
it('cancels between actual stable and scratch prewarm stages without publishing ready or keeping a live pool borrow',async()=>{
 const begin=vi.fn(async request=>verdict(request)),{engine,operations}=await harness(begin),controller=new AbortController()
 try{
  const result=await engine.prepareBrush(preset,{signal:controller.signal,onProgress:done=>{if(done===2)controller.abort()}})
  expect(result.status).toBe('cancelled');expect(engine['_canonicalPreparedAuthor']).toBeUndefined()
  expect(engine['_canonicalLayerOwner']?.stable.tileCount).toBe(1);expect(engine['_ribbonScratchPool'].bytes).toEqual({live:0,free:0})
  expect(begin).not.toHaveBeenCalled();expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not clear existing stable content or grow retained buffers when repeating source preparation after a durable gesture',async()=>{
 const h=await harness(async request=>verdict(request)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false))
  for(const [index,op]of operations.entries())engine.appendOriginalRecorded(confirmed(h,op,index+1))
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Missing owner')
  const stable=owner.stable.gpuAllocationSnapshot()[0].buffer,clear=vi.spyOn(stable,'clear'),pool=engine['_ribbonScratchPool'],before=pool.bytes,journal=engine['_log'].entries,compile=vi.spyOn(engine['gl'],'createProgram')
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'})
  expect(clear).not.toHaveBeenCalled();expect(pool.bytes).toEqual(before);expect(compile).not.toHaveBeenCalled();expect(engine['_log'].entries).toBe(journal);expect(owner.coordinator).toBeUndefined();expect(owner.derived).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('skips optional prewarm for a compatible brush while a real unconfirmed local wash remains owned',async()=>{
 const {engine,operations}=await harness(async request=>verdict(request)),repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false))
  const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  // CPU UP completion does not imply the existing painter job has drained.
  // Observe only preparation effects, with the unconfirmed wash still owned.
  await vi.waitFor(()=>expect(owner.job).toBeUndefined(),{timeout:5000})
  expect(owner.coordinator?.checkpointReady).toBe(false)
  const coordinator=owner.coordinator,targets=vi.spyOn(owner.stable,'preparePaintTargetRects'),pool=engine['_ribbonScratchPool'],scratch=vi.spyOn(pool,'prepareAcquisition'),count=operations.length,journal=engine['_log'].entries
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'})
  expect(targets).not.toHaveBeenCalled();expect(scratch).not.toHaveBeenCalled();expect(owner.coordinator).toBe(coordinator);expect(engine['_log'].entries).toBe(journal);expect(operations).toHaveLength(count);expect(repair).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('restores hostile caller GL and closes the real scratch reservation after an external release callback throws',async()=>{
 const {engine}=await harness(async request=>verdict(request)),gl=engine['gl'],pool=engine['_ribbonScratchPool'],error=new Error('release observer'),foreign=gl.createTexture()
 try{
  const turn=brushGlBatch.runBrushGlTurn,restored:{active:unknown;texture:unknown}[]=[]
  vi.spyOn(brushGlBatch,'runBrushGlTurn').mockImplementation((options,execute)=>{
   gl.activeTexture(gl.TEXTURE0+2);gl.bindTexture(gl.TEXTURE_2D,foreign)
   try{return turn(options,execute)}finally{restored.push({active:gl.getParameter(gl.ACTIVE_TEXTURE),texture:gl.getParameter(gl.TEXTURE_BINDING_2D)})}
  })
  const release=pool.release.bind(pool),prepare=pool.prepareAcquisition.bind(pool),close=vi.fn()
  vi.spyOn(pool,'release').mockImplementationOnce(buffer=>{release(buffer);gl.activeTexture(gl.TEXTURE0+1);throw error})
  vi.spyOn(pool,'prepareAcquisition').mockImplementation(requests=>{const plan=prepare(requests);return{...plan,close(){close();plan.close()}}})
  await expect(engine.prepareBrush(preset)).rejects.toBe(error)
  expect(close).toHaveBeenCalledOnce();expect(pool.bytes.live).toBe(0);expect(snapshotContextStorage(gl).reservedBytes).toBe(0);expect(engine['_canonicalPreparedAuthor']).toBeUndefined()
  expect(restored).toEqual([{active:gl.TEXTURE0+2,texture:foreign},{active:gl.TEXTURE0+2,texture:foreign}])
 }finally{gl.deleteTexture(foreign);engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('does not publish ready when the original owner expires between prewarm jobs',async()=>{
 let current=true
 const {engine,operations}=await harness(async request=>verdict(request),descriptor,()=>current)
 try{
  await expect(engine.prepareBrush(preset,{onProgress:done=>{if(done===2)current=false}})).rejects.toThrow()
  expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_ribbonScratchPool'].bytes.live).toBe(0);expect(snapshotContextStorage(engine['gl']).reservedBytes).toBe(0);expect(operations).toEqual([])
 }finally{current=true;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('retires a real borrowed warm scratch safely when context loss happens synchronously during its clear',async()=>{
 const {engine}=await harness(async request=>verdict(request)),pool=engine['_ribbonScratchPool'],gl=engine['gl'],clear=AccumulationBuffer.prototype.clear,deleted=vi.spyOn(gl,'deleteTexture')
 let lost=false,deletesAfterLoss=0
 try{
  vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){
   clear.call(this)
   if(!lost&&pool.gpuAllocationSnapshot().some(row=>row.buffer===this&&row.state==='live')){lost=true;engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));deletesAfterLoss=deleted.mock.calls.length}
  })
  expect(await engine.prepareBrush(preset)).toEqual({status:'cancelled'})
  expect(lost).toBe(true);expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(pool.bytes).toEqual({live:0,free:0});expect(snapshotContextStorage(gl).reservedBytes).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(deleted).toHaveBeenCalledTimes(deletesAfterLoss)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('keeps the lazy target path for a bounded page that spans more than one actual fine tile',async()=>{
 const {engine}=await harness(async request=>verdict(request),descriptor,()=>true,{width:2048,height:8})
 try{
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'})
  const owner=engine['_canonicalLayerOwner'];if(!owner)throw Error('Owner missing')
  expect(owner.stable.tileWidth).toBe(1024);expect(owner.stable.tileCount).toBe(0);expect(engine['_ribbonScratchPool'].bytes).toEqual({live:0,free:0});expect(owner.coordinator).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

it('keeps shared same-preset prewarm alive when only one preparation subscriber aborts',async()=>{
 const {engine}=await harness(async request=>verdict(request)),controller=new AbortController()
 try{
  const first=engine.prepareBrush(preset,{signal:controller.signal,onProgress:done=>{if(done===1)controller.abort()}}),second=engine.prepareBrush(preset)
  const results=await Promise.all([first,second])
  expect(results).toEqual([{status:'cancelled'},{status:'ready'}]);expect(engine['_canonicalPreparedAuthor']?.preset).toBe(preset);expect(engine['_ribbonScratchPool'].bytes).toEqual({live:0,free:8*8*4})
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

for(const [name,fixture,nativeSize]of [['Basic6',basic6Image,7.5],['Mountains',mountainsImage,360],['Graphite',graphiteImage,16]]as const)it(`authors actual ${name} nonempty local image packets with full original server material`,async()=>{
 const selected=fixture.descriptor as unknown as BrushDescriptor,assets='asset'in fixture?[fixture.asset]:fixture.assets,metadata=assets.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),selectedPreset=`brush:${selected.id}@${selected.version}`,binding=selected.tip.animation?canonicalImagePipeSourceBinding(selected,metadata):canonicalImageSourceBinding(selected,metadata[0]),digest=createHash('sha256').update(canonicalBrushDescriptorJSON(selected)).digest('hex')
 const library:unknown={schemaVersion:1,brushes:[{descriptor:selected,name,source:'original-native',warnings:[]}],assets:metadata,skipped:[]};if(!isBrushLibrary(library))throw Error('Invalid original image library');installBrushLibrary(library)
 for(const a of assets){const bytes=new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size}));expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(a.id);installBrushPixels(a.id,bytes)}
 const begin=vi.fn(async(request:CanonicalStrokeBegin):Promise<CanonicalStrokeBeginResult>=>({ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:digest,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{...canonicalSourceComposition(selected)!,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:binding.assets,materialVersion:2,material:{version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}))
 const h=await harness(begin,selected,()=>true,{width:512,height:512}),{engine,operations}=h,repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
 try{
  if(name==='Mountains'){const available:unknown={schemaVersion:1,brushes:[{descriptor,name:'Basic2',source:'native',warnings:[]},{descriptor:selected,name,source:'native',warnings:[]}],assets:metadata,skipped:[]};if(!isBrushLibrary(available))throw Error('Invalid original union library');installBrushLibrary(available);engine.setPencil(preset);engine.setSize(40);await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});engine.setPencil(selectedPreset)}
  engine.setSize(nativeSize);await expect(engine.prepareBrush(selectedPreset)).resolves.toEqual({status:'ready'})
  const bank=engine['_canonicalLayerOwner']!.bank!;expect(bank.jobs).toHaveLength(assets.length*(name==='Basic6'?5:name==='Graphite'?6:11))
  const uploads=vi.spyOn(engine['gl'],'texImage2D'),programs=vi.spyOn(engine['gl'],'createProgram');await expect(engine.prepareBrush(selectedPreset)).resolves.toEqual({status:'ready'});expect(uploads).not.toHaveBeenCalled();expect(programs).not.toHaveBeenCalled()
  engine['_onStart']({...packet(40,100),y:80,pressure:1});engine['_onMove']({...packet(name==='Mountains'?2040:240,1100),y:80,pressure:1});engine['_onEnd']({...packet(name==='Mountains'?2040:240,1200),y:80,pressure:1})
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:20000});expect(engine['_authorInputError']).toBeUndefined();expect(operations.length).toBeGreaterThan(0);expect(begin).toHaveBeenCalledOnce()
  const frames=operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke'),snapshot=h.snapshots.get(frames[0].frame.strokeId)!,decoded=frames.map(op=>decodeCanonicalStrokeFrame(op.frame,{...snapshot,frameOrdinal:op.frame.frameOrdinal}).frame)
  expect(decoded.reduce((n,f)=>n+f.draws.length,0)).toBeGreaterThan(0);expect(snapshot.material.primarySource).toEqual(binding.primarySource);expect(snapshot.assets).toEqual(binding.assets);expect(engine['_log'].entries).toHaveLength(0)
  expect(repair).not.toHaveBeenCalled();const local=engine['_canonicalLayerOwner']!.coordinator!['entries'][0].local!;expect(local.author.snapshot.assets).toEqual(binding.assets);expect(local.author.snapshot.material.primarySource).toEqual(binding.primarySource)
  for(const [i,op]of operations.entries()){const input=confirmed(h,op,i+1);await engine.prepareOriginalRecorded(input);engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:20000});expect(engine['_canonicalExportReady']()).toBe(true);expect(engine['_log'].entries.every((e,i)=>e.serverSeq===i+1&&e.canonicalInput?.operation.id===operations[i].id)).toBe(true)
  if(name==='Basic6'){
   const before=operations.length,owner=engine['_canonicalLayerOwner'];engine['_onStart']({...packet(40,1300),y:80});engine['_onMove']({...packet(80,1400),y:80});await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(before));
   engine['_onEnd']({...packet(80,1500),y:80,cancelled:true});const close=operations.at(-1)!;if(close.type!=='canonical_stroke_close')throw Error('Missing actual image partialclose')
   const partial=operations.slice(before,-1);expect(close.recordedNext).toBe(partial.length);expect(close.firstFrameOpId).toBe(partial[0].id);expect(close.lastFrameOpId).toBe(partial.at(-1)!.id);expect(engine['_canonicalLayerOwner']).toBe(owner)
   for(const [i,op]of partial.entries()){const input=confirmed(h,op,before+i+1);await engine.prepareOriginalRecorded(input);engine.appendOriginalRecorded(input)}
   const seal=attachCanonicalRecordedDelivery({operation:parseCanonicalStrokeCloseOperation({...close,seq:operations.length})},h.p.canonicalRead.scope);if(!('delivery'in seal))throw Error('Missing genuine close delivery');await engine.prepareOriginalRecorded(seal);engine.appendOriginalRecorded(seal)
   await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:20000});expect(repair).not.toHaveBeenCalled();expect(engine['_canonicalExportReady']()).toBe(true)
  }

 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

it.each(['outerAssets','crop','frames']as const)('rejects image BEGIN %s mismatch before creating a local source',async mode=>{
 const data=mode==='frames'?mountainsImage:basic6Image,selected=data.descriptor as unknown as BrushDescriptor,assets='asset'in data?[data.asset]:data.assets,metadata=assets.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),library:unknown={schemaVersion:1,brushes:[{descriptor:selected,name:'Original image',source:'native',warnings:[]}],assets:metadata,skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid original image library');installBrushLibrary(library);for(const a of assets)installBrushPixels(a.id,new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size})))
 const pin=selected.tip.animation?canonicalImagePipeSourceBinding(selected,metadata):canonicalImageSourceBinding(selected,metadata[0]),begin=vi.fn(async(request:CanonicalStrokeBegin):Promise<CanonicalStrokeBeginResult>=>{
  const changed=mode==='crop'?pin.assets.map((a,i)=>i?a:{...a,x:a.x+1}):pin.assets,primarySource=mode==='frames'?{...pin.primarySource,frames:[...pin.primarySource.frames!].reverse()}:pin.primarySource
  return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(selected)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{...canonicalSourceComposition(selected)!,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity},assets:mode==='outerAssets'?[]:changed,materialVersion:2,material:{version:2,primarySource,assets:changed,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}
 })
 const {engine,operations}=await harness(begin,selected,()=>true,{width:512,height:512}),preset=`brush:${selected.id}@${selected.version}`
 try{
  engine.setSize(Math.max(selected.sourceStamp!.brush.width,selected.sourceStamp!.brush.height)*selected.sourceStamp!.brush.scale);await engine.prepareBrush(preset);const before=engine['_brushMipCache'].reservedBytes,source=vi.spyOn(SourceStrokeAuthor.prototype,'createState')
  engine['_onStart']({...packet(40,100),y:80});engine['_onMove']({...packet(80,200),y:80});engine['_onEnd']({...packet(80,300),y:80});await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  expect(engine['_authorInputError']).toBeDefined();expect(operations).toHaveLength(0);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(source).not.toHaveBeenCalled()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('cancels auto growth after work progress without publishing a new workspace or retiring the old author',async()=>{
 const {engine}=await harness(async request=>verdict(request)),controller=new AbortController()
 try{await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner']!,epoch=owner.prepass.preparedCapacity().epoch,author=engine['_canonicalPreparedAuthor'],next=actualBasic5();engine.setPencil(next.preset);engine.setSize(next.diameter);await expect(engine.prepareBrush(next.preset,{signal:controller.signal,onProgress:n=>{if(n===1)controller.abort()}})).resolves.toEqual({status:'cancelled'});expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).toBe(author);expect(owner.prepared).toBe(true);expect(await engine.prepareBrush(next.preset)).toEqual({status:'ready'})}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})

function markerDescriptor(){const library:unknown={schemaVersion:1,brushes:[markerFixture.imported],assets:[],skipped:[]};if(!isBrushLibrary(library))throw Error('Invalid original Marker');return library.brushes[0].descriptor}
const marker=markerDescriptor(),markerPreset=`brush:${marker.id}@${marker.version}`,markerSHA=createHash('sha256').update(canonicalBrushDescriptorJSON(marker)).digest('hex'),markerPin=canonicalDefaultAutoSourceBinding(marker,markerSHA,D,G)
function markerVerdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{
 const result=verdict(request);if(!result.ok||!('materialVersion'in result.snapshot))throw Error('Expected fixture grant')
 return{...result,snapshot:{...result.snapshot,descriptorSha256:markerSHA,rasterProfile:G,material:{...result.snapshot.material,primarySource:markerPin}}}
}
function markerPacket(i:number):PointerData{const p=markerFixture.packets[i];return{...packet(p.x,100+p.t),y:p.y,pressure:p.pressure,tiltX:p.tiltX,tiltY:p.tiltY}}
it('authors actual tilted Marker locally only after exact D BEGIN and promotes originals without generating masks again',async()=>{
 let resolve!:(v:CanonicalStrokeBeginResult)=>void,request!:CanonicalStrokeBegin
 const begin=vi.fn((r:CanonicalStrokeBegin)=>{request=r;return new Promise<CanonicalStrokeBeginResult>(done=>{resolve=done})}),h=await harness(begin,marker,()=>true,{width:64,height:64},G),{engine,operations}=h
 try{
  engine.setSize(35);expect(await engine.prepareBrush(markerPreset)).toMatchObject({status:'ready'})
  const owner=engine['_canonicalLayerOwner']!,prepass=owner.prepass
  expect(owner.mask).toEqual({width:54,height:54,slots:1});expect(engine['_canonicalPreparedAuthor']?.material).toMatchObject({kind:'auto',pin:{coverageProfile:D}})
  const ink=vi.spyOn(owner.composite,'drawSource'),plan=vi.spyOn(SourceStrokeAuthor.prototype,'plan'),generation=prepass.beginAutoGeneration.bind(prepass),upload=engine['gl'].texSubImage2D.bind(engine['gl'])
  const masks=new Map<number,{width:number;expected:Uint8Array;actual:number[]}>();let active:ReturnType<typeof masks.get>
  vi.spyOn(prepass,'beginAutoGeneration').mockImplementation(r=>{
   const m=r.material
   if('kind'in m&&m.kind==='canonicalAuto'&&m.recipe.kind==='defaultAuto'&&m.recipe.coverageProfile===D){
    const q=m.recipe,identity='densityIdentity'in m?m.densityIdentity:undefined;if(!identity)throw Error('Missing original density identity')
    expect(identity.gestureId).toBe(request.strokeId)
    if(!masks.has(identity.drawOrdinal)){const prepared=prepareSourceSeededDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',coverageProfile:D,tip:{...q.source,kind:'auto',softness:1,spikes:2,randomness:0},storedScale:q.brushScale,storedAngle:q.brushAngle,shape:{scale:q.scale,ratio:q.ratio,rotation:q.rotation},subpixelX:q.subX,subpixelY:q.subY,maxPixels:1048576,maxWorkSamples:16*1048576},identity),expected=new Uint8Array(prepared.evaluator.pixels);try{while(!prepared.evaluator.done)prepared.evaluator.advance(expected,prepared.evaluator.completedPixels,65536)}finally{prepared.evaluator.cancel()}masks.set(identity.drawOrdinal,{width:q.width,expected,actual:[]})}
    active=masks.get(identity.drawOrdinal)
   }
   return generation(r)
  })
  const observe=(args:readonly unknown[])=>{const data=args[8];if(active&&data instanceof Uint8Array&&args[4]===active.width&&typeof args[5]==='number')for(let i=0;i<active.width*args[5];i++)active.actual.push(data[i*4])}
  const uploadSpy=vi.spyOn(engine['gl'],'texSubImage2D').mockImplementation((...args)=>{observe(args);return upload(...args)})
  engine['_onStart'](markerPacket(0));for(let i=1;i<markerFixture.packets.length;i++)engine['_onMove'](markerPacket(i));engine['_onEnd'](markerPacket(markerFixture.packets.length-1))
  expect(begin).toHaveBeenCalledOnce();expect(ink).not.toHaveBeenCalled();expect(plan).not.toHaveBeenCalled();expect(operations).toEqual([])
  resolve(markerVerdict(request))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:10000});await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:10000})
  expect(engine['_authorInputError']).toBeUndefined();expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)
  expect(plan).toHaveBeenCalledTimes(markerFixture.packets.length)
  expect(plan.mock.calls.map(([,p])=>({tiltX:p.tiltX,tiltY:p.tiltY,offset:p.tiltDirectionOffset,canvas:p.canvasRotation}))).toEqual(markerFixture.packets.map(p=>({tiltX:p.tiltX,tiltY:p.tiltY,offset:0,canvas:0})))
  expect(masks.size).toBe(17);for(const m of masks.values())expect(m.actual).toEqual(Array.from(m.expected))
  expect(engine['_log'].entries).toHaveLength(0);expect(owner.coordinator?.presentationReady).toBe(true);expect(owner.coordinator?.checkpointReady).toBe(false)
  const count=masks.size,uploads=uploadSpy.mock.calls.length
  engine.setPencil('other-selection')
  for(let i=0;i<operations.length;i++)engine.appendOriginalRecorded(confirmed(h,operations[i],i+1))
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:5000})
  expect(masks.size).toBe(count);expect(uploadSpy.mock.calls.length).toBe(uploads);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_log'].entries.map(e=>e.op.id)).toEqual(operations.map(op=>op.id))
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
})
it.each(['disabled','mismatched'] as const)('keeps D %s BEGIN from publishing local ink, outgoing frames or journal',async mode=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin):Promise<CanonicalStrokeBeginResult>=>{if(mode==='disabled')return{ok:false,reason:'invalid_operation'};const v=markerVerdict(r);if(!v.ok||!('materialVersion'in v.snapshot))throw Error('Expected grant');return{...v,snapshot:{...v.snapshot,descriptorSha256:'f'.repeat(64)}}}),h=await harness(begin,marker,()=>true,{width:64,height:64},G),{engine,operations}=h
 try{
  engine.setSize(35);await engine.prepareBrush(markerPreset);const owner=engine['_canonicalLayerOwner']!,before=engine['_brushMipCache'].reservedBytes,ink=vi.spyOn(owner.composite,'drawSource')
  engine['_onStart'](markerPacket(0));engine['_onMove'](markerPacket(1));engine['_onEnd'](markerPacket(1))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  expect(begin).toHaveBeenCalledOnce();expect(ink).not.toHaveBeenCalled();expect(operations).toEqual([]);expect(engine['_log'].entries).toHaveLength(0);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBe(before)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('rejects invalid first D tilt and rotated camera before BEGIN and preserves the prepared source',async()=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin)=>markerVerdict(r)),{engine,operations}=await harness(begin,marker,()=>true,{width:64,height:64},G)
 try{
  engine.setSize(35);await engine.prepareBrush(markerPreset);const before=engine['_brushMipCache'].reservedBytes,prepared=engine['_canonicalPreparedAuthor']
  for(const tiltX of [NaN,Infinity,91,-91])expect(()=>engine['_onStart']({...markerPacket(0),tiltX})).toThrow('tilt')
  engine.setViewport(0,0,1,.2);expect(()=>engine['_onStart'](markerPacket(0))).toThrow('not prepared/fixed')
  expect(begin).not.toHaveBeenCalled();expect(operations).toEqual([]);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(before)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
it('keeps G2 busy Basic2 intact before growing the SAME idle owner to D Marker',async()=>{
 const begin=vi.fn(async(r:CanonicalStrokeBegin):Promise<CanonicalStrokeBeginResult>=>{if(r.brush===markerPreset)return markerVerdict(r);const v=verdict(r);if(!v.ok||!('materialVersion'in v.snapshot))throw Error('Expected grant');return{...v,snapshot:{...v.snapshot,rasterProfile:G}}}),h=await harness(begin,descriptor,()=>true,{width:64,height:64},G),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);const owner=engine['_canonicalLayerOwner']!;
  engine['_onStart'](packet(20,100));engine['_onMove'](packet(30,120));engine['_onEnd'](packet(30,140))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false));await vi.waitFor(()=>expect(engine['_rebuildJobs'].size).toBe(0),{timeout:5000})
  expect(operations.length).toBeGreaterThan(0);expect(owner.coordinator?.checkpointReady).toBe(false)
  const previous=engine['_canonicalPreparedAuthor'],epoch=owner.prepass.preparedCapacity().epoch,bytes=engine['_brushMipCache'].reservedBytes,stable=owner.stable,composite=owner.composite,prepass=owner.prepass,journal=engine['_log'].entries
  installBrushLibrary({schemaVersion:1,brushes:[{descriptor:marker,name:'Marker',source:'native',warnings:[]}],assets:[],skipped:[]});engine.setPencil(markerPreset);engine.setSize(35)
  await expect(engine.prepareBrush(markerPreset)).rejects.toThrow('workspace busy')
  expect(engine['_canonicalPreparedAuthor']).toBe(previous);expect(owner.mask.width).toBe(41);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_brushMipCache'].reservedBytes).toBe(bytes);expect(engine['_log'].entries).toBe(journal);expect(begin).toHaveBeenCalledOnce()
  for(const [i,op]of operations.entries())engine.appendOriginalRecorded(confirmed(h,op,i+1))
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:5000})
  const committed=engine['_log'].entries,compile=vi.spyOn(engine['gl'],'createProgram')
  expect(await engine.prepareBrush(markerPreset)).toEqual({status:'ready'})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.stable).toBe(stable);expect(owner.composite).toBe(composite);expect(owner.prepass).toBe(prepass);expect(owner.mask).toEqual({width:54,height:54,slots:1});expect(engine['_log'].entries).toBe(committed);expect(compile).not.toHaveBeenCalled();expect(begin).toHaveBeenCalledOnce()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
})
