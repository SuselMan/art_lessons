import type { CanonicalDrawCommand } from '../dabs/canonicalStrokeChunk'
import type { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalTileScratch,type CanonicalLayerTile } from './tileScratch'
import type { CanonicalFieldBuffer } from './fieldBuffer'
import type { CanonicalRasterPhase,CanonicalRasterTargets } from './types'

/** Owner callback retains the existing GL-bottom-up scissor contract and Q8 pass boundary. */
export interface CanonicalSourcePassOwner {
 fieldOp(out:CanonicalFieldBuffer,a:CanonicalFieldBuffer,b:CanonicalFieldBuffer,mode:1|20,k:number,scissor?:readonly[number,number,number,number]):void
}
export interface PreparedSourceSegment {
 commands:readonly CanonicalDrawCommand[]
 /** Production revealRect(tile, compositeBounds), in GL coordinates. Never approximate with nib bounds. */
 rect:readonly[number,number,number,number]|null
 film:boolean
 waterOnly:boolean
}
/** Single bounded tile resource/phase owner. CPU delivery is already prepared exactly once.
 * Must run within backend.encodeOwnerCommands; returned raster buffers live until GPU completion. */
export class CanonicalSourcePhaseExecutor {
 readonly scratch:CanonicalTileScratch
 readonly tile:CanonicalLayerTile
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly passes:CanonicalSourcePassOwner
 private readonly imported=new Set<number>()
 constructor(backend:CanonicalWatercolorWebGpu,scratch:CanonicalTileScratch,tiles:readonly CanonicalLayerTile[],passes:CanonicalSourcePassOwner){
  if(tiles.length!==1)throw new Error('Native source executor supports exactly one bounded tile; multi-tile delivery is not implemented')
  if(tiles[0].buffer.owner!==backend||scratch.pool.owner!==backend)throw new Error('Native source executor owner mismatch')
  this.backend=backend;this.scratch=scratch;this.tile=tiles[0];this.passes=passes
 }
 /** Donor must have been replayed from unique recorded foreign chunks through the same source protocol. */
 importForeign(gesture:number,donor:{coverage:CanonicalFieldBuffer;solventLoad?:CanonicalFieldBuffer|null}):void {
  if(this.imported.has(gesture))return
  const tile=this.tile.buffer,e=this.scratch.getOrCreate(tile)
  if(donor.coverage.width!==tile.width||donor.coverage.height!==tile.height||donor.coverage.owner!==this.backend)throw new Error('Foreign donor tile mismatch')
  const temp=this.scratch.pool.acquire(tile.width,tile.height)
  try{
   this.passes.fieldOp(temp,e.coverage,donor.coverage,20,0);temp.copyTo(e.coverage)
   if(donor.solventLoad){
    if(!e.foreignSolventLoad){e.foreignSolventLoad=this.scratch.pool.acquire(tile.width,tile.height);e.foreignSolventLoad.clear()}
    this.passes.fieldOp(temp,e.foreignSolventLoad,donor.solventLoad,1,1);temp.copyTo(e.foreignSolventLoad)
   }
   this.imported.add(gesture)
  }finally{this.scratch.pool.release(temp)}
 }
 execute(encoder:GPUCommandEncoder,segment:PreparedSourceSegment,materialGesture:number):GPUBuffer[]{
  const rank={coverage:0,solvent:1,pigment:2,color:3,halo:4};let previous=-1
  for(const command of segment.commands){
   if(rank[command.phase]<previous)throw new Error('Prepared commands contain multiple segments or reordered phases')
   if(segment.waterOnly&&rank[command.phase]>1)throw new Error('Water-only segment must not contain pigment/color/halo commands')
   previous=rank[command.phase]
  }
  const tile=this.tile.buffer,e=this.scratch.getOrCreate(tile),transient:GPUBuffer[]=[]
  this.scratch.runningCoverage(tile,materialGesture)
  const fb=segment.film&&e.inkLoad?this.scratch.filmBuffers(tile,materialGesture):null
  let solvent:ReturnType<CanonicalTileScratch['solventFilm']>|undefined
  let solventLanded=false,materialStarted=false
  const landSolvent=()=>{
   if(!solvent||solventLanded)return
   if(segment.rect)this.passes.fieldOp(solvent.load,solvent.base,solvent.film,1,1,segment.rect)
   solventLanded=true
  }
  const emit=(command:CanonicalDrawCommand,phase:CanonicalRasterPhase,targets:CanonicalRasterTargets)=>{
   if(command.kind==='stamp')transient.push(...this.backend.encodePreparedStamp(encoder,command.stamp,phase,targets))
   else transient.push(...this.backend.encodePreparedRibbon(encoder,command.batch,phase,targets))
  }
  for(const command of segment.commands){
   const phase=command.phase
   if(phase==='coverage'){
    if(materialStarted||solvent)throw new Error('Prepared commands contain multiple segments; preserve per-segment landing boundaries')
    emit(command,'coverage',{coverage:e.coverage.field,pigment:e.coverage.field,color:e.coverage.field});continue
   }
   if(phase==='solvent'){
    if(materialStarted)throw new Error('Solvent must precede pigment/color')
    solvent??=this.scratch.solventFilm(tile,materialGesture)
    emit(command,'pigment',{coverage:e.coverage.field,pigment:solvent.film.field,color:solvent.film.field});continue
   }
   landSolvent();materialStarted=true
   if(segment.waterOnly)throw new Error('Water-only segment must not contain pigment/color/halo commands')
   const pigment=fb?.strokeInk??e.inkLoad,color=fb?.strokeColor??e.inkColor
   if(phase==='color'&&!color||phase!=='color'&&!pigment)throw new Error('Prepared material command has no corresponding scratch target')
   emit(command,phase==='color'?'color':'pigment',{coverage:e.coverage.field,pigment:(pigment??color!).field,color:(color??pigment!).field})
  }
  landSolvent()
  if(!segment.waterOnly&&fb&&e.inkLoad&&segment.rect){
   this.passes.fieldOp(e.inkLoad,fb.inkBase,fb.strokeInk,1,1,segment.rect)
   if(e.inkColor&&fb.colorBase&&fb.strokeColor)this.passes.fieldOp(e.inkColor,fb.colorBase,fb.strokeColor,1,1,segment.rect)
  }
  return transient
 }
}
