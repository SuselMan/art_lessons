import type { RibbonProfile } from '../dabs/ribbonProfile'
import { ribbonBristleCombs } from '../dabs/ribbonStrokeMath'
import type { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalComposite } from './render'
import type { CanonicalTileScratch, CanonicalLayerTile } from './tileScratch'
import type { CanonicalCompositeUniforms } from './types'
import type { CanonicalFieldBuffer } from './fieldBuffer'

export interface CanonicalTileFinishInput {
 /** The canonical planner's job.finish() has already landed all its fields. */
 settleComplete:true
 profile:RibbonProfile
 opacity:number
 fieldSeed:readonly[number,number]
 spreadPx:number
 water:number
 bristleRadiusPx:number
 settledGesture:number
 materialGesture:number
 bounds:{minX:number;minY:number;maxX:number;maxY:number}
 debugView?:number
}
/** Same source selection as PencilEngine._finishRibbonStroke. Settled base
 * records are NOT substitute final images: planner owns inkSettled/colorSettled,
 * and publishes its final target through inkDry/colorDry or inkLoad/inkColor. */
export function canonicalFinishSources(entry:NonNullable<ReturnType<CanonicalTileScratch['peek']>>,settledGesture:number,materialGesture:number) {
 const runningFilm=entry.filmGesture!==settledGesture&&entry.filmGesture===materialGesture&&!!entry.strokeInk
 return {original:entry.original,coverage:entry.coverage,pigment:runningFilm?entry.inkLoad:entry.inkDry??entry.inkLoad,color:runningFilm?entry.inkColor:entry.colorDry??entry.inkColor,runningFilm}
}
export type CanonicalTileLiveInput=Omit<CanonicalTileFinishInput,'settleComplete'|'settledGesture'|'materialGesture'>&{inkSmoothPx:number}
export class CanonicalSingleTileFinish {
 private readonly backend:CanonicalWatercolorWebGpu
 private readonly scratch:CanonicalTileScratch
 readonly tile:CanonicalLayerTile
 private readonly composite:CanonicalComposite
 constructor(backend:CanonicalWatercolorWebGpu,scratch:CanonicalTileScratch,tiles:readonly CanonicalLayerTile[]) {
  if(tiles.length!==1)throw new Error('Native finish supports one bounded tile; multi-tile stitching is unsupported')
  if(tiles[0].buffer.owner!==backend||scratch.pool.owner!==backend)throw new Error('Native finish GPU owner mismatch')
  this.backend=backend;this.scratch=scratch;this.tile=tiles[0];this.composite=new CanonicalComposite(backend.device)
 }
 /** Encode after job.finish in the same owner scope. Caller submits once and
  * frees returned uniforms after GPU completion; caller owns film release. */
 encode(encoder:GPUCommandEncoder,input:CanonicalTileFinishInput):GPUBuffer[] {
  if(input.settleComplete!==true)throw new Error('Native finish requires completed canonical settle')
  const tile=this.tile,entry=this.scratch.peek(tile.buffer);if(!entry)throw new Error('Native finish has no source scratch for tile')
  const source=canonicalFinishSources(entry,input.settledGesture,input.materialGesture)
  return this.encodeSelected(encoder,input,source,0)
 }
 /** Production live composite: read the current landed inkLoad/inkColor,
  * preserving the caller's actual dab-spacing smoothing before settlement. */
 encodeLive(encoder:GPUCommandEncoder,input:CanonicalTileLiveInput):GPUBuffer[] {
  const entry=this.scratch.peek(this.tile.buffer);if(!entry)throw new Error('Native live composite has no source scratch')
  return this.encodeSelected(encoder,input,{original:entry.original,coverage:entry.coverage,pigment:entry.inkLoad,color:entry.inkColor},input.inkSmoothPx)
 }
 /** Planner preview fields are temporary reconstructions, never persisted wash records. */
 encodePreview(encoder:GPUCommandEncoder,input:Omit<CanonicalTileLiveInput,'inkSmoothPx'>,source:{original:CanonicalFieldBuffer;coverage:CanonicalFieldBuffer;pigment:CanonicalFieldBuffer;color:CanonicalFieldBuffer}):GPUBuffer[] {
  for(const field of Object.values(source))if(field===this.tile.buffer||field.owner!==this.backend||field.width!==this.tile.buffer.width||field.height!==this.tile.buffer.height)throw new Error('Native planner preview tile/owner mismatch')
  return this.encodeSelected(encoder,{...input,inkSmoothPx:0},source,0)
 }
 private encodeSelected(encoder:GPUCommandEncoder,input:CanonicalTileLiveInput|CanonicalTileFinishInput,source:Omit<ReturnType<typeof canonicalFinishSources>,'runningFilm'>,inkSmoothPx:number):GPUBuffer[] {
  const p=input.profile,tile=this.tile
  if(!p.normalizeDeposit||p.compositeInkMode!==9||p.migrate!==0)throw new Error('Native composite supports normalized watercolor inkMode9 with migrate=0 only')
  if(!source.pigment||!source.color)throw new Error('Native composite requires canonical pigment/color records')
  if(!Number.isFinite(inkSmoothPx)||inkSmoothPx<0)throw new Error('Native live composite needs finite nonnegative supplied smoothing')
  const x0=Math.max(0,Math.floor(input.bounds.minX)-1-tile.originX),y0=Math.max(0,Math.floor(input.bounds.minY)-1-tile.originY)
  const x1=Math.min(tile.buffer.width,Math.ceil(input.bounds.maxX)+1-tile.originX),y1=Math.min(tile.buffer.height,Math.ceil(input.bounds.maxY)+1-tile.originY)
  if(x1<=x0||y1<=y0)return[]
  const v:CanonicalCompositeUniforms={paperOrigin:[tile.originX,-tile.originY||0],paperTexSize:this.backend.paper.texSize,paperScale:[this.backend.paper.scale,this.backend.paper.scale],fieldOffset:input.fieldSeed,inkSmoothPx,water:input.water,inkStrength:p.pigmentStrength,spreadPx:input.spreadPx,edgeWander:p.edgeWander,edgeSoft:p.edgeSoft,bristleCombs:ribbonBristleCombs(p,input.bristleRadiusPx),dryContact:p.dryContact,granulation:p.granulation,wetEdge:p.wetEdge,wetEdgeRadiusPx:p.wetEdgeRadiusPx,tideLo:p.tideLo,tideHi:p.tideHi,paperRim:p.paperRim,opacity:input.opacity,pigmentOpacity:p.pigmentOpacity,debugView:input.debugView??0,rectComposite:true,migrate:0}
  return this.composite.encode(encoder,{coverage:source.coverage.field,pigment:source.pigment.field,color:source.color.field},source.original.field,this.backend.paper.field,this.backend.noise,tile.buffer.field,v,[x0,tile.buffer.height-y1,x1-x0,y1-y0])
 }
}
