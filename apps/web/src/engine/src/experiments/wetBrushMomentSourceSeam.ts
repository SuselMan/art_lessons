import {WetBrushMomentTextureOwner} from './wetBrushMomentTextureOwner'
import type {MomentContactRecipe} from './wetBrushMomentRecipe'
import type {CanonicalWatercolorWebGpu} from '../webgpuCanonical/backend'
import type {CanonicalTileScratch} from '../webgpuCanonical/tileScratch'
import type {CanonicalFieldBuffer} from '../webgpuCanonical/fieldBuffer'
import type {PreparedSourceSegment} from '../webgpuCanonical/sourcePhaseExecutor'
/** DEV insertion seam for ordinary native Room source owner. No production caller.
 * Must run INSIDE current owner scope, immediately after execute(source segment).
 * No delivery/gesture/codec calls. New-model rebase changes film accumulation only
 * when enabled; the parent owner must gate carrier/format before presentation. */
export class WetBrushMomentSourceSeam {
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly operator:WetBrushMomentTextureOwner
 constructor(backend:CanonicalWatercolorWebGpu){this.backend=backend;this.operator=new WetBrushMomentTextureOwner(backend.device)}
 encodeAfterLanding(encoder:GPUCommandEncoder,input:{scratch:CanonicalTileScratch;tile:CanonicalFieldBuffer;segment:PreparedSourceSegment;availableWater:CanonicalFieldBuffer;materialGesture:number;recipe:MomentContactRecipe},enabled=false):{buffers:GPUBuffer[];invalid:GPUBuffer|null;release:()=>void} {
  if(!enabled)return{buffers:[],invalid:null,release:()=>{}}
  const {scratch,tile,segment,availableWater,materialGesture,recipe}=input,e=scratch.peek(tile)
  if(tile.owner!==this.backend||availableWater.owner!==this.backend||!e?.inkLoad||!e.inkColor||!segment.rect)throw Error('DEV moment seam requires actual bounded pigment landing')
  if(segment.film&&(e.filmGesture!==materialGesture||!e.inkBase||!e.strokeInk||!e.colorBase||!e.strokeColor))throw Error('DEV moment seam requires initialized current film')
  const [x,yGl,width,height]=segment.rect,y=tile.height-yGl-height
  if(width*height>512*512)throw Error('DEV moment seam bounded contact ROI exceeded')
  const contact=scratch.pool.acquire(tile.width,tile.height),outP=scratch.pool.acquire(tile.width,tile.height),outC=scratch.pool.acquire(tile.width,tile.height),buffers:GPUBuffer[]=[]
  let released=false;const release=()=>{if(released)return;released=true;for(const field of [contact,outP,outC])scratch.pool.release(field)}
  try{
   contact.clear()
   // Rasterize ONLY the exact current segment coverage commands, not accumulated
   // wash coverage. Existing source vertices/uniforms are immutable and retained.
   const targets={coverage:contact.field,pigment:contact.field,color:contact.field,availableWater:availableWater.field}
   for(const command of segment.commands)if(command.phase==='coverage')buffers.push(...(command.kind==='stamp'?this.backend.encodePreparedStamp(encoder,command.stamp,'coverage',targets):this.backend.encodePreparedRibbon(encoder,command.batch,'coverage',targets)))
   const result=this.operator.encode(encoder,{pigment:e.inkLoad.texture,color:e.inkColor.texture,availableWater:availableWater.texture,contact:contact.texture,outputPigment:outP.texture,outputColor:outC.texture,rect:{x,y,width,height},recipe},true);buffers.push(...result.buffers)
   outP.copyTo(e.inkLoad);outC.copyTo(e.inkColor)
   // Absorb the transported result into the existing film base. Otherwise next
   // production MAX film merge reintroduces old unmoved pigment. Keep epoch.
   if(segment.film){e.inkLoad.copyTo(e.inkBase!);e.inkColor.copyTo(e.colorBase!);e.strokeInk!.clear();e.strokeColor!.clear()}
   return{buffers,invalid:result.invalid,release}
  }catch(error){release();buffers.forEach(b=>b.destroy());throw error}
 }
}
