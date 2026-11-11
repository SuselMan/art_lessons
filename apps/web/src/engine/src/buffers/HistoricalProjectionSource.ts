import {AccumulationBuffer} from './AccumulationBuffer'
import type {ILayerBuffer,PaintTarget} from './ILayerBuffer'
import type {WorldRect} from './tileMath'

/** Immutable projected RGBA only. Never a writable replay/paint destination. */
export type HistoricalProjectionSource=Pick<ILayerBuffer,'resolveVisible'|'allResident'|'destroy'>
export interface CompactedHistoricalLayer {buffer:HistoricalProjectionSource;bytes:number}
type Allocate=(source:AccumulationBuffer,width:number,height:number)=>AccumulationBuffer
interface Plan {tile:PaintTarget;rect:WorldRect;width:number;height:number}
const integer=(value:number)=>Number.isSafeInteger(value)
const overlaps=(a:WorldRect,b:WorldRect)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minY<b.maxY&&a.maxY>b.minY

/** Full canonical replay must have finished before this call. Copies EVERY
 * conservative occupied texel, never a request ROI. Does not consume fresh.
 * null means no storage saving: caller retains the original readonly source.
 * A failure retires only copies allocated here, preserving even undefined.
 * Uses existing raw GPU copy; no readback, resampling, GL queries or new bank.
 * Like copyRegionInto, leaves framebuffer/texture bindings for the next pass
 * to establish. Full fresh and copies temporarily coexist, NOT a peak cap.
 */
export function compactHistoricalLayer(
 fresh:Pick<ILayerBuffer,'allResident'>,
 allocate:Allocate=(source,width,height)=>new AccumulationBuffer(source.gl,width,height),
):CompactedHistoricalLayer|null {
 const tiles=fresh.allResident(),plans:Plan[]=[]
 let fullBytes=0,bytes=0
 for(const tile of tiles){
  const {buffer,originX,originY,contentRect:c}=tile,w=buffer.width,h=buffer.height
  if(![originX,originY,w,h,originX+w,originY+h,buffer.baseBytes].every(integer)||w<=0||h<=0||buffer.baseBytes<w*h*4)throw Error('Invalid historical tile geometry')
  fullBytes+=buffer.baseBytes
  if(!integer(fullBytes))throw Error('Historical source byte overflow')
  if(!c)continue
  if(![c.minX,c.minY,c.maxX,c.maxY].every(integer)||c.maxX<c.minX||c.maxY<c.minY)throw Error('Invalid historical content bounds')
  const rect={minX:Math.max(originX,c.minX),minY:Math.max(originY,c.minY),maxX:Math.min(originX+w,c.maxX),maxY:Math.min(originY+h,c.maxY)}
  const width=rect.maxX-rect.minX,height=rect.maxY-rect.minY
  if(width<=0||height<=0)continue
  bytes+=width*height*4
  if(!integer(bytes))throw Error('Historical compact byte overflow')
  plans.push({tile,rect,width,height})
 }
 if(bytes>=fullBytes)return null
 const copies:AccumulationBuffer[]=[],targets:PaintTarget[]=[]
 const dispose=()=>{let failed=false,first:unknown;for(const copy of copies)try{copy.destroy()}catch(error){if(!failed){failed=true;first=error}}if(failed)throw first}
 try{
  for(const {tile,rect,width,height}of plans){
   const copy=allocate(tile.buffer,width,height)
   // Never retire a borrowed original even if an invalid allocator aliases it.
   if(tiles.some(source=>source.buffer===copy)||copies.includes(copy))throw Error('Historical copy aliases existing storage')
   copies.push(copy)
   if(copy.width!==width||copy.height!==height||copy.gl!==tile.buffer.gl||copy.baseBytes!==width*height*4)throw Error('Historical copy allocation mismatch')
   tile.buffer.copyRegionInto(copy,rect.minX-tile.originX,tile.buffer.height-(rect.maxY-tile.originY),0,0,width,height)
   targets.push(Object.freeze({buffer:copy,originX:rect.minX,originY:rect.minY,contentRect:Object.freeze({...rect})}))
  }
 }catch(error){try{dispose()}catch{/* Preserve the original failure, including undefined. */}throw error}
 let retired=false
 const assertLive=()=>{if(retired)throw Error('Historical projection source retired')}
 const buffer:HistoricalProjectionSource={
  resolveVisible(rect){assertLive();return targets.filter(tile=>overlaps(tile.contentRect!,rect))},
  allResident(){assertLive();return targets.slice()},
  destroy(){if(retired)return;retired=true;dispose()},
 }
 return{buffer,bytes}
}
