import {prepareCanonicalRoomState} from '../../../pages/Room/net/canonicalRoomState'
import {describe,it,expect,vi} from 'vitest'
import {CANONICAL_STROKE_RASTER_PROFILE,canonicalDefaultAutoSourceBinding,buildCanonicalMaterial,prepareCanonicalRecordedAttachment,type BrushDescriptor,type CanonicalStrokeOperation,type CanonicalStrokeSnapshotV2,type Operation,type CanonicalStrokeCloseOperation,type ServerToClientEvents} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/stock.native'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import {CanonicalWashLayerCoordinator} from './CanonicalWashLayerCoordinator'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'

function fixture(){
 const {gl}=recordingGL(),cpu=new BrushMipCache(),cache=new BrushTextureCache(gl)
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const layer=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const derived=new TiledLayerBuffer(gl,4,4,undefined,undefined,undefined,'straight-rgba8')
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'recorded-owner-test')
 prepass.prepare({width:4,height:4,slots:1},[])
 const composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'recorded-owner-composite')
 composite.prepare({width:4,height:4,operations:['alphaDarken32FusedScalar','over32FusedScalar']},prepass.preparedResources())
 const scratch=new RibbonScratchPool(gl)
 const pin=canonicalDefaultAutoSourceBinding(stock.rows[0].descriptor as unknown as BrushDescriptor,'b'.repeat(64),'neon64-f32-fma-v1')
 const material={version:2 as const,assets:[],primarySource:pin,budget:{workUnits:1048576,outputBytes:1048576,drawPixels:1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:[],layerId:'layer',brush:'brush:'+pin.descriptorId+'@'+pin.descriptorVersion,strokeId:'same',boardEpoch:1,descriptorSha256:pin.descriptorSha256,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}}
 const scope=Object.freeze({roomId:'room',boardEpoch:1,rasterProfile:CANONICAL_STROKE_RASTER_PROFILE})
 let current=true,replaced=false
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!current)throw Error('stale');return replaced?Object.freeze({...scope}):scope}})
 const input=(userId='author',ordinal=0,seq=1,ended=false)=>{
  const packed=buildCanonicalMaterial({masked:false,entry:{phase:'between'},draws:[],fences:ended?[{kind:'gestureEnd',at:0}]:[]},material).packed
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
 return {coordinator,cpu,gl,scratch,input,seal,source,snapshot,stale:()=>{current=false},replaceScope:()=>{replaced=true},close(){coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset()}}
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
