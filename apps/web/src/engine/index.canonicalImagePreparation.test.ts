import markerFixture from './src/presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,canonicalSourceComposition,type CanonicalStrokeRasterProfile} from '@grafetto/shared'
import {canonicalImageRequiredSourceLevels} from './src/dabs/canonicalImageCapacity'
import {decodeCanonicalStrokeFrame,parseCanonicalStrokeCloseOperation,type CanonicalStrokeCloseOperation} from '@grafetto/shared'
import {canonicalDefaultAutoSourceBinding,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
import {prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,canonicalImagePipeSourceBinding,isBrushLibrary,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import mountainsAuthor from './src/presets/fixtures/sourceImagePipe/mountains.native.json'
import graphiteAuthor from './src/presets/fixtures/sourceImagePipe/pencilRandom.native.json'
import fixture from './src/presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {sourceStrokeAuthorDescriptor} from './src/presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from './src/presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from './src/presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from './src/presets/sourceCanonicalFrameEncoder'
import {installBrushPixels,clearImportedBrushPixels,installBrushLibrary} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
import {PencilEngine} from './index'
import {createOrderedBrushGate} from '../pages/Room/net/orderedBrushGate'
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset)
const asset=binding.assets[0]
const requiredIndexes=canonicalImageRequiredSourceLevels(binding.primarySource,binding.assets)[0].indexes
function sourceTrace(pipe?:typeof graphiteAuthor|typeof mountainsAuthor){
 const selected=pipe?pipe.descriptor as unknown as BrushDescriptor:descriptor,pin=pipe?canonicalImagePipeSourceBinding(selected,pipe.assets):binding
 const compiled=sourceStrokeAuthorDescriptor(selected,{...(pipe?{assets:pipe.assets}:{asset:fixture.asset}),colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program)
 let state=pipe?author.createState(1,2,0):author.createState(4321,7654,.3)
 const material:SourceStrokeMaterialContextV2={version:2,...pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${selected.id}@${selected.version}`,strokeId:'original-basic6',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(selected)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const adapter=new SourceStrokeMaterialAdapter(program,material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);draws+=accepted.frame.draws.length;operations.push({id:'image-'+operations.length,userId:'author',timestamp:0,seq:operations.length+1,type:'canonical_stroke',layerId:'layer-1',frame:accepted.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const step=iterator.next();if(step.done){state=step.value;return}accept(adapter.accept(step.value));const cut=adapter.flush();if(cut)accept([cut])}}
 const f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=fixture.mapping
 if(pipe){for(const input of [{x:40,y:80,t:0},{x:240,y:80,t:1000}]){accept(adapter.beginInput(state));consume(author.plan(state,{...input,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}}
 else for(const [xb,yb,t,pb] of fixture.packets.slice(0,-1)){accept(adapter.beginInput(state));consume(author.plan(state,{x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 if(pipe!==mountainsAuthor)expect(operations).toHaveLength(pipe?67:fixture.frames);if(!pipe)expect(draws).toBe(fixture.draws);else expect(draws).toBeGreaterThan(0)
 return {operations,snapshot}
}
const trace=sourceTrace()

const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
beforeEach(()=>{expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id);installBrushPixels(asset.id,bytes)})
afterEach(()=>{vi.restoreAllMocks();clearImportedBrushPixels()})
function original(isCurrent=()=>true,open=false,emptyLane=false,traceInput=trace){
 const trace=traceInput,tail=open?trace.operations.slice(0,-1):trace.operations
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:tail,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:open&&!emptyLane?'full-room-prefix-v2':'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:trace.snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return {...prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent}),wire:state}
}
function engineFor(p:ReturnType<typeof original>,author=false){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},...(author?{canonicalAuthor:{begin:async()=>{throw Error('Unexpected BEGIN')}},onLocalOperation:vi.fn()}: {})},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);return r
}

it('keeps an actual OPEN image owner usable across resource preparation and original continuation',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,epoch=owner.prepass.preparedCapacity().epoch
  const op=trace.operations.at(-1)!,scope=p.canonicalRead.scope
  const prepared=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:trace.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]},[op],scope)
  const input=attachCanonicalRecordedDelivery(prepared[0],scope)
  if(!('delivery'in input))throw Error('Missing original delivery')
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'})
  expect(owner.bank).toBe(bank);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch)
  engine.appendOriginalRecorded(input)
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:12000})
  expect(engine['_log'].entries).toHaveLength(163);expect(engine['_log'].entries.at(-1)!.canonicalInput).toBe(input)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
function emptyOriginal(isCurrent=()=>true,page={width:8,height:8},profile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:page.width,canvasHeight:page.height,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},...(profile===CANONICAL_STROKE_RASTER_PROFILE?{}:{canonicalAuthorRasterProfile:profile}),canonicalReadScope:{roomId:'room',boardEpoch:2,...(profile===CANONICAL_STROKE_RASTER_PROFILE?{}:{allowedRasterProfiles:[profile]})},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent})
}
const autoDescriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const autoPreset='brush:'+autoDescriptor.id+'@'+autoDescriptor.version
const autoSha=createHash('sha256').update(canonicalBrushDescriptorJSON(autoDescriptor)).digest('hex')
const autoPin=canonicalDefaultAutoSourceBinding(autoDescriptor,autoSha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:autoSha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:autoPin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function autoHarness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=autoDescriptor,isCurrent=()=>true,page={width:8,height:8},profile:CanonicalStrokeRasterProfile=CANONICAL_STROKE_RASTER_PROFILE){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=emptyOriginal(isCurrent,page,profile),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:page.width,pageHeight:page.height,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
 engine.initLayer('background');engine.initLayer('layer-1');engine.setCompositeOrder([{id:'layer-1',opacity:1}]);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil('brush:'+selected.id+'@'+selected.version);engine.setSize(40);engine.setLocked(false)
 await engine.paperReady();await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
 return{engine,operations,p,snapshots}
}
function autoConfirmed(h:Awaited<ReturnType<typeof autoHarness>>,op:Operation,seq:number){
 if(op.type!=='canonical_stroke')throw Error('Expected outgoing source frame')
 const snapshot=h.snapshots.get(op.frame.strokeId);if(!snapshot)throw Error('Missing actual accepted BEGIN snapshot')
 const operation:CanonicalStrokeOperation={...op,seq}
 const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:seq,originalUserId:op.userId,capability:0}]},[operation],h.p.canonicalRead.scope)[0]
 const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Missing emptyOriginal autoConfirmed delivery')
 return input
}

it('prepares a new original Basic6 source while actual Basic2 pointer A stays down and keeps its program and pending mask',async()=>{
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 try{
  await engine.prepareBrush(autoPreset)
  const program=engine['_canonicalPreparedAuthor'],generation=engine['_brushPreparationGeneration'],owner=engine['_canonicalLayerOwner']!,epoch=owner.prepass.preparedCapacity().epoch
  const advance=owner.prepass.advanceAutoGeneration.bind(owner.prepass)
  const pause=vi.spyOn(owner.prepass,'advanceAutoGeneration').mockImplementation(()=>({done:false,consumed:0,uploadedBytes:0}))
  engine['_onStart'](packet(2,0));engine['_onMove'](packet(8,10))
  await vi.waitFor(()=>expect(h.operations.length).toBeGreaterThan(0),{timeout:5000})
  await vi.waitFor(()=>expect(owner.prepass['pendingAuto']).toBeDefined(),{timeout:5000})
  const pending=owner.prepass['pendingAuto'],coordinator=owner.coordinator
  const op={...trace.operations[0],seq:1},snapshot={...trace.snapshot,boardEpoch:2}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:1,originalUserId:op.userId,capability:0}]},[op],h.p.canonicalRead.scope)[0]
  const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original input missing')
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'})
  expect(owner.bank).toBeDefined();expect(owner.coordinator).toBe(coordinator);expect(owner.prepass['pendingAuto']).toBe(pending)
  expect(engine['_canonicalPreparedAuthor']).toBe(program);expect(engine['_brushPreparationGeneration']).toBe(generation);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch)
  pause.mockImplementation(advance)
  engine.appendOriginalRecorded(input)
  const own=h.operations.find(op=>op.type==='canonical_stroke')!;engine.appendOriginalRecorded(autoConfirmed(h,own,2))
  expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual([1,2]);expect(engine['_canonicalPreparedAuthor']).toBe(program)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

function imageInput(p:ReturnType<typeof original>,op:CanonicalStrokeOperation,snapshot=trace.snapshot){
 const scope=p.canonicalRead.scope,atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:op.userId,snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]},[op],scope)[0]
 const input=attachCanonicalRecordedDelivery(atom,scope);if(!('delivery'in input))throw Error('Original delivery missing');return input
}
function sealInput(p:ReturnType<typeof original>,operation:CanonicalStrokeCloseOperation){
 const atom=Object.freeze({operation:parseCanonicalStrokeCloseOperation(operation)}),input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope)
 if(!('delivery'in input))throw Error('Original seal delivery missing');return input
}
it('adds a distinct real-CAS crop while original image A is OPEN, preserves its epoch, then accepts both typed closes',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,epoch=bank.assertRequiredSourceBinding(asset,requiredIndexes,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']}),old=bank.resources(),workspace=owner.prepass.preparedCapacity().epoch
  const changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'synthetic-crop-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'crop-b0',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}}
  const input=imageInput(p,op,snapshot),upload=vi.spyOn(engine['gl'],'texImage2D')
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});expect(upload).toHaveBeenCalled();bank.assertCurrentOwners(epoch)
  expect(owner.bank).toBe(bank);expect(owner.prepass.preparedCapacity().epoch).toBe(workspace)
  for(const resource of old)expect(bank.resources()).toContainEqual(resource)
  engine.appendOriginalRecorded(input)
  const aSeal=sealInput(p,{type:'canonical_stroke_close',id:'close-a',userId:'author',timestamp:1,seq:164,layerId:'layer-1',targetUserId:'author',strokeId:trace.snapshot.strokeId,disposition:'commitPartial',recordedNext:162,firstFrameOpId:'image-0',lastFrameOpId:'image-161'})
  expect(await engine.prepareOriginalRecorded(aSeal)).toEqual({status:'ready'});engine.appendOriginalRecorded(aSeal)
  const bSeal=sealInput(p,{type:'canonical_stroke_close',id:'close-b',userId:'author',timestamp:2,seq:165,layerId:'layer-1',targetUserId:'author',strokeId:snapshot.strokeId,disposition:'commitPartial',recordedNext:1,firstFrameOpId:op.id,lastFrameOpId:op.id})
  engine.appendOriginalRecorded(bSeal)
  await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:12000});expect(engine['_log'].entries).toHaveLength(165)
  const tail=[...p.wire.tailOperations,op,aSeal.operation,bSeal.operation]
  const fresh=prepareCanonicalRoomState({...p.wire,tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2',roomId:'room',boardEpoch:1,throughSeq:165,operationCount:165},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:trace.snapshot},{originalUserId:'author',snapshot}],bindings:tail.filter((operation):operation is CanonicalStrokeOperation=>operation.type==='canonical_stroke').map(operation=>({operationId:operation.id,sequence:operation.seq!,originalUserId:operation.userId,capability:operation.id===op.id?1:0}))}},{expectedBoardId:'room',isCurrent:()=>true})
  const rebuilt=engineFor({...fresh,wire:p.wire})
  try{await rebuilt.engine.restoreCanonicalEmptyRoom(fresh.canonicalRead,fresh.tailOperations);expect(rebuilt.engine['_log'].entries.map(e=>e.serverSeq)).toEqual(tail.map(operation=>operation.seq));expect(rebuilt.engine['_canonicalPixelsReady']).toBe(true)}finally{rebuilt.engine.destroy();expect(rebuilt.engine['_brushMipCache'].reservedBytes).toBe(0)}

 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('recovers an accepted original OPEN image without pretending it was ended',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const journal=engine['_log'].entries,revision=engine['_log'].revision
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));expect(engine['_brushMipCache'].reservedBytes).toBe(0)
  lost.mockReturnValue(false);engine['_handleContextRestored']();await vi.waitFor(()=>expect(engine['_canonicalPixelsReady']).toBe(true),{timeout:12000})
  expect(engine['_log'].entries).toBe(journal);expect(engine['_log'].revision).toBe(revision);expect(engine['_canonicalLayerOwner']!.coordinator).toBeDefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['abort','upload','budget']as const)('rolls back only the new resource candidate on %s while original image A stays usable',async kind=>{
 const p=original(()=>true,true),{engine}=engineFor(p),controller=new AbortController()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,old=bank.resources(),epoch=bank.assertRequiredSourceBinding(asset,requiredIndexes,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']}),before=engine['_brushMipCache'].reservedBytes
  const changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'candidate-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'candidate-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
  const upload=engine['gl'].texImage2D.bind(engine['gl'])
  const spy=vi.spyOn(engine['gl'],'texImage2D').mockImplementation((...args:unknown[])=>{if(kind==='upload'&&args[8] instanceof Uint8Array)throw Error('candidate upload failed');const result=Reflect.apply(upload,engine['gl'],args);if(kind==='abort'&&args[8] instanceof Uint8Array)controller.abort();return result})
  const release=kind==='budget'?engine['_brushMipCache'].reserve(engine['_brushMipCache'].budgetBytes-before-1):undefined
  try{if(kind==='abort')expect(await engine.prepareOriginalRecorded(input,{signal:controller.signal})).toEqual({status:'cancelled'});else await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow()}
  finally{release?.();spy.mockRestore()}
  expect(owner.resourceCandidate).toBeUndefined();expect(owner.bank).toBe(bank);bank.assertCurrentOwners(epoch);expect(bank.resources()).toEqual(old);expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(engine['_canonicalPixelsReady']).toBe(true);expect(engine['_log'].entries).toHaveLength(162)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('shares lazy image work while one subscriber aborts without cancelling the surviving receiver',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p),abort=new AbortController()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,begin=vi.spyOn(bank,'beginExtension'),changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'shared-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'shared-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
  const first=engine.prepareOriginalRecorded(input,{signal:abort.signal}),second=engine.prepareOriginalRecorded(input);abort.abort()
  expect(await first).toEqual({status:'cancelled'});expect(await second).toEqual({status:'ready'});expect(begin).toHaveBeenCalledOnce();expect(owner.bank).toBe(bank);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('requires a newer genuine full read after incremental image input changes the accepted recovery cut',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p),repair=vi.fn();engine['_onCanonicalRecoveryRequired']=repair
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  engine.appendOriginalRecorded(imageInput(p,trace.operations.at(-1)!))
  const lost=vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));lost.mockReturnValue(false);engine['_handleContextRestored']()
  await vi.waitFor(()=>expect(repair).toHaveBeenCalled());expect(engine['_canonicalPixelsReady']).toBe(false);expect(engine['_canonicalLayerOwner']).toBeUndefined();expect(engine['_log'].entries).toHaveLength(163)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps an OPEN image unsupported in the old empty-history lane',()=>{
 const p=original(()=>true,true,true),get=vi.fn(()=>{throw Error('Canvas touched')}),canvas=new Proxy({}as HTMLCanvasElement,{get})
 expect(()=>new PencilEngine(canvas,{rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}})).toThrow('Open canonical image baseline unsupported');expect(get).not.toHaveBeenCalled()
})
it('rejects resource growth before source reads or mutation of an original open owner',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,before=bank.resources(),cpu=engine['_brushMipCache'].reservedBytes
  const snapshot={...trace.snapshot,material:{...trace.snapshot.material,primarySource:{...trace.snapshot.material.primarySource,brushScale:.5}}}
  const input=imageInput(p,trace.operations.at(-1)!,snapshot),upload=vi.spyOn(engine['gl'],'texImage2D')
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow('workspace busy');expect(upload).not.toHaveBeenCalled();expect(bank.resources()).toEqual(before);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps the published bank and maps coherent when a staging lease cleanup throws',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,epoch=owner.prepass.preparedCapacity().epoch,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'cleanup-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'cleanup-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot),lease=owner.cache.lease.bind(owner.cache),fault=Error('staging lease cleanup failed')
  vi.spyOn(owner.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{release();throw fault}})
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow(fault)
  expect(owner.bank).toBe(bank);expect(bank.assertRequiredSourceBinding(changed,requiredIndexes,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']})).toBeTypeOf('number');expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input);expect(engine['_log'].entries).toHaveLength(163)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('rechecks the individual original lifetime after the shared work resolves',async()=>{
 let alive=true;const p=original(()=>alive,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'late-stale-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'late-stale-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot),lease=owner.cache.lease.bind(owner.cache)
  vi.spyOn(owner.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{release();queueMicrotask(()=>{alive=false})}})
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow()
  expect(alive).toBe(false);expect(engine['_log'].entries).toHaveLength(162);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('waits passively for different finite brush work to finish before allocating the original image candidate',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p),events:string[]=[]
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'wait-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'wait-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot),begin=bank.beginExtension.bind(bank)
  vi.spyOn(bank,'beginExtension').mockImplementation((...args)=>{events.push('candidate');return begin(...args)})
  const local=engine['_brushPreparation'].run([()=>{events.push('local-1')},()=>{events.push('local-2')}],{},()=>true,'different-local',()=>{events.push('local-finalized');return undefined})
  const pending=engine.prepareOriginalRecorded(input)
  expect(owner.resourceCandidate).toBeUndefined();expect(events).not.toContain('candidate')
  expect(await pending).toEqual({status:'ready'});expect(await local).toEqual({status:'ready'})
  expect(events).toEqual(['local-1','local-2','local-finalized','candidate']);expect(owner.coordinator).toBeDefined();expect(engine['_log'].entries).toHaveLength(162)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['stale','abort','loss']as const)('does not allocate a candidate after %s during passive work wait',async kind=>{
 let alive=true;const p=original(()=>alive,true),{engine}=engineFor(p),abort=new AbortController()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,begin=vi.spyOn(bank,'beginExtension'),changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'wait-stop-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'wait-stop-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
  const local=engine['_brushPreparation'].run([()=>{
   if(kind==='stale')alive=false
   else if(kind==='abort')abort.abort()
   else{vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))}
  }],{},()=>true,'finite-owner-stop')
  const pending=engine.prepareOriginalRecorded(input,{signal:abort.signal})
  if(kind==='abort')expect(await pending).toEqual({status:'cancelled'});else await expect(pending).rejects.toThrow()
  await local;expect(begin).not.toHaveBeenCalled();expect(owner.resourceCandidate).toBeUndefined();expect(engine['_log'].entries).toHaveLength(162)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('does not wait for unrelated brush work when the original source is already ready',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p),jobs=vi.fn()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const work=engine['_brushPreparation'].run([jobs],{},()=>true,'unrelated-pending')
  expect(await engine.prepareOriginalRecorded(imageInput(p,trace.operations.at(-1)!))).toEqual({status:'ready'});expect(jobs).not.toHaveBeenCalled();expect(engine['_canonicalLayerOwner']!.resourceCandidate).toBeUndefined()
  engine['_brushPreparation'].cancel();await work
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

function imageInputs(scope:Parameters<typeof attachCanonicalRecordedDelivery>[1],offset=0,selectedTrace=trace){
 const trace=selectedTrace,snapshot={...trace.snapshot,boardEpoch:scope.boardEpoch},operations=trace.operations.map((op,i)=>({...op,seq:offset+i+1}))
 const attachment={version:1 as const,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot}],bindings:operations.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}))}
 return prepareCanonicalRecordedAttachment(attachment,operations,scope).map(atom=>{const input=attachCanonicalRecordedDelivery(atom,scope);if(!('delivery'in input))throw Error('original');return input})
}
it('backpressures a whole Basic6 burst through the SAME gate while actual Basic2 A stays OPEN then continues',async()=>{
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 let gate:ReturnType<typeof createOrderedBrushGate>|undefined,repair:unknown
 engine['_onCanonicalRecoveryRequired']=error=>{repair=error}
 try{
  await engine.prepareBrush(autoPreset);engine['_onStart'](packet(20,0));engine['_onMove'](packet(60,10))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000});expect(h.operations.length).toBeGreaterThan(0)
  const initial=h.operations.length
  for(const op of h.operations){const input=autoConfirmed(h,op,engine['_log'].entries.length+1);expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator!,program=engine['_canonicalPreparedAuthor'],snapshot={...trace.snapshot,boardEpoch:2},operations=trace.operations.map((op,i)=>({...op,seq:initial+i+1}))
  const attachment={version:1 as const,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:operations.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}))}
  const inputs=prepareCanonicalRecordedAttachment(attachment,operations,h.p.canonicalRead.scope).map(atom=>{const input=attachCanonicalRecordedDelivery(atom,h.p.canonicalRead.scope);if(!('delivery'in input))throw Error('original');return input})
  const enqueue=coordinator.enqueueRecorded.bind(coordinator);let maximum=coordinator.queuedFrameCount
  vi.spyOn(coordinator,'enqueueRecorded').mockImplementation(input=>{enqueue(input);maximum=Math.max(maximum,coordinator.queuedFrameCount)})
  let complete!:()=>void,fail!:(error:unknown)=>void
  const drained=new Promise<void>((resolve,reject)=>{complete=resolve;fail=reject})
  gate=createOrderedBrushGate(()=>null,fail)
  for(const [index,input]of inputs.entries())gate.dispatch([],()=>{engine.appendOriginalRecorded(input);if(index===inputs.length-1)complete()},()=>true,async()=>{expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'})})
  await drained.catch(error=>{throw repair??error})
  await vi.waitFor(()=>expect(owner.job).toBeUndefined(),{timeout:15000})
  expect(maximum).toBeLessThanOrEqual(8);expect(maximum).toBe(8);expect(engine.hasActiveCanonicalAuthor()).toBe(true);expect(owner.failed).toBe(false);expect(owner.coordinator).toBe(coordinator);expect(owner.bank?.isReady()).toBe(true);expect(engine['_canonicalPreparedAuthor']).toBe(program)
  expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual(Array.from({length:initial+163},(_,i)=>i+1));expect(engine['_log'].entries.slice(initial).map(e=>e.canonicalInput)).toEqual(inputs)
  engine['_onMove'](packet(100,20));engine['_onEnd'](packet(100,30));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  for(const op of h.operations.slice(initial)){const input=autoConfirmed(h,op,engine['_log'].entries.length+1);expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:15000})
  expect(h.operations.length).toBeGreaterThan(initial);expect(owner.failed).toBe(false);expect(owner.recordedCapacity).toBeUndefined()
 }finally{gate?.cancel();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

it.each(['abort','destroy','loss','stale'] as const)('retires a capacity waiter through actual %s without admitting the held ninth original',async mode=>{
 let current=true
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>current,{width:512,height:512}),{engine}=h
 try{
  await engine.prepareBrush(autoPreset)
  const inputs=imageInputs(h.p.canonicalRead.scope),owner=engine['_canonicalLayerOwner']!
  for(const input of inputs.slice(0,8)){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  expect(owner.coordinator?.queuedFrameCount).toBe(8)
  const controller=new AbortController(),pending=engine.prepareOriginalRecorded(inputs[8],{signal:controller.signal})
  expect(owner.recordedCapacity).toBeDefined()
  if(mode==='abort'){controller.abort();expect(await pending).toEqual({status:'cancelled'});expect(engine['_log'].entries).toHaveLength(8);expect(owner.failed).toBe(false)}
  else{
   const rejected=expect(pending).rejects.toThrow()
   if(mode==='destroy')engine.destroy()
   if(mode==='loss'){vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))}
   if(mode==='stale')current=false
   await rejected
  }
  expect(owner.recordedCapacity).toBeUndefined();expect(engine['_log'].entries.some(entry=>entry.op.id===inputs[8].operation.id)).toBe(false)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

function installLocalBasic6(){
 const preset=`brush:${descriptor.id}@${descriptor.version}`
 const library:unknown={schemaVersion:1,brushes:[{descriptor,name:'Original Basic6',source:'native',warnings:[]}],assets:[{id:fixture.asset.id,size:fixture.asset.size,file:fixture.asset.id.slice(6)+'.bin'}],skipped:[]};if(!isBrushLibrary(library))throw Error('Invalid original image library');installBrushLibrary(library)
 return preset
}
it.each(['abort','upload','companions']as const)('rolls back a genuinely empty first image workspace on %s without publishing author resources',async kind=>{
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h,preset=installLocalBasic6(),controller=new AbortController()
 engine.setPencil(preset);engine.setSize(7.5)
 try{
  const owner=engine['_canonicalLayerOwner']!,oldMask=owner.mask,before=engine['_brushMipCache'].reservedBytes,upload=engine['gl'].texImage2D.bind(engine['gl'])
  const spy=vi.spyOn(engine['gl'],'texImage2D').mockImplementation((...args:unknown[])=>{if(kind==='upload'&&args[8]instanceof Uint8Array)throw Error('initial upload fault');const result=Reflect.apply(upload,engine['gl'],args);if(kind==='abort'&&args[8]instanceof Uint8Array)controller.abort();return result})
  const prepare=kind==='companions'?vi.spyOn(owner.composite,'prepare').mockImplementationOnce(()=>{throw Error('initial companion fault')}):undefined
  if(kind==='abort')await expect(engine.prepareBrush(preset,{signal:controller.signal})).resolves.toEqual({status:'cancelled'});else await expect(engine.prepareBrush(preset)).rejects.toThrow()
  spy.mockRestore();prepare?.mockRestore()
  expect(owner.bank).toBeUndefined();expect(owner.resourceCandidate).toBeUndefined();expect(owner.prepared).toBe(false);expect(owner.mask).toBe(oldMask);expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(engine['_log'].entries).toHaveLength(0);expect(h.operations).toHaveLength(0)
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});expect(owner.bank?.isReady()).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('rejects missing CAS before mutating a previously ready auto owner',async()=>{
 const {engine,operations}=await autoHarness(async request=>verdict(request)),preset=installLocalBasic6()
 try{
  await engine.prepareBrush(autoPreset);const owner=engine['_canonicalLayerOwner']!,prepared=engine['_canonicalPreparedAuthor'],mask=owner.mask,cpu=engine['_brushMipCache'].reservedBytes,epoch=owner.prepass.preparedCapacity().epoch
  engine.setPencil(preset);engine.setSize(7.5);clearImportedBrushPixels();const upload=vi.spyOn(engine['gl'],'texImage2D'),program=vi.spyOn(engine['gl'],'createProgram')
  await expect(engine.prepareBrush(preset)).rejects.toThrow('asset unavailable');expect(upload).not.toHaveBeenCalled();expect(program).not.toHaveBeenCalled();expect(owner.mask).toBe(mask);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(operations).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},15000)

function installPipeAuthor(data:typeof mountainsAuthor|typeof graphiteAuthor){
 const library:unknown={schemaVersion:1,brushes:[{descriptor:data.descriptor,name:'Original image pipe',source:'native',warnings:[]}],assets:data.assets.map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid image library');installBrushLibrary(library)
 for(const a of data.assets)installBrushPixels(a.id,new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size})))
 return `brush:${library.brushes[0].descriptor.id}@${library.brushes[0].descriptor.version}`
}
it('grows an idle original auto workspace for the actual Mountains source without replacing old programs',async()=>{
 const {engine}=await autoHarness(async request=>verdict(request)),preset=installPipeAuthor(mountainsAuthor)
 try{
  await engine.prepareBrush(autoPreset);const owner=engine['_canonicalLayerOwner']!,prepass=owner.prepass,composite=owner.composite,stable=owner.stable,mask=owner.mask,journal=engine['_log'].entries
  engine.setPencil(preset);engine.setSize(360);const program=vi.spyOn(engine['gl'],'createProgram')
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite);expect(owner.stable).toBe(stable);expect(owner.mask.width).toBeGreaterThan(mask.width);expect(owner.bank?.isReady()).toBe(true);expect(program).not.toHaveBeenCalled();expect(engine['_log'].entries).toBe(journal)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['Basic6','Graphite']as const)('grows actual cold %s original history for default native40 while retaining the exact bank and journal',async kind=>{
 if(kind==='Graphite')for(const a of graphiteAuthor.assets)installBrushPixels(a.id,new Uint8Array(inflateSync(Buffer.from(a.deflateBase64,'base64'),{maxOutputLength:a.size*a.size})))
 const p=original(()=>true,false,false,kind==='Graphite'?sourceTrace(graphiteAuthor):trace),{engine}=engineFor(p,true)
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank,journal=engine['_log'].entries,prepass=owner.prepass,composite=owner.composite,epoch=prepass.preparedCapacity().epoch;installBrushLibrary({schemaVersion:1,brushes:[{descriptor:autoDescriptor,name:'Basic2',source:'native',warnings:[]}],assets:[],skipped:[]});engine.setPencil(autoPreset);engine.setSize(40);const programs=vi.spyOn(engine['gl'],'createProgram');await expect(engine.prepareBrush(autoPreset)).resolves.toEqual({status:'ready'});expect(owner.bank).toBe(bank);expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite);expect(owner.prepass.preparedCapacity().epoch).not.toBe(epoch);expect(owner.mask.width).toBeGreaterThanOrEqual(41);expect(engine['_log'].entries).toBe(journal);expect(programs).not.toHaveBeenCalled();expect(engine['_canonicalExportReady']()).toBe(true)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('adds the native Graphite suffix while preserving the ready Mountains bank and workspace',async()=>{
 const {engine}=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),mountains=installPipeAuthor(mountainsAuthor),graphite=installPipeAuthor(graphiteAuthor)
 try{
  engine.setPencil(mountains);engine.setSize(360);await expect(engine.prepareBrush(mountains)).resolves.toEqual({status:'ready'})
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,keys=bank.resources(),prepared=engine['_canonicalPreparedAuthor'],cpu=engine['_brushMipCache'].reservedBytes,epoch=owner.prepass.preparedCapacity().epoch
  engine.setPencil(graphite);engine.setSize(16);const upload=vi.spyOn(engine['gl'],'texImage2D'),begin=vi.spyOn(bank,'beginExtension')
  await expect(engine.prepareBrush(graphite)).resolves.toEqual({status:'ready'});expect(begin).toHaveBeenCalledOnce();expect(upload).toHaveBeenCalled();expect(owner.bank).toBe(bank);for(const resource of keys)expect(bank.resources()).toContainEqual(resource);expect(bank.jobs).toHaveLength(86);expect(bank.gpuBytes).toBe(5658656+13832);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).not.toBe(prepared);expect(engine['_canonicalPreparedAuthor']?.preset).toBe(graphite);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(cpu)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
function incomingNative(scope:Parameters<typeof attachCanonicalRecordedDelivery>[1]){
 const reply=verdict({layerId:'layer-1',brush:autoPreset,strokeId:'incoming-native',pigmentRgb8:[0,0,0],outerResourceOpacity:1,alphaDarken:'creamy'});if(!reply.ok||!('materialVersion'in reply.snapshot)||reply.snapshot.materialVersion!==2)throw Error('Missing native pin')
 const snapshot={...reply.snapshot,boardEpoch:scope.boardEpoch},compiled=sourceStrokeAuthorDescriptor(autoDescriptor,{inputProfile:'krita-freehand-no-smoothing-v1',colorIdentity:'native',lodScale:1,coverageProfile:'neon64-f32-fma-v1'});if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program),state=author.createState(1,2,0),adapter=new SourceStrokeMaterialAdapter(compiled.program,snapshot.material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material:snapshot.material}),packed:string[]=[]
 for(const chunk of adapter.beginInput(state))packed.push(chunk.packed)
 for(const step of author.plan(state,{x:2,y:2,t:0,pressure:.5,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})){for(const chunk of adapter.accept(step))packed.push(chunk.packed);const cut=adapter.flush();if(cut)packed.push(cut.packed)}
 if(!packed.length)throw Error('Native author yielded no original packet')
 const op:CanonicalStrokeOperation={id:'incoming-native-0',userId:'peer',timestamp:0,seq:1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(packed[0]).envelope},atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'peer',snapshot}],bindings:[{operationId:op.id,sequence:1,originalUserId:'peer',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope)
 if(!('delivery'in input))throw Error('Missing incoming original owner');return input
}
it.each(['native','image','cancel-native']as const)('keeps incoming %s behind the same finite initial image publication',async mode=>{
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h,preset=mode==='native'?installPipeAuthor(mountainsAuthor):installLocalBasic6(),controller=new AbortController()
 engine.setPencil(preset);engine.setSize(mode==='native'?360:7.5)
 try{
  const owner=engine['_canonicalLayerOwner']!,before=owner.mask,local=engine.prepareBrush(preset,{signal:controller.signal}),localResult=local.catch(error=>{throw error})
  await vi.waitFor(()=>expect(owner.resourceCandidate).toBeDefined(),{interval:1});expect(owner.prepared).toBe(false)
  const input=mode==='image'?imageInputs(h.p.canonicalRead.scope)[0]:incomingNative(h.p.canonicalRead.scope),wait=vi.spyOn(engine['_brushPreparation'],'whenIdle');let settled=false
  const incoming=engine.prepareOriginalRecorded(input).finally(()=>{settled=true});await Promise.resolve();expect(wait).toHaveBeenCalledOnce();expect(settled).toBe(false);expect(owner.mask).toBe(before);expect(engine['_log'].entries).toHaveLength(0)
  if(mode==='cancel-native')controller.abort()
  await expect(localResult).resolves.toEqual({status:mode==='cancel-native'?'cancelled':'ready'});await expect(incoming).resolves.toEqual({status:'ready'})
  if(mode==='cancel-native'){expect(owner.prepared).toBe(true);expect(owner.mask.width).toBeGreaterThanOrEqual(41);expect(owner.bank).toBeUndefined()}else expect(owner.bank?.isReady()).toBe(true)
  engine.appendOriginalRecorded(input);expect(engine['_log'].entries[0].canonicalInput).toBe(input);expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps the original image bank readers independent of the selected author program',async()=>{
 const {engine}=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),preset=installPipeAuthor(mountainsAuthor)
 try{
  engine.setPencil(preset);engine.setSize(360);await engine.prepareBrush(preset)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,first=bank.jobs[0],epoch=owner.prepass.preparedCapacity().epoch
  engine.setPencil(autoPreset);engine.setSize(40);await expect(engine.prepareBrush(autoPreset)).resolves.toEqual({status:'ready'})
  expect(owner.bank).toBe(bank);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);owner.cache.discard(first.key);expect(bank.prepareJob(0)).toBe('ready');expect(bank.isReady()).toBe(true);expect(engine['_canonicalPreparedAuthor']?.preset).toBe(autoPreset)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['upload','abort']as const)('preserves a prepared auto owner when image growth %s fails',async mode=>{
 const {engine}=await autoHarness(async request=>verdict(request)),selected=installPipeAuthor(mountainsAuthor),abort=new AbortController()
 try{await engine.prepareBrush(autoPreset);const owner=engine['_canonicalLayerOwner']!,epoch=owner.prepass.preparedCapacity().epoch,old=engine['_canonicalPreparedAuthor'],cpu=engine['_brushMipCache'].reservedBytes;engine.setPencil(selected);engine.setSize(360);const fault=Error('growth source upload');if(mode==='upload')vi.spyOn(engine['gl'],'texImage2D').mockImplementationOnce(()=>{throw fault});const result=engine.prepareBrush(selected,{signal:abort.signal,onProgress:n=>{if(mode==='abort'&&n===2)abort.abort()}});if(mode==='upload')await expect(result).rejects.toBe(fault);else await expect(result).resolves.toEqual({status:'cancelled'});expect(owner.bank).toBeUndefined();expect(owner.resourceCandidate).toBeUndefined();expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.prepared).toBe(true);expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(await engine.prepareBrush(selected)).toEqual({status:'ready'})}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('cancels staged idle growth when an original peer frame starts using the old epoch, without waiting its END',async()=>{
 const h=await autoHarness(async request=>verdict(request)),{engine}=h,selected=installPipeAuthor(mountainsAuthor)
 try{await engine.prepareBrush(autoPreset);const owner=engine['_canonicalLayerOwner']!,epoch=owner.prepass.preparedCapacity().epoch,old=engine['_canonicalPreparedAuthor'],input=incomingNative(h.p.canonicalRead.scope);engine.setPencil(selected);engine.setSize(360);let incoming:Promise<void>|undefined;const result=await engine.prepareBrush(selected,{onProgress:n=>{if(n===2)incoming=engine.prepareOriginalRecorded(input).then(()=>engine.appendOriginalRecorded(input))}});await incoming;expect(result).toEqual({status:'cancelled'});expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.bank).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(engine['_log'].entries[0].canonicalInput).toBe(input);expect(owner.resourceCandidate).toBeUndefined();await expect(engine.prepareBrush(selected)).rejects.toThrow('workspace busy')}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('keeps the coherently published grown union when old-resource retirement throws after commit',async()=>{
 const {engine}=await autoHarness(async request=>verdict(request)),basic=installLocalBasic6()
 try{await engine.prepareBrush(autoPreset);engine.setPencil(basic);engine.setSize(7.5);await engine.prepareBrush(basic);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,old=engine['_canonicalPreparedAuthor'],oldKey=owner.prepass.preparedResources()[0].key,selected=installPipeAuthor(mountainsAuthor),discard=owner.cache.discard.bind(owner.cache),fault=Error('old workspace retirement');let thrown=false;vi.spyOn(owner.cache,'discard').mockImplementation((key,lost)=>{discard(key,lost);if(key===oldKey&&!thrown){thrown=true;throw fault}});engine.setPencil(selected);engine.setSize(360);await expect(engine.prepareBrush(selected)).rejects.toBe(fault);expect(thrown).toBe(true);expect(owner.bank).toBe(bank);expect(owner.mask.width).toBeGreaterThan(360);expect(owner.prepass.isReady()).toBe(true);expect(owner.composite.isReady()).toBe(true);expect(owner.bank!.isReady()).toBe(true);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(await engine.prepareBrush(selected)).toEqual({status:'ready'})}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each([false,true])('prepares original Basic6 control resources on the SAME %s idle auto workspace without author mutation',async warm=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 try{
  if(warm)await engine.prepareBrush(autoPreset)
  const owner=engine['_canonicalLayerOwner']!,journal=engine['_log'].entries,prepared=engine['_canonicalPreparedAuthor'],generation=engine['_brushPreparationGeneration'],inputs=imageInputs(h.p.canonicalRead.scope),first=inputs[0],decode=decodeCanonicalStrokeFrame(first.operation.type==='canonical_stroke'?first.operation.frame:(()=>{throw Error('frame')})(),{...trace.snapshot,frameOrdinal:0}).frame
  expect(decode.draws).toHaveLength(0)
  expect(await engine.prepareOriginalRecorded(first)).toEqual({status:'ready'})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.bank).toBeDefined();expect(owner.bank!.jobs).toHaveLength(requiredIndexes.length);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushPreparationGeneration']).toBe(generation);expect(engine['_log'].entries).toBe(journal);expect(journal).toHaveLength(0)
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000})
  expect(engine['_log'].entries).toHaveLength(inputs.length)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

function originalMarkerTrace(){
 const library:unknown={schemaVersion:1,brushes:[markerFixture.imported],assets:[],skipped:[]};if(!isBrushLibrary(library))throw Error('Invalid Marker')
 const descriptor=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 expect(sha).toBe(markerFixture.canonicalDescriptorSHA256)
 const source=canonicalDefaultAutoSourceBinding(descriptor,sha,D,G),composition=canonicalSourceComposition(descriptor,G)
 if(!composition)throw Error('Missing source composition')
 const material={version:2 as const,assets:[],primarySource:source,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:markerFixture.strokeId,boardEpoch:2,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[0,0,0],composition:{...composition,alphaDarken:'creamy',outerResourceOpacity:1},assets:[],materialVersion:2,material}
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'normal-import-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1',coverageProfile:D});if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const author=new SourceStrokeAuthor(compiled.program);let cursor=author.createState(4321,7654,.3)
 const adapter=new SourceStrokeMaterialAdapter(compiled.program,material,cursor),encoder=new SourceCanonicalFrameEncoder({...snapshot,material}),ops:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks){const encoded=encoder.encode(c.packed);draws+=encoded.frame.draws.length;ops.push({id:'marker-'+ops.length,type:'canonical_stroke',userId:'author',timestamp:ops.length,seq:ops.length+1,layerId:'layer-1',frame:encoded.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iterator.next();if(n.done){cursor=n.value;return}accept(adapter.accept(n.value));const cut=adapter.flush();if(cut)accept([cut])}}
 for(const packet of markerFixture.packets){accept(adapter.beginInput(cursor));if(packet===markerFixture.packets[0]){const cut=adapter.flush();if(cut)accept([cut])}consume(author.plan(cursor,packet))}
 accept(adapter.beginInput(cursor));consume(author.finish(cursor));accept(adapter.finish(cursor))
 expect(ops).toHaveLength(29);expect(draws).toBe(17);expect(encoder.ended).toBe(true)
 return {operations:ops,snapshot}
}
it.each([false,true])('prepares the full original D source from its empty control before budget publication (warm %s)',async warm=>{
 const h=await autoHarness(async r=>{const v=verdict(r);if(!v.ok||!('materialVersion'in v.snapshot))throw Error('grant');return{...v,snapshot:{...v.snapshot,rasterProfile:G}}},autoDescriptor,()=>true,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope
 try{
  if(warm)await engine.prepareBrush(autoPreset)
  const owner=engine['_canonicalLayerOwner']!,prepared=engine['_canonicalPreparedAuthor'],generation=engine['_brushPreparationGeneration'],stable=owner.stable,prepass=owner.prepass,composite=owner.composite,journal=engine['_log'].entries
  const atoms=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:t.operations.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))},t.operations,scope),inputs=atoms.map(atom=>{const input=attachCanonicalRecordedDelivery(atom,scope);if(!('delivery'in input))throw Error('delivery');return input})
  expect(decodeCanonicalStrokeFrame(t.operations[0].frame,{...t.snapshot,frameOrdinal:0}).frame.draws).toHaveLength(0)
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'});expect(owner.mask).toEqual({width:54,height:54,slots:1})
  expect(engine['_canonicalLayerOwner']).toBe(owner);expect(owner.stable).toBe(stable);expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushPreparationGeneration']).toBe(generation);expect(engine['_log'].entries).toBe(journal)
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000});expect(engine['_log'].entries).toHaveLength(29)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('grows original Mountains full suffix union on the SAME idle Basic2 owner without changing its selected author',async()=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 try{
  await engine.prepareBrush(autoPreset);installPipeAuthor(mountainsAuthor)
  const owner=engine['_canonicalLayerOwner']!,prepared=engine['_canonicalPreparedAuthor'],generation=engine['_brushPreparationGeneration'],stable=owner.stable,prepass=owner.prepass,composite=owner.composite,programs=vi.spyOn(engine['gl'],'createProgram'),inputs=imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor)),journal=engine['_log'].entries
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'})
  expect(owner.mask.width).toBeGreaterThan(41);expect(owner.bank!.jobs).toHaveLength(44);expect(owner.stable).toBe(stable);expect(owner.prepass).toBe(prepass);expect(owner.composite).toBe(composite);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushPreparationGeneration']).toBe(generation);expect(engine['_log'].entries).toBe(journal);expect(programs).not.toHaveBeenCalled()
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000})
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('rejects original growth while A is OPEN before allocating or waiting for its confirmation',async()=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 try{
  await engine.prepareBrush(autoPreset);engine['_onStart'](packet(20,0));engine['_onMove'](packet(60,10))
  await vi.waitFor(()=>expect(h.operations.length).toBeGreaterThan(0));installPipeAuthor(mountainsAuthor)
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask,prepared=engine['_canonicalPreparedAuthor'],cpu=engine['_brushMipCache'].reservedBytes,allocate=vi.spyOn(owner.prepass,'prepareCapacityUpdate'),input=imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor))[0]
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow('workspace busy')
  expect(allocate).not.toHaveBeenCalled();expect(owner.mask).toBe(mask);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['abort','stale','upload']as const)('preserves idle original workspace and selected author when Mountains growth %s fails',async mode=>{
 let alive=true;const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>alive,{width:512,height:512}),{engine}=h,controller=new AbortController()
 try{
  await engine.prepareBrush(autoPreset);installPipeAuthor(mountainsAuthor)
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask,prepared=engine['_canonicalPreparedAuthor'],epoch=owner.prepass.preparedCapacity().epoch,bytes=engine['_brushMipCache'].reservedBytes,journal=engine['_log'].entries,input=imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor))[0],fault=Error('original growth upload')
  if(mode==='upload')vi.spyOn(engine['gl'],'texImage2D').mockImplementationOnce(()=>{throw fault})
  const promise=engine.prepareOriginalRecorded(input,{signal:controller.signal})
  if(mode==='abort')controller.abort();if(mode==='stale')alive=false
  if(mode==='abort'||mode==='stale')expect(await promise).toEqual({status:'cancelled'});else await expect(promise).rejects.toBe(fault)
  expect(owner.mask).toBe(mask);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(bytes);expect(engine['_log'].entries).toBe(journal);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['abort','stale','upload']as const)('does not publish D original idle growth after %s',async mode=>{
 let alive=true;const h=await autoHarness(async r=>{const v=verdict(r);if(!v.ok||!('materialVersion'in v.snapshot))throw Error('grant');return{...v,snapshot:{...v.snapshot,rasterProfile:G}}},autoDescriptor,()=>alive,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope,controller=new AbortController()
 try{
  await engine.prepareBrush(autoPreset);const owner=engine['_canonicalLayerOwner']!,mask=owner.mask,prepared=engine['_canonicalPreparedAuthor'],epoch=owner.prepass.preparedCapacity().epoch,cpu=engine['_brushMipCache'].reservedBytes,journal=engine['_log'].entries,op=t.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope),fault=Error('D original resource upload')
  if(!('delivery'in input))throw Error('delivery')
  if(mode==='upload')vi.spyOn(engine['gl'],'texImage2D').mockImplementationOnce(()=>{throw fault})
  const result=engine.prepareOriginalRecorded(input,{signal:controller.signal});if(mode==='abort')controller.abort();if(mode==='stale')alive=false
  if(mode==='upload')await expect(result).rejects.toBe(fault);else expect(await result).toEqual({status:'cancelled'})
  expect(owner.mask).toBe(mask);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).toBe(prepared);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(engine['_log'].entries).toBe(journal)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['abort','stale']as const)('retires cold D resources when %s occurs after the first resource job progress callback',async mode=>{
 let alive=true;const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>alive,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope,controller=new AbortController()
 try{
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask,cpu=engine['_brushMipCache'].reservedBytes,journal=engine['_log'].entries,op=t.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope),run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']),progress=vi.fn()
  if(!('delivery'in input))throw Error('delivery')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((factories,options,available,key,finalize)=>run(factories,{...options,onProgress:(done,total)=>{options.onProgress?.(done,total);if(done===1){expect(owner.prepass.isReady()).toBe(true);progress();if(mode==='abort')controller.abort();else alive=false}}},available,key,finalize))
  const result=engine.prepareOriginalRecorded(input,{signal:controller.signal})
  expect(await result).toEqual({status:'cancelled'})
  expect(progress).toHaveBeenCalledOnce();expect(owner.prepared).toBe(false);expect(owner.mask).toBe(mask);expect(owner.prepass.isReady()).toBe(false);expect(owner.composite.isReady()).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(engine['_log'].entries).toBe(journal);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each([['abort',false],['stale',false],['abort',true],['stale',true]]as const)('preserves the old cold composite and %s cancellation (prepass already ready %s)',async(mode,prepassReady)=>{
 let alive=true;const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>alive,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope,controller=new AbortController()
 try{
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask
  if(prepassReady)owner.prepass.prepare(mask,[])
  owner.composite.prepare(owner.plan.composite,prepassReady?owner.prepass.preparedResources():[],0)
  const resources=owner.composite.preparedResources(),binding=owner.composite.brushGlBatchInfo(),epoch=prepassReady?owner.prepass.preparedCapacity().epoch:undefined,cpu=engine['_brushMipCache'].reservedBytes,op=t.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope),run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']),programs=vi.spyOn(owner.composite,'prepare'),progress=vi.fn()
  if(!('delivery'in input))throw Error('delivery')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((jobs,options,available,key,finalize)=>run(jobs,{...options,onProgress:(done,total)=>{options.onProgress?.(done,total);if(done===1){progress();expect(owner.prepared).toBe(false);expect(owner.resourceCandidate).toBeDefined();expect(()=>engine.appendOriginalRecorded(input)).toThrow('owner unavailable');if(mode==='abort')controller.abort();else alive=false}}},available,key,finalize))
  expect(await engine.prepareOriginalRecorded(input,{signal:controller.signal})).toEqual({status:'cancelled'})
  expect(progress).toHaveBeenCalledOnce();expect(owner.prepared).toBe(false);expect(owner.mask).toBe(mask);expect(owner.composite.isReady()).toBe(true);expect(owner.composite.preparedResources()).toEqual(resources);expect(owner.composite.brushGlBatchInfo().epoch).toBe(binding.epoch);expect(owner.composite.brushGlBatchInfo().resources).toEqual(binding.resources);expect(programs).not.toHaveBeenCalled();expect(owner.prepass.isReady()).toBe(prepassReady);if(prepassReady)expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('keeps a concurrent original behind the SAME cold resource candidate and retries after its subscriber cancels',async()=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope,controller=new AbortController()
 try{
  const owner=engine['_canonicalLayerOwner']!,op=t.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope),run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']);let second:ReturnType<typeof engine.prepareOriginalRecorded>|undefined,done=false,once=false
  if(!('delivery'in input))throw Error('delivery')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((jobs,options,available,key,finalize)=>run(jobs,{...options,onProgress:(n,total)=>{options.onProgress?.(n,total);if(n===1&&!once){once=true;expect(owner.resourceCandidate).toBeDefined();expect(owner.prepared).toBe(false);second=engine.prepareOriginalRecorded(input).then(result=>{done=true;return result});expect(done).toBe(false);controller.abort()}}},available,key,finalize))
  expect(await engine.prepareOriginalRecorded(input,{signal:controller.signal})).toEqual({status:'cancelled'});if(!second)throw Error('Missing original waiter');expect(await second).toEqual({status:'ready'});expect(done).toBe(true);expect(owner.mask.width).toBe(54);expect(owner.prepared).toBe(true);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_log'].entries).toHaveLength(0)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
