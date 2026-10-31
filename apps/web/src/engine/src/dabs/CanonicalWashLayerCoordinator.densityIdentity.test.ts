import {it,expect,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {canonicalBrushDescriptorJSON,isBrushLibrary,extractSeededDensityDefaultAutoSourceDataCapability,extractDefaultAutoSourceDataCapability,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE as D,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_MATERIAL_LIMITS,canonicalDefaultAutoSourceBinding,canonicalSourceComposition} from '@grafetto/shared'
import {sourceStrokeAuthorDescriptor} from '../presets/sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorState,type SourceStrokeAuthorStep} from '../presets/sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter,type SourceStrokeMaterialContextV2} from '../presets/sourceStrokeMaterialAdapter'
import {SourceCanonicalFrameEncoder} from '../presets/sourceCanonicalFrameEncoder'
import {createSourcePrimaryComposition,advanceSourcePrimaryComposition} from '../presets/sourcePrimaryComposition'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {canonicalExecutorOperations} from './CanonicalFrameExecutor'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import fixture from '../presets/fixtures/sourceDefaultAutoWholePath/markerDry.normal.native.json'
import {CanonicalWashLayerCoordinator,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
import {prepareCanonicalRecordedAttachment,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2} from '@grafetto/shared'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'

const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex')
const packets=fixture.packets,pigment=[31,109,173] as const,gestureId=fixture.strokeId,bounds={minX:0,minY:0,maxX:64,maxY:64}
function stream(){
 const library:unknown={schemaVersion:1,assets:[],skipped:[],brushes:[fixture.imported]}
 if(!isBrushLibrary(library))throw Error('normal imported library schema rejected')
 const descriptor=library.brushes[0].descriptor,descriptorSha=sha(canonicalBrushDescriptorJSON(descriptor))
 expect(descriptorSha).toBe('7fd13ac324a458b265a19fb696fe4c91820fa5a9512a29ae24a66c064799d5b5')
 const capability=extractSeededDensityDefaultAutoSourceDataCapability(descriptor),oldCapability=extractDefaultAutoSourceDataCapability(descriptor)
 if(!capability.supported)throw Error(capability.reasons.join(','))
 expect(oldCapability.supported).toBe(false)
 const descriptorContext={colorIdentity:'rgb8:31,109,173',lodScale:1,coverageProfile:D,inputProfile:'krita-freehand-no-smoothing-v1' as const}
 const compiled=sourceStrokeAuthorDescriptor(descriptor,descriptorContext)
 if(!compiled.supported)throw Error(compiled.reasons.join(','))
 const program=compiled.program,pin=canonicalDefaultAutoSourceBinding(descriptor,descriptorSha,D,G)
 const selected=canonicalSourceComposition(descriptor,G)
 if(!selected)throw Error('source composition unavailable')
 const composition={...selected,alphaDarken:'creamy' as const,outerResourceOpacity:descriptor.opacity}
 const material:SourceStrokeMaterialContextV2={version:2,assets:[],primarySource:pin,targetGeometry:{pageBounds:bounds,tileWidth:32,tileHeight:32,maxTargets:4},budget:CANONICAL_MATERIAL_LIMITS}
 const run=(resume:boolean,flush:boolean)=>{
  const author=new SourceStrokeAuthor(program);let state=author.createState(1234567,9876543,.25)
  const adapter=new SourceStrokeMaterialAdapter(program,material,state)
  const encoder=new SourceCanonicalFrameEncoder({rasterProfile:G,brush:'brush:'+descriptor.id+'@'+descriptor.version,strokeId:gestureId,pigmentRgb8:pigment,composition,material})
  const frames:ReturnType<typeof encoder.encode>[]=[],steps:SourceStrokeAuthorStep[]=[]
  const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks)frames.push(encoder.encode(c.packed))}
  const consume=(initial:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{let iterator=initial;while(true){const next=iterator.next();if(next.done){state=next.value;return}steps.push(next.value);accept(adapter.accept(next.value));if(flush){const chunk=adapter.flush();if(chunk)accept([chunk])}
   if(resume){const saved=structuredClone(next.value.state);iterator.return(saved);if(!saved.cursor){state=saved;return}iterator=new SourceStrokeAuthor(program).resume(saved)}
  }}
  for(const p of packets){accept(adapter.beginInput(state));consume(author.plan(state,p))}
  accept(adapter.beginInput(state));consume(author.finish(state));accept(adapter.finish(state))
  expect(encoder.ended&&state.ended).toBe(true)
  let paint=createSourcePrimaryComposition(composition).state
  const draws=frames.flatMap((a,ordinal)=>{const next=advanceSourcePrimaryComposition(paint,{ordinal,frame:a.frame});paint=next.state;return next.draws.map(d=>({...d,recipe:a.frame.definitions[d.definition]}))})
  return{state,frames,draws,steps,paint}
 }
 return{...run(true,true),pin,composition,material,descriptor}
}

function execute(roomId:string,boardEpoch:number,userId:string,strokeId=fixture.strokeId,local=false){
 const data=stream()
  const {gl}=recordingGL();gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
  gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn();gl.isContextLost=()=>false
  gl.UNPACK_FLIP_Y_WEBGL=9240;gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL=9241;gl.PACK_ALIGNMENT=9242
  const flags=new Map<number,number|boolean>([[gl.UNPACK_FLIP_Y_WEBGL,true],[gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true],[gl.PACK_ALIGNMENT,8]]),getParameter=gl.getParameter,store=gl.pixelStorei
  gl.getParameter=(p:number)=>flags.has(p)?flags.get(p):getParameter(p)
  gl.pixelStorei=(p:number,v:number|boolean)=>{if(flags.has(p))flags.set(p,v);else store(p,v)}
  const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
  const attachments=new Map(),attach=gl.framebufferTexture2D
  gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)}
  gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
  const parameters=new Map(),set=gl.texParameteri
  gl.texParameteri=(t:number,n:number,v:number)=>{const tex=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(tex))parameters.set(tex,new Map());parameters.get(tex).set(n,v);set(t,n,v)}
  gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST

 const cpu=new BrushMipCache(),cache=new BrushTextureCache(gl),prepass=new TransformedMaskPrepass(gl,cache,cpu,'identity'),composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'identity-composite'),scratch=new RibbonScratchPool(gl)
 const layer=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8'),derived=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8')
 const uploaded:{ordinal:number;bytes:number[]}[]=[],begin=prepass.beginAutoGeneration.bind(prepass)
 let current:typeof uploaded[number]|undefined,alive=true
 prepass.beginAutoGeneration=r=>{const hit=begin(r);if(!hit){const ordinal='densityIdentity' in r.material?r.material.densityIdentity?.drawOrdinal:undefined;if(ordinal===undefined)throw Error('Missing ordinal');if(current?.ordinal!==ordinal){current={ordinal,bytes:[]};uploaded.push(current)}}return hit}
 gl.texSubImage2D=vi.fn((...args:unknown[])=>{if(current){const bytes=args[8] as Uint8Array;for(let i=0;i<(args[4] as number)*(args[5] as number);i++)current.bytes.push(bytes[i*4])}})
 const scope=Object.freeze({roomId,boardEpoch,rasterProfile:G})
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!alive)throw Error('Retired original owner');return scope}})
 const snap:CanonicalStrokeSnapshotV2={materialVersion:2,material:{version:2,assets:[],primarySource:data.pin,budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}},assets:[],layerId:'layer',brush:'brush:'+data.descriptor.id+'@'+data.descriptor.version,strokeId,boardEpoch,descriptorSha256:fixture.canonicalDescriptorSHA256,rasterProfile:G,pigmentRgb8:pigment,composition:data.composition}
 const original=(index:number):CanonicalRecordedInput=>{
  const encoded=data.frames[index],operation:CanonicalStrokeOperation={type:'canonical_stroke',id:'op-'+index,userId,timestamp:index,seq:index+1,layerId:'layer',frame:{...encoded.envelope,strokeId}}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId,boardEpoch,capabilities:[{originalUserId:userId,snapshot:snap}],bindings:[{operationId:operation.id,sequence:index+1,originalUserId:userId,capability:0}]},[operation],scope)[0]
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('Foreign original');lifetime.assertCurrent()}})
  accepted=Object.freeze({...atom,delivery});return accepted
 }
 prepass.prepare({width:64,height:64,slots:1},[]);composite.prepare({width:64,height:64,operations:canonicalExecutorOperations(G)},prepass.preparedResources())
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:G,layerId:'layer',layerEpoch:0,maxGestures:4,pageBounds:bounds,layer:()=>({buffer:layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source:()=>({autoSource:data.pin}),reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
 try{
  const stale=original(0);alive=false;const before=cpu.reservedBytes;expect(()=>coordinator.enqueueRecorded(stale)).toThrow('Retired');expect(cpu.reservedBytes).toBe(before);alive=true
  let turns=0
  const author:CanonicalLocalWashAuthor=Object.freeze({lifetime,snapshot:snap,userId,assertCurrent(candidate:CanonicalLocalWashAuthor){if(candidate!==author)throw Error('Foreign local');return lifetime.assertCurrent()}})
  for(let i=0;i<data.frames.length;i++){
   const accepted=original(i)
   if(local){if(accepted.operation.type!=='canonical_stroke')throw Error('Frame');const {seq:_seq,...operation}=accepted.operation;expect(coordinator.tryEnqueueLocal(author,Object.freeze(operation))).toBe(true)
    while(coordinator.pending){if(++turns>50000)throw Error('Stalled');coordinator.advance()}}
   coordinator.enqueueRecorded(accepted);while(coordinator.pending){if(++turns>50000)throw Error('Stalled');coordinator.advance()}}

  expect(coordinator.checkpointReady).toBe(true);expect(uploaded).toHaveLength(17)
  return sha(JSON.stringify(uploaded.map(u=>({ordinal:u.ordinal,sha:sha(new Uint8Array(u.bytes))}))))
 }finally{coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)
 for(const kind of ['Texture','Framebuffer','Buffer','Program','Shader'])for(const call of gl['create'+kind].mock.results)if(call.type==='return'&&call.value)expect(call.value.deleted).toBe(true)}
}
it('retains all17 actual normal Marker masks across read epochs and copied namespaces while rejecting retired owners',()=>{
 const first=execute('room',1,'author')
 expect(first).toBe(fixture.maskUploadSHA256)
 expect(execute('room',2,'author')).toBe(first)
 expect(execute('fork-room',91,'fork-user')).toBe(first)
 expect(execute('local-room',11,'local-author',fixture.strokeId,true)).toBe(first)
 expect(execute('room',3,'author','another-original-stroke')).not.toBe(first)
},30000)
