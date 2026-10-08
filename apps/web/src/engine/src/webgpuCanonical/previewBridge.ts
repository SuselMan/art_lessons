import type {CanonicalGpuContext} from './types'
import type {CanonicalFieldBuffer} from './fieldBuffer'
import {CanonicalSingleTileFinish,type CanonicalTileLiveInput} from './finishTile'
import type {CanonicalLayerTile,CanonicalTileScratch} from './tileScratch'
import type {CanonicalWatercolorWebGpu} from './backend'

export type CanonicalPreviewMetadata=Omit<CanonicalTileLiveInput,'inkSmoothPx'>
/** Reads temporary full-resolution reconstructions supplied by the ORIGINAL
 * planner. No field is copied back into the wash, and there is no alpha fade.
 * Invoke synchronously inside runQuantum, retaining the returned uniforms. */
export class CanonicalPlannerPreviewBridge {
 private readonly finish:CanonicalSingleTileFinish
 private readonly tile:CanonicalLayerTile
 constructor(owner:CanonicalWatercolorWebGpu,scratch:CanonicalTileScratch,tile:CanonicalLayerTile){
  this.tile=tile;this.finish=new CanonicalSingleTileFinish(owner,scratch,[tile])
 }
 encodePreview(ctx:CanonicalGpuContext,tile:CanonicalLayerTile,current:{pigment:CanonicalFieldBuffer;color:CanonicalFieldBuffer|null;coverage:CanonicalFieldBuffer},original:CanonicalFieldBuffer,metadata:CanonicalPreviewMetadata):GPUBuffer[]{
  if(tile.buffer!==this.tile.buffer||tile.originX!==this.tile.originX||tile.originY!==this.tile.originY)throw new Error('Native preview supports the configured bounded tile only')
  if(!current.color)throw new Error('Native preview requires the production reconstructed color record')
  return this.finish.encodePreview(ctx.encoder,metadata,{original,pigment:current.pigment,color:current.color,coverage:current.coverage})
 }
}
