import {observeSeedBridge} from './seedBridgeCost'
import {WetBrushMomentSourceSeam} from '../experiments/wetBrushMomentSourceSeam'
import {auditMomentRecords} from '../experiments/wetBrushMomentGpu'
import type {MomentContactRecipe} from '../experiments/wetBrushMomentRecipe'
import type {AccumulationBuffer} from '../buffers/AccumulationBuffer'
import type {CanonicalStrokeChunkState} from '../dabs/canonicalStrokeChunk'
import {CanonicalWatercolorSettlePlan} from '../raster/CanonicalWatercolorSettlePlan'
import type {SettlePlanMetadata} from '../watercolor/SettlePlanContracts'
import type {CanonicalWatercolorWebGpu} from './backend'
import {CanonicalFieldBuffer,CanonicalScratchPool} from './fieldBuffer'
import {CanonicalSingleTileFinish,type CanonicalTileFinishInput,type CanonicalTileLiveInput} from './finishTile'
import {CanonicalPlanAdapter} from './settlePlanAdapter'
import {CanonicalPlanFieldOwner} from './planFieldOwner'
import {CanonicalStrokeScratchMetadata} from './strokeScratchMetadata'
import {CanonicalTileScratch} from './tileScratch'
import {CanonicalSourcePhaseExecutor,type PreparedSourceSegment} from './sourcePhaseExecutor'
import {CanonicalRoomTileBridge,canonicalTopRowsToGlRows} from './roomTileBridge'

export interface RoomNativeMaterialJob {
 /** Executes one ORIGINAL pass/Q8 boundary. Owner schedules; executor has no timer. */
 canStep?(maxPending:number):boolean
 step():boolean
 finish():void
 publish?():Promise<void>
 dispose():void
}
export interface RoomNativeCentralOwner {
 readonly isIdle:boolean
 /** Existing engine owns FIFO, blocked input, authoritative replay and cancellation. */
 admit(job:RoomNativeMaterialJob):Promise<void>
 drain():Promise<void>
 cancel(reason:'clear'|'rebuild'|'snapshot'|'context-loss'|'unmount'):Promise<void>
}
export type RoomNativePath='live'|'append'|'rebuild'
export interface RoomNativePreparedChunk {
 readonly path:RoomNativePath
 readonly layerId:string
 readonly generation:number
 readonly strokeId:string
 readonly ordinal:number
 readonly segment:PreparedSourceSegment
 readonly materialGesture:number
 readonly metadata:SettlePlanMetadata
 readonly momentRecipe?:MomentContactRecipe
 readonly live:CanonicalTileLiveInput
}
export type RoomNativeSettleInput=Omit<CanonicalTileFinishInput,'settleComplete'|'settledGesture'|'materialGesture'>&{
 bloom:number;radiusPx:number;waterLevel:number;landedWet:number;standing:number;wetPeak:number;dwellMs:number
}

/** Renderer seam for ONE real Room GL layer tile. No PointerInput, DabSystem,
 * PaperWetness, operations or delivery computation lives in this executor.
 * Its delivery object MUST be the existing shared CPU state, not a replay copy.
 * Room wiring is still an explicit next step; this module never self-installs. */
export class CanonicalRoomWatercolorExecutor {
 readonly adapter:CanonicalPlanAdapter
 readonly scratch:CanonicalStrokeScratchMetadata<Pick<CanonicalStrokeChunkState,'brushTravel'|'wetContacts'>>
 readonly target
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly glTile:AccumulationBuffer
 private readonly central:RoomNativeCentralOwner
 private readonly layerId:string
 private readonly generation:number
 private readonly bridge:CanonicalRoomTileBridge
 private readonly bridgeMode:'readback'|'canvas'
 private readonly pool:CanonicalScratchPool
 private readonly fields:CanonicalPlanFieldOwner
 private readonly source:CanonicalSourcePhaseExecutor
 private readonly finish:CanonicalSingleTileFinish
 private readonly planner:CanonicalWatercolorSettlePlan<CanonicalFieldBuffer,import('./settlePlanAdapter').CanonicalUploadSlot>
 private readonly accepted=new Set<string>()
 readonly carryPressureDiagnostics:{enabled:boolean;counters:{mode15:number;mode16:number;other:number}}
 private readonly diagnosticMomentVector:boolean
 private readonly diagnosticMomentGpuAudit:boolean
 private momentSeam:WetBrushMomentSourceSeam|null=null
 private pendingMoment:{chunk:RoomNativePreparedChunk}|null=null
 readonly momentReport:{ordinal:number;supported:boolean;violations:number;maxExcess:number|null;examples:unknown[];applied:boolean;auditMode?:'cpu-rgba'|'gpu-counter'|'gpu-vector'}[]=[]
 private readonly foreignAux=new Map<string,{scratch:CanonicalTileScratch;source:CanonicalSourcePhaseExecutor}>()
 private retired=false
 private retirement:Promise<void>|null=null
 private readonly ready:Promise<void>
 constructor(backend:CanonicalWatercolorWebGpu,options:{tile:AccumulationBuffer;originX:number;originY:number;layerId:string;generation:number;delivery:Pick<CanonicalStrokeChunkState,'brushTravel'|'wetContacts'>;central:RoomNativeCentralOwner;bridgeMode:'readback'|'canvas';bridgeCanvas:HTMLCanvasElement;diagnosticNativeBrushPair?:boolean;diagnosticMomentGpuAudit?:boolean;diagnosticMomentVector?:boolean;diagnosticCarryHardwarePressure?:boolean}) {
  if(options.tile.width!==1024||options.tile.height!==1024||options.originX!==0||options.originY!==0)throw new Error('DEV Room native executor requires one origin-zero1024 tile; no silent GL fallback')
  if(options.diagnosticMomentVector&&!options.diagnosticMomentGpuAudit)throw Error('DEV vector moment requires GPU audit')
  if(!options.central.isIdle)throw new Error('Seed native Room tile only at a central idle boundary')
  this.backend=backend;this.glTile=options.tile;this.layerId=options.layerId;this.generation=options.generation;this.central=options.central;this.bridgeMode=options.bridgeMode
  this.adapter=new CanonicalPlanAdapter(backend);this.adapter.diagnosticOwnerEpoch=options.generation;this.adapter.diagnosticNativeBrushPair=import.meta.env.DEV&&options.diagnosticNativeBrushPair===true;
  const carryPressureEnabled=import.meta.env.DEV&&options.diagnosticCarryHardwarePressure===true;
  this.carryPressureDiagnostics={enabled:carryPressureEnabled,counters:installRoomCarryPressureControl(this.adapter,carryPressureEnabled)};this.pool=new CanonicalScratchPool(backend);this.fields=new CanonicalPlanFieldOwner(backend)
  this.target={buffer:new CanonicalFieldBuffer(backend,1024,1024,'linear','DEV actual Room watercolor tile'),originX:0,originY:0,contentRect:null}
  this.scratch=new CanonicalStrokeScratchMetadata(new CanonicalTileScratch(this.pool),{brushTravel:[],wetContacts:[]},[this.target])
  this.source=new CanonicalSourcePhaseExecutor(backend,this.scratch.tiles,[this.target],{fieldOp:(out,a,b,mode,k,scissor)=>this.adapter.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})},()=>this.scratch.trackRunningSource)
  this.finish=new CanonicalSingleTileFinish(backend,this.scratch.tiles,[this.target]);this.bridge=new CanonicalRoomTileBridge(backend.device,options.bridgeCanvas,1024,1024)
  this.planner=new CanonicalWatercolorSettlePlan({fieldFor:(w,h,c)=>this.fields.fieldFor(w,h,c),paperWorldSize:()=>({w:backend.paper.texSize[0],h:backend.paper.texSize[1]}),pool:()=>this.pool,supportsFilm:()=>true,ab:()=>({noDiffuse:false,noCarry:false,opDry:false}),shouldPreview:()=>false,passes:()=>this.adapter,uploads:this.adapter.uploads})
  this.diagnosticMomentVector=options.diagnosticMomentVector===true
  this.diagnosticMomentGpuAudit=options.diagnosticMomentGpuAudit===true
  this.ready=import.meta.env.DEV?observeSeedBridge(()=>options.tile.readPixels(),bytes=>canonicalTopRowsToGlRows(bytes,1024,1024),bytes=>backend.upload(this.target.buffer.field,bytes),()=>backend.whenIdle(),cost=>console.info('[native-room-seed]',JSON.stringify({...cost,generation:this.generation,layerId:this.layerId}))):(()=>{backend.upload(this.target.buffer.field,canonicalTopRowsToGlRows(options.tile.readPixels(),1024,1024));return backend.whenIdle()})()
 }
 async seedReady(){await this.ready;this.assertLive()}
 /** All three existing engine pixel paths call THIS SAME method after the
  * unchanged CPU preparer has advanced once. No decoding/preparing here. */
 emitPrepared(chunk:RoomNativePreparedChunk):void {
  this.assertLive()
  if(chunk.momentRecipe&&this.pendingMoment)throw new Error('DEV moment source must publish before next contact')
  if(!this.central.isIdle)throw new Error('Central Room owner must drain before source material mutation')
  assertRoomNativeChunkIdentity(chunk,this.layerId,this.generation)
  if(chunk.metadata.gesture< this.scratch.gesture)throw new Error('Native Room material chronology moved backwards')
  const key=`${chunk.strokeId}:${chunk.ordinal}`
  if(this.accepted.has(key))throw new Error('Prepared CPU delivery was routed twice in this generation')
  this.scratch.gesture=chunk.metadata.gesture;this.scratch.activateMaterialFilm(chunk.materialGesture)
  const paints=[...chunk.metadata.paints];this.scratch.paints.clear();for(const paint of paints)this.scratch.paints.add(paint)
  this.scratch.pigmentInputsKnownZero=false
  this.scratch.foreignSources=chunk.metadata.foreignSources;this.scratch.dryCtx=chunk.metadata.dryCtx
  // Immutable outputs of the ONE CPU advance are installed for this queued material boundary.
  this.scratch.delivery.brushTravel=chunk.metadata.brushTravel.map(v=>({...v}))
  this.scratch.delivery.wetContacts=chunk.metadata.wetContacts.map(v=>({...v}))
  this.adapter.runQuantum(ctx=>this.adapter.retain(this.source.execute(ctx.encoder,chunk.segment,chunk.materialGesture)))
  this.adapter.runQuantum(ctx=>this.adapter.retain(this.finish.encodeLive(ctx.encoder,chunk.live)))
  if(chunk.momentRecipe)this.pendingMoment={chunk}
  this.accepted.add(key)
 }
 emitForeignSegment(gesture:string,segment:PreparedSourceSegment,filmGesture:number):void {
  this.assertLive()
  let auxiliary=this.foreignAux.get(gesture)
  if(!auxiliary){const scratch=new CanonicalTileScratch(this.pool,false,false);const source=new CanonicalSourcePhaseExecutor(this.backend,scratch,[this.target],{fieldOp:(out,a,b,mode,k,scissor)=>this.adapter.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})});auxiliary={scratch,source};this.foreignAux.set(gesture,auxiliary)}
  const source=auxiliary.source
  this.adapter.runQuantum(ctx=>this.adapter.retain(source.execute(ctx.encoder,segment,filmGesture)))
 }
 importForeign(gesture:string):void {
  this.assertLive()
  const auxiliary=this.foreignAux.get(gesture)
  if(!auxiliary)throw new Error('Native foreign-water merge has no prepared donor')
  this.adapter.runQuantum(()=>{const donor=auxiliary.scratch.peek(this.target.buffer);if(donor)this.source.importForeign(gesture,donor);auxiliary.scratch.destroy()})
  this.foreignAux.delete(gesture)
 }
 prepareSettle(input:RoomNativeSettleInput):RoomNativeMaterialJob|null {
  this.assertLive()
  if(!this.central.isIdle)throw new Error('Central Room owner must serialize settle admission')
  const job=this.adapter.runQuantum(()=>this.planner.prepare(this.scratch,[this.target],input.bounds,input.bloom,input.radiusPx,input.waterLevel,input.landedWet,input.standing,input.wetPeak,input.dwellMs,undefined,false,this.scratch.captureMetadata(),true))
  if(!job)return null
  let next=0,disposed=false,finished=false
  const task:RoomNativeMaterialJob={
   canStep:maxPending=>{this.assertLive();const state=this.backend.diagnosticScopeState;if(!state.live)throw new Error('Native material scope owner destroyed');return state.pending<maxPending},
   step:()=>{this.assertLive();if(disposed||finished)throw new Error('Native Room job already closed');if(next<job.ops.length)this.adapter.runQuantum(()=>job.ops[next++]());return next===job.ops.length},
   finish:()=>{this.assertLive();if(disposed||finished||next!==job.ops.length)throw new Error('Native Room finish before canonical passes complete');this.adapter.runQuantum(ctx=>{job.finish();this.adapter.retain(this.finish.encode(ctx.encoder,{...input,settleComplete:true,settledGesture:this.scratch.gesture,materialGesture:this.scratch.materialGesture,bounds:job.compositeDomain}))});this.adapter.retireStaticFrontCache();finished=true},
   publish:()=>this.publishWithoutDrain(),
   dispose:()=>{if(disposed)return;disposed=true;disposeNativeMaterialResources(this.adapter,()=>job.dispose())},
  }
  return task
 }
 async settle(input:RoomNativeSettleInput):Promise<void> {
  const task=this.prepareSettle(input)
  if(task)try{await this.central.admit(task)}finally{task.dispose()}
 }
 /** Barrier before GL pencil/eraser/transform, snapshot/export or drawing the
  * shared GL canvas. Never silently renders the same watercolor in WebGL. */
 async synchronizeToGl():Promise<void> {
  await this.central.drain();await this.seedReady();this.assertLive()
  await this.publishWithoutDrain()
 }
 async publishCurrentToGl():Promise<void> {
  if(this.pendingMoment){
   const {chunk}=this.pendingMoment;this.pendingMoment=null
   const e=this.scratch.tiles.peek(this.target.buffer),rect=chunk.segment.rect
   if(!e?.inkLoad||!e.inkColor||!rect)throw new Error('DEV moment actual source fields unavailable')
   // Diagnostics ONLY: readback gates precede new operator. No UX/perf claim.
   const p=this.diagnosticMomentGpuAudit?null:await e.inkLoad.readBytes(),c=this.diagnosticMomentGpuAudit?null:await e.inkColor.readBytes();this.assertLive()
   const [x,yGl,w,h]=rect,y=this.target.buffer.height-yGl-h
   const region=(bytes:Uint8Array)=>{const out=new Uint8Array(w*h*4);for(let row=0;row<h;row++)out.set(bytes.subarray(((y+row)*this.target.buffer.width+x)*4,((y+row)*this.target.buffer.width+x+w)*4),row*w*4);return out}
   const audit=p&&c?auditMomentRecords(region(p),region(c)):{supported:true,violations:0,maxExcess:null,examples:[]}
   const observation={ordinal:chunk.ordinal,supported:audit.supported,violations:audit.violations,maxExcess:audit.maxExcess,examples:audit.examples,applied:false,auditMode:this.diagnosticMomentVector?'gpu-vector' as const:this.diagnosticMomentGpuAudit?'gpu-counter' as const:'cpu-rgba' as const}
   if(audit.supported){
    this.momentSeam??=new WetBrushMomentSourceSeam(this.backend,undefined,this.diagnosticMomentVector)
    let lease:ReturnType<WetBrushMomentSourceSeam['encodeAfterLanding']>|undefined,read:GPUBuffer|undefined
    try{
     this.adapter.runQuantum(ctx=>{
      lease=this.momentSeam!.encodeAfterLanding(ctx.encoder,{scratch:this.scratch.tiles,tile:this.target.buffer,segment:chunk.segment,availableWater:e.coverage,materialGesture:chunk.materialGesture,recipe:chunk.momentRecipe!,diagnosticInPlace:this.diagnosticMomentGpuAudit},true)
      this.adapter.retain(lease.buffers)
      read=this.backend.device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})
      ctx.encoder.copyBufferToBuffer(lease.invalid!,0,read,0,4)
      this.adapter.retain(this.finish.encodeLive(ctx.encoder,chunk.live))
     })
     await this.backend.whenIdle();await read!.mapAsync(GPUMapMode.READ)
     const invalidChannels=new Uint32Array(read!.getMappedRange())[0];read!.unmap();this.assertLive()
     if(invalidChannels){
      if(!this.diagnosticMomentGpuAudit)throw new Error(`DEV moment GPU carrier disagreed with actual CPU audit: ${invalidChannels}`)
      observation.supported=false;observation.violations=invalidChannels
     }else{
      // Counter validation precedes continuation bookkeeping. Invalid or retired
      // contacts must never absorb/clear the current production MAX film.
      // A zero-rate diagnostic must preserve the settle decomposition, not
      // merely the displayed records. Rebasing makes inkBase==inkLoad and
      // changes the planner's (laid - settled) mobile inputs.
      if(this.diagnosticMomentGpuAudit&&(chunk.momentRecipe!.mixRate!==0||chunk.momentRecipe!.advectionRate!==0)){
       this.adapter.runQuantum(()=>{if(chunk.segment.film){e.inkLoad!.copyTo(e.inkBase!);e.inkColor!.copyTo(e.colorBase!);e.strokeInk!.clear();e.strokeColor!.clear()}})
       await this.backend.whenIdle();this.assertLive()
      }
      observation.applied=true
     }
    }finally{read?.destroy();lease?.release()}
   }
   this.momentReport.push(observation)
   console.info('[native-moment-transport]',observation)
  }
  return this.publishWithoutDrain()
 }
 private async publishWithoutDrain():Promise<void> {
  this.assertLive()
  if(this.bridgeMode==='canvas')await this.bridge.copyByCanvas(this.target.buffer.field,this.glTile,()=>!this.retired)
  else await this.bridge.copyByReadback(this.target.buffer.field,this.glTile,field=>this.backend.readField(field),()=>!this.retired)
 }
 retire(reason:Parameters<RoomNativeCentralOwner['cancel']>[0],cancelCentral=true):Promise<void> {
  if(this.retirement)return this.retirement
  this.retired=true
  this.retirement=this.release(reason,cancelCentral)
  return this.retirement
 }
 private async release(reason:Parameters<RoomNativeCentralOwner['cancel']>[0],cancelCentral:boolean) {
  if(cancelCentral)await this.central.cancel(reason)
  try{await this.backend.whenIdle()}finally{
  for(const auxiliary of this.foreignAux.values())auxiliary.scratch.destroy();this.foreignAux.clear()
  this.adapter.retireStaticFrontCache();this.adapter.disposeCarryOracle();this.planner.destroyTextures();this.scratch.tiles.destroy();this.target.buffer.destroy();this.fields.destroy();this.pool.destroy();this.bridge.destroy()
  }
 }
 private assertLive(){if(this.retired)throw new Error('Native Room tile generation retired')}
}

/** One authoritative identity contract for local, tail/peer and rebuild routes.
 * Rebuild gets a NEW material generation; replay is not a second delivery call
 * within the current source generation. */
export function assertRoomNativeChunkIdentity(chunk:Pick<RoomNativePreparedChunk,'path'|'layerId'|'generation'|'strokeId'|'ordinal'>,layerId:string,generation:number):void {
 if(!['live','append','rebuild'].includes(chunk.path)||chunk.layerId!==layerId||chunk.generation!==generation||!chunk.strokeId||!Number.isInteger(chunk.ordinal)||chunk.ordinal<0)throw new Error('Native Room prepared chunk identity mismatch')
}

/** QA-only owner-local wrapper. No global sampler/pipeline/default changes. */
export function installRoomCarryPressureControl(adapter:CanonicalPlanAdapter,enabled=false){
 if(typeof enabled!=='boolean')throw Error('Explicit Room carry pressure control')
 if(enabled&&(adapter.diagnosticHardwareLinearInputs||adapter.diagnosticPairedCarry))throw Error('Room pressure-only control requires original unpaired baseline')
 const original=adapter.fieldOp
 const counters={mode15:0,mode16:0,other:0}
 if(!enabled)return counters
 adapter.fieldOp=function(out,a,b,mode,k,options={}){
  if(mode!==15&&mode!==16){counters.other++;return original.call(this,out,a,b,mode,k,options)}
  if(options.d?.field.filter!=='linear'||[a,b,options.c,options.e,options.path].some(f=>f&&f.field.filter!=='nearest'))throw Error('Pressure D must be ONLY LINEAR Room carry input')
  if(this.diagnosticHardwareLinearInputs||this.diagnosticPairedCarry)throw Error('Room carry sampling configuration changed')
  if(mode===15)counters.mode15++;else counters.mode16++
  const before=this.diagnosticHardwareLinearInputs;this.diagnosticHardwareLinearInputs=true
  try{return original.call(this,out,a,b,mode,k,options)}finally{this.diagnosticHardwareLinearInputs=before}
 }
 return counters
}

/** Preserve cache retirement even if an unsubmitted dispose quantum fails. */
export function disposeNativeMaterialResources(adapter:Pick<CanonicalPlanAdapter,'runQuantum'|'retireStaticFrontCache'>,dispose:()=>void):void{try{adapter.runQuantum(dispose)}finally{adapter.retireStaticFrontCache()}}
