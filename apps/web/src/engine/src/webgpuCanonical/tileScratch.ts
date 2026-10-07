import type { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalFieldBuffer, CanonicalScratchPool } from './fieldBuffer'

export interface CanonicalRibbonTileScratch {
 original:CanonicalFieldBuffer
 coverage:CanonicalFieldBuffer
 coverageFilm?:CanonicalFieldBuffer
 coverageFilmGesture?:number
 inkLoad:CanonicalFieldBuffer|null
 inkSettled:CanonicalFieldBuffer|null
 inkColor:CanonicalFieldBuffer|null
 colorSettled:CanonicalFieldBuffer|null
 strokeInk:CanonicalFieldBuffer|null
 inkBase:CanonicalFieldBuffer|null
 strokeColor:CanonicalFieldBuffer|null
 colorBase:CanonicalFieldBuffer|null
 inkDry:CanonicalFieldBuffer|null
 colorDry:CanonicalFieldBuffer|null
 foreignSolventLoad?:CanonicalFieldBuffer|null
 solventLoad?:CanonicalFieldBuffer|null
 solventBase?:CanonicalFieldBuffer|null
 strokeSolvent?:CanonicalFieldBuffer|null
 solventGesture?:number
 filmGesture:number
}
const roles=['original','coverage','coverageFilm','inkLoad','inkSettled','inkColor','colorSettled','strokeInk','inkBase','strokeColor','colorBase','inkDry','colorDry','foreignSolventLoad','solventLoad','solventBase','strokeSolvent'] as const
/** Only GPU resource ownership. CPU delivery clocks/trail/brushTravel and
 * recorded gesture metadata remain in the unchanged production preparation. */
export class CanonicalTileScratch {
 readonly pool:CanonicalScratchPool
 readonly needsInk:boolean
 readonly needsColor:boolean
 private readonly tiles=new Map<CanonicalFieldBuffer,CanonicalRibbonTileScratch>()
 constructor(pool:CanonicalScratchPool,needsInk=true,needsColor=true) {this.pool=pool;this.needsInk=needsInk;this.needsColor=needsColor}
 peek(tile:CanonicalFieldBuffer) {return this.tiles.get(tile)??null}
 tileEntries() {return this.tiles.entries()}
 getOrCreate(tile:CanonicalFieldBuffer):CanonicalRibbonTileScratch {
  const found=this.tiles.get(tile);if(found)return found
  const take=()=>this.pool.acquire(tile.width,tile.height)
  const original=take();tile.copyTo(original)
  const coverage=take();coverage.clear()
  const inkLoad=this.needsInk?take():null;if(inkLoad)inkLoad.clear()
  const inkColor=this.needsInk&&this.needsColor?take():null;if(inkColor)inkColor.clear()
  const entry:CanonicalRibbonTileScratch={original,coverage,inkLoad,inkColor,inkSettled:null,colorSettled:null,strokeInk:null,inkBase:null,strokeColor:null,colorBase:null,inkDry:null,colorDry:null,filmGesture:-1}
  this.tiles.set(tile,entry);return entry
 }
 filmBuffers(tile:CanonicalFieldBuffer,materialGesture:number) {
  const e=this.getOrCreate(tile);if(!e.inkLoad)return null
  if(e.filmGesture!==materialGesture){
   e.strokeInk??=this.pool.acquire(tile.width,tile.height);e.inkBase??=this.pool.acquire(tile.width,tile.height);e.strokeInk.clear();e.inkLoad.copyTo(e.inkBase)
   if(e.inkColor){e.strokeColor??=this.pool.acquire(tile.width,tile.height);e.colorBase??=this.pool.acquire(tile.width,tile.height);e.strokeColor.clear();e.inkColor.copyTo(e.colorBase)}
   e.filmGesture=materialGesture
  }
  return{strokeInk:e.strokeInk!,inkBase:e.inkBase!,strokeColor:e.strokeColor,colorBase:e.colorBase}
 }
 solventFilm(tile:CanonicalFieldBuffer,materialGesture:number) {
  const e=this.getOrCreate(tile);if(!e.solventLoad){e.solventLoad=this.pool.acquire(tile.width,tile.height);e.solventLoad.clear()}
  if(e.solventGesture!==materialGesture){e.strokeSolvent??=this.pool.acquire(tile.width,tile.height);e.solventBase??=this.pool.acquire(tile.width,tile.height);e.strokeSolvent.clear();e.solventLoad.copyTo(e.solventBase);e.solventGesture=materialGesture}
  return{load:e.solventLoad,base:e.solventBase!,film:e.strokeSolvent!}
 }
 runningCoverage(tile:CanonicalFieldBuffer,materialGesture:number) {
  const e=this.getOrCreate(tile)
  if(e.coverageFilmGesture!==materialGesture){if(e.coverageFilm)this.pool.release(e.coverageFilm);e.coverageFilm=this.pool.acquire(tile.width,tile.height);e.coverage.copyTo(e.coverageFilm);e.coverageFilmGesture=materialGesture}
  return e.coverageFilm
 }
 releaseRunningCoverage() {for(const e of this.tiles.values()){if(e.coverageFilm)this.pool.release(e.coverageFilm);e.coverageFilm=undefined;e.coverageFilmGesture=undefined}}
 destroy() {for(const e of this.tiles.values()){const unique=new Set<CanonicalFieldBuffer>();for(const role of roles){const b=e[role];if(b)unique.add(b)}for(const b of unique)this.pool.release(b)}this.tiles.clear()}
}
export interface CanonicalLayerTile {originX:number;originY:number;buffer:CanonicalFieldBuffer}
/** Sparse world tiles: no texture is allocated until that tile is touched.
 * The adapter supplies the production tile size; this class never rescales. */
export class CanonicalSparseLayer {
 readonly id:string
 readonly owner:CanonicalWatercolorWebGpu
 readonly tileSize:number
 private readonly tiles=new Map<string,CanonicalLayerTile>()
 constructor(owner:CanonicalWatercolorWebGpu,id:string,tileSize:number) {if(!Number.isInteger(tileSize)||tileSize<=0)throw new Error('Canonical layer needs the production integer tile size');this.owner=owner;this.id=id;this.tileSize=tileSize}
 peekTile(tx:number,ty:number) {return this.tiles.get(`${tx},${ty}`)??null}
 getOrCreateTile(tx:number,ty:number) {
  if(!Number.isInteger(tx)||!Number.isInteger(ty))throw new Error('Canonical tile indices must be integers')
  const key=`${tx},${ty}`,found=this.tiles.get(key);if(found)return found
  const buffer=new CanonicalFieldBuffer(this.owner,this.tileSize,this.tileSize,'linear',`layer ${this.id} tile ${key}`);buffer.clear()
  const tile={originX:tx*this.tileSize,originY:ty*this.tileSize,buffer};this.tiles.set(key,tile);return tile
 }
 tileEntries() {return this.tiles.values()}
 destroy() {for(const tile of this.tiles.values())tile.buffer.destroy();this.tiles.clear()}
}
