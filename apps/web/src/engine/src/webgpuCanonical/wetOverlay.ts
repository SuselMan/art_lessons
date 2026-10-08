import { WET_CELL_PX, type PaperWetness } from '../paper/paperWetness'
import { wetOverlayPixels, wetOverlayWorkspace } from '../paper/wetOverlayPixels'
import type { CanonicalWatercolorWebGpu } from './backend'
import type { CanonicalGpuField } from './types'
import type { CanonicalDryPaperView } from './paperPresentation'
export type CanonicalWetSource=Pick<PaperWetness,'peak'|'bounds'|'rasterWetAndPool'>
/** Literal CPU portion of PencilEngine._updateWetTexture: union visible sources,
 * CAP160, zero border, existing 3x3 tent/5x5 body max and Q8 packing.
 * Caller supplies the same local PaperWetness sources/clock, never solver water. */
export function prepareCanonicalWetOverlay(sources:readonly CanonicalWetSource[],now:number) {
 const active=sources.filter(source=>source.peak(now)>.01),bounds=active.map(source=>source.bounds(now)).filter((b):b is NonNullable<typeof b>=>!!b)
 if(!bounds.length)return null
 const b={minCx:Math.min(...bounds.map(b=>b.minCx)),minCy:Math.min(...bounds.map(b=>b.minCy)),maxCx:Math.max(...bounds.map(b=>b.maxCx)),maxCy:Math.max(...bounds.map(b=>b.maxCy))},cols=b.maxCx-b.minCx+1,rows=b.maxCy-b.minCy+1,step=Math.max(1,Math.ceil(Math.max(cols,rows)/160)),inW=Math.ceil(cols/step),inH=Math.ceil(rows/step),w=inW+2,h=inH+2
 const raster=new Float32Array(inW*inH),poolRaster=new Float32Array(inW*inH)
 for(const source of active){const next=source.rasterWetAndPool(b.minCx,b.minCy,step,inW,inH,now);for(let i=0;i<raster.length;i++){raster[i]=Math.max(raster[i],next.wet[i]);poolRaster[i]=Math.max(poolRaster[i],next.pool[i])}}
 const cells=new Float32Array(w*h),pools=new Float32Array(w*h);for(let y=0;y<inH;y++){cells.set(raster.subarray(y*inW,y*inW+inW),(y+1)*w+1);pools.set(poolRaster.subarray(y*inW,y*inW+inW),(y+1)*w+1)}
 const cell=WET_CELL_PX*step,rect=[b.minCx*WET_CELL_PX-cell,b.minCy*WET_CELL_PX-cell,b.minCx*WET_CELL_PX+(inW+1)*cell,b.minCy*WET_CELL_PX+(inH+1)*cell] as const
 return{w,h,rect,rgba:wetOverlayPixels(cells,pools,w,h,wetOverlayWorkspace(w*h))}
}
export class CanonicalWetOverlayTexture {
 private readonly backend:CanonicalWatercolorWebGpu
 private field:CanonicalGpuField|null=null
 constructor(backend:CanonicalWatercolorWebGpu){this.backend=backend}
 /** Run in the same owner encoder scope as presentation. Immutable staging
  * preserves upload→display chronology; old textures retire after completion. */
 encode(encoder:GPUCommandEncoder,sources:readonly CanonicalWetSource[],now:number):{wet:CanonicalDryPaperView['wet'];buffers:GPUBuffer[]} {
  const prepared=prepareCanonicalWetOverlay(sources,now);if(!prepared)return{wet:undefined,buffers:[]}
  if(!this.field||this.field.width!==prepared.w||this.field.height!==prepared.h){if(this.field)this.backend.destroyField(this.field);this.field=this.backend.createField('production local wet overlay',prepared.w,prepared.h,'linear')}
  // Display map keeps raw GL upload rows: row0 = min world Y, no field flip.
  const buffers=this.backend.encodeUploadRgba(encoder,this.field,prepared.rgba,false)
  return{wet:{field:this.field,rect:prepared.rect,kind:'production-overlay'},buffers}
 }
 destroy(){if(this.field)this.backend.destroyField(this.field);this.field=null}
}
