import type {PaperType} from '@grafetto/shared'
import type {PaintTarget,ILayerBuffer} from '../buffers/ILayerBuffer'
import type {RibbonStrokeScratch,RibbonFinishMetadata} from '../buffers/RibbonStrokeScratch'
import type {PreparedRibbonCpuDelivery} from '../dabs/RibbonStrokePainter'
import {buildCanonicalStrokeCommandsFromDelivery} from '../dabs/canonicalStrokeChunk'
import {ribbonWaterDelivery} from '../dabs/ribbonStrokeMath'
import {watercolorBloomStrength,watercolorBloomPush} from '../presets/watercolorPresets'
import {getPaperBytes} from '../paper/paperLoader'
import type {WatercolorCanonicalFIFO} from '../watercolor/WatercolorCanonicalFIFO'
import {CanonicalWatercolorWebGpu} from './backend'
import {CanonicalRoomWatercolorExecutor} from './roomWatercolorExecutor'
import {RoomNativeCentralAdapter} from './roomNativeCentralAdapter'
import {canonicalSourceRevealRect} from './strokeScratchMetadata'

export interface RoomNativeRuntimeContext {
 fifo:WatercolorCanonicalFIFO
 paper:PaperType;paperScale:number;paperWorld:{w:number;h:number};board:{w:number;h:number}
 resolve(target:ILayerBuffer,bounds:PreparedRibbonCpuDelivery['compositeBounds']):PaintTarget[]
 layerId(target:ILayerBuffer):string|undefined
 changed():void
 failed(error:unknown):void
}
/** GPU executor extension of the existing PencilEngine. No extra input,
 * PaperWetness, socket callbacks or operation journal. */
export class RoomNativeRuntime {
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly ctx:RoomNativeRuntimeContext
 private readonly central:RoomNativeCentralAdapter
 private owner:CanonicalRoomWatercolorExecutor|null=null
 private scratch:RibbonStrokeScratch|null=null
 private tile:PaintTarget|null=null
 private generation=0
 private ordinal=0
 private retired=false
 private finishScalars:PreparedRibbonCpuDelivery['input']['scalars']|null=null
 private retirements:Promise<void>[]=[]
 private constructor(backend:CanonicalWatercolorWebGpu,ctx:RoomNativeRuntimeContext){this.backend=backend;this.ctx=ctx;this.central=new RoomNativeCentralAdapter(ctx.fifo,ctx.changed)}
 static async create(ctx:RoomNativeRuntimeContext){
  if(ctx.board.w!==1024||ctx.board.h!==1024)throw new Error('DEV WebGPU Room currently requires an actual 1024×1024 bounded board')
  const la=await getPaperBytes(ctx.paper),resolution=Math.sqrt(la.length/2),bytes=new Uint8Array(resolution*resolution*4)
  for(let i=0;i<la.length/2;i++)bytes.set([la[i*2],la[i*2],la[i*2],la[i*2+1]],i*4)
  const canvas=document.createElement('canvas')
  const backend=await CanonicalWatercolorWebGpu.create({canvas,width:1024,height:1024,paper:{bytes,width:resolution,height:resolution,origin:[0,0],texSize:[ctx.paperWorld.w,ctx.paperWorld.h],scale:ctx.paperScale}})
  return new RoomNativeRuntime(backend,ctx)
 }
 consume(request:PreparedRibbonCpuDelivery,target:ILayerBuffer,path:'live'|'append'|'rebuild'):boolean {
  if(this.retired)throw new Error('Native Room runtime retired')
  if(!request.input.materialEnabled)return true
  const targets=request.targets??this.ctx.resolve(target,request.compositeBounds)
  if(targets.length!==1||targets[0].originX!==0||targets[0].originY!==0||targets[0].buffer.width!==1024||targets[0].buffer.height!==1024)throw new Error('DEV WebGPU Room supports exactly one actual 1024 origin-zero tile')
  const layerId=this.ctx.layerId(target);if(!layerId)throw new Error('Native watercolor requires an actual authoritative Room layer')
  if(request.scratch.foreignSources?.length)throw new Error('DEV WebGPU Room foreign-wash import is not yet wired')
  const {commands}=buildCanonicalStrokeCommandsFromDelivery({...request.input,tile:targets[0]})
  const metadata=request.scratch.captureFinishMetadata();metadata.paints.add(request.input.color.join(','))
  const bounds={...request.compositeBounds}
  let sourceOwner:CanonicalRoomWatercolorExecutor|null=null
  const tile=targets[0],scratch=request.scratch,scalars={...request.input.scalars},ordinal=this.ordinal++
  const live={profile:request.input.profile,opacity:request.input.drawable[0].opacity,fieldSeed:scalars.fieldSeed,spreadPx:scalars.spreadPx,water:scalars.water,bristleRadiusPx:scalars.bristleRadiusPx,inkSmoothPx:scalars.inkSmoothPx,bounds:{...bounds}}
  const film=request.input.film,waterOnly=request.input.waterOnly===true
  this.finishScalars=scalars
  // Freeze command geometry and metadata NOW, before subsequent CPU delivery advances.
  this.central.enqueueSource(()=>{
   const owner=this.ownerFor(scratch,tile,layerId);sourceOwner=owner
   owner.emitPrepared({path,layerId,generation:this.generation,strokeId:`cpu-gesture-${metadata.gesture}`,ordinal,segment:{commands,rect:canonicalSourceRevealRect(owner.target,bounds),film,waterOnly},materialGesture:metadata.gesture,metadata,live})
  },async()=>{if(sourceOwner)await sourceOwner.publishCurrentToGl()})
  return true
 }
 private ownerFor(scratch:RibbonStrokeScratch,tile:PaintTarget,layerId:string){
  if(this.owner&&(this.scratch!==scratch||this.tile?.buffer!==tile.buffer))throw new Error('DEV WebGPU Room retained wash/generation switch requires explicit invalidation')
  if(!this.owner){this.generation++;this.scratch=scratch;this.tile=tile;this.owner=new CanonicalRoomWatercolorExecutor(this.backend,{tile:tile.buffer,originX:tile.originX,originY:tile.originY,layerId,generation:this.generation,delivery:scratch,central:this.central,bridgeMode:'canvas',bridgeCanvas:document.createElement('canvas')})}
  return this.owner
 }
 finish(scratch:RibbonStrokeScratch,metadata:RibbonFinishMetadata):void {
  const context=metadata.finish,scalars=this.finishScalars
  if(!context||!scalars)return
  const delivery=ribbonWaterDelivery(context.profile),standing=delivery.water*(delivery.retain+(1-delivery.retain)*Math.min(1,context.landedWet))
  // Queue the logical boundary AFTER all prepared source packets. It must not
  // await a nested FIFO request from inside its current generator.
  void this.central.admitFactory(()=>{
   if(this.retired)return null
   if(this.scratch!==scratch||!this.owner)throw new Error('Native Room finish has no matching source owner')
   return this.owner.prepareSettle({profile:context.profile,opacity:context.opacity,fieldSeed:context.fieldSeed,spreadPx:scalars.spreadPx,water:scalars.water,bristleRadiusPx:scalars.bristleRadiusPx,bounds:{...context.bounds},bloom:watercolorBloomStrength(context.landedWet,context.profile.pigmentLevel)*watercolorBloomPush(context.profile.pigmentLevel),radiusPx:context.radiusPx,waterLevel:context.profile.waterLevel,landedWet:context.landedWet,standing,wetPeak:context.wetPeak,dwellMs:context.dwellMs})
  }).catch(e=>{if(!this.retired)this.ctx.failed(e)})
 }
 async retire(reason:'clear'|'rebuild'|'snapshot'|'context-loss'|'unmount'){
  if(this.retired)return;this.retired=true
  if(this.owner)this.retirements.push(this.owner.retire(reason));else await this.central.cancel(reason)
  await Promise.allSettled(this.retirements);this.backend.destroy()
 }
}
