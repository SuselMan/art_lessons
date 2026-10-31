import {expect,it,vi,afterEach} from 'vitest'
import {inflateSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {canonicalImageSourceBinding,canonicalBrushDescriptorJSON,CANONICAL_STROKE_RASTER_PROFILE,type BrushDescriptor,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,type ServerToClientEvents} from '@grafetto/shared'
import fixture from '../presets/fixtures/sourcePngWholePath/guiStroke.native.json'
import {sourceStrokeAuthorDescriptor} from '../presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from '../presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from '../presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../presets/sourceCanonicalFrameEncoder'
import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import type {CanonicalRecordedInput} from '../oplog/CanonicalRecordedDelivery'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {CanonicalWashLayerCoordinator,type CanonicalWashLayerCoordinatorOptions,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
afterEach(()=>vi.restoreAllMocks())
const descriptor=fixture.descriptor as unknown as BrushDescriptor
const binding=canonicalImageSourceBinding(descriptor,fixture.asset)
const asset=binding.assets[0]
function sourceTrace(){
 const compiled=sourceStrokeAuthorDescriptor(descriptor,{asset:fixture.asset,colorIdentity:'native-GUI-black',lodScale:1,inputProfile:'krita-freehand-no-smoothing-v1'})
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,author=new SourceStrokeAuthor(program)
 let state=author.createState(4321,7654,.3)
 const material:SourceStrokeMaterialContextV2={version:2,...binding,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={layerId:'layer',brush:`brush:${descriptor.id}@${descriptor.version}`,strokeId:'original-basic6',boardEpoch:1,descriptorSha256:createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex'),rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'},assets:material.assets,materialVersion:2,material}
 const adapter=new SourceStrokeMaterialAdapter(program,material,state),encoder=new SourceCanonicalFrameEncoder({...snapshot,material})
 const operations:CanonicalStrokeOperation[]=[];let draws=0
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const chunk of chunks){const accepted=encoder.encode(chunk.packed);draws+=accepted.frame.draws.length;operations.push({id:'image-'+operations.length,userId:'author',timestamp:0,seq:operations.length+1,type:'canonical_stroke',layerId:'layer',frame:accepted.envelope})}}
 const consume=(iterator:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const step=iterator.next();if(step.done){state=step.value;return}accept(adapter.accept(step.value));const cut=adapter.flush();if(cut)accept([cut])}}
 const f32=(bits:number)=>new Float32Array(new Uint32Array([bits]).buffer)[0],m=fixture.mapping
 for(const [xb,yb,t,pb] of fixture.packets.slice(0,-1)){accept(adapter.beginInput(state));consume(author.plan(state,{x:m.a*f32(xb)+m.c*f32(yb)+m.tx,y:m.b*f32(xb)+m.d*f32(yb)+m.ty,t,pressure:f32(pb),tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false}))}
 accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
 expect(operations).toHaveLength(fixture.frames);expect(draws).toBe(fixture.draws)
 return {operations,snapshot}
}
const trace=sourceTrace()
function original(second=false){
 let current=true
 const operations=second?[...trace.operations,{...trace.operations[0],id:'second-0',seq:trace.operations.length+1,frame:{...trace.operations[0].frame,strokeId:'second'}}]:trace.operations
 const capabilities=[{originalUserId:'author',snapshot:trace.snapshot},...(second?[{originalUserId:'author',snapshot:{...trace.snapshot,strokeId:'second'}}]:[])]
 const state:Parameters<ServerToClientEvents['room_state']>[0]={room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:512,canvasHeight:512,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},latestSnapshotSeq:null,tailOperations:operations,participants:[],palette:[],frozen:false,lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalHistoryBase:{kind:'empty-room-prefix-v1',roomId:'room',boardEpoch:1,throughSeq:operations.length,operationCount:operations.length},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities,bindings:operations.map(op=>({operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:op.frame.strokeId==='second'?1:0}))}}
 const prepared=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>current})
 return{read:prepared.canonicalRead,inputs:prepared.canonicalRead.preparedAtoms as readonly CanonicalRecordedInput[],stale:()=>{current=false}}
}
function physical(){
 const {gl}=recordingGL();gl.texSubImage2D=vi.fn()
 gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002
 gl.LINEAR=9010;gl.REPEAT=9011
 gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 const attachments=new Map(),attach=gl.framebufferTexture2D
 gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)}
 gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
 const parameters=new Map(),setParameter=gl.texParameteri
 gl.texParameteri=(target:number,name:number,value:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(name,value);setParameter(target,name,value)}
 gl.getTexParameter=(_:number,name:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(name)??gl.NEAREST
 const cpu=new BrushMipCache(),cache=new BrushTextureCache(gl)
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const layer=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8')
 const derived=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8')
 const bytes=new Uint8Array(inflateSync(Buffer.from(fixture.asset.deflateBase64,'base64'),{maxOutputLength:65536}))
 expect('asset:'+createHash('sha256').update(bytes).digest('hex')).toBe(asset.id)
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[{id:asset.id as `asset:${string}`,tip:descriptor.tip,assetSide:asset.size,readOriginalCoverage:()=>bytes}],{gpuBytes:0,cpuBytes:0})
 for(let i=0;i<bank.jobs.length;i++)expect(bank.prepareJob(i)).toBe('ready')
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'image-prepass');prepass.prepare({width:16,height:16,slots:1},bank.preparedResources())
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'image-composite');composite.prepare({width:32,height:32,operations:['alphaDarken32FusedScalar','over32FusedScalar']},[...prepass.preparedResources(),...bank.preparedResources()])
 const scratch=new RibbonScratchPool(gl),source=vi.fn<CanonicalWashLayerCoordinatorOptions['source']>(()=>({bank}))
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,layerId:'layer',layerEpoch:0,maxGestures:4,pageBounds:{minX:0,minY:0,maxX:512,maxY:512},layer:()=>({buffer:layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source,reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
 const owners={gl,cache,cpu}
 return{gl,cache,cpu,bank,prepass,composite,source,coordinator,owners,close(){coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset();bank.reset();cache.clear()}}
}
it('consumes actual Basic6 V2 source frames through original room read and the same prepared image bank',()=>{
 const p=original(),s=physical(),cold=vi.spyOn(s.bank,'assertSourceBinding')
 try{for(const input of p.inputs){s.coordinator.enqueueRecorded(input);let turns=0;while(s.coordinator.pending&&turns++<10000)s.coordinator.advance();expect(turns).toBeLessThan(10000)}expect(s.coordinator.checkpointReady).toBe(true);expect(s.source).toHaveBeenCalledOnce();expect(s.source.mock.calls[0][1]).toBe(p.inputs[0]);expect(cold).toHaveBeenCalledOnce()}finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('checks exact original bank context and reset generation without a repeated cold resource scan',()=>{
 const s=physical()
 try{const generation=s.bank.assertSourceBinding(asset,s.owners),scan=vi.spyOn(s.bank,'preparedResources');for(let i=0;i<20;i++)s.bank.assertCurrentOwners(generation);expect(scan).not.toHaveBeenCalled();s.bank.reset();expect(()=>s.bank.assertCurrentOwners(generation)).toThrow()}finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it.each(['gl','cache','cpu'] as const)('rejects a foreign %s owner before a cold resource scan',kind=>{
 const s=physical()
 try{const scan=vi.spyOn(s.bank,'preparedResources'),owners={...s.owners}
  if(kind==='gl')owners.gl=recordingGL().gl
  if(kind==='cache')owners.cache=new BrushTextureCache(s.gl)
  if(kind==='cpu')owners.cpu=new BrushMipCache()
  expect(()=>s.bank.assertSourceBinding(asset,owners)).toThrow();expect(scan).not.toHaveBeenCalled()
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects copied receivers, missing metadata charge and owner mutation without changing accepted bank resources',()=>{
 const s=physical()
 try{const generation=s.bank.assertSourceBinding(asset,s.owners)
  expect(()=>Reflect.apply(s.bank.assertCurrentOwners,{...s.bank},[generation])).toThrow()
  expect(()=>Reflect.apply(s.bank.assertSourceBinding,{...s.bank},[asset,s.owners])).toThrow()
  const originalCpu=s.cpu;Reflect.set(s.bank,'cpu',new BrushMipCache())
  try{expect(()=>s.bank.assertCurrentOwners(generation)).toThrow()}finally{Reflect.set(s.bank,'cpu',originalCpu)}
  const copy=new CanonicalMaskSourceBank(s.gl,s.cache,s.cpu,[{id:asset.id as `asset:${string}`,tip:descriptor.tip,assetSide:asset.size,readOriginalCoverage:()=>new Uint8Array(65536)}],{gpuBytes:0,cpuBytes:0})
  try{expect(copy.isReady()).toBe(true);expect(()=>copy.assertSourceBinding(asset,s.owners)).toThrow()}finally{copy.reset()}
  expect(s.bank.assertSourceBinding(asset,s.owners)).toBe(generation)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it.each(['missing','duplicate','dimension','scale','bytes','crop'] as const)('rejects %s bank level metadata before publishing a new original Entry',kind=>{
 const p=original(),s=physical(),before=s.cpu.reservedBytes
 try{const resources=s.bank.preparedResources()
  const altered=kind==='missing'?resources.slice(1):kind==='duplicate'?[...resources.slice(1),resources[1]]:resources.map((r,i)=>i?r:{...r,...kind==='bytes'?{bytes:r.bytes+4}:{},canonical:{...r.canonical!,...kind==='dimension'?{nativeWidth:r.canonical!.nativeWidth+1}:kind==='scale'?{baseScale:r.canonical!.baseScale*2}:kind==='crop'?{asset:{...r.canonical!.asset,x:r.canonical!.asset.x+1}}:{}}})
  vi.spyOn(s.bank,'preparedResources').mockReturnValue(altered)
  const writes=[s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)
  expect(()=>s.coordinator.enqueueRecorded(p.inputs[0])).toThrow()
  expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)
  expect([s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)).toEqual(writes)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects a reset/reprepared bank generation before writes, then releases only coordinator-owned storage',()=>{
 const p=original(),s=physical()
 try{s.coordinator.enqueueRecorded(p.inputs[0]);s.bank.reset();for(let i=0;i<s.bank.jobs.length;i++)s.bank.prepareJob(i)
  const generation=s.bank.assertSourceBinding(asset,s.owners),scan=vi.spyOn(s.bank,'preparedResources'),writes=[s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)
  expect(()=>s.coordinator.advance()).toThrow();expect(scan).not.toHaveBeenCalled()
  expect([s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)).toEqual(writes)
  s.coordinator.cancel();expect(s.bank.assertSourceBinding(asset,s.owners)).toBe(generation)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rechecks bank generation after callback-capable enqueue before publishing a new Entry',()=>{
 const p=original(),s=physical(),before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu)
 let armed=false
 s.source.mockImplementation(()=>{armed=true;return{bank:s.bank}})
 vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{if(armed){armed=false;s.bank.reset();for(let i=0;i<s.bank.jobs.length;i++)s.bank.prepareJob(i)}return reserve(bytes)})
 try{expect(()=>s.coordinator.enqueueRecorded(p.inputs[0])).toThrow();expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)}finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('refuses a missing image bank before executor publication',()=>{
 const p=original(),s=physical(),before=s.cpu.reservedBytes
 s.source.mockReturnValue({})
 try{expect(()=>s.coordinator.enqueueRecorded(p.inputs[0])).toThrow('image bank');expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)}finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rechecks the actual original read after callback-capable admission before publication',()=>{
 const p=original(),s=physical(),before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu)
 let armed=false;s.source.mockImplementation(()=>{armed=true;return{bank:s.bank}})
 vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{if(armed){armed=false;p.stale()}return reserve(bytes)})
 try{expect(()=>s.coordinator.enqueueRecorded(p.inputs[0])).toThrow();expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before)}finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('keeps the accepted first image gesture intact when a later original gesture supplies a foreign bank',()=>{
 const p=original(true),s=physical(),foreign=physical()
 try{
  for(const input of p.inputs.slice(0,-1)){s.coordinator.enqueueRecorded(input);let turns=0;while(s.coordinator.pending&&turns++<10000)s.coordinator.advance();expect(turns).toBeLessThan(10000)}
  expect(s.coordinator.checkpointReady).toBe(true)
  const before=s.cpu.reservedBytes;s.source.mockReturnValue({bank:foreign.bank})
  expect(()=>s.coordinator.enqueueRecorded(p.inputs.at(-1)!)).toThrow()
  expect(s.coordinator.checkpointReady).toBe(true);expect(s.coordinator.poisoned).toBe(false);expect(s.cpu.reservedBytes).toBe(before)
 }finally{foreign.close();s.close()}expect(s.cpu.reservedBytes).toBe(0);expect(foreign.cpu.reservedBytes).toBe(0)
})

it('uses the same bank for a local internal BEGIN lease and original confirmation without depositing frames twice',()=>{
 const p=original(),s=physical(),snapshot=p.inputs[0].read!.capability.snapshot
 // Internal caller lease contract only; engine/image author activation is B2.
 const author:CanonicalLocalWashAuthor=Object.freeze({lifetime:p.read,snapshot,userId:'author',assertCurrent(candidate:CanonicalLocalWashAuthor){if(this!==author||candidate!==author)throw Error('Foreign author');return p.read.assertCurrent()}})
 try{
  for(const input of p.inputs){const operation=input.operation;if(operation.type!=='canonical_stroke')throw Error('Expected frame');const {seq:_seq,...local}=operation
   expect(s.coordinator.tryEnqueueLocal(author,Object.freeze(local))).toBe(true)
   let turns=0;while(s.coordinator.pending&&turns++<10000)s.coordinator.advance();expect(turns).toBeLessThan(10000)
  }
  expect(s.coordinator.checkpointReady).toBe(false);expect(s.source).toHaveBeenCalledOnce();expect(s.source.mock.calls[0][2]).toBe(author)
  for(const input of p.inputs)s.coordinator.enqueueRecorded(input)
  let turns=0;while(s.coordinator.pending&&turns++<10000)s.coordinator.advance()
  expect(turns).toBeLessThan(10000);expect(s.coordinator.checkpointReady).toBe(true);expect(s.source).toHaveBeenCalledOnce()
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
