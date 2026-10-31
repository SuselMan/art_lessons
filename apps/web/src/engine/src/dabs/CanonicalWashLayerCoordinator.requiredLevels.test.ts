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
function execute(full=false,scale=.1){
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
 const bank=new CanonicalMaskSourceBank(gl,cache,cpu,[{asset,readOriginalCoverage:()=>new Uint8Array(256*256).fill(255)}],{gpuBytes:0,cpuBytes:0},full?undefined:canonicalImageRequiredSourceLevels(source,[asset]))
 bank.jobs.forEach((_,i)=>bank.prepareJob(i));const prepass=new TransformedMaskPrepass(gl,cache,cpu,'required'),composite=new CanonicalRgba8CompositePass(gl,cache,cpu,'required-composite'),scratch=new RibbonScratchPool(gl),layer=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8'),derived=new TiledLayerBuffer(gl,32,32,undefined,undefined,undefined,'straight-rgba8')
 prepass.prepare({width:32,height:32,slots:1},bank.preparedResources());composite.prepare({width:32,height:32,operations:['alphaDarken32FusedScalar','over32FusedScalar']},[...bank.preparedResources(),...prepass.preparedResources()])
 const coordinator=new CanonicalWashLayerCoordinator({rasterProfile:P,layerId:'layer',layerEpoch:0,maxGestures:4,pageBounds:{minX:0,minY:0,maxX:32,maxY:32},layer:()=>({buffer:layer,epoch:0}),presentation:()=>({buffer:derived,epoch:0}),prepass,composite,scratch,source:()=>({bank}),reserveTransient:()=>()=>{},changed:()=>{},poison:()=>{}})
 function input(ordinal:number){
  const m=sourceImageTransformMetadata(150,150,sourcePngRasterShape({width:150,height:150,scale:source.brushScale,angle:0},{scale,ratio:1,rotation:0}),0,0)
  const recipe={kind:'image' as const,asset:asset.id,brushScale:.05,brushAngle:0,scale,ratio:1,rotation:0,subX:0,subY:0,width:m.width,height:m.height,mirrorH:false,mirrorV:false}
  const packed=buildCanonicalMaterial(ordinal===0?{masked:false,entry:{phase:'between'},draws:[],fences:[]}:{masked:false,entry:{phase:'between'},draws:[{recipe,role:'primary',x:0,y:0,opacity:1,flow:1}],fences:[{at:0,kind:'segmentBegin',group:0},{at:1,kind:'primaryEnd',group:0},{at:1,kind:'segmentEnd',group:0},{at:1,kind:'gestureEnd'}]},material).packed
  const operation:CanonicalStrokeOperation={type:'canonical_stroke',id:'frame-'+ordinal,userId:'author',timestamp:ordinal,seq:ordinal+1,layerId:'layer',frame:{version:1,rasterProfile:P,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:ordinal,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,materialPacked:packed}}
  const atom=prepareCanonicalRecordedAttachment({version:1,roomId:'room',boardEpoch:1,capabilities:[{originalUserId:'author',snapshot}],bindings:[{operationId:operation.id,sequence:ordinal+1,originalUserId:'author',capability:0}]},[operation],scope)[0]
  let accepted:CanonicalRecordedInput
  const delivery:CanonicalRecordedDelivery=Object.freeze({lifetime,assertCurrent(candidate:CanonicalRecordedInput){if(this!==delivery||candidate!==accepted)throw Error('Foreign original');lifetime.assertCurrent()}})
  accepted=Object.freeze({...atom,delivery});return accepted
 }
 try{
  const first=input(0),before=cpu.reservedBytes;alive=false;expect(()=>coordinator.enqueueRecorded(first)).toThrow('Stale');expect(cpu.reservedBytes).toBe(before);alive=true
  for(let ordinal=0;ordinal<2;ordinal++){coordinator.enqueueRecorded(ordinal===0?first:input(1));let turns=0;while(coordinator.pending){if(++turns>1000)throw Error('Stalled');coordinator.advance()}}
  expect(coordinator.checkpointReady).toBe(true);return bank.gpuBytes
 }finally{coordinator.cancel();scratch.destroy();layer.destroy();derived.destroy();prepass.reset();composite.reset();bank.reset();cache.clear();expect(cpu.reservedBytes).toBe(0)}
}
it('admits an original empty image prefix then tiny material through the same suffix bank',()=>{expect(execute()).toBe(816)})
it('keeps complete-bank low-level wider recipe behavior unchanged',()=>{expect(execute(true,2)).toBe(489928)})
