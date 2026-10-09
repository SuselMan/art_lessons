import {installNativeTipA,type NativeTipQaProof} from '../experiments/nativeTipContactQa'
import {prepareMomentSegment,type MomentContactState} from '../experiments/wetBrushMomentRecipe'
import {expandCanonicalPaperLa} from './paperExpansion'
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
 /** DEV QA only: pressure D sampler in canonical carry15/16; OFF default. */
 /** QA-only detached raw canvas warmup; no source/settle warmup. */
 diagnosticFirstLiveWarmup?:boolean
 diagnosticRawCanvasWarmup?:boolean
 diagnosticCarryHardwarePressure?:boolean
 diagnosticTipContactA?:boolean
 diagnosticMomentTransport?:boolean
 diagnosticMomentGpuAudit?:boolean
 diagnosticMomentVector?:boolean
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
 readonly tipContactQa:NativeTipQaProof
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly ctx:RoomNativeRuntimeContext
 private readonly central:RoomNativeCentralAdapter
 private owner:CanonicalRoomWatercolorExecutor|null=null
 private scratch:RibbonStrokeScratch|null=null
 private tile:PaintTarget|null=null
 private targetLayer:ILayerBuffer|null=null
 private readonly foreignPrepared=new WeakMap<RibbonStrokeScratch,Set<string>>()
 private readonly momentStates=new WeakMap<RibbonStrokeScratch,MomentContactState>()
 private generation=0
 private ordinal=0
 private retired=false
 private queued=false
 private finishScalars:PreparedRibbonCpuDelivery['input']['scalars']|null=null
 private retirements:Promise<void>[]=[]
 private constructor(backend:CanonicalWatercolorWebGpu,ctx:RoomNativeRuntimeContext){this.backend=backend;this.ctx=ctx;this.tipContactQa=installNativeTipA(backend,ctx.diagnosticTipContactA===true);this.central=new RoomNativeCentralAdapter(ctx.fifo,ctx.changed)}
 static async create(ctx:RoomNativeRuntimeContext){
  if(import.meta.env.DEV&&ctx.diagnosticFirstLiveWarmup===true&&ctx.diagnosticRawCanvasWarmup===true)throw new Error('Separate first-live and raw-only warmup arms required')
  console.info('[native-room-init]','paper:load-start')
  const la=await getPaperBytes(ctx.paper),resolution=Math.sqrt(la.length/2)
  console.info('[native-room-init]','paper:expand-start',la.length)
  const bytes=expandCanonicalPaperLa(la)
  console.info('[native-room-init]','paper:expand-done',bytes.length)
  const canvas=document.createElement('canvas')
  const backend=await CanonicalWatercolorWebGpu.create({canvas,roomOwnedResources:true,onInitStage:stage=>console.info('[native-room-init]',stage),width:1024,height:1024,paper:{bytes,width:resolution,height:resolution,origin:[0,0],texSize:[ctx.paperWorld.w,ctx.paperWorld.h],scale:ctx.paperScale}})
  try{
   if(import.meta.env.DEV&&ctx.diagnosticRawCanvasWarmup===true){
    const started=performance.now()
    console.info('[native-room-init]','raw-warm:start',started)
    const [{CanonicalRoomTileBridge},{warmDetachedRawCanvas}]=await Promise.all([import('./roomTileBridge'),import('./detachedWarmup')])
    const bridge=new CanonicalRoomTileBridge(backend.device,document.createElement('canvas'),1024,1024)
    try{
     const ledger=await warmDetachedRawCanvas(backend,bridge)
     console.info('[native-room-init]','raw-warm:completed',JSON.stringify({scope:'raw canvas only',completedAt:performance.now(),wallMs:performance.now()-started,peakBytes:ledger.peakBytes,sourceWarmed:false,pressureWarmed:false,compositeWarmed:false}))
    }finally{bridge.destroy()}
   }
   if(import.meta.env.DEV&&ctx.diagnosticFirstLiveWarmup===true){
    if(ctx.diagnosticRawCanvasWarmup===true)throw new Error('Separate first-live and raw-only warmup arms required')
    const started=performance.now()
    console.info('[native-room-init]','first-live-warm:start',started)
    const [{warmDetachedFirstLiveUse},{createWarmCorpusPacket,createWarmCorpusLive}]=await Promise.all([import('./detachedSourceWarmup'),import('./warmCorpusPacket')])
    const packet=createWarmCorpusPacket(),live=createWarmCorpusLive()
    const ledger=await warmDetachedFirstLiveUse(backend,packet,live)
    console.info('[native-room-init]','first-live-warm:completed',JSON.stringify({...ledger,completedAt:performance.now(),wallMs:performance.now()-started,input:'detached synthetic production CPU corpus400; not captured user operation'}))
   }
   return new RoomNativeRuntime(backend,ctx)
  }catch(error){backend.destroy();throw error}
 }
 consume(request:PreparedRibbonCpuDelivery,target:ILayerBuffer,path:'live'|'append'|'rebuild'):boolean {
  if(this.retired)throw new Error('Native Room runtime retired')
  if(!request.input.materialEnabled)return true
  const targets=request.targets??this.ctx.resolve(target,request.compositeBounds)
  if(targets.length!==1||targets[0].originX!==0||targets[0].originY!==0||targets[0].buffer.width!==1024||targets[0].buffer.height!==1024)throw new Error('DEV WebGPU Room supports exactly one actual 1024 origin-zero tile')
  const layerId=this.ctx.layerId(target);if(!layerId)throw new Error('Native watercolor requires an actual authoritative Room layer')
  const {commands}=buildCanonicalStrokeCommandsFromDelivery({...request.input,tile:targets[0]})
  const metadata=request.scratch.captureFinishMetadata();metadata.paints.add(request.input.color.join(','))
  const bounds={...request.compositeBounds}
  let sourceOwner:CanonicalRoomWatercolorExecutor|null=null
  const tile=targets[0],scratch=request.scratch,scalars={...request.input.scalars},ordinal=this.ordinal++
  const live={profile:request.input.profile,opacity:request.input.drawable[0].opacity,fieldSeed:scalars.fieldSeed,spreadPx:scalars.spreadPx,water:scalars.water,bristleRadiusPx:scalars.bristleRadiusPx,inkSmoothPx:scalars.inkSmoothPx,bounds:{...bounds}}
  const film=request.input.film,waterOnly=request.input.waterOnly===true
  let momentRecipe:import('../experiments/wetBrushMomentRecipe').MomentContactRecipe|undefined
  if(this.ctx.diagnosticMomentTransport&&!request.auxiliary){
   const prepared=prepareMomentSegment(this.momentStates.get(scratch),request.input.drawable,request.input.previous)
   this.momentStates.set(scratch,prepared.state);momentRecipe=prepared.recipe
  }
  if(request.auxiliary){
   const auxiliary=request.auxiliary
   let prepared=this.foreignPrepared.get(auxiliary.recipient);if(!prepared){prepared=new Set();this.foreignPrepared.set(auxiliary.recipient,prepared)}prepared.add(auxiliary.gesture)
   this.queued=true
   this.central.enqueueSource(()=>{const owner=this.ownerFor(auxiliary.recipient,tile,layerId,target);owner.emitForeignSegment(auxiliary.gesture,{commands,rect:canonicalSourceRevealRect(owner.target,bounds),film,waterOnly:true},metadata.gesture)},async()=>{})
   return true
  }
  this.finishScalars=scalars
  // Freeze command geometry and metadata NOW, before subsequent CPU delivery advances.
  this.queued=true
  this.central.enqueueSource(()=>{
   const owner=this.ownerFor(scratch,tile,layerId,target);sourceOwner=owner
   owner.emitPrepared({path,layerId,generation:this.generation,strokeId:`cpu-gesture-${metadata.gesture}`,ordinal,segment:{commands,rect:canonicalSourceRevealRect(owner.target,bounds),film,waterOnly},materialGesture:metadata.gesture,metadata,live,momentRecipe})
  },async()=>{if(sourceOwner)await sourceOwner.publishCurrentToGl()})
  return true
 }
 importForeign(recipient:RibbonStrokeScratch,target:ILayerBuffer,gesture:string):void {
  if(!this.foreignPrepared.get(recipient)?.delete(gesture))return // Every selected auxiliary source was wholly off this tile.
  this.queued=true
  this.central.enqueueSource(()=>{if(this.scratch!==recipient||this.targetLayer!==target||!this.owner)throw new Error('Native foreign-water recipient layer/generation mismatch');this.owner.importForeign(gesture)},async()=>{})
 }
 get carryPressureDiagnostics(){return this.owner?.carryPressureDiagnostics??null}
 private ownerFor(scratch:RibbonStrokeScratch,tile:PaintTarget,layerId:string,targetLayer:ILayerBuffer){
  if(this.owner&&(this.scratch!==scratch||this.tile?.buffer!==tile.buffer||this.targetLayer!==targetLayer)){this.trackRetirement(this.owner.retire('rebuild',false));this.owner=null}
  if(!this.owner){this.generation++;this.scratch=scratch;this.tile=tile;this.targetLayer=targetLayer;this.owner=new CanonicalRoomWatercolorExecutor(this.backend,{tile:tile.buffer,originX:tile.originX,originY:tile.originY,layerId,generation:this.generation,delivery:scratch,central:this.central,diagnosticMomentVector:this.ctx.diagnosticMomentVector,diagnosticMomentGpuAudit:this.ctx.diagnosticMomentGpuAudit,diagnosticCarryHardwarePressure:this.ctx.diagnosticCarryHardwarePressure,bridgeMode:'canvas',bridgeCanvas:document.createElement('canvas')})}
  return this.owner
 }
 finish(scratch:RibbonStrokeScratch,metadata:RibbonFinishMetadata):void {
  const context=metadata.finish,scalars=this.finishScalars
  if(!context||!scalars)return
  const delivery=ribbonWaterDelivery(context.profile),standing=delivery.water*(delivery.retain+(1-delivery.retain)*Math.min(1,context.landedWet))
  const prevDry=scratch.dryCtx
  scratch.dryCtx={...context,bounds:prevDry?{minX:Math.min(prevDry.bounds.minX,context.bounds.minX),minY:Math.min(prevDry.bounds.minY,context.bounds.minY),maxX:Math.max(prevDry.bounds.maxX,context.bounds.maxX),maxY:Math.max(prevDry.bounds.maxY,context.bounds.maxY)}:{...context.bounds},radiusPx:Math.max(prevDry?.radiusPx??0,context.radiusPx),standing:Math.max(prevDry?.standing??0,standing)}
  const dryCtx=scratch.dryCtx
  // Queue the logical boundary AFTER all prepared source packets. It must not
  // await a nested FIFO request from inside its current generator.
  this.queued=true
  void this.central.admitFactory(()=>{
   if(this.retired)return null
   if(this.scratch!==scratch||!this.owner)throw new Error('Native Room finish has no matching source owner')
   this.owner.scratch.dryCtx=dryCtx
   return this.owner.prepareSettle({profile:context.profile,opacity:context.opacity,fieldSeed:context.fieldSeed,spreadPx:scalars.spreadPx,water:scalars.water,bristleRadiusPx:scalars.bristleRadiusPx,bounds:{...context.bounds},bloom:watercolorBloomStrength(context.landedWet,context.profile.pigmentLevel)*watercolorBloomPush(context.profile.pigmentLevel),radiusPx:context.radiusPx,waterLevel:context.profile.waterLevel,landedWet:context.landedWet,standing,wetPeak:context.wetPeak,dwellMs:context.dwellMs})
  }).catch(e=>{if(!this.retired)this.ctx.failed(e)})
 }
 /** Tool/wash changes land preceding packets, then retire material ownership.
  * Destructive restore/rebuild cancels preceding packets and prevents late upload. */
 invalidateAtBoundary(reason:'clear'|'rebuild'|'snapshot'|'context-loss'):void {
  const old=this.owner;this.owner=null;this.scratch=null;this.tile=null;this.targetLayer=null;this.finishScalars=null
  if(old)this.trackRetirement(old.retire(reason,false))
 }
 invalidate(reason:'clear'|'rebuild'|'snapshot'|'context-loss',cancel=false):void {
  const release=()=>{this.invalidateAtBoundary(reason);return null}
  if(cancel){this.ctx.fifo.cancel(reason==='context-loss');release()}
  else void this.central.admitFactory(release).catch(e=>{if(!this.retired)this.ctx.failed(e)})
 }
 private trackRetirement(promise:Promise<void>){this.retirements.push(promise.catch(error=>{if(!this.retired)this.ctx.failed(error)}))}
 async retire(reason:'clear'|'rebuild'|'snapshot'|'context-loss'|'unmount'){
  if(this.retired)return;this.retired=true
  if(this.owner)this.trackRetirement(this.owner.retire(reason));else if(this.queued)await this.central.cancel(reason)
  await Promise.allSettled(this.retirements);this.backend.destroy()
 }
}
