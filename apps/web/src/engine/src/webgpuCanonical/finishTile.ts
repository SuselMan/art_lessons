import type { RibbonProfile } from '../dabs/ribbonProfile'
import { ribbonBristleCombs } from '../dabs/ribbonStrokeMath'
import type { CanonicalWatercolorWebGpu } from './backend'
import { CanonicalComposite } from './render'
import type { CanonicalTileScratch, CanonicalLayerTile } from './tileScratch'
import type { CanonicalCompositeUniforms } from './types'

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
  const p=input.profile
  if(!p.normalizeDeposit||p.compositeInkMode!==9||p.migrate!==0)throw new Error('Native finish supports normalized watercolor inkMode9 with migrate=0 only')
  const tile=this.tile,entry=this.scratch.peek(tile.buffer);if(!entry)throw new Error('Native finish has no source scratch for tile')
  const source=canonicalFinishSources(entry,input.settledGesture,input.materialGesture)
  if(!source.pigment||!source.color)throw new Error('Native finish requires canonical pigment/color records')
  const x0=Math.max(0,Math.floor(input.bounds.minX)-1-tile.originX),y0=Math.max(0,Math.floor(input.bounds.minY)-1-tile.originY)
  const x1=Math.min(tile.buffer.width,Math.ceil(input.bounds.maxX)+1-tile.originX),y1=Math.min(tile.buffer.height,Math.ceil(input.bounds.maxY)+1-tile.originY)
  if(x1<=x0||y1<=y0)return[]
  const v:CanonicalCompositeUniforms={paperOrigin:[tile.originX,-tile.originY||0],paperTexSize:this.backend.paper.texSize,paperScale:[this.backend.paper.scale,this.backend.paper.scale],fieldOffset:input.fieldSeed,inkSmoothPx:0,water:input.water,inkStrength:p.pigmentStrength,spreadPx:input.spreadPx,edgeWander:p.edgeWander,edgeSoft:p.edgeSoft,bristleCombs:ribbonBristleCombs(p,input.bristleRadiusPx),dryContact:p.dryContact,granulation:p.granulation,wetEdge:p.wetEdge,wetEdgeRadiusPx:p.wetEdgeRadiusPx,tideLo:p.tideLo,tideHi:p.tideHi,paperRim:p.paperRim,opacity:input.opacity,pigmentOpacity:p.pigmentOpacity,debugView:input.debugView??0,rectComposite:true,migrate:0}
  return this.composite.encode(encoder,{...this.backend.fields,coverage:source.coverage.field,pigment:source.pigment.field,color:source.color.field},source.original.field,this.backend.paper.field,this.backend.noise,tile.buffer.field,v,[x0,tile.buffer.height-y1,x1-x0,y1-y0])
 }
}
