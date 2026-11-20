import type{BrushDescriptor,Dab}from'@grafetto/shared'
import type{ILayerBuffer,PaintTarget}from'../buffers/ILayerBuffer'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{RibbonStrokeScratch,RibbonTileScratch}from'../buffers/RibbonStrokeScratch'
import type{RequestWashBatch}from'./RequestWashBatch'
export function isGridRenderableDab137(dab:Dab):boolean{return Number.isFinite(dab.size)&&dab.size>0}
export type GridWashReason='history'|'prefix'|'resource'|'context'
export interface GridWashBinding{readonly layerId:string;readonly userId:string;readonly strokeId:string;readonly targetGeneration:number;readonly prefixKey:string;readonly begin:{readonly kind:'canonical';readonly firstOpId:string;readonly seq:number}|{readonly kind:'optimistic';readonly logRevision:number}}
export interface GridWashNotReady{kind:'notReady';reason:GridWashReason;retryKey:string;detail?:'geometry';resource?:{requiredBytes:number;limitBytes:number;activeBytes:number;unavailable:'exceeds-ceiling'|'busy'}}
export interface GridWashLease{assertCurrent():void;release():void}
export type GridBeginResult={kind:'ready';view:GridWashLease&{readonly binding:GridWashBinding;readonly tiles:readonly PaintTarget[]}}|GridWashNotReady
export type GridDestinationPinsResult={kind:'ready';lease:GridWashLease}|GridWashNotReady
export interface GridWashRuntime{readonly binding:GridWashBinding}
export type GridWashPrepareResult={kind:'ready'}|GridWashNotReady
export type GridWashPaintResult={kind:'painted';acceptedDabs:number}|(GridWashNotReady&{acceptedDabs:number})
export interface GridWashOwnerInfo{readonly target:ILayerBuffer;readonly binding:GridWashBinding;readonly bytes:number;readonly acceptedDabs:number}
export interface BorrowedGridWash{readonly kernel:Pick<RequestWashBatch,'assertPrepared'|'captureCurrent'|'transfer'>;present(tile:PaintTarget,bounds:GridBounds,entry:RibbonTileScratch,brush:BrushDescriptor,opacity:number):void;release():void}
export interface GridBounds{minX:number;minY:number;maxX:number;maxY:number}
/** NEW active Grid working-set limit, distinct from texture caches/idle pools. */
export const GRID_WASH_ACTIVE_BYTES=16*1024*1024
export const GRID_WASH_TRANSIENT_BYTES=2*512*512*4 // sampled source reused as previous coverage + request
export class GridWashBudget{
 private active=0
 get bytes():number{return this.active}
 reserve(bytes:number):(()=>void)|undefined{
  if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('Invalid Grid working-set reservation')
  if(bytes>GRID_WASH_ACTIVE_BYTES-this.active)return undefined
  this.active+=bytes;let live=true
  return()=>{if(live){live=false;this.active-=bytes}}
 }
}
export function gridGestureKey137(b:GridWashBinding):string{return'grid137:'+JSON.stringify([b.userId,b.layerId,b.strokeId,b.targetGeneration])}
export function gridBindingKey(b:GridWashBinding):string{return JSON.stringify([b.layerId,b.userId,b.strokeId,b.targetGeneration,b.prefixKey,b.begin.kind,b.begin.kind==='canonical'?b.begin.firstOpId:b.begin.logRevision,b.begin.kind==='canonical'?b.begin.seq:null])}
export function gridNotReady(binding:GridWashBinding,reason:GridWashReason):GridWashNotReady{return{kind:'notReady',reason,retryKey:binding.prefixKey+':'+reason}}
export function gridCapacity(binding:GridWashBinding,budget:GridWashBudget,requiredBytes:number):GridWashNotReady{return{...gridNotReady(binding,'resource'),resource:{requiredBytes,limitBytes:GRID_WASH_ACTIVE_BYTES,activeBytes:budget.bytes,unavailable:requiredBytes>GRID_WASH_ACTIVE_BYTES?'exceeds-ceiling':'busy'}}}
export function gridGeometryNotReady(binding:GridWashBinding):GridWashNotReady{return{kind:'notReady',reason:'resource',retryKey:binding.prefixKey+':geometry-limit',detail:'geometry'}}
export interface GridTilePlan{originX:number;originY:number;width:number;height:number}
function planKey(t:GridTilePlan):string{return[t.originX,t.originY,t.width,t.height].join(':')}
export function gridDestinationPlan(bounds:GridBounds,size:{w:number;h:number}):GridTilePlan[]|undefined{
 if(![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY,size.w,size.h].every(Number.isFinite)||!Number.isSafeInteger(size.w)||!Number.isSafeInteger(size.h)||size.w<=0||size.h<=0)throw Error('Invalid Grid destination plan')
 const x0=Math.floor(bounds.minX/size.w),y0=Math.floor(bounds.minY/size.h),x1=Math.ceil(bounds.maxX/size.w),y1=Math.ceil(bounds.maxY/size.h),count=(x1-x0)*(y1-y0)
 if(!Number.isSafeInteger(count)||count<0||count*size.w*size.h*12>GRID_WASH_ACTIVE_BYTES)return undefined
 const result:GridTilePlan[]=[];for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)result.push({originX:x*size.w,originY:y*size.h,width:size.w,height:size.h});return result
}
function tileKey(t:PaintTarget):string{return[t.originX,t.originY,t.buffer.width,t.buffer.height].join(':')}
function tileBytes(t:PaintTarget):number{
 if(![t.originX,t.originY,t.buffer.width,t.buffer.height].every(Number.isSafeInteger)||t.buffer.width<=0||t.buffer.height<=0)throw Error('Invalid Grid BEGIN tile geometry')
 const bytes=t.buffer.width*t.buffer.height*12;if(!Number.isSafeInteger(bytes))throw Error('Invalid Grid BEGIN tile byte count');return bytes
}
interface GridStoredTile{tile:PaintTarget;entry:RibbonTileScratch;segment?:number}
/** One wetGestures-owned scratch; metadata maps world rectangles, not another owner registry. */
export class GridWashOwner{
 readonly binding:GridWashBinding
 readonly target:ILayerBuffer
 readonly scratch:RibbonStrokeScratch
 readonly opacity:number
 acceptedDabs=0
 private live=true
 private segment=0
 private readonly entries=new Map<string,GridStoredTile>()
 private readonly source:GridStoredTile[]=[]
 private readonly pins:GridWashLease[]=[]
 private readonly pinned=new Set<AccumulationBuffer>()
 private readonly claims:(()=>void)[]=[]
 private readonly planned=new Set<string>()
 private claimed=0
 private readonly budget:GridWashBudget
 private constructor(target:ILayerBuffer,binding:GridWashBinding,scratch:RibbonStrokeScratch,opacity:number,budget:GridWashBudget){this.target=target;this.binding=structuredClone(binding);this.scratch=scratch;this.opacity=opacity;this.budget=budget}
 static capture(target:ILayerBuffer,binding:GridWashBinding,view:Extract<GridBeginResult,{kind:'ready'}>['view'],opacity:number,budget:GridWashBudget,create:()=>RibbonStrokeScratch,destinations:readonly GridTilePlan[]=[]):GridWashOwner|undefined{
  if(gridBindingKey(binding)!==gridBindingKey(view.binding))throw Error('Grid BEGIN binding mismatch')
  let bytes=GRID_WASH_TRANSIENT_BYTES;const keys=new Set<string>()
  for(const tile of view.tiles){const key=tileKey(tile);if(keys.has(key))throw Error('Duplicate Grid BEGIN tile');keys.add(key);bytes+=tileBytes(tile)}
  for(const tile of destinations){const key=planKey(tile);if(!keys.has(key)){bytes+=tile.width*tile.height*12;keys.add(key)}}
  const release=budget.reserve(bytes);if(!release)return undefined
  let scratch:RibbonStrokeScratch|undefined,owner:GridWashOwner|undefined
  try{
   view.assertCurrent();scratch=create();owner=new GridWashOwner(target,binding,scratch,opacity,budget);owner.claims.push(release);owner.claimed=bytes;for(const key of keys)owner.planned.add(key)
   for(const tile of view.tiles){view.assertCurrent();const entry=scratch.getOrCreate(tile.buffer);scratch.brushCeiling(tile.buffer);const stored={tile:{...tile},entry};owner.entries.set(tileKey(tile),stored);owner.source.push(stored)}
   view.assertCurrent();return owner
  }catch(error){if(owner){try{owner.retire()}catch{/* Preserve primary. */}}else{try{scratch?.destroy()}catch{/* Preserve primary. */}release()}throw error}
 }
 static requiredBytes(tiles:readonly PaintTarget[],destinations:readonly GridTilePlan[]):number{let bytes=GRID_WASH_TRANSIENT_BYTES;const keys=new Set<string>();for(const tile of tiles){const key=tileKey(tile);if(keys.has(key))throw Error('Duplicate Grid BEGIN tile');keys.add(key);bytes+=tileBytes(tile)}for(const t of destinations){const key=planKey(t);if(!keys.has(key)){keys.add(key);bytes+=t.width*t.height*12}}return bytes}
 planDestinations(plan:readonly GridTilePlan[]):GridWashPrepareResult{
  let delta=0;const keys=new Set<string>();for(const tile of plan){const key=planKey(tile);if(!this.planned.has(key)&&!keys.has(key)){keys.add(key);delta+=tile.width*tile.height*12}}
  if(!delta)return{kind:'ready'};const release=this.budget.reserve(delta);if(!release)return gridCapacity(this.binding,this.budget,this.claimed+delta)
  this.claims.push(release);this.claimed+=delta;for(const key of keys)this.planned.add(key);return{kind:'ready'}
 }
 get bytes():number{return this.claimed}
 matches(target:ILayerBuffer,binding:GridWashBinding):boolean{return this.live&&this.target===target&&gridBindingKey(this.binding)===gridBindingKey(binding)}
 info():GridWashOwnerInfo{return{target:this.target,binding:this.binding,bytes:this.claimed,acceptedDabs:this.acceptedDabs}}
 assertCurrent():void{if(!this.live)throw Error('Grid owner retired');for(const pin of this.pins)pin.assertCurrent()}
 /** All new destinations are admitted BEFORE pool calls; no source membership grows here. */
 admitDestinations(tiles:readonly PaintTarget[],pin:(fresh:readonly PaintTarget[])=>GridDestinationPinsResult):GridWashPrepareResult{
  this.assertCurrent();const unique=new Map<string,PaintTarget>();for(const tile of tiles){tileBytes(tile);unique.set(tileKey(tile),tile)}
  let delta=0;for(const[key,tile]of unique)if(!this.planned.has(key))delta+=tileBytes(tile)
  const release=delta?this.budget.reserve(delta):()=>{};if(!release)return gridCapacity(this.binding,this.budget,this.claimed+delta)
  const fresh=[...unique.values()].filter(t=>!this.pinned.has(t.buffer))
  let lease:GridWashLease|undefined,retained=false,failed=false
  try{
   if(fresh.length){const result=pin(fresh);if(result.kind==='notReady'){release();return result}lease=result.lease;lease.assertCurrent()}
   // Claim remains conservative on unexpected later allocation failure; any
   // published scratch entries remain owned until retire, never undercharged.
   if(delta){this.claims.push(release);this.claimed+=delta}retained=true;for(const key of unique.keys())this.planned.add(key)
   for(const[key,tile]of unique)if(!this.entries.has(key)){const entry=this.scratch.getOrCreate(tile.buffer);this.scratch.brushCeiling(tile.buffer);this.entries.set(key,{tile:{...tile},entry})}
   if(lease){this.pins.push(lease);for(const tile of fresh)this.pinned.add(tile.buffer);lease=undefined}
   this.assertCurrent();return{kind:'ready'}
  }catch(error){failed=true;throw error}finally{if(!retained)release();try{lease?.release()}catch(error){if(!failed)throw error}}
 }
 resetDestinations():void{
  if(!this.live)return;let failed=false,first:unknown
  // Destination epoch may already be stale; release is idempotent, never assert here.
  for(const pin of this.pins)try{pin.release()}catch(error){if(!failed){failed=true;first=error}}
  this.pins.length=0;this.pinned.clear();this.segment++
  if(failed)throw first
 }
 markDestinationBoundary():void{this.assertCurrent();this.segment++}
 destinationEntry(tile:PaintTarget):RibbonTileScratch{
  this.assertCurrent();const stored=this.entries.get(tileKey(tile));if(!stored)throw Error('Grid destination was not admitted')
  if(stored.segment!==this.segment){
   if(!stored.entry.inkLoad)throw Error('Grid destination baseline missing')
   tile.buffer.copyTo(stored.entry.inkLoad);stored.entry.coverage.clear();stored.segment=this.segment
  }
  return stored.entry
 }
 entry(tile:PaintTarget):RibbonTileScratch{this.assertCurrent();const stored=this.entries.get(tileKey(tile));if(!stored)throw Error('Grid destination was not admitted');return stored.entry}
 /** Fixed world membership: later B/new destination tiles NEVER enter BEGIN. */
 sampleTexel(x:number,y:number,dest:AccumulationBuffer):void{
  this.assertCurrent();if(this.source.some(s=>s.entry.original.texture===dest.texture))throw Error('Grid source aliases destination');dest.clear();const px=Math.floor(x),py=Math.floor(y)
  for(const{tile,entry}of this.source){if(px<tile.originX||py<tile.originY||px>=tile.originX+tile.buffer.width||py>=tile.originY+tile.buffer.height)continue
   entry.original.copyRegionInto(dest,px-tile.originX,tile.buffer.height-1-(py-tile.originY),0,dest.height-1,1,1);return}
 }
 retire(lost=false):void{
  if(!this.live)return;this.live=false;let failed=false,first:unknown
  const attempt=(work:()=>void)=>{try{work()}catch(error){if(!failed){failed=true;first=error}}}
  attempt(()=>{if(lost)this.scratch.forget();else this.scratch.destroy()})
  for(const pin of this.pins)attempt(()=>pin.release());this.pins.length=0;this.pinned.clear();this.entries.clear();this.planned.clear();this.source.length=0
  // Ownership transfer to SAME existing pool idle baseline, not GPU-free claim.
  for(const release of this.claims)attempt(release);this.claims.length=0;this.claimed=0
  if(failed)throw first
 }
}
