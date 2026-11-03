import {canonicalExecutorOperations} from './CanonicalFrameExecutor'
import {canonicalSourceMaterialContext,prepareCanonicalRecordedAttachmentV8,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G} from '@grafetto/shared'
import {compositeSourceFused32} from '../presets/sourceFused32'
import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import {describe,it,expect,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalDefaultAutoSourceBinding,buildCanonicalMaterial,prepareCanonicalRecordedAttachment,type BrushDescriptor,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type Operation,type CanonicalStrokeCloseOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {prepareSourceDefaultAutoDab} from '../presets/sourceDefaultAutoDab'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES,TransformedMaskPrepass} from './TransformedMaskPrepass'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {CanonicalWashLayerCoordinator,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'

function fixture(compositeSide=4,replayRetention?:{maxEntries:number;maxBytes:number},masked=false){
 const profile=masked?G:CANONICAL_STROKE_RASTER_PROFILE
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
 const layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const derived=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'recorded-owner-test')
 prepass.prepare({width:4,height:4,slots:masked?2:1},[])
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'recorded-owner-composite')
 composite.prepare({width:compositeSide,height:compositeSide,operations:masked?canonicalExecutorOperations(profile,{masked:true}):['alphaDarken32FusedScalar','over32FusedScalar']},prepass.preparedResources())
 const scratch=new RibbonScratchPool(gl)
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const nativeCoverage=pin.coverageProfile;if(nativeCoverage==='browser-number-coverage-v1'||nativeCoverage==='neon64-f32-fma-seeded-density-v1')throw Error('Native fixture coverage required')
 const material={version:2 as const,assets:[],primarySource:pin,...masked?{maskSource:pin,maskingBlend:'multiply' as const}:{},budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:[],layerId:'layer',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'same',boardEpoch:1,descriptorSha256:pin.descriptorSha256,rasterProfile:profile,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}}
 const scope=Object.freeze({roomId:'room',boardEpoch:1,rasterProfile:profile,...masked?{pixelMaskedSource:'pixel-masked-v1' as const}:{}})
 let current=true,replaced=false,layerEpoch=0;let layerObserver:(()=>void)|undefined
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!current)throw Error('stale');return replaced?Object.freeze({...scope}):scope}})
 const input=(userId='author',ordinal=0,seq=1,ended=false,painted=false,group=0,x=0)=>{
  const dab=painted?prepareSourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape:{scale:.01,ratio:1,rotation:0},subpixelX:0,subpixelY:0,coverageProfile:nativeCoverage,maxPixels:1048576,maxWorkSamples:16*1048576}):undefined
  const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.01,ratio:1,rotation:0,subX:0,subY:0,width:dab?.geometry.maskSize[0]??1,height:dab?.geometry.maskSize[1]??1,mirrorH:false,mirrorV:false}
  const paintedMaterial=painted?buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group},{kind:'primaryEnd',at:1,group},{kind:'segmentEnd',at:1,group},...(ended?[{kind:'gestureEnd' as const,at:1}]:[])]},material):undefined
  const packed=paintedMaterial?.packed??buildCanonicalMaterial({masked,entry:{phase:'between'},draws:[],fences:ended?[{kind:'gestureEnd',at:0}]:[]},material).packed
  const operation:CanonicalStrokeOperation={type:'canonical_stroke',id:`${userId}-${seq}`,userId,timestamp:0,seq,layerId:'layer',frame:{version:masked?2:1,rasterProfile:profile,brush:snapshot.brush,strokeId:'same',frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
  const atom=(masked?prepareCanonicalRecordedAttachmentV8:prepareCanonicalRecordedAttachment)({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:userId,snapshot}],bindings:[{operationId:operation.id,sequence:seq,originalUserId:userId,capability:0}]},[operation],scope)[0]
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('foreign');lifetime.assertCurrent()}})
  accepted=Object.freeze({...atom,delivery});return accepted
 }
 const source=vi.fn(()=>({autoSource:pin,...masked?{sourceMaterial:canonicalSourceMaterialContext(material)}:{}}))
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:profile,layerId:'layer',layerEpoch:0,maxGestures:4,replayRetention,layer:()=>{layerObserver?.();return {buffer:layer,epoch:layerEpoch}},presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source,reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
 const seal=(frame:CanonicalRecordedInput,patch:Partial<CanonicalStrokeCloseOperation>={})=>{
  const op=frame.operation;if(op.type!=='canonical_stroke')throw Error('frame')
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('foreign');lifetime.assertCurrent()}})
  accepted=Object.freeze({operation:{type:'canonical_stroke_close',id:'close',userId:'operator',timestamp:1,seq:10,layerId:'layer',targetUserId:op.userId,strokeId:'same',disposition:'commitPartial',recordedNext:1,firstFrameOpId:op.id,lastFrameOpId:op.id,...patch} as Operation,delivery})
  return accepted
 }
 const localAuthor=(userId='author'):CanonicalLocalWashAuthor=>{
  const author:CanonicalLocalWashAuthor=Object.freeze({lifetime,snapshot,userId,assertCurrent(candidate:CanonicalLocalWashAuthor){if(this!==author||candidate!==author)throw Error('foreign local author');return lifetime.assertCurrent()}})
  return author
 }
 const local=(value:CanonicalRecordedInput):CanonicalStrokeOperation=>{if(value.operation.type!=='canonical_stroke')throw Error('frame');const {seq:_seq,...op}=value.operation;return Object.freeze(op)}
 return {coordinator,layer,derived,cpu,gl,scratch,composite,input,seal,source,snapshot,localAuthor,local,observeLayer:(callback:(()=>void)|undefined)=>{layerObserver=callback},stale:()=>{current=false},replaceScope:()=>{replaced=true},changeLayer:()=>{layerEpoch=1},close(){coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset()}}
}

describe('original-lifetime recorded prefix owner',()=>{
 it('rejects copied delivery input before source resolution or metadata allocation',()=>{
  const s=fixture();try{expect(typeof s.coordinator.enqueueRecorded).toBe('function');const input=s.input(),before=s.cpu.reservedBytes;expect(()=>s.coordinator.enqueueRecorded({...input})).toThrow();expect(s.source).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(before)}finally{s.close()}
 })
 it('requires ordinal zero and a current original owner before allocating source',()=>{
  const s=fixture();try{expect(typeof s.coordinator.enqueueRecorded).toBe('function');expect(()=>s.coordinator.enqueueRecorded(s.input('author',1))).toThrow();s.stale();expect(()=>s.coordinator.enqueueRecorded(s.input())).toThrow();expect(s.source).not.toHaveBeenCalled()}finally{s.close()}
 })
 it('keeps equal stroke IDs from distinct original authors in separate existing entries',()=>{
  const s=fixture();try{expect(typeof s.coordinator.enqueueRecorded).toBe('function');s.coordinator.enqueueRecorded(s.input('A',0,1));s.coordinator.enqueueRecorded(s.input('B',0,2));expect(s.source).toHaveBeenCalledTimes(2);expect(s.source.mock.calls[0]).not.toEqual(s.source.mock.calls[1])}finally{s.close()}
 })
 it('seals only an existing original prefix; close-only delivery never resolves a source',()=>{
  const s=fixture();try{const frame=s.input(),close=s.seal(frame),before=s.cpu.reservedBytes
   expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow();expect(s.source).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(before)
   s.coordinator.enqueueRecorded(frame);expect(s.cpu.reservedBytes).toBe(before+6144+CANONICAL_MASK_CAPACITY_LEASE_CPU_BYTES)
   expect(()=>s.coordinator.enqueueRecordedSeal({...close})).toThrow()
   s.coordinator.enqueueRecordedSeal(close);expect(()=>s.coordinator.enqueueRecordedSeal(close)).toThrow()
   expect(s.source).toHaveBeenCalledTimes(1)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('rejects malformed seal without retiring or closing the accepted recorded prefix',()=>{
  const s=fixture();try{const frame=s.input();s.coordinator.enqueueRecorded(frame)
   expect(()=>s.coordinator.enqueueRecordedSeal(s.seal(frame,{layerId:'other'}))).toThrow()
   expect(()=>s.coordinator.enqueueRecordedSeal(s.seal(frame,{seq:1}))).toThrow()
   expect(s.coordinator.poisoned).toBe(false);s.coordinator.enqueueRecordedSeal(s.seal(frame))
  }finally{s.close()}
 })
 it('rechecks exact stable lifetime scope before subsequent frames and GL advance',()=>{
  const s=fixture();try{s.coordinator.enqueueRecorded(s.input());s.replaceScope()
   expect(()=>s.coordinator.enqueueRecorded(s.input('author',1,2))).toThrow()
   const writes=[s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)
   expect(()=>s.coordinator.advance()).toThrow();expect([s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)).toEqual(writes)
   expect(s.source).toHaveBeenCalledTimes(1);expect(s.cpu.reservedBytes).toBeGreaterThan(0)
   s.coordinator.cancel();expect(s.scratch.bytes.live).toBe(0)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('rejects mismatched source before executor allocation and releases each failed candidate charge',()=>{
  const s=fixture();try{const baseline=s.cpu.reservedBytes;s.source.mockImplementation(()=>({autoSource:{...canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'c'.repeat(64),'neon64-f32-fma-v1')}}))
   for(let i=0;i<3;i++){expect(()=>s.coordinator.enqueueRecorded(s.input())).toThrow();expect(s.cpu.reservedBytes).toBe(baseline)}
   expect(s.coordinator.pending).toBe(false)
  }finally{s.close()}
 })
 it('does not permit public raw close or raw enqueue to bypass the genuine prefix owner',()=>{
  const s=fixture();try{s.coordinator.enqueueRecorded(s.input());const id=JSON.stringify(['room',1,'author','same'])
   expect(()=>s.coordinator.enqueueRecordedClose(id,1,2)).toThrow(/original/)
   const frame=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[]},{version:2,assets:[],primarySource:canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1'),budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}).frame
   expect(()=>s.coordinator.enqueue({gestureId:id,layerId:'layer',layerEpoch:0,ordinal:1,frame,assets:[],rgb:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},2)).toThrow(/original/)
  }finally{s.close()}
 })

 it('advances a complete multi-frame prefix and validates last authoritative ID/sequence',()=>{
  const s=fixture();try{const first=s.input();s.coordinator.enqueueRecorded(first);const next=s.input('author',1,4);s.coordinator.enqueueRecorded(next)
   expect(()=>s.coordinator.enqueueRecordedSeal(s.seal(first))).toThrow()
   s.coordinator.enqueueRecordedSeal(s.seal(first,{recordedNext:2,lastFrameOpId:next.operation.id}))
   expect(s.source).toHaveBeenCalledTimes(1)
  }finally{s.close()}
 })

 it('rejects copied delivery receivers and normally ended prefixes as close targets',()=>{
  const s=fixture();try{const first=s.input('author',0,1,true)
   expect(()=>s.coordinator.enqueueRecorded({...first,delivery:{...first.delivery}})).toThrow()
   s.coordinator.enqueueRecorded(first)
   expect(()=>s.coordinator.enqueueRecordedSeal(s.seal(first))).toThrow()
   expect(()=>s.coordinator.enqueueRecorded(s.input('author',1,2))).toThrow()
   expect(s.source).toHaveBeenCalledTimes(1)
  }finally{s.close()}
 })

 it('consumes the actual room-state prepared owner and retires its lane after the original lifetime expires',()=>{
  const s=fixture();try{
   let current=true
   const original=s.input(),op=original.operation
   if(op.type!=='canonical_stroke'||!original.read)throw Error('Expected frame fixture')
   const state:Parameters<ServerToClientEvents['room_state']>[0]={
    room:{id:'room',name:'Board',ownerId:'reader',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},
    latestSnapshotSeq:null,tailOperations:[op],participants:[],palette:[],frozen:false,
    lesson:{id:'room',boards:[],assignments:[],activeAssignmentId:null,activeBoardId:null,spotlightBoardId:null,classVisibility:'teacher_only',handsRaised:[]},
    canonicalReadScope:{roomId:'room',boardEpoch:1},canonicalCapabilities:{version:1,roomId:'room',boardEpoch:1,capabilities:[original.read.capability],bindings:[{operationId:op.id,sequence:op.seq!,originalUserId:op.userId,capability:0}]}}
   const prepared=prepareCanonicalRoomState(state,{expectedBoardId:'room',isCurrent:()=>current})
   const input=prepared.canonicalRead.preparedAtoms[0] as CanonicalRecordedInput
   expect(input.delivery.lifetime).toBe(prepared.canonicalRead)
   expect(input.delivery.lifetime.assertCurrent()).toBe(prepared.canonicalRead.scope)
   expect(Object.keys(input)).not.toContain('delivery')
   s.coordinator.enqueueRecorded(input);expect(s.source).toHaveBeenCalledWith(JSON.stringify(['room',1,'author','same']),input)
   current=false
   const writes=[s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)
   expect(()=>s.coordinator.advance()).toThrow()
   expect([s.gl.drawArrays,s.gl.clear,s.gl.texImage2D].map(fn=>fn.mock.calls.length)).toEqual(writes)
   s.coordinator.cancel();expect(s.scratch.bytes.live).toBe(0)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })

})

describe('same wash lane provisional original promotion',()=>{
 it('deposits local frames once and requires original confirmation before checkpoint',()=>{
  const s=fixture();try{
   const recorded=s.input('author',0,1,true,true),op=s.local(recorded),author=s.localAuthor()
   expect(s.coordinator.tryEnqueueLocal(author,op)).toBe(true)
   for(let i=0;i<40&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.presentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false);expect(s.coordinator.pending).toBe(false)
   expect(s.derived.resolveVisible({minX:0,minY:0,maxX:4,maxY:4}).every(target=>target.contentRect!==null)).toBe(true)
   expect(s.derived.tileCount).toBeGreaterThan(0)
   const calls=s.source.mock.calls.length
   s.coordinator.enqueueRecorded(recorded)
   expect(s.source.mock.calls.length).toBe(calls);expect(s.coordinator.queuedFrameCount).toBe(0)
   for(let i=0;i<40&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.checkpointReady).toBe(true)
   expect(s.layer.tileCount).toBeGreaterThan(0)
   expect(s.layer.resolveVisible({minX:0,minY:0,maxX:4,maxY:4}).every(target=>target.contentRect!==null)).toBe(true)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('rejects copied lease and sequenced payload before retaining CPU/source',()=>{
  const s=fixture();try{const author=s.localAuthor(),recorded=s.input(),before=s.cpu.reservedBytes
   expect(()=>s.coordinator.tryEnqueueLocal({...author},s.local(recorded))).toThrow(/foreign/)
   expect(()=>s.coordinator.tryEnqueueLocal(author,recorded.operation as CanonicalStrokeOperation)).toThrow()
   expect(s.cpu.reservedBytes).toBe(before);expect(s.source).not.toHaveBeenCalled()
  }finally{s.close()}
 })
 it('rejects changed original timestamp and preserves pending receipt until cancellation',()=>{
  const s=fixture();try{const recorded=s.input(),op=s.local(recorded)
   s.coordinator.tryEnqueueLocal(s.localAuthor(),Object.freeze({...op,timestamp:1}))
   expect(()=>s.coordinator.enqueueRecorded(recorded)).toThrow(/match/)
   expect(s.coordinator.checkpointReady).toBe(false)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
})

describe('provisional lane pressure and global original ordering',()=>{
 it('retries exactly the same ninth envelope after queue pressure without retaining it twice',()=>{
  const s=fixture();try{const author=s.localAuthor()
   for(let i=0;i<8;i++)expect(s.coordinator.tryEnqueueLocal(author,s.local(s.input('author',i,i+1)))).toBe(true)
   const ninth=s.local(s.input('author',8,9,true)),before=s.cpu.reservedBytes
   expect(s.coordinator.tryEnqueueLocal(author,ninth)).toBe(false);expect(s.cpu.reservedBytes).toBe(before)
   expect(s.coordinator.queuedFrameCount).toBe(8)
   for(let i=0;i<40&&s.coordinator.queuedFrameCount===8;i++)s.coordinator.advance()
   expect(s.coordinator.tryEnqueueLocal(author,ninth)).toBe(true)
   expect(s.coordinator.tryEnqueueLocal(author,ninth)).toBe(false) // full again: no validation/admission
   for(let i=0;i<40&&s.coordinator.queuedFrameCount===8;i++)s.coordinator.advance()
   expect(()=>s.coordinator.tryEnqueueLocal(author,ninth)).toThrow()
   expect(s.source).toHaveBeenCalledTimes(1)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('keeps every stable commit blocked by any unknown local and reorders on original first seq',()=>{
  const s=fixture();try{const a=s.input('A',0,2,true),b=s.input('B',0,1,true)
   s.coordinator.tryEnqueueLocal(s.localAuthor('A'),s.local(a));s.coordinator.enqueueRecorded(b)
   for(let i=0;i<80;i++)s.coordinator.advance()
   expect(s.coordinator.presentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false);expect(s.coordinator.pending).toBe(false)
   expect(s.coordinator['entries'].map(e=>e.firstSequence)).toEqual([1,undefined])
   expect(s.coordinator['entries'].every(e=>!e.committed)).toBe(true)
   const aEntry=s.coordinator['entries'][1],raw=aEntry.ownership
   s.coordinator.enqueueRecorded(a)
   expect(s.coordinator['entries'].map(e=>e.firstSequence)).toEqual([1,2]);expect(aEntry.ownership).toBe(raw)
   for(let i=0;i<80&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.checkpointReady).toBe(true);expect(s.source).toHaveBeenCalledTimes(2)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('checks stale local leases before GL and retires receipt CPU during explicit cancellation',()=>{
  const s=fixture();try{s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(s.input()))
   s.stale();const writes=s.gl.drawArrays.mock.calls.length
   expect(()=>s.coordinator.advance()).toThrow(/stale/);expect(s.gl.drawArrays.mock.calls.length).toBe(writes)
   s.coordinator.cancel();expect(s.coordinator['entries'][0].local?.receipts??[]).toHaveLength(0)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('normalizes captured nested payload once, so later mutation cannot change accepted paint',()=>{
  const s=fixture();try{const recorded=s.input('author',0,1,true),original=s.local(recorded)
   const rgb:[number,number,number]=[0,0,0],op=Object.freeze({...original,frame:{...original.frame,pigmentRgb8:rgb}})
   s.coordinator.tryEnqueueLocal(s.localAuthor(),op);rgb[0]=255
   expect(()=>s.coordinator.enqueueRecorded(recorded)).not.toThrow()
   expect(s.coordinator['entries'][0].local?.receipts??[]).toHaveLength(0)
  }finally{s.close()}
 })
 it('does not allow public raw close to fabricate the end of a local author',()=>{
  const s=fixture();try{s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(s.input()))
   expect(()=>s.coordinator.enqueueRecordedClose(JSON.stringify(['room',1,'author','same']),1,2)).toThrow(/original/)
   expect(s.coordinator.checkpointReady).toBe(false)
  }finally{s.close()}
 })
})

it('retains the actual nonempty raw wash through confirmation without re-deposition',()=>{
 const s=fixture();try{const recorded=s.input('author',0,1,true,true)
  s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(recorded))
  for(let i=0;i<200&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(s.coordinator.pending).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)
  const entry=s.coordinator['entries'][0],owned=entry.ownership
  expect(owned?.tiles.length).toBeGreaterThan(0)
  const uploads=s.gl.texSubImage2D.mock.calls.length,draws=s.gl.drawArrays.mock.calls.length
  s.coordinator.enqueueRecorded(recorded)
  expect(entry.ownership).toBe(owned);expect(s.gl.texSubImage2D.mock.calls.length).toBe(uploads);expect(s.gl.drawArrays.mock.calls.length).toBe(draws)
  for(let i=0;i<200&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(s.coordinator.checkpointReady).toBe(true);expect(s.source).toHaveBeenCalledTimes(1)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('does not publish confirmation after receipt release invalidates the original owner',()=>{
 const s=fixture();try{const reserve=s.cpu.reserve.bind(s.cpu),recorded=s.input()
  vi.spyOn(s.cpu,'reserve').mockImplementationOnce(bytes=>{const release=reserve(bytes);return()=>{release();s.stale()}})
  s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(recorded))
  expect(()=>s.coordinator.enqueueRecorded(recorded)).toThrow(/stale/)
  expect(s.coordinator['entries'][0].recorded).toBeUndefined()
  expect(s.coordinator['entries'][0].firstSequence).toBeUndefined()
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects permanent receipt CPU pressure without advancing local ordinal or resolving another source',()=>{
 const s=fixture();try{const author=s.localAuthor(),op=s.local(s.input()),before=s.cpu.reservedBytes,error=Error('receipt budget')
  vi.spyOn(s.cpu,'reserve').mockImplementationOnce(()=>{throw error})
  expect(()=>s.coordinator.tryEnqueueLocal(author,op)).toThrow(error)
  expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.cpu.reservedBytes).toBe(before);expect(s.source).not.toHaveBeenCalled()
  expect(s.coordinator.tryEnqueueLocal(author,op)).toBe(true)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it.each(['id','paint']as const)('requires original immutable %s equality, not only a matching ordinal',field=>{
 const s=fixture();try{const original=s.input('author',0,1,true),op=s.local(original)
  const local=Object.freeze(field==='id'?{...op,id:'different'}:{...op,frame:s.local(s.input()).frame})
  s.coordinator.tryEnqueueLocal(s.localAuthor(),local)
  expect(()=>s.coordinator.enqueueRecorded(original)).toThrow(/match/)
  expect(s.coordinator['entries'][0].recorded).toBeUndefined();expect(s.coordinator.checkpointReady).toBe(false)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('retires provisional receipt CPU after real loss and ledger forget without old-name deletion',()=>{
 const s=fixture();try{s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(s.input('author',0,1,true,true)))
  for(let i=0;i<200&&s.coordinator.pending;i++)s.coordinator.advance()
  const deletes=s.gl.deleteTexture.mock.calls.length+s.gl.deleteFramebuffer.mock.calls.length+s.gl.deleteProgram.mock.calls.length
  s.gl.isContextLost=()=>true;AccumulationBuffer.forgetContextStorage(s.gl)
  s.coordinator.cancel('lost',{lost:true})
  expect(s.coordinator['entries'][0].local?.receipts??[]).toHaveLength(0)
  expect(s.gl.deleteTexture.mock.calls.length+s.gl.deleteFramebuffer.mock.calls.length+s.gl.deleteProgram.mock.calls.length).toBe(deletes)
  s.scratch.forget();s.gl.isContextLost=()=>false
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('charges the complete retained BEGIN snapshot before source resolution and retires it with the entry',()=>{
 const s=fixture();try{const reserve=vi.spyOn(s.cpu,'reserve'),author=s.localAuthor()
  const snapshotBytes=2*JSON.stringify(author.snapshot).length
  s.coordinator.tryEnqueueLocal(author,s.local(s.input()))
  expect(reserve).toHaveBeenCalledWith(1024+4096+snapshotBytes)
  s.coordinator.cancel();expect(s.coordinator['entries'][0].local?.receipts??[]).toHaveLength(0)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('rejects retained snapshot overflow before source allocation and releases its candidate receipt',()=>{
 const s=fixture();try{const reserve=s.cpu.reserve.bind(s.cpu),author=s.localAuthor(),before=s.cpu.reservedBytes,error=Error('snapshot budget')
  const expected=1024+4096+2*JSON.stringify(author.snapshot).length
  vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{if(bytes===expected)throw error;return reserve(bytes)})
  expect(()=>s.coordinator.tryEnqueueLocal(author,s.local(s.input()))).toThrow(error)
  expect(s.source).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(before);expect(s.coordinator.queuedFrameCount).toBe(0)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('drops the completed local BEGIN lease before external metadata release',()=>{
 const s=fixture();try{const recorded=s.input('author',0,1,true),reserve=s.cpu.reserve.bind(s.cpu),author=s.localAuthor()
  const retained=1024+4096+2*JSON.stringify(author.snapshot).length
  let inspected=false
  vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{const release=reserve(bytes);return()=>{if(bytes===retained){inspected=true;expect(s.coordinator['entries'][0].local).toBeUndefined()}release()}})
  s.coordinator.tryEnqueueLocal(author,s.local(recorded));s.coordinator.enqueueRecorded(recorded)
  for(let i=0;i<40&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(inspected).toBe(true);expect(s.coordinator.checkpointReady).toBe(true)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

describe('matching confirmation without a visual reorder',()=>{
 it('does not publish initialized blank raw storage on the first matching confirmation before actual deposition',()=>{
  const s=fixture();try{
   const original=s.input('author',0,1,false,true),author=s.localAuthor(),draw=vi.spyOn(s.composite,'drawSource')
   expect(s.coordinator.tryEnqueueLocal(author,s.local(original))).toBe(true)
   const executor=s.coordinator['entries'][0].executor
   for(let i=0;i<40&&executor['queue'][0].scratchCursor===0;i++)s.coordinator.advance()
   const work=executor['queue'][0]
   expect(work.targetCursor).toBe(1);expect(work.scratchCursor).toBe(1);expect(work.draw).toBe(0);expect(draw).not.toHaveBeenCalled()
   const revision=s.coordinator['revision']
   s.coordinator.enqueueRecorded(original)
   expect(s.coordinator['revision']).toBe(revision);expect(s.coordinator['dirty'].size).toBe(0);expect(s.coordinator.completedPresentationRevision).toBe(-1)
   for(let i=0;i<40&&!s.coordinator['dirty'].size;i++)s.coordinator.advance()
   expect(draw.mock.calls.some(([request])=>request.source.kind==='maskRgb')).toBe(true)
   expect(s.coordinator['revision']).toBeGreaterThan(revision);expect(s.coordinator['dirty'].size).toBeGreaterThan(0)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('retains the existing completed presentation when first confirmation changes only its sequence authority',()=>{
  const s=fixture();try{
   const original=s.input('author',0,1,false,true)
   s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(original))
   for(let i=0;i<80&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.publishedPresentationReady).toBe(true)
   const revision=s.coordinator.completedPresentationRevision,entry=s.coordinator['entries'][0],executor=entry.executor,draws=s.gl.drawArrays.mock.calls.length
   s.coordinator.enqueueRecorded(original)
   expect(entry.firstSequence).toBe(1);expect(entry.executor).toBe(executor)
   expect(s.coordinator.publishedPresentationReady).toBe(true);expect(s.coordinator.completedPresentationRevision).toBe(revision);expect(s.coordinator['revision']).toBe(revision)
   expect(s.gl.drawArrays.mock.calls).toHaveLength(draws);expect(s.coordinator['dirty'].size).toBe(0)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
 it('still invalidates and rebases an actual two-entry reorder, then ignores the next order-preserving confirmation',()=>{
  const s=fixture();try{
   const a=s.input('A',0,2,false,true),b=s.input('B',0,1,false,true)
   s.coordinator.tryEnqueueLocal(s.localAuthor('A'),s.local(a));s.coordinator.tryEnqueueLocal(s.localAuthor('B'),s.local(b))
   for(let i=0;i<120&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.publishedPresentationReady).toBe(true)
   const [first,second]=s.coordinator['entries'],revision=s.coordinator['revision']
   s.coordinator.enqueueRecorded(b)
   expect(s.coordinator['entries']).toEqual([second,first]);expect(s.coordinator['revision']).toBe(revision+1);expect(s.coordinator['dirty'].size).toBeGreaterThan(0);expect(s.coordinator.publishedPresentationReady).toBe(false)
   for(let i=0;i<80&&s.coordinator.pending;i++)s.coordinator.advance()
   expect(s.coordinator.publishedPresentationReady).toBe(true)
   const rebased=s.coordinator['revision']
   s.coordinator.enqueueRecorded(a)
   expect(s.coordinator['entries']).toEqual([second,first]);expect(s.coordinator['revision']).toBe(rebased);expect(s.coordinator.publishedPresentationReady).toBe(true)
  }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
 })
})

it('drains bounded raw work behind a partial pinned stable commit so B head can precede later A originals',()=>{
 const s=fixture(1)
 try{
  s.coordinator.enqueueRecorded(s.input('P',0,1,true,true))
  for(let i=0;i<1000&&!s.coordinator['entries'][0].part;i++)s.coordinator.advance()
  const partial=s.coordinator['entries'][0],plan=partial.targetPlan,buffer=partial.committingBuffer,part=partial.part
  expect(part).toBeGreaterThan(0);expect(plan).toBeDefined();expect(buffer).toBeDefined();expect(partial.committed).toBe(false)
  const a=s.input('A',0,10,false,true),author=s.localAuthor('A');expect(s.coordinator.tryEnqueueLocal(author,s.local(a))).toBe(true)
  for(let i=0;i<7;i++)s.coordinator.enqueueRecorded(s.input('B',i,i+2))
  const head=s.input('B',7,9,true,true)
  expect(s.coordinator.queuedFrameCount).toBe(8)
  expect(s.coordinator.canAcceptRecorded(head)).toBe(false);expect(s.coordinator.canAcceptRecorded(a)).toBe(true)
  expect(()=>s.coordinator.canAcceptRecorded({...head})).toThrow(/foreign/)
  const close=s.seal(s.input('B',6,8),{id:'close-B',seq:9,targetUserId:'B',recordedNext:7,firstFrameOpId:'B-2',lastFrameOpId:'B-8'})
  expect(s.coordinator.canAcceptRecorded(close)).toBe(true)
  const draws=vi.spyOn(s.composite,'drawSource')
  for(let i=0;i<1000&&s.coordinator.queuedFrameCount===8;i++)s.coordinator.advance()
  expect(s.coordinator.queuedFrameCount).toBeLessThan(8)
  expect(partial.targetPlan).toBe(plan);expect(partial.committingBuffer).toBe(buffer);expect(partial.part).toBe(part)
  expect(plan!.takeResident(0)?.buffer).toBe(buffer);expect(()=>s.layer.clear()).toThrow('retained');expect(s.coordinator.canAcceptRecorded(head)).toBe(true)
  expect(draws.mock.calls.every(([request])=>request.source.kind==='maskRgb')).toBe(true)
  expect(s.coordinator.presentationReady).toBe(false)
  s.coordinator.enqueueRecorded(head);s.coordinator.enqueueRecorded(a)
  for(let i=0;i<1000&&s.coordinator.queuedFrameCount===8;i++)s.coordinator.advance()
  const end=s.input('A',1,11,true);expect(s.coordinator.tryEnqueueLocal(author,s.local(end))).toBe(true)
  s.coordinator.enqueueRecorded(end)
  for(let i=0;i<2000&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(s.coordinator.checkpointReady).toBe(true)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('derives pending local receipts independently of drained CPU and an original peer OPEN wash',()=>{
 const s=fixture();try{
  expect(Reflect.get(s.coordinator,'hasPendingLocal')).toBe(false)
  const own=s.input('author',0,2,true,true),peer=s.input('peer',0,1,false,true)
  s.coordinator.enqueueRecorded(peer);expect(s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(own))).toBe(true)
  for(let i=0;i<100&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(s.coordinator.queuedFrameCount).toBe(0);expect(s.coordinator.presentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false);expect(Reflect.get(s.coordinator,'hasPendingLocal')).toBe(true)
  s.coordinator.enqueueRecorded(own)
  expect(Reflect.get(s.coordinator,'hasPendingLocal')).toBe(false)
  for(let i=0;i<100&&s.coordinator.pending;i++)s.coordinator.advance()
  expect(s.coordinator.presentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false);expect(s.coordinator['entries'].some(entry=>entry.recorded?.userId==='peer'&&!entry.recorded.state.ended)).toBe(true)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('keeps a genuine coordinator participant across addition while new recorded entries capture the new default',()=>{
 const s=fixture(),prepass=s.coordinator['options'].prepass,old=s.coordinator['maskParticipant'],clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.coordinator.enqueueRecorded(s.input('A',0,1,false,true));while(s.coordinator.pending)s.coordinator.advance()
  const oldCapacity=old.preparedCapacity(),update=prepass.prepareCapacityAddition({width:8,height:8,slots:1},[],s.composite.preparedResources())
  const companions=s.composite.prepareCompanionUpdate(update.preparedResources())
  update.assertPreparedPublication();companions.assertCurrent();update.publish();companions.publish();update.finalizeCleanup();companions.finalizeCleanup()
  expect(old.preparedCapacity()).toEqual(oldCapacity);expect(prepass.preparedCapacity().epoch).not.toBe(oldCapacity.epoch)
  const next=s.input('B',0,2,true,true);expect(s.coordinator.canAcceptRecorded(next)).toBe(true);s.coordinator.enqueueRecorded(next)
  expect(s.coordinator['entries'][1].executor['maskParticipant'].preparedCapacity()).toEqual(prepass.preparedCapacity())
  while(s.coordinator.pending)s.coordinator.advance()
  expect(s.coordinator.presentationReady).toBe(true);expect(s.coordinator.checkpointReady).toBe(false);expect(s.coordinator.poisoned).toBe(false)
  expect(old.isReady()).toBe(true)
 }finally{clock.mockRestore();s.close()}expect(s.cpu.reservedBytes).toBe(0);expect(()=>old.isReady()).toThrow(/Closed/)
})
it('retires a constructor capacity capture when coordinator metadata admission throws',()=>{
 const s=fixture(),before=s.cpu.reservedBytes,reserve=s.cpu.reserve.bind(s.cpu),primary=new Error('lane metadata cap');let n=0
 const allocation=vi.spyOn(s.cpu,'reserve').mockImplementation(bytes=>{if(++n===2)throw primary;return reserve(bytes)})
 try{expect(()=>new CanonicalWashLayerCoordinator(s.coordinator['options'])).toThrow(primary);expect(s.cpu.reservedBytes).toBe(before)}finally{allocation.mockRestore();s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})
it('derives local promotion resource reuse from the exact current receipt without consuming confirmation',()=>{
 const s=fixture()
 try{
  const own=s.input('author',0,1,true,true),other=s.input('author',0,2,true,true)
  expect(s.coordinator.hasLocalRecordedPromotion(own)).toBe(false)
  expect(s.coordinator.tryEnqueueLocal(s.localAuthor(),s.local(own))).toBe(true)
  const cpu=s.cpu.reservedBytes,receipt=s.coordinator['entries'][0].local!.receipts[0]
  expect(s.coordinator.hasLocalRecordedPromotion(other)).toBe(false)
  expect(s.coordinator.hasLocalRecordedPromotion(own)).toBe(true)
  expect(s.cpu.reservedBytes).toBe(cpu);expect(s.coordinator['entries'][0].local!.receipts[0]).toBe(receipt)
  s.coordinator.enqueueRecorded(own)
  expect(s.coordinator.hasLocalRecordedPromotion(own)).toBe(false)
 }finally{s.close()}
 expect(s.cpu.reservedBytes).toBe(0)
})

// The fixture executes genuine original delivery, source mask generation,
// deposition and commit services. recordingGL does not rasterize pixels.
it('defers only NEW derived previews while preserving actual deposition and final stable composition',()=>{
 const run=(defer:boolean)=>{
  const s=fixture(),present=vi.spyOn(s.coordinator as unknown as {present:(started:number)=>void},'present'),draw=vi.spyOn(s.composite,'drawSource')
  const deposition:unknown[]=[],commit:unknown[]=[]
  try{
   for(let ordinal=0;ordinal<4;ordinal++){
    s.coordinator.enqueueRecorded(s.input('author',ordinal,ordinal+1,ordinal===3,true,ordinal))
    let turns=0
    while((defer&&ordinal<3?s.coordinator.executionPending:s.coordinator.pending)){
     if(++turns>1000)throw Error('Cooperative execution stalled')
     s.coordinator.advance(defer&&ordinal<3?{deferPresentation:true}:undefined)
    }
    if(defer&&ordinal<3){expect(s.coordinator.pending).toBe(true);expect(s.coordinator.presentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false);expect(present).not.toHaveBeenCalled()}
   }
   for(const [request]of draw.mock.calls){
    const row={source:request.source.kind,operation:request.operation,writeBounds:request.writeBounds}
    if(request.source.kind==='maskRgb')deposition.push(row)
    else if(request.target.texture===s.layer['tiles'].values().next().value?.texture)commit.push(row)
   }
   expect(s.coordinator.checkpointReady).toBe(true);expect(s.coordinator.executionPending).toBe(false)
   return {deposition,commit,present:present.mock.calls.length}
  }finally{s.close();expect(s.cpu.reservedBytes).toBe(0)}
 }
 const ordinary=run(false),deferred=run(true)
 expect(deferred.deposition).toHaveLength(4);expect(deferred.deposition).toEqual(ordinary.deposition)
 expect(deferred.commit).toEqual(ordinary.commit);expect(deferred.commit.length).toBeGreaterThan(0)
 expect(deferred.present).toBeLessThan(ordinary.present)
})
it('finishes an already-started preview normally even when later execution requests deferral',()=>{
 const s=fixture(1),present=vi.spyOn(s.coordinator as unknown as {present:(started:number)=>void},'present')
 try{
  s.coordinator.enqueueRecorded(s.input('author',0,1,false,true))
  let turns=0
  while(!s.coordinator['work']){if(++turns>1000)throw Error('Preview never started');s.coordinator.advance()}
  const started=present.mock.calls.length
  while(s.coordinator.executionPending){if(++turns>2000)throw Error('Partial preview stalled');s.coordinator.advance({deferPresentation:true})}
  expect(present.mock.calls.length).toBeGreaterThan(started);expect(s.coordinator.presentationReady).toBe(true)
  expect(s.coordinator.checkpointReady).toBe(false)
 }finally{s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('cancels deferred dirty originals without leaking source or scratch ownership',()=>{
 const s=fixture()
 try{
  s.coordinator.enqueueRecorded(s.input('author',0,1,false,true))
  let turns=0;while(s.coordinator.executionPending){if(++turns>1000)throw Error('Execution stalled');s.coordinator.advance({deferPresentation:true})}
  expect(s.coordinator.pending).toBe(true);s.coordinator.cancel()
  expect(s.coordinator.presentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)
 }finally{s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('checks current local proofs but does not read the packed body or reserve on repeated REAL full-queue retries',()=>{
 const s=fixture();try{
  const author=s.localAuthor()
  for(let i=0;i<8;i++)expect(s.coordinator.tryEnqueueLocal(author,s.local(s.input('author',i,i+1)))).toBe(true)
  const ninth=s.local(s.input('author',8,9,true));let packedReads=0
  const frame=new Proxy(ninth.frame,{get(target,key,receiver){if(key==='materialPacked')packedReads++;return Reflect.get(target,key,receiver)}})
  const original=Object.freeze({...ninth,frame}),entry=s.coordinator['entries'][0],local=entry.local!,prefix=local.state,receipts=[...local.receipts],bytes=s.cpu.reservedBytes
  const reserve=vi.spyOn(s.cpu,'reserve'),sourceCalls=s.source.mock.calls.length
  for(let i=0;i<3;i++)expect(s.coordinator.tryEnqueueLocal(author,original)).toBe(false)
  expect(packedReads).toBe(0);expect(reserve).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(bytes)
  expect(local.state).toBe(prefix);expect(local.receipts).toEqual(receipts);expect(s.coordinator.queuedFrameCount).toBe(8);expect(s.source).toHaveBeenCalledTimes(sourceCalls)
  reserve.mockRestore()
  for(let turns=0;turns<40&&s.coordinator.queuedFrameCount===8;turns++)s.coordinator.advance()
  expect(s.coordinator.queuedFrameCount).toBeLessThan(8)
  expect(s.coordinator.tryEnqueueLocal(author,original)).toBe(true);expect(packedReads).toBeGreaterThan(0)
  expect(local.receipts).toHaveLength(receipts.length+1);expect(local.receipts.at(-1)?.operation).toBe(original)
  const acceptedPrefix=local.state,acceptedReceipts=[...local.receipts],acceptedBytes=s.cpu.reservedBytes
  expect(s.coordinator.tryEnqueueLocal(author,original)).toBe(false)
  expect(local.state).toBe(acceptedPrefix);expect(local.receipts).toEqual(acceptedReceipts);expect(s.cpu.reservedBytes).toBe(acceptedBytes);expect(s.coordinator.queuedFrameCount).toBe(8)
  for(let turns=0;turns<40&&s.coordinator.queuedFrameCount===8;turns++)s.coordinator.advance()
  expect(()=>s.coordinator.tryEnqueueLocal(author,original)).toThrow()
  expect(local.state).toBe(acceptedPrefix);expect(local.receipts).toEqual(acceptedReceipts)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it.each(['author','namespace','layer']as const)('keeps the actual %s proof mandatory while the local queue is full',mode=>{
 const s=fixture();try{
  const author=s.localAuthor()
  for(let i=0;i<8;i++)s.coordinator.tryEnqueueLocal(author,s.local(s.input('author',i,i+1)))
  const next=s.local(s.input('author',8,9,true)),bytes=s.cpu.reservedBytes
  if(mode==='author')s.stale()
  if(mode==='layer')s.changeLayer()
  const selected=mode==='namespace'?s.localAuthor():author
  expect(()=>s.coordinator.tryEnqueueLocal(selected,next)).toThrow(mode==='author'?/stale/:mode==='namespace'?/namespace/:/layer/)
  expect(s.coordinator.queuedFrameCount).toBe(8);expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})
it('defers malformed material under real full capacity but never admits it when one actual slot drains',()=>{
 const s=fixture();try{
  const author=s.localAuthor();for(let i=0;i<8;i++)s.coordinator.tryEnqueueLocal(author,s.local(s.input('author',i,i+1)))
  const ninth=s.local(s.input('author',8,9,true)),malformed=Object.freeze({...ninth,frame:Object.freeze({...ninth.frame,materialPacked:'not a packed material'})}),local=s.coordinator['entries'][0].local!,prefix=local.state,receipts=local.receipts.length
  expect(s.coordinator.tryEnqueueLocal(author,malformed)).toBe(false)
  expect(local.state).toBe(prefix);expect(local.receipts).toHaveLength(receipts)
  for(let turns=0;turns<40&&s.coordinator.queuedFrameCount===8;turns++)s.coordinator.advance()
  const bytes=s.cpu.reservedBytes,count=s.coordinator.queuedFrameCount
  expect(()=>s.coordinator.tryEnqueueLocal(author,malformed)).toThrow()
  expect(local.state).toBe(prefix);expect(local.receipts).toHaveLength(receipts);expect(s.coordinator.queuedFrameCount).toBe(count);expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

it('retains the late current-layer guard after packed-body callbacks on the free-capacity path',()=>{
 const s=fixture();try{
  const author=s.localAuthor(),first=s.local(s.input())
  s.coordinator.tryEnqueueLocal(author,first)
  const next=s.local(s.input('author',1,2)),entry=s.coordinator['entries'][0],local=entry.local!,prefix=local.state,receipts=local.receipts.length,bytes=s.cpu.reservedBytes
  const frame=new Proxy(next.frame,{get(target,key,receiver){if(key==='materialPacked')s.changeLayer();return Reflect.get(target,key,receiver)}})
  expect(()=>s.coordinator.tryEnqueueLocal(author,Object.freeze({...next,frame}))).toThrow(/layer/)
  expect(local.state).toBe(prefix);expect(local.receipts).toHaveLength(receipts);expect(s.coordinator.queuedFrameCount).toBe(1);expect(s.cpu.reservedBytes).toBe(bytes)
 }finally{s.close()}expect(s.cpu.reservedBytes).toBe(0)
})

describe('owner-scoped active replay retention', () => {
    const limits = { maxEntries: 8, maxBytes: 1024 * 1024 };
    const snapshot = (s: ReturnType<typeof fixture>) => s.coordinator['retainReplaySnapshot']();
    const drain = (s: ReturnType<typeof fixture>) => { let n = 0; while (s.coordinator.pending) {
        if (++n > 1000)
            throw Error('bounded drain');
        s.coordinator.advance();
    } };
    it('keeps the default wash path free of replay holds', () => {
        const s = fixture();
        try {
            s.coordinator.enqueueRecorded(s.input());
            expect(s.coordinator['replay'].size).toBe(0);
            expect(() => snapshot(s)).toThrow('Replay work unavailable');
        }
        finally {
            s.close();
        }
    });
    it('retains exact original inputs and snapshots FIRST-gesture order, not wire interleave', () => {
        const s = fixture(4, limits);
        try {
            const a = s.input('A', 0, 1), b = s.input('B', 0, 2), a1 = s.input('A', 1, 3);
            s.coordinator.enqueueRecorded(a);
            s.coordinator.enqueueRecorded(b);
            s.coordinator.enqueueRecorded(a1);
            const work = snapshot(s);
            expect(work.values().map(v => v.kind === 'recorded' ? v.input : null)).toEqual([a, a1, b]);
            expect(work.values()[0]).toMatchObject({ kind: 'recorded', input: a });
            expect(Object.isFrozen(work.values()[0])).toBe(true);
            expect(Reflect.set(work.values()[0], 'input', b)).toBe(false);
            expect(() => snapshot(s)).toThrow('Replay work unavailable');
            s.stale();
            expect(() => work.values()).toThrow('stale');
            work.release();
            work.release();
        }
        finally {
            s.close();
        }
    });
    it('promotes a pinned local payload to the SAME original without double enqueue or losing its hold', () => {
        const s = fixture(4, limits);
        try {
            const original = s.input(), op = s.local(original), author = s.localAuthor();
            expect(s.coordinator.tryEnqueueLocal(author, op)).toBe(true);
            const work = snapshot(s), before = s.cpu.reservedBytes, entry = s.coordinator['replay'].get(op.id)!;
            s.coordinator.enqueueRecorded(original);
            expect(s.coordinator.queuedFrameCount).toBe(1);
            expect(s.coordinator['replay'].get(op.id)).toBe(entry);
            expect(entry.value).toMatchObject({ kind: 'recorded', input: original });
            expect(s.cpu.reservedBytes - before).toBe(JSON.stringify(original.read).length * 2);
            expect(work.values()[0]).toMatchObject({ kind: 'local', operation: op });
            work.release();
            const next = snapshot(s);
            expect(next.values()[0]).toMatchObject({ kind: 'recorded', input: original });
            next.release();
        }
        finally {
            s.close();
        }
    });
    it('charges each independently normalized continuation read even after its frame is consumed', () => {
        const s = fixture(4, limits);
        try {
            const a = s.input('A', 0, 1), a1 = s.input('A', 1, 2);
            expect(a.read!.capability.snapshot).not.toBe(a1.read!.capability.snapshot);
            s.coordinator.enqueueRecorded(a);
            drain(s);
            const before = s.cpu.reservedBytes;
            s.coordinator.enqueueRecorded(a1);
            drain(s);
            expect(s.cpu.reservedBytes - before).toBeGreaterThanOrEqual(JSON.stringify(a1.read).length * 2);
            expect(s.coordinator['replayCount']).toBe(2);
        }
        finally {
            s.close();
        }
    });
    it('does not allocate snapshot arrays or root children after a denied snapshot reservation', () => {
        const s = fixture(4, limits);
        try {
            s.coordinator.enqueueRecorded(s.input());
            const before = s.cpu.reservedBytes;
            const reserve = vi.spyOn(s.cpu, 'reserve').mockImplementationOnce(() => { throw Error('snapshot budget'); });
            expect(() => snapshot(s)).toThrow('snapshot budget');
            expect(s.coordinator['replayWork']).toBeUndefined();
            expect([...s.coordinator['replay'].values()][0].pins).toBe(0);
            expect(s.cpu.reservedBytes).toBe(before);
            reserve.mockRestore();
            const work = snapshot(s);
            work.release();
        }
        finally {
            s.close();
        }
    });
    it('fails capacity before accepting a frame and preserves a genuine retry after prefix retirement', () => {
        const s = fixture(4, { maxEntries: 1, maxBytes: 1024 * 1024 });
        try {
            const a = s.input('A', 0, 1, true), b = s.input('B', 0, 2, true);
            s.coordinator.enqueueRecorded(a);
            const work = snapshot(s);
            expect(() => s.coordinator.enqueueRecorded(b)).toThrow('Active replay capacity exceeded');
            expect(s.coordinator.queuedFrameCount).toBe(1);
            drain(s);
            expect(s.coordinator['replay'].size).toBe(0);
            expect(s.coordinator['replayCount']).toBe(1);
            expect(work.values()[0]).toMatchObject({ kind: 'recorded', input: a });
            expect(Object.isFrozen(work.values()[0])).toBe(true);
            expect(Reflect.set(work.values()[0], 'input', b)).toBe(false);
            expect(() => s.coordinator.enqueueRecorded(b)).toThrow('Active replay capacity exceeded');
            work.release();
            expect(s.coordinator['replayCount']).toBe(0);
            s.coordinator.enqueueRecorded(b);
            drain(s);
            expect(s.coordinator['replayCount']).toBe(0);
            expect(s.coordinator['replayBytes']).toBe(0);
        }
        finally {
            s.close();
        }
    });
    it('does not retain a denied reservation or a copied input and leaves the original retry usable', () => {
        const s = fixture(4, limits);
        try {
            const input = s.input(), before = s.cpu.reservedBytes;
            expect(() => s.coordinator.enqueueRecorded({ ...input })).toThrow('foreign');
            expect(s.coordinator['replayCount']).toBe(0);
            const reserve = vi.spyOn(s.cpu, 'reserve').mockImplementationOnce(() => { throw Error('held budget'); });
            expect(() => s.coordinator.enqueueRecorded(input)).toThrow('held budget');
            expect(s.coordinator.queuedFrameCount).toBe(0);
            expect(s.coordinator['replayCount']).toBe(0);
            expect(s.cpu.reservedBytes).toBe(before);
            reserve.mockRestore();
            s.coordinator.enqueueRecorded(input);
            expect(s.coordinator['replayCount']).toBe(1);
        }
        finally {
            s.close();
        }
    });
    it('rejects a byte limit before local receipt retention and keeps its exact operation retry valid', () => {
        const s = fixture(4, { maxEntries: 8, maxBytes: 1 });
        try {
            const input = s.input(), op = s.local(input), before = s.cpu.reservedBytes;
            expect(() => s.coordinator.tryEnqueueLocal(s.localAuthor(), op)).toThrow('Active replay capacity exceeded');
            expect(s.coordinator.queuedFrameCount).toBe(0);
            expect(s.coordinator.hasPendingLocal).toBe(false);
            expect(s.cpu.reservedBytes).toBe(before);
        }
        finally {
            s.close();
        }
    });
    it('invalidates a captured order when a real recorded peer moves ahead of an unconfirmed local', () => {
        const s = fixture(4, limits);
        try {
            const local = s.input('A', 0, 2), author = s.localAuthor('A');
            s.coordinator.tryEnqueueLocal(author, s.local(local));
            const work = snapshot(s);
            s.coordinator.enqueueRecorded(s.input('B', 0, 1));
            expect(() => work.values()).toThrow('Replay snapshot retired');
            work.release();
        }
        finally {
            s.close();
        }
    });
    it('attempts every pinned cleanup even when one release callback reports an error', () => {
        const s = fixture(4, limits);
        s.coordinator.enqueueRecorded(s.input());
        const entry = [...s.coordinator['replay'].values()][0];
        const release = entry.release;
        entry.release = () => { release(); throw Error('retire diagnostic'); };
        const work = snapshot(s);
        s.close();
        work.release();
        expect(s.coordinator.cleanupFailures.some(e => String(e).includes('retire diagnostic'))).toBe(true);
        expect(s.cpu.reservedBytes).toBe(0);
    });
    it('cancels a pinned snapshot and retires every metadata hold exactly once', () => {
        const s = fixture(4, limits);
        s.coordinator.enqueueRecorded(s.input());
        const work = snapshot(s);
        s.close();
        expect(() => work.values()).toThrow('Replay snapshot retired');
        work.release();
        expect(s.cpu.reservedBytes).toBe(0);
        expect(s.coordinator['replayCount']).toBe(0);
        expect(s.coordinator['replayBytes']).toBe(0);
    });
});

// Real material2 recorded delivery and native execution. The scalar shadow is
// one fully covered sample with installed fused CPU math, not recordingGL pixels.
function mixedDeferredWashFixture(){
 const s=fixture(),options=s.coordinator['options'];s.coordinator.cancel()
 let stable=s.layer,derived:TiledLayerBuffer|undefined=s.derived
 const stagedBuffers:TiledLayerBuffer[]=[],stagedCuts:number[][]=[],pixels=new Map<WebGLTexture,Uint8Array>()
 const clear=AccumulationBuffer.prototype.clear,copy=AccumulationBuffer.prototype.copyTo
 const clearSpy=vi.spyOn(AccumulationBuffer.prototype,'clear').mockImplementation(function(this:AccumulationBuffer){clear.call(this);pixels.set(this.texture,new Uint8Array(4))})
 const copySpy=vi.spyOn(AccumulationBuffer.prototype,'copyTo').mockImplementation(function(this:AccumulationBuffer,target:AccumulationBuffer){copy.call(this,target);pixels.set(target.texture,(pixels.get(this.texture)??new Uint8Array(4)).slice())})
 const native=s.composite.drawSource.bind(s.composite),draw=vi.spyOn(s.composite,'drawSource').mockImplementation((request,frame)=>{
  const result=native(request,frame);if(result==='empty')return result
  const operation=request.operation
  if(operation.kind!=='alphaDarken32FusedScalar'&&operation.kind!=='over32FusedScalar')throw Error('Fixture requires installed fused law')
  const control=operation.control,source=request.source.kind==='maskRgb'?Uint8Array.from([...request.source.rgb,255]):pixels.get(request.source.view.texture)??new Uint8Array(4)
  const destination=pixels.get((request.readDestination??request.target).texture)??new Uint8Array(4)
  pixels.set(request.target.texture,compositeSourceFused32({profile:'installed-arm64-vector32-fused-fpcr0-v1',operator:operation.kind==='over32FusedScalar'?'over':'variant'in control&&control.variant==='hard'?'alphaDarkenHard':'alphaDarkenCreamy',source,destination,cols:1,rows:1,sourceStride:4,destinationStride:4,maskStride:0,sourceAlignment:0,destinationAlignment:0,opacity:control.opacity,averageOpacity:'averageOpacity'in control?control.averageOpacity:control.opacity,flow:'flow'in control?control.flow:1}).pixels)
  return result
 })
 const stage=vi.fn(()=>{
  stagedCuts.push(coordinator['entries'].map(entry=>entry.depositedNextOrdinal))
  const previous=derived,buffer=new TiledLayerBuffer(s.gl,4,4,undefined,undefined,undefined,'straight-rgba8');stagedBuffers.push(buffer);let pending=true
  return {buffer,assertCurrent(){if(!pending||derived!==previous)throw Error('Staged view changed')},cancel(){if(!pending)return;pending=false;buffer.destroy()},finish(old:TiledLayerBuffer,disposition='display'){if(!pending||old!==previous||(disposition==='closed-handoff'?stable!==buffer||derived!==undefined:derived!==buffer))throw Error('Publication pointer mismatch');pending=false;old.destroy()}}
 })
 const coordinator=new CanonicalWashLayerCoordinator({...options,pageBounds:{minX:0,minY:0,maxX:4,maxY:4},mixedReplay7:true,replayRetention:{maxEntries:64,maxBytes:1048576},previewCandidate:stage,layer:id=>({...options.layer(id),buffer:stable}),presentation:()=>({buffer:derived!,epoch:0})})
 const publish=(ticket:import('./CanonicalWashLayerCoordinator').CanonicalPreviewPublication)=>{ticket.assertCurrent();ticket.publish();if(ticket.disposition==='closed-handoff'){stable=ticket.buffer;derived=undefined}else derived=ticket.buffer;ticket.finish()}
 const step=(defer=false)=>{const result=coordinator.advance(defer?{deferPresentation:true}:undefined);if(result?.kind==='preview-ready')publish(result.ticket);return result}
 const drain=(defer=false)=>{let turns=0;while(defer?coordinator.executionPending:coordinator.pending){if(++turns>2000)throw Error('Mixed deferred drain stalled');step(defer)}}
 return {...s,coordinator,stage,stagedCuts,draw,step,drain,publish,stable:()=>stable,pixel:()=>{const texture=stable.resolveForPaint({minX:0,minY:0,maxX:1,maxY:1})[0].buffer.texture;return [...(pixels.get(texture)??new Uint8Array(4))]},close(){try{coordinator.cancel();for(const buffer of stagedBuffers)buffer.destroy()}finally{draw.mockRestore();copySpy.mockRestore();clearSpy.mockRestore();s.close()}}}
}
it('mixed indexed adjacent material2 WASH defers new candidates, preserves commands and final fused sample',()=>{
 const run=(defer:boolean)=>{
  const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0),log:string[]=[]
  try{
   for(let ordinal=0;ordinal<4;ordinal++){
    const input=s.input('author',ordinal,ordinal+1,ordinal===3,true,ordinal);log.push(input.operation.id);s.coordinator.enqueueRecorded(input)
    s.drain(defer&&ordinal<3)
    if(defer&&ordinal<3){expect(s.stage).not.toHaveBeenCalled();expect(s.coordinator.presentationReady).toBe(false);expect(s.coordinator.checkpointReady).toBe(false)}
   }
   const commands=s.draw.mock.calls.filter(([r])=>r.source.kind==='maskRgb').map(([r])=>({operation:r.operation,writeBounds:r.writeBounds}))
   const outer=s.draw.mock.calls.filter(([r])=>r.source.kind==='straightRgba8').at(-1)?.[0].operation
   const pixel=s.pixel();expect(pixel[3]).toBeGreaterThan(0);expect(s.coordinator.queuedFrameCount).toBe(0)
   return {commands,outer,pixel,log,stages:s.stage.mock.calls.length,cuts:s.stagedCuts}
  }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
 }
 const ordinary=run(false),deferred=run(true)
 expect(deferred.commands).toEqual(ordinary.commands);expect(deferred.commands).toHaveLength(4)
 expect(deferred.outer).toEqual(ordinary.outer);expect(deferred.pixel).toEqual(ordinary.pixel);expect(deferred.log).toEqual(ordinary.log)
 // Nondeferred final boundary first presents the already deposited3, then real END4.
 expect(deferred.cuts).toEqual([[3],[4]]);expect(deferred.stages).toBeLessThan(ordinary.stages)
})
it('mixed indexed defer completes an already active candidate without advancing its frozen WASH raw',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.coordinator.enqueueRecorded(s.input('author',0,1,false,true,0));let turns=0
  while(!s.coordinator['candidate']){if(++turns>1000)throw Error('No candidate');s.step()}
  const candidate=s.coordinator['candidate'],entry=s.coordinator['entries'][0],deposited=entry.depositedNextOrdinal
  s.coordinator.enqueueRecorded(s.input('author',1,2,false,true,1));let published=false
  while(!published){if(++turns>2000)throw Error('Candidate stalled');expect(s.coordinator['candidate']).toBe(candidate);const result=s.step(true);published=result?.kind==='preview-ready';expect(entry.depositedNextOrdinal).toBe(deposited)}
  s.drain(true);expect(entry.depositedNextOrdinal).toBe(deposited+1);s.drain();expect(s.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('mixed indexed deferred dirty WASH still validates original lifetime before staging and cancels all ownership',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.coordinator.enqueueRecorded(s.input('author',0,1,false,true));s.drain(true);expect(s.stage).not.toHaveBeenCalled()
  s.stale();expect(()=>s.step(true)).toThrow('stale');expect(s.stage).not.toHaveBeenCalled()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('mixed indexed empty-queue defer keeps dirty END unallocated until explicit normal final flush',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  s.coordinator.enqueueRecorded(s.input('author',0,1,true,true));s.drain(true)
  expect(s.coordinator.executionPending).toBe(false);expect(s.coordinator.pending).toBe(true)
  const bytes=s.cpu.reservedBytes,alloc=s.gl.texImage2D.mock.calls.length
  s.step(true);expect(s.stage).not.toHaveBeenCalled();expect(s.cpu.reservedBytes).toBe(bytes);expect(s.gl.texImage2D.mock.calls.length).toBe(alloc)
  s.drain();expect(s.stage).toHaveBeenCalledTimes(1);expect(s.pixel()[3]).toBeGreaterThan(0);expect(s.coordinator.queuedFrameCount).toBe(0)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

// FOLLOW scheduling witnesses use actual native deposition and publication.
// No test writes either published-paint scalar or the coordinator order stamp.
it('FOLLOW empty and clipped prefixes cannot grant published native paint',()=>{
 for(const clipped of [false,true]){
  const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
  try{
   const first=s.input('author',0,1,false,clipped,0,clipped?10000:0),next=s.input('author',1,2,false,true,1)
   s.coordinator.enqueueRecorded(first);s.drain()
   expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(false)
   expect(s.coordinator['entries'][0].firstRawPaintNextOrdinal).toBeUndefined()
  }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
 }
})
it('FOLLOW native deposition becomes proof only after the actual publication CAS',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=s.input('author',0,1,false,true,0),next=s.input('author',1,2,false,true,1)
  s.coordinator.enqueueRecorded(first);s.drain(true)
  expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(false)
  let ticket:import('./CanonicalWashLayerCoordinator').CanonicalPreviewPublication|undefined
  for(let n=0;n<2000&&!ticket;n++){const result=s.coordinator.advance();if(result?.kind==='preview-ready')ticket=result.ticket}
  if(!ticket)throw Error('No actual publication ticket')
  ticket.assertCurrent();expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(false)
  s.publish(ticket);expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('FOLLOW same-entry append survives order identity but eight deposited frames require a new actual P',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  let previous=s.input('author',0,1,false,true,0);s.coordinator.enqueueRecorded(previous);s.drain()
  for(let ordinal=1;ordinal<=8;ordinal++){
   const next=s.input('author',ordinal,ordinal+1,false,true,ordinal)
   expect(s.coordinator.canDeferRecordedPresentation(previous,next)).toBe(true)
   s.coordinator.enqueueRecorded(next);s.drain(true);previous=next
  }
  const ninth=s.input('author',9,10,false,true,9)
  expect(s.coordinator.canDeferRecordedPresentation(previous,ninth)).toBe(false)
  s.drain();expect(s.coordinator.canDeferRecordedPresentation(previous,ninth)).toBe(true)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('FOLLOW rejects a different queued original Entry without borrowing its authority',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=s.input('author',0,1,false,true,0),next=s.input('author',1,2,false,true,1)
  s.coordinator.enqueueRecorded(first);s.drain()
  const other=s.input('other',0,2,false,true,0);s.coordinator.enqueueRecorded(other)
  expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(false)
  s.drain();expect(s.coordinator.poisoned).toBe(false)
  // Once the foreign queue drained, scheduling may be eligible again. It is
  // not admission: the genuine global sequence2 was already consumed.
  expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(true)
  expect(()=>s.coordinator.enqueueRecorded(next)).toThrow()
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
it('FOLLOW original callback reentry cannot clear the outer work slot or publish stale native proof',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const first=s.input('author',0,1,false,true,0),next=s.input('author',1,2,false,true,1)
  s.coordinator.enqueueRecorded(first);s.drain()
  const original=first.delivery.assertCurrent.bind(first.delivery),seen:unknown[]=[]
  // Existing delivery is frozen; use the actual options.layer callback instead.
  s.observeLayer(()=>{try{s.coordinator.cancel()}catch(error){seen.push(error)}})
  expect(s.coordinator.canDeferRecordedPresentation(first,next)).toBe(true)
  expect(seen.length).toBeGreaterThan(0);original(first)
  s.observeLayer(undefined);s.stale();expect(()=>s.coordinator.canDeferRecordedPresentation(first,next)).toThrow('stale')
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('FOLLOW A published then B newly painted requires B first actual P before valid A tail continuation can defer',()=>{
 const s=mixedDeferredWashFixture(),clock=vi.spyOn(performance,'now').mockReturnValue(0)
 try{
  const a1=s.input('A',0,1,false,true,0),b2=s.input('B',0,2,false,true,0),a3=s.input('A',1,3,false,true,1),a4=s.input('A',2,4,false,true,2)
  s.coordinator.enqueueRecorded(a1);s.drain();expect(s.stage).toHaveBeenCalledTimes(1)
  s.coordinator.enqueueRecorded(b2);s.coordinator.enqueueRecorded(a3)
  const b=s.coordinator['entries'].find(entry=>entry.recorded?.userId==='B')!
  let turns=0;while(b.depositedNextOrdinal<1){if(++turns>2000)throw Error('B raw did not complete');s.step(true)}
  expect(b.firstRawPaintNextOrdinal).toBe(1);expect(b.publishedPaintedNextOrdinal).toBeUndefined();expect(s.stage).toHaveBeenCalledTimes(1)
  expect(s.coordinator.queuedFrameCount).toBe(1)
  // A3 is the actual global tail, A4 the genuine consecutive next recipe.
  // A's prior P cannot hide the default first-publication boundary for B.
  expect(s.coordinator.canDeferRecordedPresentation(a3,a4)).toBe(false)
  s.drain();expect(b.publishedPaintedNextOrdinal).toBe(1)
  expect(s.coordinator.canDeferRecordedPresentation(a3,a4)).toBe(true)
  s.coordinator.enqueueRecorded(a4);s.drain();expect(s.coordinator.poisoned).toBe(false)
 }finally{clock.mockRestore();s.close();expect(s.cpu.reservedBytes).toBe(0)}
})

it('accepts original READ paired source2 context and preserves recorded lifetime checks',()=>{
 const s=fixture(4,undefined,true)
 try{
  const first=s.input('author',0,1,false),end=s.input('author',1,2,true)
  expect(()=>s.coordinator.enqueueRecorded(first)).not.toThrow()
  expect(()=>s.coordinator.enqueueRecorded(end)).not.toThrow()
  expect(s.coordinator['entries'][0].recorded?.state.nextOrdinal).toBe(2)
  s.stale();expect(()=>s.coordinator.enqueueRecorded(end)).toThrow('stale')
 }finally{s.close();expect(s.cpu.reservedBytes).toBe(0)}
})
