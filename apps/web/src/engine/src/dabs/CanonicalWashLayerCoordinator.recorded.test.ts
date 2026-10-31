import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import {describe,it,expect,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalDefaultAutoSourceBinding,buildCanonicalMaterial,prepareCanonicalRecordedAttachment,type BrushDescriptor,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type Operation,type CanonicalStrokeCloseOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {prepareSourceDefaultAutoDab} from '../presets/sourceDefaultAutoDab'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {CanonicalWashLayerCoordinator,type CanonicalLocalWashAuthor} from './CanonicalWashLayerCoordinator'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'

function fixture(){
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
 prepass.prepare({width:4,height:4,slots:1},[])
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'recorded-owner-composite')
 composite.prepare({width:4,height:4,operations:['alphaDarken32FusedScalar','over32FusedScalar']},prepass.preparedResources())
 const scratch=new RibbonScratchPool(gl)
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const nativeCoverage=pin.coverageProfile;if(nativeCoverage==='browser-number-coverage-v1')throw Error('Native fixture coverage required')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:[],layerId:'layer',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'same',boardEpoch:1,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}}
 const scope=Object.freeze({roomId:'room',boardEpoch:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE})
 let current=true,replaced=false
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!current)throw Error('stale');return replaced?Object.freeze({...scope}):scope}})
 const input=(userId='author',ordinal=0,seq=1,ended=false,painted=false)=>{
  const dab=painted?prepareSourceDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',tip:{...pin.source,kind:'auto',spikes:2,softness:1,randomness:0,density:1},storedScale:pin.brushScale,storedAngle:pin.brushAngle,shape:{scale:.01,ratio:1,rotation:0},subpixelX:0,subpixelY:0,coverageProfile:nativeCoverage,maxPixels:1048576,maxWorkSamples:16*1048576}):undefined
  const recipe={kind:'defaultAuto' as const,source:pin.source,coverageProfile:pin.coverageProfile,brushScale:pin.brushScale,brushAngle:pin.brushAngle,scale:.01,ratio:1,rotation:0,subX:0,subY:0,width:dab?.geometry.maskSize[0]??1,height:dab?.geometry.maskSize[1]??1,mirrorH:false,mirrorV:false}
  const paintedMaterial=painted?buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:.5,flow:.7}],fences:[{kind:'segmentBegin',at:0,group:0},{kind:'primaryEnd',at:1,group:0},{kind:'segmentEnd',at:1,group:0},...(ended?[{kind:'gestureEnd' as const,at:1}]:[])]},material):undefined
  const packed=paintedMaterial?.packed??buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{kind:'gestureEnd',at:0}]:[]},material).packed
  const operation:CanonicalStrokeOperation={type:'canonical_stroke',id:`${userId}-${seq}`,userId,timestamp:0,seq,layerId:'layer',frame:{version:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,brush:snapshot.brush,strokeId:'same',frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:userId,snapshot}],bindings:[{operationId:operation.id,sequence:seq,originalUserId:userId,capability:0}]},[operation],scope)[0]
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('foreign');lifetime.assertCurrent()}})
  accepted=Object.freeze({...atom,delivery});return accepted
 }
 const source=vi.fn(()=>({autoSource:pin}))
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,layerId:'layer',layerEpoch:0,maxGestures:4,layer:()=>({buffer:layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source,reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
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
 return {coordinator,layer,derived,cpu,gl,scratch,composite,input,seal,source,snapshot,localAuthor,local,stale:()=>{current=false},replaceScope:()=>{replaced=true},close(){coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset()}}
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
   s.coordinator.enqueueRecorded(frame);expect(s.cpu.reservedBytes).toBe(before+6144)
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
