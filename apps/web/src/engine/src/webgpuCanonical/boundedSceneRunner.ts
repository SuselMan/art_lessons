import { strokeDabs,type Operation,type StrokeOperation } from '@grafetto/shared'
import { CanonicalSingleTileFinish } from './finishTile'
import type { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalFieldBuffer,CanonicalScratchPool } from './fieldBuffer'
import { CanonicalTileScratch,type CanonicalLayerTile } from './tileScratch'
import { CanonicalStrokeScratchMetadata,canonicalSourceRevealRect } from './strokeScratchMetadata'
import { CanonicalSourcePhaseExecutor } from './sourcePhaseExecutor'
import { CanonicalPlanAdapter,type CanonicalUploadSlot } from './settlePlanAdapter'
import { CanonicalPlanFieldOwner } from './planFieldOwner'
import { CanonicalWatercolorSettlePlan } from '../raster/CanonicalWatercolorSettlePlan'
import { CanonicalWatercolorGesture,type WatercolorGestureSettings,type GestureProvenance,type BakedWatercolorChunk } from '../input/CanonicalWatercolorGesture'
import { PointerInput,type PointerData,type PressureMap } from '../input/PointerInput'
import { createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk,type CanonicalStrokeChunkInput } from '../dabs/canonicalStrokeChunk'
import { codecDab } from '../dabs/codecDab'
import { canonicalSourceGeometry } from './sourceGeometry'
import { ribbonProfileFor } from '../dabs/ribbonProfile'
import { presetForTool } from '../presets/resolvePreset'
import { PaperWetness,wetAt,wetPeak,WET_DRY_MS } from '../paper/paperWetness'
import { watercolorBloomStrength,watercolorBloomPush,mottleSeedFromStrokeId,watercolorMixFromPreset } from '../presets/watercolorPresets'
import { runCanonicalSettleJob } from './runSettleJob'
import { CanonicalPlannerPreviewBridge } from './previewBridge'
import type { CanonicalGpuContext } from './types'
import { ribbonWaterDelivery } from '../dabs/ribbonStrokeMath'

export interface BoundedSceneOptions {
 sourceOptions:CanonicalStrokeChunkInput['options']
 /** Diagnostic only: same serial passes/Q8 order, fewer submissions. Default false. */
 groupedSettleSubmission?:boolean
 /** OFF by default; source and live draws share one encoder, without fusing passes. */
 diagnosticSourceLiveSubmission?:boolean
 diagnosticPairedCarry?:boolean
 diagnosticCarryOracleIndex?:number
 diagnosticHardwareLinearInputs?:boolean
 /** OFF by default. Same solver with actual intermediate presentation; incompatible with grouped. */
 progressiveSettle?:boolean
 onSettlePreview?():void
 yieldSettleFrame?():Promise<void>
 now():number;timestamp():number;operationId():string
 onLocalOperation?(operation:Operation):void

}
/** Debug bounded scene, serial GPU jobs. Not PencilEngineAPI/Room, network ACK or live morphing. */
export class CanonicalBoundedSceneRunner {
 readonly backend:CanonicalWatercolorWebGpu
 readonly adapter:CanonicalPlanAdapter
 readonly fieldOwner:CanonicalPlanFieldOwner
 readonly pool:CanonicalScratchPool
 readonly paperWet=new PaperWetness()
 scratch:CanonicalStrokeScratchMetadata
 readonly gesture:CanonicalWatercolorGesture
 readonly target
 private readonly options:BoundedSceneOptions
 private source:CanonicalSourcePhaseExecutor
 private finish:CanonicalSingleTileFinish
 private readonly planner:CanonicalWatercolorSettlePlan<CanonicalFieldBuffer,CanonicalUploadSlot>
 private preview:CanonicalPlannerPreviewBridge
 private pendingSettle:Promise<void>|null=null
 private settleFailure:unknown
 private previewEnabled=false
 private activePreviewContext:CanonicalGpuContext|null=null
 private previewReady=false
 private settings?:WatercolorGestureSettings
 private retired=false
 private resourcesReleased=false
 private readonly detachInputs=new Set<()=>void>()
 private cancelYield!:()=>void
 private readonly retiredSignal=new Promise<void>(resolve=>{this.cancelYield=resolve})
 private retirement:Promise<void>|null=null
 private active=false
 private busy=false
 private replayStrokeId?:string
 private layerId?:string
 private washId?:string
 private readonly geometry={dabSpacing:0}
 constructor(backend:CanonicalWatercolorWebGpu,options:BoundedSceneOptions){
  if(options.progressiveSettle&&options.groupedSettleSubmission)throw new Error('Progressive and grouped native settle are incompatible')
  this.backend=backend;this.options=options;this.adapter=new CanonicalPlanAdapter(backend);this.adapter.diagnosticPairedCarry=options.diagnosticPairedCarry===true;this.adapter.diagnosticCarryOracleIndex=options.diagnosticCarryOracleIndex;this.adapter.diagnosticHardwareLinearInputs=options.diagnosticHardwareLinearInputs===true;this.fieldOwner=new CanonicalPlanFieldOwner(backend);this.pool=new CanonicalScratchPool(backend)
  const buffer=new CanonicalFieldBuffer(backend,1024,1024,'linear','bounded native layer');buffer.clear()
  this.target={buffer,originX:0,originY:0,contentRect:null}
  this.scratch=new CanonicalStrokeScratchMetadata(new CanonicalTileScratch(this.pool),createCanonicalStrokeChunkState(),[this.target])
  this.finish=new CanonicalSingleTileFinish(backend,this.scratch.tiles,[this.target])
  this.preview=new CanonicalPlannerPreviewBridge(backend,this.scratch.tiles,this.target)
  this.source=new CanonicalSourcePhaseExecutor(backend,this.scratch.tiles,[this.target],{fieldOp:(out,a,b,mode,k,scissor)=>this.adapter.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})})
  this.planner=new CanonicalWatercolorSettlePlan({fieldFor:(w,h,c)=>this.fieldOwner.fieldFor(w,h,c),paperWorldSize:()=>({w:backend.paper.texSize[0],h:backend.paper.texSize[1]}),pool:()=>this.pool,supportsFilm:()=>true,ab:()=>({noDiffuse:false,noCarry:false,opDry:false}),shouldPreview:()=>this.previewEnabled,passes:()=>this.adapter,uploads:this.adapter.uploads})
  this.gesture=new CanonicalWatercolorGesture({paperWet:this.paperWet,now:options.now,timestamp:options.timestamp,operationId:options.operationId,onPreparedChunk:chunk=>this.prepare(chunk),onLocalStroke:(op)=>options.onLocalOperation?.(op),onChunkBoundary:()=>{this.settle();this.scratch.newFilm();this.scratch.activateMaterialFilm(this.scratch.gesture)}})
 }
 get isIdle(){return !this.retired&&!this.resourcesReleased&&!this.active&&!this.busy}
 private assertAlive(){if(this.retired||this.resourcesReleased)throw new Error('Native scene has been retired')}
 async clear():Promise<void>{
  this.assertAlive()
  if(this.active)throw new Error('Finish the active native gesture before clearing')
  await this.drain();this.scratch.tiles.destroy();this.target.buffer.clear();this.paperWet.clear();this.geometry.dabSpacing=0;this.replayStrokeId=undefined;this.layerId=undefined;this.washId=undefined
  this.scratch=new CanonicalStrokeScratchMetadata(new CanonicalTileScratch(this.pool),createCanonicalStrokeChunkState(),[this.target])
  this.source=new CanonicalSourcePhaseExecutor(this.backend,this.scratch.tiles,[this.target],{fieldOp:(out,a,b,mode,k,scissor)=>this.adapter.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})})
  this.finish=new CanonicalSingleTileFinish(this.backend,this.scratch.tiles,[this.target]);this.preview=new CanonicalPlannerPreviewBridge(this.backend,this.scratch.tiles,this.target);await this.backend.device.queue.onSubmittedWorkDone()
 }
 attach(canvas:HTMLCanvasElement,getStroke:()=>{settings:WatercolorGestureSettings;provenance:GestureProvenance},transform:(x:number,y:number)=>{x:number;y:number},pressureMap:PressureMap|null=null):()=>void {
  this.assertAlive()
  const input=new PointerInput(canvas);input.setTransform(transform);input.setPressureMap(pressureMap)
  input.on('start',event=>{const stroke=getStroke();this.begin(event,stroke.settings,stroke.provenance)}).on('move',event=>this.move(event)).on('end',event=>this.end(event))
  const detach=()=>{input.destroy();this.detachInputs.delete(detach)};this.detachInputs.add(detach);return detach
 }
 private guardOwner(layerId:string,washId?:string){
  if(this.layerId!==undefined&&this.layerId!==layerId||this.washId!==undefined&&washId!==undefined&&this.washId!==washId)throw new Error('Native debug scene supports one layer and one retained wash only')
  this.layerId=layerId;this.washId??=washId
 }
 private guardPoint(e:PointerData){if(e.x<0||e.y<0||e.x>=1024||e.y>=1024)throw new Error('Native debug scene does not support input outside its single tile')}
 begin(e:PointerData,settings:WatercolorGestureSettings,provenance:GestureProvenance):void {
  this.assertAlive()
  if(this.active||this.busy)throw new Error('Native debug scene is busy; concurrent gestures are unsupported')
  this.guardPoint(e);this.guardOwner(provenance.layerId,provenance.washId);this.settings={...settings,color:[...settings.color],nibAngle:{...settings.nibAngle}};this.resetGesture();this.active=true
  this.gesture.begin(e,settings,provenance)
 }
 move(e:PointerData):void {this.assertAlive();this.guardPoint(e);if(!this.active)throw new Error('No active native gesture');this.gesture.move(e)}
 end(e:PointerData):void {this.assertAlive();this.guardPoint(e);if(!this.active)throw new Error('No active native gesture');this.gesture.end(e);this.active=false;this.settle();this.busy=true}
 async drain():Promise<void>{this.assertAlive();await this.pendingSettle;this.assertAlive();await this.backend.device.queue.onSubmittedWorkDone();if(this.settleFailure){const failure=this.settleFailure;this.settleFailure=undefined;throw failure}this.busy=false}
 private resetGesture(){
  this.scratch.beginStroke(()=>{
   const cached=this.scratch.delivery.gestureScalars
   Object.assign(this.scratch.delivery,createCanonicalStrokeChunkState());this.scratch.delivery.gestureScalars=cached
  })
  this.scratch.activateMaterialFilm(this.scratch.gesture)
 }
 private prepare(chunk:BakedWatercolorChunk){
  const s=this.settings!,preset=presetForTool('watercolor',s.preset),state=this.scratch.delivery,profile=ribbonProfileFor('watercolor',s.preset,this.scratch.finishContext?.landedWet??wetAt(chunk.wet,0))
  state.standing.clear()
  const canonical=chunk.dabs.map(codecDab)
  for(let i=0;i<chunk.dabs.length;i++){
   const previous=state.lastKept??(i===0&&chunk.previous?codecDab(chunk.previous):undefined),wet=chunk.wet.slice(i,i+1)
   const result=prepareCanonicalStrokeChunk(state,{dabs:[canonical[i]],previous,preset,presetName:s.preset,profile,color:s.color,wetProfile:wet,strokeSeed:chunk.strokeSeed,tile:this.target,film:true,segmentMode:'combined',segmented:true,options:this.options.sourceOptions})
   if(!result.drawable.length)continue
   state.landedWet??=wetAt(wet,0)
   const geometry=canonicalSourceGeometry(result.drawable,previous,preset,profile,wet,state,this.geometry,{w:1024,h:1024},this.options.sourceOptions.diagnosticCanonicalSettleRadius)
   const encodeSource=(ctx:CanonicalGpuContext)=>this.adapter.retain(this.source.execute(ctx.encoder,{commands:result.commands,rect:canonicalSourceRevealRect(this.target,geometry.compositeBounds),film:true,waterOnly:false},this.scratch.materialGesture))
   const encodeLive=(ctx:CanonicalGpuContext)=>this.adapter.retain(this.finish.encodeLive(ctx.encoder,{profile,opacity:result.drawable[0].opacity,fieldSeed:geometry.scalars.fieldSeed,spreadPx:geometry.scalars.spreadPx,water:geometry.scalars.water,bristleRadiusPx:geometry.scalars.bristleRadiusPx,inkSmoothPx:this.geometry.dabSpacing,bounds:geometry.compositeBounds}))
   if(this.options.diagnosticSourceLiveSubmission===true)this.adapter.runQuantum(ctx=>{encodeSource(ctx);encodeLive(ctx)})
   else{this.adapter.runQuantum(encodeSource);this.adapter.runQuantum(encodeLive)}
   this.scratch.paints.add(s.color.join(','));if(profile.pigmentStrength>0)this.scratch.pigmentInputsKnownZero=false
   this.scratch.noteFinish({target:this.target,preset,profile,color:s.color,opacity:result.drawable[0].opacity,bounds:geometry.bounds,fieldSeed:geometry.scalars.fieldSeed,landedWet:this.scratch.finishContext?.landedWet??wetAt(wet,0),wetPeak:wetPeak(wet),radiusPx:geometry.nibRadius,dwellMs:state.dwellMs})
  }
  const originalStanding=new Map(state.standing)
  for(let i=0;i<canonical.length;i++)if(canonical[i]!==chunk.dabs[i]&&state.standing.has(canonical[i])){originalStanding.delete(canonical[i]);originalStanding.set(chunk.dabs[i],state.standing.get(canonical[i])!)}
  return{standing:originalStanding,dabPool:state.dabPool}
 }
 private settle():void {
  const finish=this.scratch.finishContext;if(!finish)return
  const profile=finish.profile as ReturnType<typeof ribbonProfileFor>,scalars=this.scratch.delivery.gestureScalars!,bounds=finish.bounds
  const delivery=ribbonWaterDelivery(profile),standing=delivery.water*(delivery.retain+(1-delivery.retain)*Math.min(1,finish.landedWet)),previous=this.scratch.dryCtx
  this.scratch.dryCtx={...finish,bounds:previous?{minX:Math.min(previous.bounds.minX,bounds.minX),minY:Math.min(previous.bounds.minY,bounds.minY),maxX:Math.max(previous.bounds.maxX,bounds.maxX),maxY:Math.max(previous.bounds.maxY,bounds.maxY)}:{...bounds},radiusPx:Math.max(previous?.radiusPx??0,finish.radiusPx),standing:Math.max(previous?.standing??0,standing)}
  // Chunk boundaries within an active gesture must stay synchronous: delivery state
  // immediately proceeds to the next material film on the same CPU stack.
  const progressive=this.options.progressiveSettle===true&&!this.active
  this.previewEnabled=progressive
  const compositeMetadata={profile,opacity:finish.opacity as number,fieldSeed:scalars.fieldSeed,spreadPx:scalars.spreadPx,water:scalars.water,bristleRadiusPx:scalars.bristleRadiusPx,bounds}
  const preview=progressive?((tile:CanonicalLayerTile,pigment:CanonicalFieldBuffer,color:CanonicalFieldBuffer|null,coverage:CanonicalFieldBuffer)=>{
   const ctx=this.activePreviewContext,original=this.scratch.tiles.peek(tile.buffer)?.original
   if(!ctx||!original)throw new Error('Native preview must run inside its owner quantum')
   this.adapter.retain(this.preview.encodePreview(ctx,tile,{pigment,color,coverage},original,compositeMetadata));this.previewReady=true
  }):undefined
  const job=this.adapter.runQuantum(ctx=>{this.activePreviewContext=ctx;try{return this.planner.prepare(this.scratch,[this.target],bounds,watercolorBloomStrength(finish.landedWet,profile.pigmentLevel)*watercolorBloomPush(profile.pigmentLevel),finish.radiusPx,profile.waterLevel,finish.landedWet,standing,finish.wetPeak,finish.dwellMs,preview,false,this.scratch.captureMetadata(),true)}finally{this.activePreviewContext=null}})
  if(!job){this.previewEnabled=false;return}
  compositeMetadata.bounds=job.compositeDomain
  const composite=(ctx:CanonicalGpuContext)=>{this.adapter.retain(this.finish.encode(ctx.encoder,{settleComplete:true,...compositeMetadata,settledGesture:this.scratch.gesture,materialGesture:this.scratch.materialGesture,bounds:job.compositeDomain}))}
  if(!progressive){runCanonicalSettleJob(this.adapter,job,composite,this.options.groupedSettleSubmission===true);return}
  this.busy=true
  this.pendingSettle=this.runProgressive(job,composite).catch(error=>{if(!this.retired)this.settleFailure=error}).finally(()=>{this.previewEnabled=false;this.activePreviewContext=null})
 }
 private async runProgressive(job:Parameters<typeof runCanonicalSettleJob>[1],composite:(ctx:CanonicalGpuContext)=>void):Promise<void>{
  try{
   for(const op of job.ops){
    if(this.retired)return
    this.previewReady=false
    this.adapter.runQuantum(ctx=>{this.activePreviewContext=ctx;try{op()}finally{this.activePreviewContext=null}})
    if(this.previewReady&&!this.retired)this.options.onSettlePreview?.()
    await Promise.race([this.retiredSignal,this.options.yieldSettleFrame?.()??new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))])
   }
   if(this.retired)return
   this.adapter.runQuantum(ctx=>{job.finish();composite(ctx)});if(!this.retired)this.options.onSettlePreview?.()
  }finally{this.adapter.runQuantum(()=>job.dispose())}

 }
 replay(operation:StrokeOperation):void {
  this.assertAlive()
  if(this.active||this.busy)throw new Error('Native debug scene is busy')
  if(operation.tool!=='watercolor')throw new Error('Native debug replay supports only watercolor')
  this.guardOwner(operation.layerId,operation.washId)
  const dabs=strokeDabs(operation);for(const d of dabs)this.guardPoint(d as unknown as PointerData)
  this.settings={tool:'watercolor',preset:operation.preset!,color:operation.color as [number,number,number],size:dabs[0]?.size??1,opacity:1,nibAngle:{angle:0,anchor:'canvas'},tiltResponse:'smooth'}
  const replayId=operation.strokeId??operation.id
  const previous=this.replayStrokeId===replayId?this.scratch.delivery.lastKept:undefined
  if(previous){this.scratch.newFilm();this.scratch.activateMaterialFilm(this.scratch.gesture)}else this.resetGesture()
  this.replayStrokeId=replayId
  const prepared=this.prepare({dabs,previous,wet:operation.wet??'0'.repeat(dabs.length),strokeSeed:mottleSeedFromStrokeId(operation.strokeId),strokeId:operation.strokeId??operation.id,washId:operation.washId,layerId:operation.layerId,userId:operation.userId,operationIndex:0,dabOffset:0})
  const age=Math.min(Math.max(this.options.timestamp()-operation.timestamp,0),WET_DRY_MS)
  if(age<WET_DRY_MS){const at=this.options.now()-age,preset=presetForTool('watercolor',operation.preset),water=watercolorMixFromPreset(operation.preset).water;for(const dab of dabs)this.paperWet.deposit(operation.layerId,dab.x,dab.y,dab.size*.5*preset.sizeMultiplier*Math.max(dab.aspectRatio,1),prepared.standing.get(dab)??water,at,false,prepared.dabPool.get(dab)??0)}
  this.settle();this.busy=true
 }
 /** Whole-owner cancellation. Never synthesizes pen-up or an operation. Call
  * before backend.destroy: cancellation disposes the CPU job in its live scope.
  * Texture retirement stays deferred by the backend's existing scope owner. */
 retire():Promise<void>{
  if(this.retirement)return this.retirement
  this.retired=true;this.cancelYield();for(const detach of [...this.detachInputs])detach()
  this.retirement=(async()=>{try{await this.pendingSettle}finally{this.releaseResources();this.active=false;this.busy=false;this.settleFailure=undefined}})()
  return this.retirement
 }
 private releaseResources(){if(this.resourcesReleased)return;this.resourcesReleased=true;for(const detach of [...this.detachInputs])detach();this.adapter.disposeCarryOracle();this.planner.destroyTextures();this.scratch.tiles.destroy();this.target.buffer.destroy();this.fieldOwner.destroy();this.pool.destroy()}
 destroy(){if(this.active||this.busy)throw new Error('Drain native scene before destroy');this.releaseResources()}

}
