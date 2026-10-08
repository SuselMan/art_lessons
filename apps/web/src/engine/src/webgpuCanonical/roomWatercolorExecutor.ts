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
 private retired=false
 private retirement:Promise<void>|null=null
 private readonly ready:Promise<void>
 constructor(backend:CanonicalWatercolorWebGpu,options:{tile:AccumulationBuffer;originX:number;originY:number;layerId:string;generation:number;delivery:Pick<CanonicalStrokeChunkState,'brushTravel'|'wetContacts'>;central:RoomNativeCentralOwner;bridgeMode:'readback'|'canvas';bridgeCanvas:HTMLCanvasElement}) {
  if(options.tile.width!==1024||options.tile.height!==1024||options.originX!==0||options.originY!==0)throw new Error('DEV Room native executor requires one origin-zero1024 tile; no silent GL fallback')
  if(!options.central.isIdle)throw new Error('Seed native Room tile only at a central idle boundary')
  this.backend=backend;this.glTile=options.tile;this.layerId=options.layerId;this.generation=options.generation;this.central=options.central;this.bridgeMode=options.bridgeMode
  this.adapter=new CanonicalPlanAdapter(backend);this.pool=new CanonicalScratchPool(backend);this.fields=new CanonicalPlanFieldOwner(backend)
  this.target={buffer:new CanonicalFieldBuffer(backend,1024,1024,'linear','DEV actual Room watercolor tile'),originX:0,originY:0,contentRect:null}
  this.scratch=new CanonicalStrokeScratchMetadata(new CanonicalTileScratch(this.pool),{brushTravel:[],wetContacts:[]},[this.target])
  this.source=new CanonicalSourcePhaseExecutor(backend,this.scratch.tiles,[this.target],{fieldOp:(out,a,b,mode,k,scissor)=>this.adapter.fieldOp(out,a,b,mode,k,{scissor:scissor?[...scissor]:undefined})})
  this.finish=new CanonicalSingleTileFinish(backend,this.scratch.tiles,[this.target]);this.bridge=new CanonicalRoomTileBridge(backend.device,options.bridgeCanvas,1024,1024)
  this.planner=new CanonicalWatercolorSettlePlan({fieldFor:(w,h,c)=>this.fields.fieldFor(w,h,c),paperWorldSize:()=>({w:backend.paper.texSize[0],h:backend.paper.texSize[1]}),pool:()=>this.pool,supportsFilm:()=>true,ab:()=>({noDiffuse:false,noCarry:false,opDry:false}),shouldPreview:()=>false,passes:()=>this.adapter,uploads:this.adapter.uploads})
  backend.upload(this.target.buffer.field,canonicalTopRowsToGlRows(options.tile.readPixels(),1024,1024));this.ready=backend.whenIdle()
 }
 async seedReady(){await this.ready;this.assertLive()}
 /** All three existing engine pixel paths call THIS SAME method after the
  * unchanged CPU preparer has advanced once. No decoding/preparing here. */
 emitPrepared(chunk:RoomNativePreparedChunk):void {
  this.assertLive()
  if(!this.central.isIdle)throw new Error('Central Room owner must drain before source material mutation')
  assertRoomNativeChunkIdentity(chunk,this.layerId,this.generation)
  if(chunk.metadata.foreignSources?.length)throw new Error('DEV Room native external wash import is not wired; no silent mixed backend')
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
  this.accepted.add(key)
 }
 prepareSettle(input:RoomNativeSettleInput):RoomNativeMaterialJob|null {
  this.assertLive()
  if(!this.central.isIdle)throw new Error('Central Room owner must serialize settle admission')
  const job=this.adapter.runQuantum(()=>this.planner.prepare(this.scratch,[this.target],input.bounds,input.bloom,input.radiusPx,input.waterLevel,input.landedWet,input.standing,input.wetPeak,input.dwellMs,undefined,false,this.scratch.captureMetadata(),true))
  if(!job)return null
  let next=0,disposed=false,finished=false
  const task:RoomNativeMaterialJob={
   step:()=>{this.assertLive();if(disposed||finished)throw new Error('Native Room job already closed');if(next<job.ops.length)this.adapter.runQuantum(()=>job.ops[next++]());return next===job.ops.length},
   finish:()=>{this.assertLive();if(disposed||finished||next!==job.ops.length)throw new Error('Native Room finish before canonical passes complete');this.adapter.runQuantum(ctx=>{job.finish();this.adapter.retain(this.finish.encode(ctx.encoder,{...input,settleComplete:true,settledGesture:this.scratch.gesture,materialGesture:this.scratch.materialGesture,bounds:job.compositeDomain}))});finished=true},
   publish:()=>this.publishWithoutDrain(),
   dispose:()=>{if(disposed)return;disposed=true;this.adapter.runQuantum(()=>job.dispose())},
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
 publishCurrentToGl():Promise<void> {return this.publishWithoutDrain()}
 private async publishWithoutDrain():Promise<void> {
  this.assertLive()
  if(this.bridgeMode==='canvas')await this.bridge.copyByCanvas(this.target.buffer.field,this.glTile,()=>!this.retired)
  else await this.bridge.copyByReadback(this.target.buffer.field,this.glTile,field=>this.backend.readField(field),()=>!this.retired)
 }
 retire(reason:Parameters<RoomNativeCentralOwner['cancel']>[0]):Promise<void> {
  if(this.retirement)return this.retirement
  this.retired=true
  this.retirement=this.release(reason)
  return this.retirement
 }
 private async release(reason:Parameters<RoomNativeCentralOwner['cancel']>[0]) {
  await this.central.cancel(reason);await this.backend.whenIdle()
  this.adapter.disposeCarryOracle();this.planner.destroyTextures();this.scratch.tiles.destroy();this.target.buffer.destroy();this.fields.destroy();this.pool.destroy();this.bridge.destroy()
 }
 private assertLive(){if(this.retired)throw new Error('Native Room tile generation retired')}
}

/** One authoritative identity contract for local, tail/peer and rebuild routes.
 * Rebuild gets a NEW material generation; replay is not a second delivery call
 * within the current source generation. */
export function assertRoomNativeChunkIdentity(chunk:Pick<RoomNativePreparedChunk,'path'|'layerId'|'generation'|'strokeId'|'ordinal'>,layerId:string,generation:number):void {
 if(!['live','append','rebuild'].includes(chunk.path)||chunk.layerId!==layerId||chunk.generation!==generation||!chunk.strokeId||!Number.isInteger(chunk.ordinal)||chunk.ordinal<0)throw new Error('Native Room prepared chunk identity mismatch')
}
