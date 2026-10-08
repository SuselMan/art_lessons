import type { CanonicalStrokeChunkState } from '../dabs/canonicalStrokeChunk'
import type { WaterSource } from '../watercolor/foreignWater'
import type { SettlePlanMetadata,SettlePlanScratch,SettlePlanRect } from '../watercolor/SettlePlanContracts'
import { CanonicalTileScratch,type CanonicalLayerTile } from './tileScratch'
import type { CanonicalFieldBuffer } from './fieldBuffer'

export interface CanonicalScratchBounds {minX:number;minY:number;maxX:number;maxY:number}
/** Keep full production finish payload supplied by the preparer; no guessed constants. */
export interface CanonicalFinishContext {
 bounds:CanonicalScratchBounds;radiusPx:number;dwellMs:number;wetPeak:number;landedWet:number
 [key:string]:unknown
}
export interface CanonicalDryContext extends NonNullable<SettlePlanMetadata['dryCtx']> {[key:string]:unknown}
/** Exact production _revealRect: top-down world -> bottom-up GL scissor. */
export function canonicalSourceRevealRect(tile:CanonicalLayerTile,bounds:CanonicalScratchBounds):SettlePlanRect|null {
 const {buffer,originX,originY}=tile
 const x0=Math.max(Math.floor(bounds.minX),originX),y0=Math.max(Math.floor(bounds.minY),originY)
 const x1=Math.min(Math.ceil(bounds.maxX),originX+buffer.width),y1=Math.min(Math.ceil(bounds.maxY),originY+buffer.height)
 if(x1<=x0||y1<=y0)return null
 return[x0-originX,buffer.height-(y1-originY),x1-x0,y1-y0]
}
/** CPU metadata + real native resource owner, structurally satisfies generic settle planner.
 * Delivery formulas remain in the unchanged CPU preparer; GPU source phases remain separate. */
export class CanonicalStrokeScratchMetadata<D extends Pick<CanonicalStrokeChunkState,'brushTravel'|'wetContacts'> = CanonicalStrokeChunkState> implements SettlePlanScratch<CanonicalFieldBuffer> {
 readonly tiles:CanonicalTileScratch
 readonly delivery:D
 readonly tile:CanonicalLayerTile
 gesture=0
 private material:number|null=null
 readonly paints=new Set<string>()
 foreignSources:WaterSource[]|null=null
 dryCtx:CanonicalDryContext|null=null
 trackRunningSource=false
 runningSourceCommands:Array<()=>void>=[]
 pigmentInputsKnownZero=true
 private storage:CanonicalScratchBounds|null|undefined=null
 private finish:CanonicalFinishContext|null=null
 constructor(tiles:CanonicalTileScratch,delivery:D,boundedTiles:readonly CanonicalLayerTile[]){
  if(boundedTiles.length!==1)throw new Error('Native scratch metadata requires exactly one bounded tile')
  if(boundedTiles[0].buffer.owner!==tiles.pool.owner)throw new Error('Native scratch metadata owner mismatch')
  this.tiles=tiles;this.delivery=delivery;this.tile=boundedTiles[0]
 }
 get materialGesture(){return this.material??this.gesture}
 set materialGesture(gesture:number){this.activateMaterialFilm(gesture)}
 get brushTravel(){return this.delivery.brushTravel}
 get wetContacts(){return this.delivery.wetContacts}
 get storageBounds(){return this.storage===undefined?undefined:this.storage===null?null:{...this.storage}}
 get finishContext(){return this.finish}
 activateMaterialFilm(gesture:number):void {
  if(!Number.isInteger(gesture)||gesture<0||gesture>this.gesture||this.material!==null&&gesture<this.material)throw new Error('Watercolor material film is outside chronological input order')
  this.material=gesture
 }
 /** Owner invokes production CPU reset; composite caches must not be silently discarded. */
 beginStroke(resetDelivery:()=>void):void {
  resetDelivery();this.gesture++;this.foreignSources=null;this.finish=null
 }
 newFilm():void {this.delivery.brushTravel=[];this.gesture++}
 peek(buffer:CanonicalFieldBuffer){this.assertTile(buffer);return this.tiles.peek(buffer)}
 tileEntries(){return this.tiles.tileEntries()}
 getOrCreate(buffer:CanonicalFieldBuffer){this.assertTile(buffer);return this.tiles.getOrCreate(buffer)}
 runningCoverage(buffer:CanonicalFieldBuffer){this.assertTile(buffer);return this.trackRunningSource?this.tiles.runningCoverage(buffer,this.materialGesture):undefined}
 releaseRunningCoverage(forget=false):void {
  if(forget)throw new Error('Native lost-device forget is unsupported; retire the entire GPU owner')
  this.tiles.releaseRunningCoverage();this.trackRunningSource=false;this.runningSourceCommands=[]
 }
 noteStorageBounds(bounds:CanonicalScratchBounds):void {
  const old=this.storage;if(old===undefined)return
  this.storage=old?{minX:Math.min(old.minX,bounds.minX),minY:Math.min(old.minY,bounds.minY),maxX:Math.max(old.maxX,bounds.maxX),maxY:Math.max(old.maxY,bounds.maxY)}:{...bounds}
 }
 /** Restoration lacking exterior-zero proof must retain the whole extent, as production. */
 markStorageUnknown():void {this.storage=undefined;this.pigmentInputsKnownZero=false}
 noteFinish(ctx:CanonicalFinishContext):void {
  this.noteStorageBounds(ctx.bounds)
  const previous=this.finish
  if(!previous){this.finish=ctx;return}
  previous.dwellMs=Math.max(previous.dwellMs,ctx.dwellMs)
  previous.bounds={minX:Math.min(previous.bounds.minX,ctx.bounds.minX),minY:Math.min(previous.bounds.minY,ctx.bounds.minY),maxX:Math.max(previous.bounds.maxX,ctx.bounds.maxX),maxY:Math.max(previous.bounds.maxY,ctx.bounds.maxY)}
  previous.radiusPx=Math.max(previous.radiusPx,ctx.radiusPx);previous.wetPeak=Math.max(previous.wetPeak,ctx.wetPeak)
 }
 /** Capture owned CPU request metadata; later input cannot rewrite a deferred settle's lists. */
 captureMetadata():SettlePlanMetadata {
  const dry:CanonicalDryContext|null=this.dryCtx?{...structuredClone({...this.dryCtx,target:undefined}),target:this.dryCtx.target}:null
  return{gesture:this.gesture,paints:new Set(this.paints),brushTravel:this.brushTravel.map(d=>({...d})),wetContacts:this.wetContacts.map(d=>({...d})),foreignSources:this.foreignSources?.map(source=>({gesture:source.gesture,footprints:source.footprints.map(d=>({...d})),chunks:source.chunks?.map(chunk=>({...chunk,color:[...chunk.color],seed:[...chunk.seed],dabs:chunk.dabs.map(d=>({...d}))}))}))??null,dryCtx:dry}
 }
 captureFinishMetadata():SettlePlanMetadata&{finish:CanonicalFinishContext|null} {
  return{...this.captureMetadata(),finish:this.finish?{...structuredClone({...this.finish,target:undefined}),target:this.finish.target}:null}
 }
 recordRunningSource(command:()=>void):void {if(this.trackRunningSource)this.runningSourceCommands.push(command)}
 private assertTile(buffer:CanonicalFieldBuffer){if(buffer!==this.tile.buffer)throw new Error('Native scratch metadata does not support tile fanout')}
}
