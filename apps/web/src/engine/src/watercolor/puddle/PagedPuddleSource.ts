import {MaterialFieldPages,type MaterialFieldSnapshot,type MaterialRect} from './MaterialFieldPages'
import {extractMaterialTileRect,materialTileIntersection} from './MaterialTileCoordinates'
import type {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import type {ILayerBuffer} from '../../buffers/ILayerBuffer'
import type {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import type {WatercolorPasses} from '../../raster/WatercolorPasses'

export const PAGED_RAW_PLANES=['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad'] as const
export type PagedRawPlane=typeof PAGED_RAW_PLANES[number]
export type PagedPuddleSource=Record<PagedRawPlane|'water',MaterialFieldSnapshot>

/** Freeze one accepted material revision before solving any window. Physical
 * tiles outside the finite sheet are deliberately excluded from this domain;
 * their pixels remain owned by the ordinary layer buffer. */
export function capturePagedPuddleSource(source:RibbonStrokeScratch,target:ILayerBuffer,
  size:{width:number;height:number},pool:RibbonScratchPool,passes:WatercolorPasses):PagedPuddleSource {
  const fields=Object.fromEntries([...PAGED_RAW_PLANES,'water'].map(name=>[name,new MaterialFieldPages(size)])) as Record<PagedRawPlane|'water',MaterialFieldPages>
  for(const tile of target.allResident()){
    const entry=source.peek(tile.buffer)
    if(!entry?.inkLoad||!entry.inkColor)continue
    const clip=materialTileIntersection(size,{...tile,width:tile.buffer.width,height:tile.buffer.height})
    if(!clip)continue
    const write=(name:PagedRawPlane|'water',pixels:Uint8Array)=>fields[name].writeRect(clip.field,
      extractMaterialTileRect(pixels,tile.buffer.width,tile.buffer.height,clip.texture))
    for(const name of PAGED_RAW_PLANES){const buffer=entry[name];if(buffer)write(name,buffer.readPixels())}
    if(entry.solventLoad&&entry.foreignSolventLoad){
      const combined=pool.acquire(tile.buffer.width,tile.buffer.height)
      try{passes.fieldOp(combined,entry.solventLoad,entry.foreignSolventLoad,1,1);write('water',combined.readPixels())}
      finally{pool.release(combined)}
    }else{const water=entry.solventLoad??entry.foreignSolventLoad;if(water)write('water',water.readPixels())}
  }
  return Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.snapshot()])) as PagedPuddleSource
}

/** Upload a window into an already-owned scratch entry. No material is derived
 * from presentation RGB or a previously computed target. */
export function restorePagedPuddleWindow(source:PagedPuddleSource,rect:MaterialRect,
  scratch:RibbonStrokeScratch,key:Parameters<RibbonStrokeScratch['getOrCreate']>[0],pool:RibbonScratchPool):void {
  if(key.width!==rect.width||key.height!==rect.height)throw new Error('Material window dimensions differ')
  const entry=scratch.getOrCreate(key)
  for(const name of PAGED_RAW_PLANES){
    let buffer=entry[name]
    if(!buffer){buffer=pool.acquire(rect.width,rect.height);entry[name]=buffer}
    buffer.restorePixels(source[name].readRect(rect,'zero'))
  }
}
