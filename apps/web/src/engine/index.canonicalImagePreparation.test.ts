import {parseCanonicalStrokeCloseOperation,type CanonicalStrokeCloseOperation} from '@grafetto/shared'
import {canonicalDefaultAutoSourceBinding,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type Operation} from '@grafetto/shared'
import type {PointerData} from './src/input/PointerInput'
import {prepareCanonicalRecordedAttachment} from '@grafetto/shared'
import {attachCanonicalRecordedDelivery} from '../pages/Room/net/canonicalRecordedDelivery'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
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
function sourceTrace(){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{asset:fixture.asset,colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program)
 let state=author.createState(4321,7654,.3)
 const material:SourceStrokeMaterialContextV2={version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer-1',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'original-basic6',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const adapter=new SourceStrokeMaterialAdapter(program,material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);draws+=accepted.frame.draws.length;operations.push({id:'image-'+operations.length,userId:'author',timestamp:0,seq:operations.length+1,type:'canonical_stroke',layerId:'layer-1',frame:accepted.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const step=iterator.next();if(step.done){state=step.value;return}accept(adapter.accept(step.value));const cut=adapter.flush();if(cut)accept([cut])}}
 const f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=fixture.mapping
 for(const [xb,yb,t,pb] of fixture.packets.slice(0,-1)){accept(adapter.beginInput(state));consume(author.plan(state,{x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(operations).toHaveLength(fixture.frames);expect(draws).toBe(fixture.draws)
 return {operations,snapshot}
}
const trace=sourceTrace()

const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
beforeEach(()=>{expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id);installBrushPixels(asset.id,bytes)})
afterEach(()=>{vi.restoreAllMocks();clearImportedBrushPixels()})
function original(isCurrent=()=>true,open=false,emptyLane=false){
 const tail=open?trace.operations.slice(0,-1):trace.operations
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
function emptyOriginal(isCurrent=()=>true,page={width:8,height:8}){
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:page.width,canvasHeight:page.height,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:[],participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:2},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:2,throughSeq:0,operationCount:0}}
 return prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent})
}
const autoDescriptor=stock.rows.find(row=>row.index===4)!.descriptor as unknown as BrushDescriptor
const autoPreset='brush:'+autoDescriptor.id+'@'+autoDescriptor.version
const autoSha=createHash('sha256').update(canonicalBrushDescriptorJSON(autoDescriptor)).digest('hex')
const autoPin=canonicalDefaultAutoSourceBinding(autoDescriptor,autoSha,'neon64-f32-fma-v1')
function verdict(request:CanonicalStrokeBegin):CanonicalStrokeBeginResult{return{ok:true,recordedNext:0,liveNext:0,ended:false,snapshot:{layerId:request.layerId,brush:request.brush,strokeId:request.strokeId,pigmentRgb8:request.pigmentRgb8,boardEpoch:2,descriptorSha256:autoSha,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,composition:{mode:'wash',alphaDarken:request.alphaDarken,outerResourceOpacity:request.outerResourceOpacity,outerBlend:'over'},assets:[],materialVersion:2,material:{version:2,assets:[],primarySource:autoPin,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}}}}
function packet(x:number,timeStamp:number):PointerData{return{x,y:2,pressure:.5,tiltX:0,tiltY:0,speed:0,pointerType:'pen',timeStamp,dispatchTime:timeStamp}}
async function autoHarness(begin:(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>Promise<CanonicalStrokeBeginResult>,selected=autoDescriptor,isCurrent=()=>true,page={width:8,height:8}){
 installBrushLibrary({schemaVersion:1,brushes:[{descriptor:selected,name:'native Basic2Opacity',source:'native',warnings:[]}],assets:[],skipped:[]})
 const snapshots=new Map<string,CanonicalStrokeSnapshotV2>()
 const acceptedBegin=async(request:CanonicalStrokeBegin,lifetime:{signal:AbortSignal;isCurrent:()=>boolean})=>{const reply=await begin(request,lifetime);if(reply.ok&&'materialVersion'in reply.snapshot&&reply.snapshot.materialVersion===2)snapshots.set(request.strokeId,reply.snapshot);return reply}
 const p=emptyOriginal(isCurrent,page),operations:Operation[]=[],r=createTestEngine({rasterVersion:'straight-rgba8-v1',pageWidth:page.width,pageHeight:page.height,canonicalEmptyRoom:{read:p.canonicalRead,tail:p.tailOperations},canonicalAuthor:{begin:acceptedBegin},onLocalOperation:op=>operations.push(op)},{width:8,height:8}),engine=r.engine,gl=engine['gl'],get=gl.getParameter.bind(gl),mock=r.canvas.getContext('webgl')!,extension=gl.getExtension.bind(gl),extensions=new Map<string,unknown>()
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
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,epoch=bank.assertSourceBinding(asset,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']}),old=bank.resources(),workspace=owner.prepass.preparedCapacity().epoch
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
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,old=bank.resources(),epoch=bank.assertSourceBinding(asset,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']}),before=engine['_brushMipCache'].reservedBytes
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
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow('growth unsupported');expect(upload).not.toHaveBeenCalled();expect(bank.resources()).toEqual(before);expect(engine['_brushMipCache'].reservedBytes).toBe(cpu);expect(owner.resourceCandidate).toBeUndefined()
 }finally{engine.destroy();expect(engine['_brushMipCache'].reservedBytes).toBe(0)}
},20000)

it('keeps the published bank and maps coherent when a staging lease cleanup throws',async()=>{
 const p=original(()=>true,true),{engine}=engineFor(p)
 try{
  await engine.restoreCanonicalEmptyRoom(p.canonicalRead,p.tailOperations)
  const owner=engine['_canonicalLayerOwner']!,bank=owner.bank!,epoch=owner.prepass.preparedCapacity().epoch,changed={...asset,x:asset.x-1},snapshot={...trace.snapshot,strokeId:'cleanup-B',assets:[changed],material:{...trace.snapshot.material,assets:[changed]}},op={...trace.operations[0],id:'cleanup-b',seq:163,frame:{...trace.operations[0].frame,strokeId:snapshot.strokeId}},input=imageInput(p,op,snapshot),lease=owner.cache.lease.bind(owner.cache),fault=Error('staging lease cleanup failed')
  vi.spyOn(owner.cache,'lease').mockImplementationOnce(resources=>{const release=lease(resources);return()=>{release();throw fault}})
  await expect(engine.prepareOriginalRecorded(input)).rejects.toThrow(fault)
  expect(owner.bank).toBe(bank);expect(bank.assertSourceBinding(changed,{gl:engine['gl'],cache:owner.cache,cpu:engine['_brushMipCache']})).toBeTypeOf('number');expect(owner.prepass.preparedCapacity().epoch).toBe(epoch);expect(owner.resourceCandidate).toBeUndefined();expect(engine['_canonicalPixelsReady']).toBe(true)
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

function imageInputs(scope:Parameters<typeof attachCanonicalRecordedDelivery>[1],offset=0){
 const snapshot={...trace.snapshot,boardEpoch:scope.boardEpoch},operations=trace.operations.map((op,i)=>({...op,seq:offset+i+1}))
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
