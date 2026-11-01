import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {parseCanonicalStrokeCloseOperation,CANONICAL_STROKE_RASTER_PROFILE,canonicalBrushDescriptorJSON,canonicalDefaultAutoSourceBinding,prepareCanonicalRecordedAttachment,type CanonicalStrokeRasterProfile,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type BrushDescriptor,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {installBrushLibrary} from './src/presets/importedBrushes'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
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
async function harness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=descriptor,isCurrent=()=>true,page={width:8,height:8},profile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE,onIdle?:()=>void,initial?:ReturnType<typeof original>){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=initial??original(isCurrent,page,profile),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:page.width,pageHeight:page.height,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op),onCanonicalAuthorIdle:onIdle},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
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

async function author(h:Awaited<ReturnType<typeof harness>>,time=100,promote=true){
 const {engine,operations}=h,start=operations.length
 engine['_onStart'](packet(1,time));engine['_onMove'](packet(5,time+10));engine['_onEnd'](packet(5,time+20))
 await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
 const frames=operations.slice(start).filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke');expect(frames.length).toBeGreaterThan(0)
 if(promote){for(const op of frames)engine.appendOriginalRecorded(confirmed(h,op,engine['_log'].entries.length+1));await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000})}
 return frames
}
it('emits one undo candidate for the whole latest original ended gesture without changing journal or pixels',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);await author(h);const second=await author(h,200),journal=engine['_log'].entries,revision=engine['_log'].revision,owner=engine['_canonicalLayerOwner'],stable=owner?.stable,prepass=owner?.prepass,draw=vi.spyOn(engine['gl'],'drawArrays'),before=operations.length
  const groupEntries=journal.filter(entry=>entry.op.type==='canonical_stroke'&&entry.op.frame.strokeId===second[0].frame.strokeId);expect(groupEntries.length).toBeGreaterThan(1);expect(groupEntries[0].canonicalInput!.read!.capability).not.toBe(groupEntries[1].canonicalInput!.read!.capability);expect(groupEntries[0].canonicalRead!.capability).toBe(groupEntries[1].canonicalRead!.capability)
  const target=engine.undo();expect(target?.id).toBe(second.at(-1)!.id);expect(operations.slice(before)).toEqual([expect.objectContaining({type:'operation_undo',targetOpId:target!.id,userId:'local'})]);expect(engine['_log'].entries).toBe(journal);expect(engine['_log'].revision).toBe(revision);expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner?.stable).toBe(stable);expect(owner?.prepass).toBe(prepass);expect(draw).not.toHaveBeenCalled();expect(engine.redo()).toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('returns null for active author and CPU-drained unpromoted receipts without emitting control',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);await author(h)
  engine['_onStart'](packet(1,200));expect(engine.undo()).toBeNull();engine['_onMove'](packet(4,210));engine['_onEnd'](packet(4,220))
  await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000});expect(engine['_canonicalLayerOwner']?.coordinator?.hasPendingLocal).toBe(true);expect(engine.undo()).toBeNull();expect(operations.every(op=>op.type==='canonical_stroke')).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('reports healthy author idle only after release and tolerates a notification error without poisoning',async()=>{
 let inspect=()=>{};const idle=vi.fn(()=>{inspect();throw Error('UI notification failure')}),h=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,idle),{engine}=h
 try{
  await engine.prepareBrush(preset);const base=engine['_brushMipCache'].reservedBytes;inspect=()=>{expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(engine['_canonicalSourceLifetimeHolds']).toBe(0);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(base)}
  await author(h,100,false);expect(idle).toHaveBeenCalledOnce();expect(engine['_authorInputError']).toBeUndefined();expect(engine['_canonicalLayerOwner']?.failed).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('selects redo only from a genuine hidden original full prefix and leaves it hidden until replacement',async()=>{
 const h=await harness(async r=>verdict(r));let restored:Awaited<ReturnType<typeof harness>>|undefined
 try{
  await h.engine.prepareBrush(preset);const first=await author(h),second=await author(h,200),frames=[...first,...second].map((op,i)=>({...op,seq:i+1})),snapshots=[...h.snapshots.values()],tail:Operation[]=[...frames,{type:'operation_undo',id:'original-undo',userId:'local',timestamp:300,seq:frames.length+1,targetOpId:second[0].id}]
  const {canonicalRead:_read,...wire}=h.p
  const p=prepareCanonicalRoomState({...wire,tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:2,capabilities:snapshots.map(snapshot=>({originalUserId:'local',snapshot})),bindings:frames.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:'local',capability:snapshots.findIndex(s=>s.strokeId===op.frame.strokeId)}))}},{expectedBoardId:'room',isCurrent:()=>true})
  restored=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,undefined,p)
  const {engine,operations}=restored,entries=engine['_log'].entries,revision=engine['_log'].revision
  expect(entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId===second[0].frame.strokeId).every(e=>e.state==='undone')).toBe(true)
  expect(engine.redo()?.id).toBe(second.at(-1)!.id);expect(operations).toHaveLength(1);expect(operations[0]).toMatchObject({type:'operation_redo',targetOpId:second.at(-1)!.id});expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(entries.some(e=>e.state==='undone')).toBe(true)
 }finally{h.engine.destroy();restored?.engine.destroy();expect(h.engine['_brushMipCache'].reservedBytes).toBe(0);if(restored)expect(restored.engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['stale','journal','user']as const)('refuses control after %s changes from an original callback without emission',async kind=>{
 let current=true,change=()=>{};const h=await harness(async r=>verdict(r),descriptor,()=>{change();return current}),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);await author(h);const count=operations.length,revision=engine['_log'].revision
  change=()=>{if(kind==='stale')current=false;else if(kind==='journal')engine['_log'].entries[0].serverSeq=999;else engine.setUserId('other')}
  expect(engine.undo()).toBeNull();expect(operations).toHaveLength(count);expect(engine['_log'].revision).toBe(revision)
 }finally{change=()=>{};engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('emits a real partial close before notifying healthy author idle',async()=>{
 let inspect=()=>{};const events:string[]=[],idle=vi.fn(()=>{inspect();events.push('idle')}),h=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,idle),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0))
  inspect=()=>{expect(operations.at(-1)?.type).toBe('canonical_stroke_close');expect(engine['_canonicalSourceLifetimeHolds']).toBe(0)}
  engine['_onEnd']({...packet(5,120),cancelled:true});await vi.waitFor(()=>expect(idle).toHaveBeenCalledOnce());expect(events).toEqual(['idle']);expect(engine['_canonicalLayerOwner']?.failed).toBe(false);expect(engine.undo()).toBeNull()
  const close=operations.at(-1)!;if(close.type!=='canonical_stroke_close')throw Error('Missing real close')
  for(const op of operations)if(op.type==='canonical_stroke')engine.appendOriginalRecorded(confirmed(h,op,engine['_log'].entries.length+1))
  const input=attachCanonicalRecordedDelivery({operation:parseCanonicalStrokeCloseOperation({...close,seq:engine['_log'].entries.length+1})},h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original close');engine.appendOriginalRecorded(input)
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000});expect(engine.undo()).not.toBeNull()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('can request its ended original group while a peer OPEN wash remains, without treating the peer as pending local',async()=>{
 const h=await harness(async r=>verdict(r)),{engine,operations}=h
 try{
  await engine.prepareBrush(preset);const own=await author(h),snapshot=h.snapshots.get(own[0].frame.strokeId)!;expect(own.length).toBeGreaterThan(1)
  const captured={...snapshot,strokeId:'peer-open'},peer=own.slice(0,2).map((op,i)=>({...op,id:'peer-'+i,userId:'peer',seq:engine['_log'].entries.length+i+1,frame:{...op.frame,strokeId:captured.strokeId}})),atoms=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'peer',snapshot:captured}],bindings:peer.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:'peer',capability:0}))},peer,h.p.canonicalRead.scope)
  for(const atom of atoms){const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original peer');engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>{expect(engine['_canonicalLayerOwner']?.coordinator?.presentationReady).toBe(true);expect(engine['_canonicalLayerOwner']?.coordinator?.queuedFrameCount).toBe(0)},{timeout:10000})
  expect(engine['_canonicalLayerOwner']?.coordinator?.hasPendingLocal).toBe(false);expect(engine['_canonicalLayerOwner']?.coordinator?.checkpointReady).toBe(false)
  const count=operations.length;expect(engine.undo()?.id).toBe(own.at(-1)!.id);expect(operations.slice(count)).toEqual([expect.objectContaining({type:'operation_undo',targetOpId:own.at(-1)!.id})])
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('preserves journal and resources if the paired submission callback throws before enqueue',async()=>{
 const h=await harness(async r=>verdict(r)),{engine}=h
 try{
  await engine.prepareBrush(preset);await author(h);const entries=engine['_log'].entries,revision=engine['_log'].revision,owner=engine['_canonicalLayerOwner'],error=Error('Outbox persistence refused'),send=vi.fn(()=>{throw error});engine['_onLocalOperation']=send
  expect(()=>engine.undo()).toThrow(error);expect(send).toHaveBeenCalledOnce();expect(engine['_log'].entries).toBe(entries);expect(engine['_log'].revision).toBe(revision);expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner?.failed).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('does not announce healthy author idle after source emission poisons its owner',async()=>{
 const idle=vi.fn(),h=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,idle),{engine}=h
 try{
  await engine.prepareBrush(preset);const error=Error('source send failure');engine['_onLocalOperation']=()=>{throw error}
  engine['_onStart'](packet(1,100));engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:10000});expect(engine['_canonicalSourceLifetimeHolds']).toBe(0);expect(idle).not.toHaveBeenCalled();expect(engine['_canonicalLayerOwner']).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('notifies once after both queued source owners and all their CPU references retire',async()=>{
 let release!:()=>void,inspect=()=>{};const gate=new Promise<void>(done=>{release=done}),idle=vi.fn(()=>inspect()),h=await harness(async r=>{await gate;return verdict(r)},descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,idle),{engine}=h
 try{
  await engine.prepareBrush(preset);engine['_onStart'](packet(1,100));const a=engine['_authorProducer']!.source!;engine['_onMove'](packet(5,110));engine['_onEnd'](packet(5,120));engine['_onStart'](packet(1,200));const b=engine['_authorProducer']!.source!;engine['_onMove'](packet(5,210));engine['_onEnd'](packet(5,220))
  expect(engine['_canonicalSourceLifetimeHolds']).toBe(2);expect(idle).not.toHaveBeenCalled();inspect=()=>{expect(a.released).toBe(true);expect(b.released).toBe(true);expect(a.references).toBe(0);expect(b.references).toBe(0);expect(engine['_authorInput'].pending).toBe(false);expect(engine.hasActiveCanonicalAuthor()).toBe(false)}
  release();await vi.waitFor(()=>expect(idle).toHaveBeenCalledOnce(),{timeout:10000})
 }finally{release();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

function fullOriginalHistory(h:Awaited<ReturnType<typeof harness>>,tail:readonly Operation[],snapshots:readonly CanonicalStrokeSnapshotV2[]){
 const {canonicalRead:_read,...wire}=h.p
 const operations:Operation[]=tail.map((op,i)=>({...op,seq:i+1})),frames=operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke')
 return prepareCanonicalRoomState({...wire,tailOperations:operations,canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:2,throughSeq:operations.length,operationCount:operations.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:2,capabilities:snapshots.map(snapshot=>({originalUserId:'local',snapshot})),bindings:frames.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:snapshots.findIndex(s=>s.strokeId===op.frame.strokeId)}))}},{expectedBoardId:'room',isCurrent:()=>true})
}
it.each([false,true])('installs original gone metadata without rejecting previously accepted historical redo (historical redo=%s)',async historicalRedo=>{
 const h=await harness(async r=>verdict(r));let restored:Awaited<ReturnType<typeof harness>>|undefined
 try{
  await h.engine.prepareBrush(preset);const a=await author(h),b=await author(h,200),snapshot=h.snapshots.get(a[0].frame.strokeId)!,c=a.map((op,i)=>({...op,id:'C-'+i,frame:{...op.frame,strokeId:'C'}})),tail:Operation[]=[...a,...b,{type:'operation_undo',id:'undoB',userId:'local',timestamp:300,targetOpId:b[0].id},...c]
  if(historicalRedo)tail.push({type:'operation_redo',id:'oldAcceptedRedo',userId:'local',timestamp:500,targetOpId:'undoB'})
  const p=fullOriginalHistory(h,tail,[...h.snapshots.values(),{...snapshot,strokeId:'C'}]);restored=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,undefined,p)
  const {engine,operations}=restored,entries=engine['_log'].entries,hidden=entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId===b[0].frame.strokeId)
  expect(hidden.length).toBe(b.length);expect(hidden.every(e=>e.state===(historicalRedo?'done':'gone'))).toBe(true)
  expect(engine['_log'].pixelOpDoneCount('layer-1')).toBe(a.length+c.length+(historicalRedo?b.length:0))
  expect(engine.redo()).toBeNull();expect(operations).toHaveLength(0);expect(engine['_canonicalExportReady']()).toBe(true)
  expect(engine['_canonicalLayerOwner']?.proof.originalStates).toEqual(entries.map(e=>e.state))
 }finally{h.engine.destroy();restored?.engine.destroy();expect(h.engine['_brushMipCache'].reservedBytes).toBe(0);if(restored)expect(restored.engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('invalidates redo on a newly confirmed original source after a hidden full baseline, preserving journal proof and grouped counts',async()=>{
 const h=await harness(async r=>verdict(r));let restored:Awaited<ReturnType<typeof harness>>|undefined
 try{
  await h.engine.prepareBrush(preset);const a=await author(h),b=await author(h,200),tail:Operation[]=[...a,...b,{type:'operation_undo',id:'undoB',userId:'local',timestamp:300,targetOpId:b[0].id}],p=fullOriginalHistory(h,tail,[...h.snapshots.values()])
  restored=await harness(async r=>verdict(r),descriptor,()=>true,{width:8,height:8},CANONICAL_STROKE_RASTER_PROFILE,undefined,p)
  const {engine}=restored,old=engine['_log'].entries,hidden=old.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId===b[0].frame.strokeId)
  expect(hidden.every(e=>e.state==='undone')).toBe(true);await engine.prepareBrush(preset);const c=await author(restored,500)
  expect(hidden.every(e=>e.state==='undone')).toBe(true);expect(engine['_log'].entries.filter(e=>e.op.type==='canonical_stroke'&&e.op.frame.strokeId===b[0].frame.strokeId).every(e=>e.state==='gone')).toBe(true)
  expect(engine['_log'].pixelOpDoneCount('layer-1')).toBe(a.length+c.length);expect(engine['_canonicalLayerOwner']?.proof.originalStates).toEqual(engine['_log'].entries.map(e=>e.state))
  const count=restored.operations.length;expect(engine.redo()).toBeNull();expect(restored.operations).toHaveLength(count);expect(engine.undo()?.id).toBe(c.at(-1)!.id)
 }finally{h.engine.destroy();restored?.engine.destroy();expect(h.engine['_brushMipCache'].reservedBytes).toBe(0);if(restored)expect(restored.engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
