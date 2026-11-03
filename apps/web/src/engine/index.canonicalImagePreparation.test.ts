import softPressureActual from '../../../../packages/shared/src/fixtures/sourceSoftAutoData/texturePressure.native-default.compiled4.metadata.json'
import{extractCanonicalSoftAutoNativeDefaultTextureProgramData,canonicalSoftAutoNativeDefaultTextureSourceBinding,canonicalSoftNativeDefaultTexturedSourceMaterialContext,canonicalStrokeSnapshotV6}from'@grafetto/shared'
import{sourceNativeDefaultMaterialProgramCpuBytes}from'./src/presets/sourceStrokeAuthor'
import pressureActual from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json'
import {extractCanonicalDefaultAutoPressureTextureProgramData,canonicalDefaultAutoPressureTextureSourceBinding,canonicalPressureTexturedSourceMaterialContext,canonicalPressureCurvePrimaryTexturePin,canonicalStrokeSnapshotV5} from '@grafetto/shared'
import * as pressureDescriptorApi from './src/presets/sourceStrokeAuthorDescriptor'
import {sourcePressureMaterialProgramCpuBytes} from './src/presets/sourceStrokeAuthor'
import fixedRegular from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json'
import {CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE,canonicalStrokeSnapshotV2,canonicalDefaultAutoFixedTextureSourceBinding,extractCanonicalDefaultAutoFixedTextureCapability,canonicalTexturedSourceMaterialContext,canonicalStrokeSnapshotV4,sourceAutoGeometry,decodeCanonicalRecordedSnapshotFrame} from '@grafetto/shared'
import * as brushLibraryApi from '../lib/api/brushLibrary'
import {indexedSocketFixture} from './testing/canonicalIndexedReadFixture'
import type {CanonicalIndexedRead} from './src/oplog/CanonicalRecordedDelivery'
import {canonicalImageMaterialPin} from '@grafetto/shared'
import {transformedMaskPrepassBudget} from './src/dabs/TransformedMaskPrepass'
import {CanonicalRgba8CompositePass,canonicalRgba8CompositeBudget} from './src/dabs/CanonicalRgba8CompositePass'
import {canonicalPrimaryTextureMaterialContext,buildCanonicalMaterial,canonicalStrokeSnapshotV3} from '@grafetto/shared'
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
import {installBrushPixels,clearImportedBrushPixels,installBrushLibrary,importedAssetPixels} from './src/presets/importedBrushes'
import {prepareCanonicalRoomState} from '../pages/Room/net/canonicalRoomState'
import {createTestEngine} from './testing/engineTestUtils'
import {PencilEngine} from './index'
import {createOrderedBrushGate} from '../pages/Room/net/orderedBrushGate'
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset)
const asset=binding.assets[0]
const requiredIndexes=canonicalImageRequiredSourceLevels(binding.primarySource,binding.assets)[0].indexes
function sourceTrace(pipe?:typeof graphiteAuthor|typeof mountainsAuthor,imageAsset=fixture.asset,strokeId='original-basic6'){
 const selected=pipe?pipe.descriptor as unknown as BrushDescriptor:descriptor,pin=pipe?canonicalImagePipeSourceBinding(selected,pipe.assets):canonicalImageSourceBinding(descriptor,imageAsset)
 const compiled=sourceStrokeAuthorDescriptor(selected,{...(pipe?{assets:pipe.assets}:{asset:imageAsset}),colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program)
 let state=pipe?author.createState(1,2,0):author.createState(4321,7654,.3)
 const material:SourceStrokeMaterialContextV2={version:2,...pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${selected.id}@${selected.version}`,strokeId,boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(selected)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
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
function engineFor(p:ReturnType<typeof original>|CanonicalIndexedRead,author=false,service?:NonNullable<NonNullable<Parameters<typeof createTestEngine>[0]>['canonicalAuthor']>,onLocalOperation?:(op:Operation)=>void){
 const r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:512,pageHeight:512,...('canonicalRead'in p?{canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations}}:{canonicalIndexedRoom:p}),...(author?{canonicalAuthor:service??{begin:async()=>{throw Error('Unexpected BEGIN')}},onLocalOperation:onLocalOperation??vi.fn()}: {})},{width:512,height:512}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,512,512]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
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
 Object.assign(gl,{bufferSubData:vi.fn(),getExtension:(name:string)=>{if(!extensions.has(name))extensions.set(name,extension(name));return extensions.get(name)},VIEWPORT:9001,COLOR_CLEAR_VALUE:9002,COLOR_WRITEMASK:9003,HIGH_FLOAT:9004,getAttribLocation:(_p:WebGLProgram,name:string)=>['a_position','a_origin','a_step','a_span','position'].indexOf(name),getShaderPrecisionFormat:()=>({precision:23,rangeMin:127,rangeMax:127}),getVertexAttrib:()=>null,getVertexAttribOffset:()=>0,isTexture:()=>true,isBuffer:()=>true,colorMask:()=>{},getTexParameter:(_t:number,key:number)=>key===gl.TEXTURE_MIN_FILTER||key===gl.TEXTURE_MAG_FILTER?mock.getMinFilter(get(gl.TEXTURE_BINDING_2D) as Parameters<typeof mock.getMinFilter>[0])??gl.NEAREST:gl.CLAMP_TO_EDGE,getParameter:(key:number)=>key===9001?[0,0,8,8]:key===9002?[0,0,0,0]:key===9003?[true,true,true,true]:get(key)})
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
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,begin=vi.spyOn(bank,'prepareRoot'),changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'shared-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'shared-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
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
it('adds a larger original image capacity without displacing an OPEN image owner',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,before=bank.resources(),cpu=engine['_brushMipCache'].reservedBytes
  const snapshot={...trace.snapshot,material:{...trace.snapshot.material,primarySource:{...trace.snapshot.material.primarySource,brushScale:.5}}}
  const input=imageInput(p,trace.operations.at(-1)!,snapshot),upload=vi.spyOn(engine['gl'],'texImage2D')
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});expect(upload).toHaveBeenCalled();expect(owner.bank).toBe(bank);expect(bank.resources().length).toBeGreaterThanOrEqual(before.length);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(cpu);expect(owner.resourceCandidate).toBeUndefined();expect(owner.coordinator?.checkpointReady).toBe(false)
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
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'wait-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'wait-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot),begin=bank.prepareRoot.bind(bank)
  vi.spyOn(bank,'prepareRoot').mockImplementation((...args)=>{events.push('candidate');return begin(...args)})
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
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,begin=vi.spyOn(bank,'prepareRoot'),changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'wait-stop-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'wait-stop-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
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
  engine.setPencil(graphite);engine.setSize(16);const upload=vi.spyOn(engine['gl'],'texImage2D'),begin=vi.spyOn(bank,'prepareRoot')
  await expect(engine.prepareBrush(graphite)).resolves.toEqual({status:'ready'});expect(begin).toHaveBeenCalledOnce();expect(upload).toHaveBeenCalled();expect(owner.bank).toBe(bank);expect(keys.length).toBeGreaterThan(0);expect(bank.jobs.length).toBeGreaterThan(0);expect(bank.jobs.every(j=>j.kind==='native-image'&&graphiteAuthor.assets.some(a=>a.id===j.resource.id))).toBe(true);expect(bank.gpuBytes).toBe(bank.jobs.reduce((n,j)=>n+j.bytes,0));expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(engine['_canonicalPreparedAuthor']).not.toBe(prepared);expect(engine['_canonicalPreparedAuthor']?.preset).toBe(graphite);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThan(cpu)
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
 const h=await autoHarness(async request=>verdict(request),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h,preset=installPipeAuthor(mountainsAuthor)
 try{
  engine.setPencil(preset);engine.setSize(360);await engine.prepareBrush(preset)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,first=bank.jobs[0],epoch=owner.prepass.preparedCapacity().epoch
  engine.setPencil(autoPreset);engine.setSize(40);await expect(engine.prepareBrush(autoPreset)).resolves.toEqual({status:'ready'})
  expect(owner.bank).toBe(bank);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);owner.cache.discard(first.key);expect(await engine.prepareOriginalRecorded(imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor))[0])).toEqual({status:'ready'});expect(bank.isReady()).toBe(true);expect(engine['_canonicalPreparedAuthor']?.preset).toBe(autoPreset)
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
 try{await engine.prepareBrush(autoPreset);engine.setPencil(basic);engine.setSize(7.5);await engine.prepareBrush(basic);const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,old=engine['_canonicalPreparedAuthor'],oldKey=owner.prepass.brushGlBatchInfo().ownedPointSamplers![0].key,selected=installPipeAuthor(mountainsAuthor),discard=owner.cache.discard.bind(owner.cache),fault=Error('old workspace retirement');let thrown=false;vi.spyOn(owner.cache,'discard').mockImplementation((key,lost)=>{discard(key,lost);if(key===oldKey&&!thrown){thrown=true;throw fault}});engine.setPencil(selected);engine.setSize(360);await expect(engine.prepareBrush(selected)).rejects.toBe(fault);expect(thrown).toBe(true);expect(owner.bank).toBe(bank);expect(owner.mask.width).toBeGreaterThan(360);expect(owner.prepass.isReady()).toBe(true);expect(owner.composite.isReady()).toBe(true);expect(owner.bank!.isReady()).toBe(true);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(await engine.prepareBrush(selected)).toEqual({status:'ready'})}finally{vi.restoreAllMocks();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
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
it.each(['partial','final']as const)('grows an original Mountains workspace across A %s cursor, then drains B before A confirmations',async phase=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h
 let gate:ReturnType<typeof createOrderedBrushGate>|undefined
 try{
  await engine.prepareBrush(autoPreset)
  const owner=engine['_canonicalLayerOwner']!,program=engine['_canonicalPreparedAuthor'],oldEpoch=owner.prepass.preparedCapacity().epoch
  const advanceAuto=owner.prepass.advanceAutoGeneration.bind(owner.prepass),pauseAuto=vi.spyOn(owner.prepass,'advanceAutoGeneration').mockImplementation(()=>({done:false,consumed:0,uploadedBytes:0}))
  engine['_onStart'](packet(20,0));engine['_onMove'](packet(60,10))
  await vi.waitFor(()=>expect(owner.prepass['pendingAuto']).toBeDefined(),{timeout:5000})
  const coordinator=owner.coordinator!,advance=coordinator.advance.bind(coordinator),pause=vi.spyOn(coordinator,'advance').mockImplementation(()=>{})
  pauseAuto.mockImplementation(advanceAuto)
  if(phase==='final')for(let turns=0;!owner.prepass['pendingAuto']?.computedFinal;turns++){if(turns>10000)throw Error('Unbounded mask computation');advanceAuto(64,{deferFinalUpload:true})}
  const pending=owner.prepass['pendingAuto']!,participant=pending.participant
  expect(participant).not.toBe(owner.prepass);expect(pending.computedFinal).toBe(phase==='final')
  installPipeAuthor(mountainsAuthor)
  const run=engine['_brushPreparation'].run.bind(engine['_brushPreparation'])
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((jobs,options,available,key,finalize)=>run(jobs,options,available,key,outcome=>{const result=finalize?.(outcome);if(owner.mask.width===722){expect(owner.prepass['pendingAuto']).toBe(pending);expect(participant.brushGlBatchInfo().epoch).toBe(oldEpoch);pause.mockImplementation(advance)}return result}))
  const inputs=imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor)),addition=vi.spyOn(owner.prepass,'prepareCapacityAddition'),replace=vi.spyOn(owner.prepass,'prepareCapacityUpdate'),journal=engine['_log'].entries
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'})
  expect(addition).toHaveBeenCalledOnce();expect(replace).not.toHaveBeenCalled();expect(owner.mask.width).toBe(722);expect(owner.prepass.preparedCapacity().epoch).not.toBe(oldEpoch)
  expect(participant.brushGlBatchInfo().epoch).toBe(oldEpoch);expect(owner.coordinator).toBe(coordinator);expect(engine['_canonicalPreparedAuthor']).toBe(program);expect(engine['_log'].entries).toBe(journal)
  pause.mockImplementation(advance)
  let complete!:()=>void,fail!:(reason:unknown)=>void;const drained=new Promise<void>((resolve,reject)=>{complete=resolve;fail=reject});gate=createOrderedBrushGate(()=>null,fail)
  for(const [i,input]of inputs.entries())gate.dispatch([],()=>{engine.appendOriginalRecorded(input);if(i===inputs.length-1)complete()},()=>true,async()=>{expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'})})
  await vi.waitFor(()=>expect({journal:engine['_log'].entries.length,queued:coordinator.queuedFrameCount,pending:!!owner.prepass['pendingAuto'],failed:owner.failed,parked:owner.orderParked,job:!!owner.job}).toMatchObject({journal:inputs.length}),{timeout:10000});await drained
  const initial=h.operations.length
  for(const op of h.operations){const input=autoConfirmed(h,op,engine['_log'].entries.length+1);expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  engine['_onMove'](packet(100,20));engine['_onEnd'](packet(100,30));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000})
  for(const op of h.operations.slice(initial)){const input=autoConfirmed(h,op,engine['_log'].entries.length+1);expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:15000})
  expect(owner.failed).toBe(false);expect(engine['_log'].entries.map(e=>e.serverSeq)).toEqual(Array.from({length:inputs.length+h.operations.length},(_,i)=>i+1));expect(owner.resourceCandidate).toBeUndefined()
 }finally{gate?.cancel();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it('adds original seeded auto capacity while an actual generic A remains OPEN, without changing its selected program',async()=>{
 const h=await autoHarness(async r=>{const v=verdict(r);if(!v.ok||!('materialVersion'in v.snapshot))throw Error('grant');return{...v,snapshot:{...v.snapshot,rasterProfile:G}}},autoDescriptor,()=>true,{width:64,height:64},G),{engine}=h
 try{
  await engine.prepareBrush(autoPreset);engine['_onStart'](packet(20,0));engine['_onMove'](packet(30,10));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  const owner=engine['_canonicalLayerOwner']!,program=engine['_canonicalPreparedAuthor'],epoch=owner.prepass.preparedCapacity().epoch,coordinator=owner.coordinator,trace=originalMarkerTrace(),inputs=imageInputs(h.p.canonicalRead.scope,0,trace),addition=vi.spyOn(owner.prepass,'prepareCapacityAddition'),compositeEpoch=owner.composite.preparedCapacity().epoch
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  expect(addition).toHaveBeenCalledOnce();expect(owner.mask.width).toBe(54);expect(owner.prepass.preparedCapacity().epoch).not.toBe(epoch);expect(owner.composite.preparedCapacity().epoch).toBe(compositeEpoch);expect(owner.coordinator).toBe(coordinator);expect(engine['_canonicalPreparedAuthor']).toBe(program)
  engine['_onEnd'](packet(30,20));await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false))
  for(const op of h.operations){const input=autoConfirmed(h,op,engine['_log'].entries.length+1);expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:10000});expect(owner.failed).toBe(false)
  expect(owner.coordinator).toBeUndefined();const mountains=installPipeAuthor(mountainsAuthor);engine.setPencil(mountains);engine.setSize(360);expect(await engine.prepareBrush(mountains)).toEqual({status:'ready'});expect(engine['_canonicalPreparedAuthor']?.preset).toBe(mountains);expect(owner.mask.width).toBe(722)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it('drops retired intermediate mask keys from same-capacity image publication before later original drawing',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 let intermediate:ReturnType<NonNullable<typeof engine['_canonicalLayerOwner']>['prepass']['retainPreparedCapacity']>|undefined
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,coordinator=owner.coordinator
  installPipeAuthor(graphiteAuthor);const graphite=imageInputs(p.canonicalRead.scope,162,sourceTrace(graphiteAuthor))[0];expect(await engine.prepareOriginalRecorded(graphite)).toEqual({status:'ready'})
  intermediate=owner.prepass.retainPreparedCapacity();const retiredKeys=intermediate.preparedResources().map(r=>r.key)
  installPipeAuthor(mountainsAuthor);expect(await engine.prepareOriginalRecorded(imageInputs(p.canonicalRead.scope,162,sourceTrace(mountainsAuthor))[0])).toEqual({status:'ready'});expect(owner.mask.width).toBe(722)
  const changed={...fixture.asset,x:asset.x-1},recropped=sourceTrace(undefined,changed,'new-crop-after-growth'),operations=recropped.operations.map(op=>({...op,id:'post-growth-'+op.id})),inputs=imageInputs(p.canonicalRead.scope,162,{snapshot:recropped.snapshot,operations})
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'});intermediate.release();intermediate=undefined
  for(const key of retiredKeys)expect(owner.cache.get(key)).toBeUndefined()
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  const end=imageInput(p,{...trace.operations.at(-1)!,seq:engine['_log'].entries.length+1});expect(await engine.prepareOriginalRecorded(end)).toEqual({status:'ready'});engine.appendOriginalRecorded(end)
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:15000});expect(owner.failed).toBe(false);expect(owner.coordinator).toBeUndefined();expect(coordinator?.cleanupFailures).toEqual([])
 }finally{intermediate?.release();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)
it.each(['abort','budget','upload','loss']as const)('rolls back original growth during %s while A has an unconfirmed OPEN prefix',async mode=>{
 const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>true,{width:512,height:512}),{engine}=h,controller=new AbortController()
 let release:(()=>void)|undefined
 try{
  await engine.prepareBrush(autoPreset);engine['_onStart'](packet(20,0));engine['_onMove'](packet(60,10))
  await vi.waitFor(()=>expect(engine['_authorInput'].pending).toBe(false),{timeout:5000});const owner=engine['_canonicalLayerOwner']!
  await vi.waitFor(()=>expect(owner.job).toBeUndefined(),{timeout:5000})
  installPipeAuthor(mountainsAuthor)
  const epoch=owner.prepass.preparedCapacity().epoch,mask=owner.mask,coordinator=owner.coordinator,program=engine['_canonicalPreparedAuthor'],journal=engine['_log'].entries,bytes=engine['_brushMipCache'].reservedBytes,input=imageInputs(h.p.canonicalRead.scope,0,sourceTrace(mountainsAuthor))[0],upload=engine['gl'].texImage2D.bind(engine['gl'])
  if(mode==='budget')release=engine['_brushMipCache'].reserve(engine['_brushMipCache'].budgetBytes-bytes-1)
  if(mode==='upload')vi.spyOn(engine['gl'],'texImage2D').mockImplementationOnce(()=>{throw Error('O3 incoming upload fault')})
  if(mode==='loss')vi.spyOn(engine['gl'],'texImage2D').mockImplementationOnce((...args:unknown[])=>{Reflect.apply(upload,engine['gl'],args);vi.spyOn(engine['gl'],'isContextLost').mockReturnValue(true);engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))})
  const result=engine.prepareOriginalRecorded(input,{signal:controller.signal});if(mode==='abort')controller.abort()
  if(mode==='abort'||mode==='loss')expect(await result).toEqual({status:'cancelled'});else await expect(result).rejects.toThrow()
  release?.();release=undefined
  expect(engine['_log'].entries).toBe(journal);expect(owner.resourceCandidate).toBeUndefined()
  if(mode!=='loss'){expect(owner.mask).toBe(mask);expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.coordinator).toBe(coordinator);expect(engine['_canonicalPreparedAuthor']).toBe(program);expect(owner.failed).toBe(false);expect(engine['_brushMipCache'].reservedBytes).toBe(bytes)}
 }finally{release?.();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
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
it.each(['abort','stale']as const)('keeps cold D unallocated when %s occurs in the prepublication progress callback',async mode=>{
 let alive=true;const h=await autoHarness(async r=>verdict(r),autoDescriptor,()=>alive,{width:64,height:64},G),{engine}=h,t=originalMarkerTrace(),scope=h.p.canonicalRead.scope,controller=new AbortController()
 try{
  const owner=engine['_canonicalLayerOwner']!,mask=owner.mask,cpu=engine['_brushMipCache'].reservedBytes,journal=engine['_log'].entries,op=t.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:scope.roomId,boardEpoch:scope.boardEpoch,capabilities:[{originalUserId:'author',snapshot:t.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}]},[op],scope)[0],input=attachCanonicalRecordedDelivery(atom,scope),run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']),progress=vi.fn()
  if(!('delivery'in input))throw Error('delivery')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((factories,options,available,key,finalize)=>run(factories,{...options,onProgress:(done,total)=>{options.onProgress?.(done,total);if(done===1){expect(owner.prepass.isReady()).toBe(false);expect(owner.resourceCandidate).toBeDefined();progress();if(mode==='abort')controller.abort();else alive=false}}},available,key,finalize))
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

function textureOriginal(open=false){
 const gray=Uint8Array.from({length:64},(_,i)=>i*3),id:`asset:${string}`=`asset:${createHash('sha256').update(gray).digest('hex')}`,pattern={id,size:8,x:0,y:0,width:4,height:4}
 installBrushPixels(id,gray)
 const material=canonicalPrimaryTextureMaterialContext({version:3,assets:[asset,pattern],primarySource:binding.primarySource,primaryTexture:{kind:'canvasTexture',asset:id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:1,offsetY:2,strength:'pressure-identity-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV3({...trace.snapshot,strokeId:'texture-engine',materialVersion:3,material,assets:material.assets,rasterProfile:G,composition:{...trace.snapshot.composition,alphaDarken:'hard'}},1,G)
 const encoder=new SourceCanonicalFrameEncoder({...snapshot,material}),recipe={kind:'image' as const,asset:asset.id,brushScale:binding.primarySource.brushScale,brushAngle:binding.primarySource.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
 const operations:CanonicalStrokeOperation[]=[0,.5,1].map((grainDepth,i)=>{
  const packed=buildCanonicalMaterial({masked:false,entry:i?{phase:'primary',group:0}:{phase:'between'},draws:[{recipe,role:'primary',x:20+i*4,y:20,opacity:.8,flow:.7,grainDepth}],fences:[...i?[]:[{kind:'segmentBegin' as const,at:0,group:0}],...i===2?[{kind:'primaryEnd' as const,at:1,group:0},{kind:'segmentEnd' as const,at:1,group:0},{kind:'gestureEnd' as const,at:1}]:[]]},material).packed
  return{id:'texture-'+i,userId:'author',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(packed).envelope}
 })
 const base=original().wire,tail=open?operations.slice(0,-1):operations
 const wire={...base,canonicalAuthorRasterProfile:G,canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[G]},tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return{...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),wire,operations,snapshot,pattern}
}
it.each([false,true])('uses ONE root-residency cold pipeline for genuine CMAT3 (open=%s), with raw pattern once and plain outer passes',async open=>{
 const p=textureOriginal(open),{engine}=engineFor(p),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,root=owner.fullSource!
  expect(root).toBeDefined();expect(owner.bank!['mode']).toBe('root-residency');expect(owner.bank!.jobs.filter(j=>j.kind==='raw-pattern-l8')).toHaveLength(1)
  expect(root.preparedResources().every(r=>r.canonical?.asset.id===asset.id)).toBe(true)
  expect(owner.composite.supportsTexturedOperations(['alphaDarken32FusedScalar'])).toBe(true)
  if(open){
   const op=p.operations.at(-1)!,atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope)
   if(!('delivery'in input))throw Error('Actual original missing')
   expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)
   await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:10000})
  }
  expect(engine['_log'].entries).toHaveLength(3);expect(engine['_canonicalPixelsReady']).toBe(true)
  const sources=draw.mock.calls.map(([r])=>r.source),textures=sources.filter(s=>s.kind==='texturedMaskRgb')
  expect(textures.length).toBeGreaterThanOrEqual(3);expect(new Set(textures.map(s=>s.kind==='texturedMaskRgb'?s.strengthU8:-1))).toEqual(new Set([0,128,255]))
  expect(sources.some(s=>s.kind==='straightRgba8')).toBe(true);expect(sources.every(s=>s.kind==='texturedMaskRgb'||s.kind==='straightRgba8')).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each([false,true])('authors CMAT3 only with captured optin=%s and hands the SAME tip+pattern root to local drawing',async enabled=>{
 const t=textureOriginal(),d=structuredClone(descriptor)
 Reflect.set(d,'id','imported-'+createHash('sha256').update('self-authored-textured-basic6-engine').digest('hex'))
 Reflect.set(d.sourceStamp!.flags,'textureEnabled',true)
 Object.assign(d.sourceStamp!.settings,{'Texture/Pattern/Enabled':'true','PressureTexture/Strength/':'true','Texture/Strength/StrengthVersion':'2','Texture/Strength/UseCurve':'true','Texture/Strength/UseSameCurve':'true','Texture/Strength/Value':'1','Texture/Strength/curveMode':'0','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
 Reflect.set(d,'texture',{id:t.pattern.id,strength:1,periodPx:4,patternSize:{width:4,height:4},application:{mode:'subtract',soft:false},offset:{x:1,y:2,randomX:false,randomY:false}})
 const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),preset=`brush:${d.id}@${d.version}`,wire={...t.wire,tailOperations:[],canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:0,operationCount:0},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:[],bindings:[]}},p={...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),wire},operations:Operation[]=[],begins=vi.fn(async(request:CanonicalStrokeBegin,lifetime:{expectedDescriptorSha256:string})=>{
  expect(lifetime.expectedDescriptorSha256).toBe(sha)
  return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV3({...t.snapshot,brush:request.brush,strokeId:request.strokeId,descriptorSha256:sha,pigmentRgb8:request.pigmentRgb8,composition:{...t.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}
 })
 const library:unknown={schemaVersion:1,brushes:[{descriptor:d,name:'Self-authored textured Basic6 test',source:'native',warnings:[]}],assets:[asset,t.pattern].map(a=>({id:a.id,size:a.size,file:a.id.slice(6)+'.bin'})),skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid self-authored texture library');installBrushLibrary(library)
 const{engine}=engineFor(p,true,{...enabled?{primaryTextureSource:'pressure-identity-subtract-v3' as const}:{},begin:begins},op=>operations.push(op)),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(7.5);engine.setLocked(false)
  if(!enabled){await expect(engine.prepareBrush(preset)).rejects.toThrow();expect(begins).not.toHaveBeenCalled();expect(engine['_canonicalLayerOwner']!.defaultSourceRoots).toBeUndefined();return}
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});expect(engine['_canonicalPreparedAuthor']!.material.kind).toBe('imageTexture')
  const owner=engine['_canonicalLayerOwner']!,roots=owner.defaultSourceRoots!
  expect(roots).toHaveLength(1);expect(owner.bank!.jobs.filter(j=>j.kind==='raw-pattern-l8')).toHaveLength(1)
  // Warm the first source-map/companion update and retained author token.
  // Later identical preparations must not retain another full root's metadata.
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
  const warmCpu=engine['_brushMipCache'].reservedBytes
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'})
  expect(engine['_brushMipCache'].reservedBytes).toBe(warmCpu);expect(owner.defaultSourceRoots![0].lease).toBe(roots[0].lease)
  engine['_onStart'](packet(20,0));engine['_onMove'](packet(24,10));engine['_onEnd'](packet(24,20))
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
  expect(begins).toHaveBeenCalledOnce();expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb')).toBe(true);expect(owner.defaultSourceRoots).toHaveLength(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('reprepares genuine A after speculative B on the SAME full owner and then delivers A through the normal original path',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,changed={...fixture.asset,x:asset.x-1},a=sourceTrace(undefined,changed,'handoff-A'),inputs=imageInputs(p.canonicalRead.scope,162,{snapshot:a.snapshot,operations:a.operations.map(op=>({...op,id:'handoff-A-'+op.id}))})
  installPipeAuthor(graphiteAuthor);const b=imageInputs(p.canonicalRead.scope,162,sourceTrace(graphiteAuthor))[0]
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'});const first=owner.indexedSource!.lease
  expect(await engine.prepareOriginalRecorded(inputs[0])).toEqual({status:'ready'});expect(owner.indexedSource!.lease).toBe(first)
  expect(await engine.prepareOriginalRecorded(b)).toEqual({status:'ready'});expect(()=>first.resources()).toThrow();expect(owner.indexedSource!.input).toBe(b)
  // The real caller always prepares the input immediately before append. A's
  // original read/lifetime is unchanged; no replacement delivery/grant is minted.
  for(const input of inputs){expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input)}
  const end=imageInput(p,{...trace.operations.at(-1)!,seq:162+inputs.length+1});expect(await engine.prepareOriginalRecorded(end)).toEqual({status:'ready'});engine.appendOriginalRecorded(end)
  await vi.waitFor(()=>expect(engine['_canonicalExportReady']()).toBe(true),{timeout:15000})
  expect(owner.failed).toBe(false);expect(owner.indexedSource).toBeUndefined();expect(owner.defaultSourceRoots!.length).toBeLessThanOrEqual(3);expect(engine['_log'].entries).toHaveLength(163+inputs.length)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps concurrent SAME-CAS texture phases in distinct preparation keys and paints only the actual admitted phase',async()=>{
 const p=textureOriginal(true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,source=p.snapshot.material,recipe=decodeCanonicalStrokeFrame(p.operations[0].frame,{rasterProfile:G,materialVersion:3,brush:p.snapshot.brush,strokeId:p.snapshot.strokeId,frameOrdinal:0,pigmentRgb8:p.snapshot.pigmentRgb8,composition:p.snapshot.composition,material:source}).frame.definitions[0]
  const make=(name:string,offsetX:number)=>{
   const material=canonicalPrimaryTextureMaterialContext({...source,primaryTexture:{...source.primaryTexture,offsetX}}),snapshot=canonicalStrokeSnapshotV3({...p.snapshot,strokeId:name,material,assets:material.assets},1,G)
   const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:20,y:20,opacity:1,flow:1,grainDepth:.5}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},material).packed
   const op:CanonicalStrokeOperation={id:name,userId:'author',timestamp:0,seq:3,type:'canonical_stroke',layerId:'layer-1',frame:{version:2,rasterProfile:G,brush:snapshot.brush,strokeId:name,frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}},atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:name,sequence:3,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope)
   if(!('delivery'in input))throw Error('Missing genuine phase input');return input
  }
  const a=make('texture-phase-a',2),b=make('texture-phase-b',3),run=vi.spyOn(engine['_brushPreparation'],'run'),prepare=vi.spyOn(owner.bank!,'prepareRoot')
  const before=engine['_log'].entries.length
  expect(await Promise.all([engine.prepareOriginalRecorded(a),engine.prepareOriginalRecorded(b)])).toEqual([{status:'ready'},{status:'ready'}])
  const keys=run.mock.calls.map(call=>call[3]).filter(key=>key?.startsWith('recorded-image:'))
  expect(keys).toHaveLength(2);expect(new Set(keys).size).toBe(2);expect(prepare).toHaveBeenCalledTimes(2);expect(owner.indexedSource!.input).toBe(b);expect(engine['_log'].entries).toHaveLength(before)
  const draw=vi.spyOn(owner.composite,'drawSource')
  expect(await engine.prepareOriginalRecorded(a)).toEqual({status:'ready'});engine.appendOriginalRecorded(a)
  await vi.waitFor(()=>expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb')).toBe(true),{timeout:10000})
  expect(draw.mock.calls.filter(([r])=>r.source.kind==='texturedMaskRgb').every(([r])=>r.source.kind==='texturedMaskRgb'&&r.source.pin.strength==='pressure-identity-v1'&&r.source.pin.offsetX===2)).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps the old genuine root, source map and exact CPU baseline when retained selection-key reservation fails before map publication',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,before=engine['_brushMipCache'].reservedBytes,oldMap=owner.prepass['sources'],oldResources=owner.bank!.resources(),oldDefaults=owner.defaultSourceRoots,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'key-reservation-failure',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'key-reservation-failure',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot)
  const pin=canonicalImageMaterialPin(snapshot.material.primarySource,snapshot.material.assets),key='recorded-image:'+JSON.stringify([[pin],undefined,undefined]),fault=Error('selection-key reservation failed'),reserve=engine['_brushMipCache'].reserve.bind(engine['_brushMipCache']);let failed=false
  const spy=vi.spyOn(engine['_brushMipCache'],'reserve').mockImplementation(bytes=>{if(bytes===2*key.length){failed=true;expect(owner.prepass['sources']).toBe(oldMap);throw fault}return reserve(bytes)})
  await expect(engine.prepareOriginalRecorded(input)).rejects.toBe(fault);spy.mockRestore()
  expect(failed).toBe(true);expect(owner.prepass['sources']).toBe(oldMap);expect(owner.bank!.resources()).toEqual(oldResources);expect(owner.defaultSourceRoots).toBe(oldDefaults);expect(owner.indexedSource).toBeUndefined();expect(owner.fullSource!.isReady()).toBe(true);expect(engine['_brushMipCache'].reservedBytes).toBe(before)
  expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});expect(owner.defaultSourceRoots).toHaveLength(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['cancel','loss']as const)('releases the separately charged selection key when an actual indexed image candidate stops by %s after root publication',async mode=>{
 // This engine unit already installs verified original pixels; the normal API
 // availability seam is controlled rather than inventing a room-library HTTP session.
 const resources=vi.spyOn(brushLibraryApi,'prepareCanonicalImageAssets').mockImplementation(async(board,assets,assertCurrent)=>{assertCurrent();expect(board).toBe('room');expect(assets).toHaveLength(1);expect(assets[0].id).toBe(asset.id);expect(assets[0].size).toBe(asset.size);expect(importedAssetPixels(asset.id)).toEqual(bytes);assertCurrent()})
 const operations=[{...trace.operations[0],seq:1}],snapshot={...trace.snapshot,boardEpoch:2},issuer=indexedSocketFixture(operations,1)
 issuer.offer.roomGeometry.width=512;issuer.offer.roomGeometry.height=512
 const attachment=(rows:typeof operations)=>({version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'author',snapshot}],bindings:rows.map(op=>({operationId:op.id,sequence:op.seq,originalUserId:op.userId,capability:0}))})
 const next=issuer.handlers.canonical_history_stream_next
 issuer.handlers.canonical_history_stream_next=async body=>{const reply=await next(body);if(!reply||typeof reply!=='object'||!('value'in reply))throw Error('Actual page missing');const value=reply.value;if(!value||typeof value!=='object'||!('operations'in value)||!Array.isArray(value.operations))throw Error('Actual page rows missing');return{...reply,value:{...value,canonicalCapabilities:attachment(value.operations)}}}
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:1,root:body.root,rows:operations,canonicalCapabilities:attachment(operations),first:0,terminal:null,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 const read=await issuer.open(),{engine}=engineFor(read),prepare=engine['_prepareOriginalRecorded'].bind(engine)
 try{
  await engine.paperReady();const baseline=engine['_brushMipCache'].reservedBytes;let captured:NonNullable<typeof engine['_canonicalLayerOwner']>|undefined,seenKey=''
  engine['_prepareOriginalRecorded']=async(...args)=>{const result=await prepare(...args),owner=args[0];if(owner?.defaultSourceRoots?.length){captured=owner;seenKey=owner.defaultSourceRoots[0].selectionKey;expect(seenKey.length).toBeGreaterThan(0);if(mode==='loss')engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}));else engine['_cancelRebuildJob']('layer-1')}return result}
  await expect(engine.restoreCanonicalIndexedRoom(read)).rejects.toThrow()
  expect(resources).toHaveBeenCalled();expect(seenKey).not.toBe('');expect(captured!.defaultSourceRoots).toBeUndefined();expect(engine.getCanonicalIndexedCut()).toBeNull();expect(engine['_brushMipCache'].reservedBytes).toBe(baseline)
 }finally{engine['_prepareOriginalRecorded']=prepare;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('loads cold original CAS through the actual indexed page before replaying an OPEN CMAT3 root across 64/48 frames',async()=>{
 const tipGray=new Uint8Array(64).fill(100),patternGray=Uint8Array.from({length:64},(_,i)=>i*3),cas=(gray:Uint8Array)=>`asset:${createHash('sha256').update(gray).digest('hex')}` as `asset:${string}`
 const tip={id:cas(tipGray),size:8,x:0,y:0,width:8,height:8},pattern={id:cas(patternGray),size:8,x:0,y:0,width:4,height:4}
 const material=canonicalPrimaryTextureMaterialContext({version:3,assets:[tip,pattern],primarySource:{kind:'image',asset:tip.id,brushScale:1,brushAngle:0},primaryTexture:{kind:'canvasTexture',asset:pattern.id,law:'subtract-u8-v1',width:4,height:4,periodX:4,periodY:4,offsetX:1,offsetY:2,strength:'pressure-identity-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV3({...trace.snapshot,boardEpoch:2,strokeId:'cold-page-crossing',materialVersion:3,material,assets:material.assets,rasterProfile:G,composition:{...trace.snapshot.composition,alphaDarken:'hard'}},2,G),encoder=new SourceCanonicalFrameEncoder(snapshot)
 const recipe={kind:'image' as const,asset:tip.id,brushScale:1,brushAngle:0,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:8,height:8,mirrorH:false,mirrorV:false}
 const operations:CanonicalStrokeOperation[]=Array.from({length:112},(_,i)=>({type:'canonical_stroke',id:'cold-original-'+i,userId:'author',timestamp:i,seq:i+1,layerId:'layer-1',frame:encoder.encode(buildCanonicalMaterial({masked:false,entry:i?{phase:'primary',group:0}:{phase:'between'},draws:[{recipe,role:'primary',x:20+i%4,y:20,opacity:1,flow:1,grainDepth:.5}],fences:[...i?[]:[{kind:'segmentBegin' as const,at:0,group:0}],...i===111?[{kind:'primaryEnd' as const,at:1,group:0},{kind:'segmentEnd' as const,at:1,group:0},{kind:'gestureEnd' as const,at:1}]:[]]},material).packed).envelope}))
 const issuer=indexedSocketFixture(operations,64);Object.assign(issuer.offer,{authorRasterProfile:G,roomGeometry:{width:512,height:512,infinite:false}});Object.assign(issuer.offer.scope,{allowedRasterProfiles:[G]})
 const attachment=(rows:readonly Operation[])=>({version:1,roomId:'room',boardEpoch:2,capabilities:rows.some(op=>op.type==='canonical_stroke')?[{originalUserId:'author',snapshot}]:[],bindings:rows.filter(op=>op.type==='canonical_stroke').map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))})
 const next=issuer.handlers.canonical_history_stream_next
 issuer.handlers.canonical_history_stream_next=async body=>{const reply=await next(body);if(!reply||typeof reply!=='object'||!('value'in reply))throw Error('Genuine page reply required');const value=reply.value;if(!value||typeof value!=='object'||!('operations'in value)||!Array.isArray(value.operations))throw Error('Genuine page originals required');return{...reply,value:{...value,canonicalCapabilities:attachment(value.operations)}}}
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:112,root:body.root,rows:[operations[0],operations[111]],canonicalCapabilities:attachment([operations[0],operations[111]]),first:0,terminal:1,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 clearImportedBrushPixels()
 const loaded=new Set<string>(),availability=vi.spyOn(brushLibraryApi,'prepareCanonicalImageAssets').mockImplementation(async(_board,assets,assertCurrent)=>{assertCurrent();for(const a of assets){expect([tip.id,pattern.id]).toContain(a.id);installBrushPixels(a.id,a.id===tip.id?tipGray:patternGray);loaded.add(a.id)}assertCurrent()})
 const read=await issuer.open(),{engine}=engineFor(read),admission=engine['_prepareOriginalRecorded'].bind(engine);let admittedFirstPage=false,readSecondPageAfterOpen=false
 engine['_prepareOriginalRecorded']=async(...args)=>{if(args[1].operation.seq===1)admittedFirstPage=loaded.has(tip.id)&&loaded.has(pattern.id);return admission(...args)}
 const networkNext=issuer.handlers.canonical_history_stream_next
 issuer.handlers.canonical_history_stream_next=body=>{if(body.afterSeq===64){expect(admittedFirstPage).toBe(true);expect(engine.getCanonicalIndexedCut()).toBeNull();readSecondPageAfterOpen=true}return networkNext(body)}
 try{
  await expect(engine.restoreCanonicalIndexedRoom(read)).resolves.toBeUndefined()
  expect(engine['_canonicalLayerOwner']!.composite.supportsTexturedOperations(['alphaDarken32FusedScalar','over32FusedScalar'])).toBe(true);expect(engine['_canonicalLayerOwner']!.composite['reservedCpuBytes']).toBe(41008);
  expect(availability).toHaveBeenCalled();expect(loaded).toEqual(new Set([tip.id,pattern.id]));expect(readSecondPageAfterOpen).toBe(true)
  expect(engine.getCanonicalIndexedCut()).toMatchObject({throughSeq:112,operationCount:112});expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(issuer.requests.filter(r=>r.event==='canonical_history_stream_next').map(r=>r.body.afterSeq)).toEqual([0,64,112])
 }finally{engine['_prepareOriginalRecorded']=admission;engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

/** Retained Regular mechanism + NEW self-authored pattern. Not vendor CAS identity. */
function fixedTextureOriginal(open=false,empty=false,alive=()=>true,count=3){
 const gray=Uint8Array.from({length:256},(_,i)=>(i*37+11)%256),id=`asset:${createHash('sha256').update(gray).digest('hex')}`
 const candidate=structuredClone(fixedRegular.descriptor);Reflect.set(candidate,'id','imported-'+createHash('sha256').update('self-authored-fixed-auto-engine').digest('hex'));Reflect.set(candidate,'version',1)
 if(!candidate.texture)throw Error('Retained texture missing');Reflect.set(candidate.texture,'id',id)
 const library:unknown={schemaVersion:1,brushes:[{descriptor:candidate,name:'Self-authored fixed texture mechanism',source:'self-authored-test',warnings:[]}],assets:[{id,size:16,file:id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid fixed texture test library')
 const d=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),semantic=extractCanonicalDefaultAutoFixedTextureCapability(d,{pattern:{id:library.assets[0].id,size:16}})
 if(!semantic.supported)throw Error(semantic.reasons.join(','))
 const pin=canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'neon64-f32-fma-v1',{id:library.assets[0].id,size:16},G),material=canonicalTexturedSourceMaterialContext({version:4,primarySource:pin,assets:[semantic.capability.patternAsset],primaryTexture:semantic.capability.primaryTexture,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV4({materialVersion:4,material,assets:material.assets,layerId:'layer-1',brush:`brush:${d.id}@1`,strokeId:'fixed-texture-engine',boardEpoch:1,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[12,34,56],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},1,G)
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false},encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=Array.from({length:count},(_,i)=>({id:'fixed-engine-'+i,userId:'author',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(buildCanonicalMaterial({masked:false,entry:i?{phase:'primary',group:0}:{phase:'between'},draws:[{recipe,role:'primary',x:20+(i%32)*4,y:20,opacity:.8,flow:.7,grainDepth:1}],fences:[...i?[]:[{kind:'segmentBegin' as const,at:0,group:0}],...i===count-1?[{kind:'primaryEnd' as const,at:1,group:0},{kind:'segmentEnd' as const,at:1,group:0},{kind:'gestureEnd' as const,at:1}]:[]]},material).packed).envelope}))
 installBrushPixels(id,gray)
 const tail=empty?[]:open?operations.slice(0,-1):operations,wire={...original().wire,canonicalAuthorRasterProfile:G,canonicalAuthorTexturedSource:'fixed-default-auto-texture-v4' as const,canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[G]},tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:tail.length?[{originalUserId:'author',snapshot}]:[],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return{...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:alive}),wire,operations,snapshot,library,descriptor:d,pattern:material.assets[0],gray}
}
it.each([false,true])('replays real material4 through SAME pattern-only full/open root pipeline (open=%s)',async open=>{
 const p=fixedTextureOriginal(open),{engine}=engineFor(p),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,root=owner.fullSource!
  expect(root).toBeDefined();expect(owner.bank!.jobs).toHaveLength(1);expect(owner.bank!.jobs[0].kind).toBe('raw-pattern-l8');expect(root.preparedResources()).toHaveLength(0)
  if(open){const op=p.operations[2],atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:3,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Missing original');expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:10000})}
  expect(engine['_log'].entries).toHaveLength(3);expect(engine['_canonicalPixelsReady']).toBe(true)
  const sources=draw.mock.calls.map(([r])=>r.source),textures=sources.filter(s=>s.kind==='texturedMaskRgb')
  expect(textures.length).toBeGreaterThanOrEqual(3);expect(textures.every(s=>s.kind==='texturedMaskRgb'&&s.strengthU8===255&&s.pin.strength==='fixed-one-v1')).toBe(true)
  expect(sources.some(s=>s.kind==='straightRgba8')).toBe(true);expect(sources.every(s=>s.kind==='texturedMaskRgb'||s.kind==='straightRgba8')).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['abort','stale']as const)('rolls back a cold pattern-only material4 candidate on %s with no retained key/root',async mode=>{
 let alive=true;const p=fixedTextureOriginal(false,true,()=>alive),{engine}=engineFor(p),controller=new AbortController()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,baseline=engine['_brushMipCache'].reservedBytes,oldMask=owner.mask,run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']),op=p.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:1,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope)
  if(!('delivery'in input))throw Error('Actual original input missing')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((jobs,options,available,key,finalize)=>run(jobs,{...options,onProgress:(done,total)=>{options.onProgress?.(done,total);if(done===1){if(mode==='abort')controller.abort();else alive=false}}},available,key,finalize))
  expect(await engine.prepareOriginalRecorded(input,{signal:controller.signal})).toEqual({status:'cancelled'});expect(owner.mask).toBe(oldMask);expect(owner.bank).toBeUndefined();expect(owner.defaultSourceRoots).toBeUndefined();expect(owner.resourceCandidate).toBeUndefined();expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(baseline)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each([false,true])('authors fixed4 only through captured original policy optin=%s with native pressure geometry',async enabled=>{
 const p=fixedTextureOriginal(false,true),preset=p.snapshot.brush,operations:Operation[]=[],draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource'),begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:{expectedDescriptorSha256:string})=>{expect(lifetime.expectedDescriptorSha256).toBe(p.snapshot.descriptorSha256);return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV4({...p.snapshot,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}})
 installBrushLibrary(p.library)
 let engine:PencilEngine;const created=engineFor(p,true,{...enabled?{texturedSource:'fixed-default-auto-texture-v4' as const}:{},begin},op=>{const lane=engine['_canonicalLayerOwner']?.coordinator;expect(lane).toBeDefined();expect([...lane!['entries'].values()].some(e=>e.local?.receipts.some(r=>r.operation===op))).toBe(true);operations.push(op)});engine=created.engine
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(40);engine.setLocked(false)
  if(!enabled){await expect(engine.prepareBrush(preset)).rejects.toThrow();expect(begin).not.toHaveBeenCalled();return}
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});expect(engine['_canonicalPreparedAuthor']!.material.kind).toBe('autoTexture')
  const owner=engine['_canonicalLayerOwner']!,root=owner.defaultSourceRoots![0].lease
  await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});const cpu=engine['_brushMipCache'].reservedBytes
  for(let i=0;i<2;i++){await expect(engine.prepareBrush(preset)).resolves.toEqual({status:'ready'});expect(owner.defaultSourceRoots).toHaveLength(1);expect(owner.defaultSourceRoots![0].lease).toBe(root);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu)}
  engine['_onStart']({...packet(20,0),pressure:.5});engine['_onMove']({...packet(36,10),pressure:1});engine['_onEnd']({...packet(36,20),pressure:1})
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
  expect(begin).toHaveBeenCalledOnce();expect(owner.bank!.jobs).toHaveLength(1)
  const frames=operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke').map(op=>decodeCanonicalRecordedSnapshotFrame(op.frame,{...p.snapshot,strokeId:op.frame.strokeId,pigmentRgb8:op.frame.pigmentRgb8,composition:op.frame.composition},op.frame.frameOrdinal).frame)
  const widths=new Set(frames.flatMap(f=>f.definitions.map(r=>r.width)));expect(widths.size).toBeGreaterThan(1);expect(frames.flatMap(f=>f.draws).every(d=>'grainDepth'in d&&d.grainDepth===1)).toBe(true)
  expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb'&&r.source.strengthU8===255)).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('loads actual material4 indexed OPEN root through 64/48 original pages and typedEND before accepted cut',async()=>{
 const p=fixedTextureOriginal(false,false,()=>true,112),snapshot=canonicalStrokeSnapshotV4({...p.snapshot,boardEpoch:2},2,G),issuer=indexedSocketFixture(p.operations,64)
 Reflect.set(issuer.offer,'authorRasterProfile',G);Reflect.set(issuer.offer,'authorTexturedSource','fixed-default-auto-texture-v4');Reflect.set(issuer.offer.scope,'allowedRasterProfiles',[G]);issuer.offer.roomGeometry.width=512;issuer.offer.roomGeometry.height=512
 const attachment=(rows:readonly CanonicalStrokeOperation[])=>({version:1 as const,roomId:'room',boardEpoch:2,capabilities:rows.length?[{originalUserId:'author',snapshot}]:[],bindings:rows.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:'author',capability:0}))})
 const open=issuer.handlers.canonical_history_stream_open,next=issuer.handlers.canonical_history_stream_next
 issuer.handlers.canonical_history_stream_open=async body=>{const reply=await open(body);if(!reply||typeof reply!=='object'||!('value'in reply)||!reply.value||typeof reply.value!=='object')throw Error('Missing original OPEN');return{...reply,value:{...reply.value,authorTexturedSource:'fixed-default-auto-texture-v4'}}}
 issuer.handlers.canonical_history_stream_next=async body=>{const reply=await next(body);if(!reply||typeof reply!=='object'||!('value'in reply)||!reply.value||typeof reply.value!=='object'||!('operations'in reply.value)||!Array.isArray(reply.value.operations))throw Error('Missing original page');const rows=p.operations.slice(Number(body.afterSeq),Number(body.afterSeq)+64);expect(reply.value.operations.map(row=>{if(!row||typeof row!=='object'||!('id'in row))throw Error('Invalid source row');return row.id})).toEqual(rows.map(op=>op.id));return{...reply,value:{...reply.value,canonicalCapabilities:attachment(rows)}}}
 issuer.handlers.canonical_history_stream_evidence=body=>({ok:true,value:{kind:'canonical-indexed-history-root-evidence-v1',streamId:body.streamId,throughSeq:112,root:body.root,rows:[p.operations[0],p.operations[111]],canonicalCapabilities:attachment([p.operations[0],p.operations[111]]),first:0,terminal:1,lastMetadata:null,latestRedo:null,firstUndoAfterLatestRedo:null,ownBranchAfterUndo:null}})
 const resources=vi.spyOn(brushLibraryApi,'prepareCanonicalImageAssets').mockImplementation(async(board,assets,current)=>{current();expect(board).toBe('room');expect(assets).toHaveLength(1);expect(assets[0].id).toBe(p.pattern.id);expect(assets[0].size).toBe(16);expect(importedAssetPixels(p.pattern.id)).toEqual(p.gray);current()})
 const read=await issuer.open(),{engine}=engineFor(read)
 try{await engine.restoreCanonicalIndexedRoom(read);expect(engine['_canonicalLayerOwner']!.composite.supportsTexturedOperations(['alphaDarken32FusedScalar','over32FusedScalar'])).toBe(true);expect(engine['_canonicalLayerOwner']!.composite['reservedCpuBytes']).toBe(41008);expect(engine.getCanonicalIndexedCut()?.throughSeq).toBe(112);expect(resources).toHaveBeenCalled();expect(issuer.requests.filter(r=>r.event==='canonical_history_stream_next').map(r=>r.body.afterSeq)).toEqual([0,64,112]);expect(engine['_canonicalLayerOwner']!.bank!.jobs.every(j=>j.kind==='raw-pattern-l8')).toBe(true)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},30000)

it.each(['phase','budget']as const)('refuses a validly parsed foreign BEGIN4 %s before any local admission/pixel',async fault=>{
 const p=fixedTextureOriginal(false,true),operations:Operation[]=[],draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 installBrushLibrary(p.library)
 const begin=async(request:CanonicalStrokeBegin)=>{
  const material=canonicalTexturedSourceMaterialContext({...p.snapshot.material,...fault==='phase'?{primaryTexture:{...p.snapshot.material.primaryTexture,offsetX:p.snapshot.material.primaryTexture.offsetX+1}}:{budget:{...p.snapshot.material.budget,workUnits:p.snapshot.material.budget.workUnits-1}}})
  return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV4({...p.snapshot,material,assets:material.assets,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}
 }
 const{engine}=engineFor(p,true,{texturedSource:'fixed-default-auto-texture-v4',begin},op=>operations.push(op))
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(p.snapshot.brush);engine.setSize(40);engine.setLocked(false);expect(await engine.prepareBrush(p.snapshot.brush)).toEqual({status:'ready'});const root=engine['_canonicalLayerOwner']!.defaultSourceRoots![0].lease;engine['_onStart'](packet(20,0));await vi.waitFor(()=>expect(engine['_authorInputError']).toBeDefined(),{timeout:10000});expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(operations).toHaveLength(0);expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb')).toBe(false);expect(engine['_canonicalLayerOwner']!.defaultSourceRoots![0].lease).toBe(root)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

/** Old material2 Browser reader/author, with BOTH material4 policies absent. */
function legacyBrowserOriginal(profile:typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE|typeof G=CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE){
 const pin=canonicalDefaultAutoSourceBinding(autoDescriptor,autoSha,profile===CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE?CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE:'neon64-f32-fma-v1',profile),geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0}),policy=canonicalSourceComposition(autoDescriptor,profile)
 if(!policy)throw Error('Legacy Browser composition unavailable')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}},snapshot=canonicalStrokeSnapshotV2({materialVersion:2,material,assets:[],layerId:'layer-1',brush:autoPreset,strokeId:'legacy-browser-engine',boardEpoch:1,descriptorSha256:autoSha,rasterProfile:profile,pigmentRgb8:[0,0,0],composition:{mode:policy.mode,alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:policy.outerBlend}},1,profile)
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false},encoder=new SourceCanonicalFrameEncoder({...snapshot,material}),op:CanonicalStrokeOperation={id:'legacy-browser-frame',userId:'author',timestamp:0,seq:1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:20,y:20,opacity:1,flow:1}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},{kind:'gestureEnd',at:1}]},material).packed).envelope}
 const wire={...original().wire,canonicalAuthorRasterProfile:profile,canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[profile]},tailOperations:[op],canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:1,operationCount:1},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:op.id,sequence:1,originalUserId:'author',capability:0}]}}
 return{...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:()=>true}),wire,snapshot}
}
it('accounts upfront BOTH Browser texture variants for old material2 with read4/author4 OFF, and resets two programs/16384CPU',async()=>{
 const p=legacyBrowserOriginal(),{engine}=engineFor(p,true,{begin:async()=>{throw Error('Preparation cannot BEGIN')}}),cpu=engine['_brushMipCache'];let reference:CanonicalRgba8CompositePass|undefined,ownedComposite:CanonicalRgba8CompositePass|undefined
 try{
  expect(p.canonicalRead.authorTexturedSource).toBeUndefined();expect(engine['_canonicalAuthorService']!.texturedSource).toBeUndefined()
  Object.assign(engine['gl'],{getShaderPrecisionFormat:()=>({precision:23,rangeMax:24,rangeMin:14})})
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,limits=owner.plan.composite,plain={width:limits.width,height:limits.height,operations:limits.operations},plainBudget=canonicalRgba8CompositeBudget(plain),texturedBudget=canonicalRgba8CompositeBudget(limits)
  ownedComposite=owner.composite
  expect(limits.texturedOperations).toEqual(['alphaDarkenBrowserFloat','overBrowserFloat']);expect(limits.operations).toHaveLength(3);expect(texturedBudget.gpuBytes).toBe(plainBudget.gpuBytes);expect(texturedBudget.cpuBytes-plainBudget.cpuBytes).toBe(16384)
  expect(owner.composite['reservedCpuBytes']).toBe(texturedBudget.cpuBytes);expect(owner.composite['workspace']!.programs.size).toBe(5);expect(owner.composite['workspace']!.programs.has('alphaDarkenBrowserFloat:subtract-u8-v1')).toBe(true);expect(owner.composite.supportsTexturedOperations(['alphaDarkenBrowserFloat','overBrowserFloat'])).toBe(true)
  const before=cpu.reservedBytes,programs=vi.spyOn(engine['gl'],'createProgram')
  reference=new CanonicalRgba8CompositePass(engine['gl'],owner.cache,cpu,'legacy-browser-reference')
  reference.prepare(plain,[]);expect(programs).toHaveBeenCalledTimes(3);expect(reference['workspace']!.programs.size).toBe(3);expect(reference.supportsTexturedOperations(['alphaDarkenBrowserFloat'])).toBe(false);expect(reference['reservedCpuBytes']).toBe(plainBudget.cpuBytes);expect(cpu.reservedBytes-before).toBe(plainBudget.cpuBytes)
  reference.reset();expect(reference['reservedCpuBytes']).toBe(0);expect(reference.isReady()).toBe(false);expect(cpu.reservedBytes).toBe(before);reference=undefined
  // Author2 remains available with4 OFF, and reuses the pre-admitted Browser variant.
  installBrushLibrary({schemaVersion:1,brushes:[{descriptor:autoDescriptor,name:'Old Browser2',source:'native',warnings:[]}],assets:[],skipped:[]});engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(autoPreset);engine.setSize(40);engine.setLocked(false)
  programs.mockClear();expect(await engine.prepareBrush(autoPreset)).toEqual({status:'ready'});expect(engine['_canonicalPreparedAuthor']!.material.kind).toBe('auto');expect(owner.composite['workspace']!.programs.size).toBe(5);expect(programs).not.toHaveBeenCalled();expect(engine['_canonicalPixelsReady']).toBe(true)
 }finally{reference?.reset();engine.destroy();expect(cpu.reservedBytes).toBe(0);expect(ownedComposite?.['reservedCpuBytes']).toBe(0);expect(ownedComposite?.['workspace']).toBeUndefined()}
},20000)
it.each([{rangeMax:23,rangeMin:14},{rangeMax:24,rangeMin:13},{rangeMax:24.5,rangeMin:14},{rangeMax:24,rangeMin:14.5}])('rejects insufficient/noninteger upfront Browser precision %j and retires prior ordinary prepass program plus CPU',async ranges=>{
 const p=legacyBrowserOriginal(),{engine}=engineFor(p)
 try{await engine.paperReady();const cpu=engine['_brushMipCache'],before=cpu.reservedBytes,programs=vi.spyOn(engine['gl'],'createProgram'),deleted=vi.spyOn(engine['gl'],'deleteProgram');Object.assign(engine['gl'],{getShaderPrecisionFormat:()=>({precision:23,...ranges})});await expect(engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)).rejects.toThrow('Unverified textured composite precision range');expect(programs).toHaveBeenCalledOnce();const allocated=programs.mock.results.filter(r=>r.type==='return'&&r.value).map(r=>r.value);expect(allocated).toHaveLength(1);expect(deleted.mock.calls.filter(([handle])=>handle===allocated[0])).toHaveLength(1);expect(cpu.reservedBytes).toBe(before);expect(engine.getCanonicalIndexedCut()).toBeNull()}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

/** Genuine compiled3 metadata + self-authored pattern CAS; no vendor pixel claim. */
function pressureTextureOriginal(open=false,empty=false,alive=()=>true,count=3){
 const gray=Uint8Array.from({length:65536},(_,i)=>(i*37+11)%256),id=`asset:${createHash('sha256').update(gray).digest('hex')}`
 const candidate=structuredClone(pressureActual.descriptor);Reflect.set(candidate,'id','imported-'+createHash('sha256').update('self-authored-pressure-auto-engine').digest('hex'));Reflect.set(candidate,'version',1)
 if(!candidate.texture)throw Error('Retained texture missing');Reflect.set(candidate.texture,'id',id)
 const library:unknown={schemaVersion:1,brushes:[{descriptor:candidate,name:'Self-authored fixed texture mechanism',source:'self-authored-test',warnings:[]}],assets:[{id,size:256,file:id.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid fixed texture test library')
 const d=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),semantic=extractCanonicalDefaultAutoPressureTextureProgramData(d,{pattern:{id:library.assets[0].id,size:256}})
 if(!semantic.supported)throw Error(semantic.reasons.join(','))
 const pin=canonicalDefaultAutoPressureTextureSourceBinding(d,sha,'neon64-f32-fma-v1',{id:library.assets[0].id,size:256},G),material=canonicalPressureTexturedSourceMaterialContext({version:5,primarySource:pin,assets:[semantic.patternAsset],primaryTexture:canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:id,law:'subtract-u8-v1',width:256,height:256,periodX:256,periodY:256,offsetX:0,offsetY:0,strength:'source-pressure-curve-v1'},[semantic.patternAsset]),budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV5({materialVersion:5,material,assets:material.assets,layerId:'layer-1',brush:`brush:${d.id}@1`,strokeId:'fixed-texture-engine',boardEpoch:1,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[12,34,56],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},1,G)
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false},encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=Array.from({length:count},(_,i)=>({id:'fixed-engine-'+i,userId:'author',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(buildCanonicalMaterial({masked:false,entry:i?{phase:'primary',group:0}:{phase:'between'},draws:[{recipe,role:'primary',x:20+(i%32)*4,y:20,opacity:.8,flow:.7,grainDepth:.5}],fences:[...i?[]:[{kind:'segmentBegin' as const,at:0,group:0}],...i===count-1?[{kind:'primaryEnd' as const,at:1,group:0},{kind:'segmentEnd' as const,at:1,group:0},{kind:'gestureEnd' as const,at:1}]:[]]},material).packed).envelope}))
 installBrushPixels(id,gray)
 const tail=empty?[]:open?operations.slice(0,-1):operations,wire={...original().wire,canonicalAuthorRasterProfile:G,canonicalAuthorPressureTexturedSource:'pressure-default-auto-texture-v5' as const,canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[G]},tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:tail.length?[{originalUserId:'author',snapshot}]:[],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return{...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:alive}),wire,operations,snapshot,library,descriptor:d,pattern:material.assets[0],gray}
}

it.each([false,true])('replays original pressure5 full/OPEN through existing bank/prepass/coordinator open=%s',async open=>{
 const p=pressureTextureOriginal(open),{engine}=engineFor(p),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!
  expect(owner.bank!.jobs).toHaveLength(1);expect(owner.bank!.jobs[0].kind).toBe('raw-pattern-l8');expect(owner.fullSource!.preparedResources()).toHaveLength(0)
  if(open){const op=p.operations[2],atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:3,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original input');expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:10000})}
  expect(engine['_log'].entries).toHaveLength(3);expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb'&&r.source.pin.strength==='source-pressure-curve-v1'&&r.source.strengthU8>0&&r.source.strengthU8<255)).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['ready','abort']as const)('reserves additional material program before actual factory and releases ownership on %s',async mode=>{
 let retainedFloor=0
 const p=pressureTextureOriginal(false,true),preset=p.snapshot.brush,controller=new AbortController(),real=pressureDescriptorApi.sourceStrokeAuthorDescriptor,operations:Operation[]=[],begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:{expectedDescriptorSha256:string})=>{
  expect(lifetime.expectedDescriptorSha256).toBe(p.snapshot.descriptorSha256);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(retainedFloor)
  return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV5({...p.snapshot,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}
 })
 installBrushLibrary(p.library)
 let engine:PencilEngine;engine=engineFor(p,true,{pressureTexturedSource:'pressure-default-auto-texture-v5',begin},op=>{const lane=engine['_canonicalLayerOwner']!.coordinator;expect(lane).toBeDefined();expect([...lane!['entries'].values()].some(e=>e.local?.receipts.some(r=>r.operation===op))).toBe(true);operations.push(op)}).engine
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(100);engine.setLocked(false)
  const before=engine['_brushMipCache'].reservedBytes,semantic=extractCanonicalDefaultAutoPressureTextureProgramData(p.descriptor,{pattern:{id:p.pattern.id,size:p.pattern.size}});if(!semantic.supported)throw Error('semantic')
  const extra=sourcePressureMaterialProgramCpuBytes(semantic.program),base=new TextEncoder().encode(canonicalBrushDescriptorJSON(p.descriptor)).length*8+8192,spy=vi.spyOn(pressureDescriptorApi,'sourceStrokeAuthorDescriptor').mockImplementation((d,context)=>{
   expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(before+base+extra)
   expect(context.pressurePrimaryTexture?.materialCpuBudgetBytes).toBe(extra)
   const result=real(d,context);if(mode==='abort')controller.abort();return result
  })
  expect(await engine.prepareBrush(preset,{signal:controller.signal})).toEqual({status:mode==='abort'?'cancelled':'ready'});expect(spy).toHaveBeenCalledOnce()
  if(mode==='abort'){expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(begin).not.toHaveBeenCalled();return}
  const prepared=engine['_canonicalPreparedAuthor']!;expect(prepared.material.kind).toBe('autoPressureTexture');expect(prepared.bytes).toBe(base+extra)
  spy.mockRestore();const owner=engine['_canonicalLayerOwner']!,root=owner.defaultSourceRoots![0].lease,mask=owner.mask,sourceKey=owner.defaultSourceRoots![0].selectionKey,owners={gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']},physical=root.patternResource(p.snapshot.material.primaryTexture,p.pattern,owners).texture
  // Initial publication owns the base root. Subsequent cache-hit preparation
  // owns its retained child; companion-list metadata is also now explicit.
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});const stable=engine['_brushMipCache'].reservedBytes
  for(let n=0;n<3;n++){expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});expect(engine['_brushMipCache'].reservedBytes).toBe(stable);expect(owner.defaultSourceRoots).toHaveLength(1);expect(owner.defaultSourceRoots![0].lease).toBe(root);expect(owner.mask).toBe(mask);expect(owner.defaultSourceRoots![0].selectionKey).toBe(sourceKey);expect(engine['_canonicalPreparedAuthor']!.imageLease!.isReady()).toBe(true);expect(engine['_canonicalPreparedAuthor']!.imageLease!.patternResource(p.snapshot.material.primaryTexture,p.pattern,owners).texture).toBe(physical)}
  retainedFloor=stable+prepared.bytes+8192
  engine['_onStart']({...packet(20,0),pressure:.2});engine['_onMove']({...packet(36,10),pressure:1});engine['_onEnd']({...packet(36,20),pressure:1})
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
  expect(begin).toHaveBeenCalledOnce();const frames=operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke').map(op=>decodeCanonicalRecordedSnapshotFrame(op.frame,{...p.snapshot,strokeId:op.frame.strokeId,pigmentRgb8:op.frame.pigmentRgb8,composition:op.frame.composition},op.frame.frameOrdinal).frame)
  const grains=frames.flatMap(f=>f.draws.map(d=>'grainDepth'in d?d.grainDepth:-1));expect(grains.length).toBeGreaterThan(0);expect(grains.every(v=>v>=0&&v<=1)).toBe(true);expect(new Set(grains).size).toBeGreaterThan(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('denies pressure5 before additional factory when same CPU ledger lacks candidate capacity',async()=>{
 const p=pressureTextureOriginal(false,true),preset=p.snapshot.brush;installBrushLibrary(p.library)
 const {engine}=engineFor(p,true,{pressureTexturedSource:'pressure-default-auto-texture-v5',begin:async()=>{throw Error('Unexpected BEGIN')}})
 let release:(()=>void)|undefined
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(100)
  const cache=engine['_brushMipCache'],before=cache.reservedBytes,owner=engine['_canonicalLayerOwner']!,mask=owner.mask,spy=vi.spyOn(pressureDescriptorApi,'sourceStrokeAuthorDescriptor')
  release=cache.reserve(cache.budgetBytes-before-1)
  await expect(engine.prepareBrush(preset)).rejects.toThrow(/budget/i)
  expect(spy).not.toHaveBeenCalled();expect(owner.mask).toBe(mask);expect(owner.bank).toBeUndefined();expect(engine['_canonicalPreparedAuthor']).toBeUndefined()
  release();release=undefined;expect(cache.reservedBytes).toBe(before)
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'})
 }finally{release?.();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['abort','stale']as const)('rolls back a cold pattern-only material5 candidate on %s with no retained key/root',async mode=>{
 let alive=true;const p=pressureTextureOriginal(false,true,()=>alive),{engine}=engineFor(p),controller=new AbortController()
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);const owner=engine['_canonicalLayerOwner']!,baseline=engine['_brushMipCache'].reservedBytes,oldMask=owner.mask,run=engine['_brushPreparation'].run.bind(engine['_brushPreparation']),op=p.operations[0],atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:1,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope)
  if(!('delivery'in input))throw Error('Actual original input missing')
  vi.spyOn(engine['_brushPreparation'],'run').mockImplementation((jobs,options,available,key,finalize)=>run(jobs,{...options,onProgress:(done,total)=>{options.onProgress?.(done,total);if(done===1){if(mode==='abort')controller.abort();else alive=false}}},available,key,finalize))
  expect(await engine.prepareOriginalRecorded(input,{signal:controller.signal})).toEqual({status:'cancelled'});expect(owner.mask).toBe(oldMask);expect(owner.bank).toBeUndefined();expect(owner.defaultSourceRoots).toBeUndefined();expect(owner.resourceCandidate).toBeUndefined();expect(engine['_log'].entries).toHaveLength(0);expect(engine['_brushMipCache'].reservedBytes).toBe(baseline)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each(['phase','budget']as const)('refuses a validly parsed foreign BEGIN5 %s before any local admission/pixel',async fault=>{
 const p=pressureTextureOriginal(false,true),operations:Operation[]=[],draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 installBrushLibrary(p.library)
 const begin=async(request:CanonicalStrokeBegin)=>{
  const material=canonicalPressureTexturedSourceMaterialContext({...p.snapshot.material,...fault==='phase'?{primaryTexture:{...p.snapshot.material.primaryTexture,offsetX:p.snapshot.material.primaryTexture.offsetX+1}}:{budget:{...p.snapshot.material.budget,workUnits:p.snapshot.material.budget.workUnits-1}}})
  return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV5({...p.snapshot,material,assets:material.assets,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}
 }
 const{engine}=engineFor(p,true,{pressureTexturedSource:'pressure-default-auto-texture-v5',begin},op=>operations.push(op))
 try{await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(p.snapshot.brush);engine.setSize(100);engine.setLocked(false);expect(await engine.prepareBrush(p.snapshot.brush)).toEqual({status:'ready'});const root=engine['_canonicalLayerOwner']!.defaultSourceRoots![0].lease;engine['_onStart'](packet(20,0));await vi.waitFor(()=>expect(engine['_authorInputError']).toBeDefined(),{timeout:10000});expect(engine.hasActiveCanonicalAuthor()).toBe(false);expect(operations).toHaveLength(0);expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb')).toBe(false);expect(engine['_canonicalLayerOwner']!.defaultSourceRoots![0].lease).toBe(root)}finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

/** Genuine compiled4 Soft metadata + self-authored pattern CAS; no vendor pixel claim. */
function softPressureTextureOriginal(open=false,empty=false,alive=()=>true,count=3){
 const gray=Uint8Array.from({length:256},(_,i)=>(i*37+11)%256),id=`asset:${createHash('sha256').update(gray).digest('hex')}`
 const candidate=structuredClone(softPressureActual.descriptor);Reflect.set(candidate,'id','imported-'+createHash('sha256').update('self-authored-soft-native-default-engine').digest('hex'));Reflect.set(candidate,'version',1)
 if(!candidate.texture)throw Error('Retained texture missing');Reflect.set(candidate.texture,'id',id)
 const library:unknown={schemaVersion:1,brushes:[{descriptor:candidate,name:'Self-authored fixed texture mechanism',source:'self-authored-test',warnings:[]}],assets:[{id,size:16,file:id.slice(6)+'.bin'},{id:softPressureActual.descriptor.tip.profile.lookup,size:32,file:softPressureActual.descriptor.tip.profile.lookup.slice(6)+'.bin'}],skipped:[]}
 if(!isBrushLibrary(library))throw Error('Invalid fixed texture test library')
 const d=library.brushes[0].descriptor,sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),semantic=extractCanonicalSoftAutoNativeDefaultTextureProgramData(d,{pattern:{id:library.assets[0].id,size:16}})
 if(!semantic.supported)throw Error(semantic.reasons.join(','))
 const pin=canonicalSoftAutoNativeDefaultTextureSourceBinding(d,sha,'neon64-f32-fma-v1',{id:library.assets[0].id,size:16},G),material=canonicalSoftNativeDefaultTexturedSourceMaterialContext({version:6,primarySource:pin,assets:[semantic.patternAsset],primaryTexture:canonicalPressureCurvePrimaryTexturePin({kind:'canvasTexture',asset:id,law:'subtract-u8-v1',width:9,height:9,periodX:9,periodY:9,offsetX:0,offsetY:0,strength:'source-pressure-curve-v1'},[semantic.patternAsset]),budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV6({materialVersion:6,material,assets:material.assets,layerId:'layer-1',brush:`brush:${d.id}@1`,strokeId:'fixed-texture-engine',boardEpoch:1,descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[12,34,56],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},1,G)
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
 const recipe={kind:'softAuto' as const,sourceSlot:0 as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:1,ratio:1,rotation:0,subX:0,subY:0,width:geometry.maskSize[0],height:geometry.maskSize[1],mirrorH:false,mirrorV:false},encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=Array.from({length:count},(_,i)=>({id:'fixed-engine-'+i,userId:'author',timestamp:i,seq:i+1,type:'canonical_stroke',layerId:'layer-1',frame:encoder.encode(buildCanonicalMaterial({masked:false,entry:i?{phase:'primary',group:0}:{phase:'between'},draws:[{recipe,role:'primary',x:20+(i%32)*4,y:20,opacity:.8,flow:.7,grainDepth:.5}],fences:[...i?[]:[{kind:'segmentBegin' as const,at:0,group:0}],...i===count-1?[{kind:'primaryEnd' as const,at:1,group:0},{kind:'segmentEnd' as const,at:1,group:0},{kind:'gestureEnd' as const,at:1}]:[]]},material).packed).envelope}))
 installBrushPixels(id,gray)
 const tail=empty?[]:open?operations.slice(0,-1):operations,wire={...original().wire,canonicalAuthorRasterProfile:G,canonicalAuthorSoftPressureTexturedSource:'pressure-soft-auto-texture-v6' as const,canonicalReadScope:{roomId:'room',boardEpoch:1,allowedRasterProfiles:[G]},tailOperations:tail,canonicalHistoryBase:{kind:'full-room-prefix-v2' as const,roomId:'room',boardEpoch:1,throughSeq:tail.length,operationCount:tail.length},canonicalCapabilities:{version:1 as const,roomId:'room',boardEpoch:1,capabilities:tail.length?[{originalUserId:'author',snapshot}]:[],bindings:tail.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}))}}
 return{...prepareCanonicalRoomState(wire,{expectedBoardId:'room',isCurrent:alive}),wire,operations,snapshot,library,descriptor:d,pattern:material.assets[0],gray}
}

it.each([false,true])('replays original Soft native-default6 full/OPEN through existing bank/prepass/coordinator open=%s',async open=>{
 const p=softPressureTextureOriginal(open),{engine}=engineFor(p),draw=vi.spyOn(CanonicalRgba8CompositePass.prototype,'drawSource')
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!
  expect(owner.bank!.jobs).toHaveLength(1);expect(owner.bank!.jobs[0].kind).toBe('raw-pattern-l8');expect(owner.fullSource!.preparedResources()).toHaveLength(0)
  if(open){const op=p.operations[2],atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:p.snapshot}],bindings:[{operationId:op.id,sequence:3,originalUserId:'author',capability:0}]},[op],p.canonicalRead.scope)[0],input=attachCanonicalRecordedDelivery(atom,p.canonicalRead.scope);if(!('delivery'in input))throw Error('Original input');expect(await engine.prepareOriginalRecorded(input)).toEqual({status:'ready'});engine.appendOriginalRecorded(input);await vi.waitFor(()=>expect(owner.coordinator).toBeUndefined(),{timeout:10000})}
  expect(engine['_log'].entries).toHaveLength(3);expect(engine['_canonicalPixelsReady']).toBe(true)
  expect(draw.mock.calls.some(([r])=>r.source.kind==='texturedMaskRgb'&&r.source.pin.strength==='source-pressure-curve-v1'&&r.source.strengthU8>0&&r.source.strengthU8<255)).toBe(true)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
it.each(['ready','abort']as const)('reserves additional material program before actual factory and releases ownership on %s',async mode=>{
 let retainedFloor=0
 const p=softPressureTextureOriginal(false,true),preset=p.snapshot.brush,controller=new AbortController(),real=pressureDescriptorApi.sourceStrokeAuthorDescriptor,operations:Operation[]=[],begin=vi.fn(async(request:CanonicalStrokeBegin,lifetime:{expectedDescriptorSha256:string})=>{
  expect(lifetime.expectedDescriptorSha256).toBe(p.snapshot.descriptorSha256);expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(retainedFloor)
  return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV6({...p.snapshot,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}
 })
 installBrushLibrary(p.library)
 let engine:PencilEngine;engine=engineFor(p,true,{softPressureTexturedSource:'pressure-soft-auto-texture-v6',begin},op=>{const lane=engine['_canonicalLayerOwner']!.coordinator;expect(lane).toBeDefined();expect([...lane!['entries'].values()].some(e=>e.local?.receipts.some(r=>r.operation===op))).toBe(true);operations.push(op)}).engine
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(p.snapshot.material.primarySource.source.diameter*p.snapshot.material.primarySource.brushScale);engine.setLocked(false)
  const before=engine['_brushMipCache'].reservedBytes,semantic=extractCanonicalSoftAutoNativeDefaultTextureProgramData(p.descriptor,{pattern:{id:p.pattern.id,size:p.pattern.size}});if(!semantic.supported)throw Error('semantic')
  const extra=sourceNativeDefaultMaterialProgramCpuBytes(semantic.program),base=new TextEncoder().encode(canonicalBrushDescriptorJSON(p.descriptor)).length*8+8192,spy=vi.spyOn(pressureDescriptorApi,'sourceStrokeAuthorDescriptor').mockImplementation((d,context)=>{
   expect(engine['_brushMipCache'].reservedBytes).toBeGreaterThanOrEqual(before+base+extra)
   expect(context.softPressurePrimaryTexture?.materialCpuBudgetBytes).toBe(extra)
   const result=real(d,context);if(mode==='abort')controller.abort();return result
  })
  expect(await engine.prepareBrush(preset,{signal:controller.signal})).toEqual({status:mode==='abort'?'cancelled':'ready'});expect(spy).toHaveBeenCalledOnce()
  if(mode==='abort'){expect(engine['_canonicalPreparedAuthor']).toBeUndefined();expect(engine['_brushMipCache'].reservedBytes).toBe(before);expect(begin).not.toHaveBeenCalled();return}
  const prepared=engine['_canonicalPreparedAuthor']!;expect(prepared.material.kind).toBe('autoSoftPressureTexture');expect(prepared.bytes).toBe(base+extra)
  spy.mockRestore();const owner=engine['_canonicalLayerOwner']!,root=owner.defaultSourceRoots![0].lease,mask=owner.mask,sourceKey=owner.defaultSourceRoots![0].selectionKey,owners={gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']},physical=root.patternResource(p.snapshot.material.primaryTexture,p.pattern,owners).texture
  // Initial publication owns the base root. Subsequent cache-hit preparation
  // owns its retained child; companion-list metadata is also now explicit.
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});const stable=engine['_brushMipCache'].reservedBytes
  for(let n=0;n<3;n++){expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});expect(engine['_brushMipCache'].reservedBytes).toBe(stable);expect(owner.defaultSourceRoots).toHaveLength(1);expect(owner.defaultSourceRoots![0].lease).toBe(root);expect(owner.mask).toBe(mask);expect(owner.defaultSourceRoots![0].selectionKey).toBe(sourceKey);expect(engine['_canonicalPreparedAuthor']!.imageLease!.isReady()).toBe(true);expect(engine['_canonicalPreparedAuthor']!.imageLease!.patternResource(p.snapshot.material.primaryTexture,p.pattern,owners).texture).toBe(physical)}
  retainedFloor=stable+prepared.bytes+8192
  engine['_onStart']({...packet(20,0),pressure:.2});engine['_onMove']({...packet(36,10),pressure:1});engine['_onEnd']({...packet(36,20),pressure:1})
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000})
  expect(begin).toHaveBeenCalledOnce();const frames=operations.filter((op):op is CanonicalStrokeOperation=>op.type==='canonical_stroke').map(op=>decodeCanonicalRecordedSnapshotFrame(op.frame,{...p.snapshot,strokeId:op.frame.strokeId,pigmentRgb8:op.frame.pigmentRgb8,composition:op.frame.composition},op.frame.frameOrdinal).frame)
  const grains=frames.flatMap(f=>f.draws.map(d=>'grainDepth'in d?d.grainDepth:-1));expect(grains.length).toBeGreaterThan(0);expect(grains.every(v=>v>=0&&v<=1)).toBe(true);expect(new Set(grains).size).toBeGreaterThan(1)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)


it.each(['abort','factoryFailure']as const)('retains usable old Soft6 prepared when replacement candidate %s',async mode=>{
 const p=softPressureTextureOriginal(false,true),preset=p.snapshot.brush,controller=new AbortController(),operations:Operation[]=[],begin=vi.fn(async(request:CanonicalStrokeBegin)=>({ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV6({...p.snapshot,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}))
 installBrushLibrary(p.library);const{engine}=engineFor(p,true,{softPressureTexturedSource:'pressure-soft-auto-texture-v6',begin},op=>operations.push(op))
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(p.snapshot.material.primarySource.source.diameter*p.snapshot.material.primarySource.brushScale);engine.setLocked(false)
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});const old=engine['_canonicalPreparedAuthor']!,root=old.imageLease,real=pressureDescriptorApi.sourceStrokeAuthorDescriptor
  const spy=vi.spyOn(pressureDescriptorApi,'sourceStrokeAuthorDescriptor').mockImplementation((d,c)=>{if(mode==='factoryFailure')throw Error('controlled candidate factory failure');const result=real(d,c);controller.abort();return result})
  if(mode==='abort')expect(await engine.prepareBrush(preset,{signal:controller.signal})).toEqual({status:'cancelled'});else await expect(engine.prepareBrush(preset)).rejects.toThrow('controlled candidate factory failure')
  spy.mockRestore();expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(root!.isReady()).toBe(true);expect(begin).not.toHaveBeenCalled()
  engine['_onStart']({...packet(20,0),pressure:.2});engine['_onMove']({...packet(36,10),pressure:1});engine['_onEnd']({...packet(36,20),pressure:1})
  await vi.waitFor(()=>expect(operations.length).toBeGreaterThan(0),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000});expect(begin).toHaveBeenCalledOnce()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('retires failed late Soft6 executor reservation without publishing fake operations and retains old prepared',async()=>{
 const p=softPressureTextureOriginal(false,true),preset=p.snapshot.brush,operations:Operation[]=[];let reserveSpy:ReturnType<typeof vi.spyOn>|undefined,fail=true
 const begin=vi.fn(async(request:CanonicalStrokeBegin)=>{if(fail){fail=false;const cache=engine['_brushMipCache'],original=cache.reserve.bind(cache);let first=true;reserveSpy=vi.spyOn(cache,'reserve').mockImplementation(bytes=>{if(first&&new Error().stack?.includes('CanonicalFrameExecutor')){first=false;throw Error('controlled late executor CPU budget')};return original(bytes)})}return{ok:true as const,recordedNext:0,liveNext:0,ended:false,snapshot:canonicalStrokeSnapshotV6({...p.snapshot,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,composition:{...p.snapshot.composition,alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity}},1,G)}})
 installBrushLibrary(p.library);const{engine}=engineFor(p,true,{softPressureTexturedSource:'pressure-soft-auto-texture-v6',begin},op=>operations.push(op))
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations);engine.setActiveLayer('layer-1');engine.setTool('digitalBrush');engine.setPencil(preset);engine.setSize(p.snapshot.material.primarySource.source.diameter*p.snapshot.material.primarySource.brushScale);engine.setLocked(false)
  expect(await engine.prepareBrush(preset)).toEqual({status:'ready'});const old=engine['_canonicalPreparedAuthor']!
  engine['_onStart']({...packet(20,0),pressure:.2})
  await vi.waitFor(()=>expect(begin).toHaveBeenCalledOnce(),{timeout:10000});await vi.waitFor(()=>expect(engine.hasActiveCanonicalAuthor()).toBe(false),{timeout:10000});expect(operations).toHaveLength(0);expect(engine['_canonicalPreparedAuthor']).toBe(old);expect(old.imageLease!.isReady()).toBe(true);reserveSpy?.mockRestore()
 }finally{reserveSpy?.mockRestore();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)


it('accounts upfront BOTH native GenericSC texture variants through actual full material2 restore and warm companion preparation',async()=>{
 const p=legacyBrowserOriginal(G),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,limits=owner.plan.composite,plain=canonicalRgba8CompositeBudget({width:limits.width,height:limits.height,operations:limits.operations}),cost=canonicalRgba8CompositeBudget(limits)
  expect(limits.texturedOperations).toEqual(['alphaDarken32FusedScalar','over32FusedScalar'])
  expect(cost.cpuBytes).toBe(41008);expect(cost.cpuBytes-plain.cpuBytes).toBe(16384);expect(cost.gpuBytes).toBe(plain.gpuBytes)
  expect(owner.composite.supportsTexturedOperations(['alphaDarken32FusedScalar','over32FusedScalar'])).toBe(true)
  expect(owner.composite['reservedCpuBytes']).toBe(cost.cpuBytes);expect(owner.composite['workspace']!.programs.size).toBe(5)
  const cpu=engine['_brushMipCache'].reservedBytes,workspace=owner.composite['workspace'],compile=vi.spyOn(engine['gl'],'createProgram')
  owner.composite.prepare(limits,owner.prepass.preparedResources(),transformedMaskPrepassBudget(owner.mask).cpuBytes)
  const incoming=owner.prepass.preparedResources(),oldCompanions=owner.composite['companions'].length
  const update=owner.composite.prepareCompanionUpdate(incoming,transformedMaskPrepassBudget(owner.mask).cpuBytes)
  update.assertCurrent();update.publish();update.finalizeCleanup()
  const updatedCpu=engine['_brushMipCache'].reservedBytes
  expect(updatedCpu-cpu).toBe(192*(incoming.length+oldCompanions)+1024)
  const again=owner.composite.prepareCompanionUpdate(incoming,transformedMaskPrepassBudget(owner.mask).cpuBytes)
  again.assertCurrent();again.publish();again.finalizeCleanup()
  expect(compile).not.toHaveBeenCalled();expect(owner.composite['workspace']).toBe(workspace);expect(engine['_brushMipCache'].reservedBytes).toBe(updatedCpu)
  expect(owner.composite['reservedCpuBytes']).toBe(cost.cpuBytes)
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it.each([G,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE])('preflights the extra textured OVER CPU before cold workspace GL allocation for %s',async profile=>{
 const {engine}=await autoHarness(async()=>{throw Error('Resource preparation cannot BEGIN')},autoDescriptor,()=>true,{width:8,height:8},profile)
 let release:(()=>void)|undefined
 try{
  const owner=engine['_canonicalLayerOwner']!,cpu=engine['_brushMipCache'],requested={width:41,height:41,slots:1},maskCost=transformedMaskPrepassBudget(requested)
  expect(owner.prepared).toBe(false);expect(owner.composite.isReady()).toBe(false);expect(owner.prepass.isReady()).toBe(false)
  const plain=canonicalRgba8CompositeBudget({width:owner.plan.composite.width,height:owner.plan.composite.height,operations:owner.plan.composite.operations})
  // This SAME CPU owner can fit the historical one-texture manifest exactly,
  // but not the new OVER program. The held reservation is real and bounded.
  const historicalAllowance=maskCost.cpuBytes+plain.cpuBytes+8192,before=cpu.reservedBytes
  release=cpu.reserve(cpu.budgetBytes-before-historicalAllowance)
  const held=cpu.reservedBytes,program=vi.spyOn(engine['gl'],'createProgram'),texture=vi.spyOn(engine['gl'],'createTexture'),mask=owner.mask,stable=owner.stable,journal=engine['_log'].entries
  expect(()=>engine['_prepareCanonicalLayerWorkspace'](owner,requested)).toThrow('Canonical source workspace companions exceed budget')
  expect(program).not.toHaveBeenCalled();expect(texture).not.toHaveBeenCalled();expect(cpu.reservedBytes).toBe(held)
  expect(owner.mask).toBe(mask);expect(owner.stable).toBe(stable);expect(engine['_log'].entries).toBe(journal);expect(owner.prepared).toBe(false)
  release();release=undefined;expect(cpu.reservedBytes).toBe(before)
  engine['_prepareCanonicalLayerWorkspace'](owner,requested)
  expect(owner.prepared).toBe(true);expect(owner.composite.supportsTexturedOperations(profile===G?['alphaDarken32FusedScalar','over32FusedScalar']:['alphaDarkenBrowserFloat','overBrowserFloat'])).toBe(true)
 }finally{release?.();engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)
