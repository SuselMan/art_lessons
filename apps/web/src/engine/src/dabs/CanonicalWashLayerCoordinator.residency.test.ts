import {expect,it,vi} from 'vitest'
import {buildCanonicalMaterial,prepareCanonicalRecordedAttachment,type CanonicalStrokeSnapshotV2,type CanonicalStrokeOperation,CANONICAL_STROKE_RASTER_PROFILE as P,sourceImageTransformMetadata,sourcePngRasterShape} from '@grafetto/shared'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {CanonicalWashLayerCoordinator} from './CanonicalWashLayerCoordinator'
import {CanonicalMaskSourceBank} from './CanonicalMaskSourceBank'
import {canonicalImageRequiredSourceLevels} from './canonicalImageCapacity'
import {CanonicalRgba8CompositePass} from './CanonicalRgba8CompositePass'
import {TransformedMaskPrepass} from './TransformedMaskPrepass'
import {BrushTextureCache} from './BrushTextureCache'
import {BrushMipCache} from './BrushMipCache'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {TiledLayerBuffer} from '../buffers/TiledLayerBuffer'
import type {CanonicalRecordedInput,CanonicalRecordedLifetime,CanonicalRecordedDelivery} from '../oplog/CanonicalRecordedDelivery'
function execute(cancelOpen=false,failEnqueue=false,scale=.1,selection=false){
 const {gl}=recordingGL();gl.TEXTURE1=gl.TEXTURE0+1;gl.STATIC_DRAW=9001;gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME=9002;gl.LINEAR=9010;gl.REPEAT=9011
 gl.copyTexSubImage2D=vi.fn();gl.copyTexImage2D=vi.fn();gl.uniform3f=vi.fn();gl.uniform4f=vi.fn()
 const attrib=gl.getAttribLocation;gl.getAttribLocation=(p:unknown,n:string)=>n==='position'?0:attrib(p,n)
 const attachments=new Map(),attach=gl.framebufferTexture2D
 gl.framebufferTexture2D=(...args:unknown[])=>{attachments.set(gl.getParameter(gl.FRAMEBUFFER_BINDING),args[3]);attach(...args)}
 gl.getFramebufferAttachmentParameter=()=>attachments.get(gl.getParameter(gl.FRAMEBUFFER_BINDING))
 const parameters=new Map(),set=gl.texParameteri
 gl.texParameteri=(t:number,n:number,v:number)=>{const texture=gl.getParameter(gl.TEXTURE_BINDING_2D);if(!parameters.has(texture))parameters.set(texture,new Map());parameters.get(texture).set(n,v);set(t,n,v)}
 gl.getTexParameter=(_:number,n:number)=>parameters.get(gl.getParameter(gl.TEXTURE_BINDING_2D))?.get(n)??gl.NEAREST
 const cpu=new BrushMipCache(),cache=new BrushTextureCache(gl),asset={id:'asset:'+'b'.repeat(64),size:256,x:53,y:53,width:150,height:150},source={kind:'image' as const,asset:asset.id,brushScale:.05,brushAngle:0}
 const material={version:2 as const,assets:[asset],primarySource:source,budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}}
 const snapshot:CanonicalStrokeSnapshotV2={materialVersion:2,material,assets:material.assets,layerId:'layer',brush:'brush:native-image@1',strokeId:'same',boardEpoch:1,descriptorSha256:'a'.repeat(64),rasterProfile:P,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:1,outerBlend:'over'}}
 const scope=Object.freeze({roomId:'room',boardEpoch:1,rasterProfile:P});let alive=true
 const lifetime:CanonicalRecordedLifetime=Object.freeze({assertCurrent(){if(this!==lifetime||!alive)throw Error('Stale original');return scope}})
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[],{gpuBytes:0,cpuBytes:0},undefined,'root-residency')
 const pending=bank.prepareRoot([{asset,readOriginalCoverage:()=>new Uint8Array(256*256).fill(255)}],{gpuBytes:0,cpuBytes:0},canonicalImageRequiredSourceLevels(source,[asset]))
 pending.jobs.forEach((_,i)=>pending.prepareJob(i));pending.assertPreparedPublication();const lease=pending.publish(),release=vi.fn((lost?:boolean)=>lease.release(lost));
 const prepass=new TransformedMaskPrepass(gl,cache,cpu,'required'),composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'required-composite'),scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8'),derived=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8')
 prepass.prepare({width:32,height:32,slots:1},lease.preparedResources());composite.prepare({width:32,height:32,operations:['alphaDarken32FusedScalar','over32FusedScalar']},[...lease.preparedResources(),...prepass.preparedResources()])
 const owned=Object.freeze({...lease,release})
 const createCoordinator=()=>new CanonicalWashLayerCoordinator({rasterProfile:P,layerId:'layer',layerEpoch:0,maxGestures:4,pageBounds:{minX:0,minY:0,maxX:32,maxY:32},layer:()=>({buffer:layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source:()=>{const child=selection?lease.retain():owned;return{bank:failEnqueue?bank:child,sourceLease:child}},reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
 let coordinator=createCoordinator()
 function input(ordinal:number,cycle=0){
  const currentSnapshot=cycle?{...snapshot,strokeId:'second'}:snapshot
  const m=sourceImageTransformMetadata(150,150,sourcePngRasterShape({width:150,height:150,scale:source.brushScale,angle:0},{scale,ratio:1,rotation:0}),0,0)
  const recipe={kind:'image' as const,asset:asset.id,brushScale:.05,brushAngle:0,scale,ratio:1,rotation:0,subX:0,subY:0,width:m.width,height:m.height,mirrorH:false,mirrorV:false}
  const packed=buildCanonicalMaterial(ordinal===0?{masked:false,entry:{phase:'between'},draws:[],fences:[]}:{masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
  const operation:CanonicalStrokeOperation={type:'canonical_stroke',id:'frame-'+cycle+'-'+ordinal,userId:'author',timestamp:ordinal,seq:ordinal+1+2*cycle,layerId:'layer',frame:{version:1,rasterProfile:P,brush:snapshot.brush,strokeId:currentSnapshot.strokeId,frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot:currentSnapshot}],bindings:[{operationId:operation.id,sequence:ordinal+1+2*cycle,originalUserId:'author',capability:0}]},[operation],scope)[0]
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('Foreign original');lifetime.assertCurrent()}})
  accepted=Object.freeze({...atom,delivery});return accepted
 }
 try{
  const first=input(0),before=cpu.reservedBytes;alive=false;expect(()=>coordinator.enqueueRecorded(first)).toThrow('Stale');expect(cpu.reservedBytes).toBe(before);alive=true
  if(failEnqueue){expect(()=>coordinator.enqueueRecorded(first)).toThrow('lease reader changed');expect(release).toHaveBeenCalledOnce();expect(bank.jobs).toHaveLength(0);return 0}
  for(let ordinal=0;ordinal<(cancelOpen?1:2);ordinal++){coordinator.enqueueRecorded(ordinal===0?first:input(1));let turns=0;while(coordinator.pending){if(++turns>1000)throw Error('Stalled');coordinator.advance()}}
  if(cancelOpen){expect(coordinator.checkpointReady).toBe(false);expect(release).not.toHaveBeenCalled();expect(bank.jobs.length).toBeGreaterThan(0);coordinator.cancel();expect(release).toHaveBeenCalledOnce()}
  else{
   expect(coordinator.checkpointReady).toBe(true)
   if(selection){
    expect(lease.isReady()).toBe(true);expect(release).not.toHaveBeenCalled();coordinator.cancel();coordinator=createCoordinator()
    for(let ordinal=0;ordinal<2;ordinal++){coordinator.enqueueRecorded(input(ordinal,1));let turns=0;while(coordinator.pending){if(++turns>1000)throw Error('Stalled second selected gesture');coordinator.advance()}}
    expect(coordinator.checkpointReady).toBe(true);expect(lease.isReady()).toBe(true);lease.release()
   }else expect(release).toHaveBeenCalledOnce()
  }
  expect(bank.jobs).toHaveLength(0);return 0
 }finally{coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
}
it('uses a root-scoped reader through actual original Coordinator and Executor, releasing only after stable commit',()=>{execute()})
it('preserves an OPEN image root then releases it on cancellation',()=>{execute(true)})
it('retires the supplied root lease when admission fails after the original source callback handoff',()=>{execute(false,true)})
it('reuses one selected preparation across two completed Coordinator cycles with separate per-gesture leases',()=>{execute(false,false,.1,true)})
