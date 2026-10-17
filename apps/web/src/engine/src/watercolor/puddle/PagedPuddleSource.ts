import {unionM70Support,type M70CapturedSupport} from './M70FixedWindowSkip'
import {MaterialFieldPages,type MaterialFieldSnapshot,type MaterialRect} from './MaterialFieldPages'
import {extractMaterialTileRect,materialTileIntersection} from './MaterialTileCoordinates'
import type {RibbonStrokeScratch,RibbonTileScratch} from '../../buffers/RibbonStrokeScratch'
import type {ILayerBuffer} from '../../buffers/ILayerBuffer'
import type {RibbonScratchPool} from '../../buffers/RibbonScratchPool'
import type {WatercolorPasses} from '../../raster/WatercolorPasses'

export const PAGED_RAW_PLANES=['original','coverage','inkLoad','inkColor','solventLoad','foreignSolventLoad'] as const
export type PagedRawPlane=typeof PAGED_RAW_PLANES[number]
export type PagedPuddleSource=Record<PagedRawPlane|'water',MaterialFieldSnapshot> & {materialSupport?:M70CapturedSupport}

/** Freeze one accepted material revision before solving any window. Physical
 * tiles outside the finite sheet are deliberately excluded from this domain;
 * their pixels remain owned by the ordinary layer buffer. */
export function capturePagedPuddleSource(source:RibbonStrokeScratch,target:ILayerBuffer,
  size:{width:number;height:number},pool:RibbonScratchPool,passes:WatercolorPasses):PagedPuddleSource {
  const fields=Object.fromEntries([...PAGED_RAW_PLANES,'water'].map(name=>[name,new MaterialFieldPages(size)])) as Record<PagedRawPlane|'water',MaterialFieldPages>
  let support:MaterialRect|null=null
  const supportRects:MaterialRect[]=[]
  for(const tile of target.allResident()){
    const entry=source.peek(tile.buffer)
    if(!entry?.inkLoad||!entry.inkColor)continue
    const clip=materialTileIntersection(size,{...tile,width:tile.buffer.width,height:tile.buffer.height})
    if(!clip)continue
    const tileSupport={rect:null as MaterialRect|null}
    const write=(name:PagedRawPlane|'water',pixels:Uint8Array)=>{
      const bytes=extractMaterialTileRect(pixels,tile.buffer.width,tile.buffer.height,clip.texture)
      fields[name].writeRect(clip.field,bytes)
      if(name!=='original')tileSupport.rect=unionM70Support(tileSupport.rect,clip.field,bytes)
    }
    for(const name of PAGED_RAW_PLANES){const buffer=entry[name];if(buffer)write(name,buffer.readPixels())}
    if(entry.solventLoad&&entry.foreignSolventLoad){
      const combined=pool.acquire(tile.buffer.width,tile.buffer.height)
      try{passes.fieldOp(combined,entry.solventLoad,entry.foreignSolventLoad,1,1);write('water',combined.readPixels())}
      finally{pool.release(combined)}
    }else{const water=entry.solventLoad??entry.foreignSolventLoad;if(water)write('water',water.readPixels())}
    if(tileSupport.rect){const tileRect=tileSupport.rect;supportRects.push(tileRect);if(!support)support={...tileRect};else{const x=Math.min(support.x,tileRect.x),y=Math.min(support.y,tileRect.y);support={x,y,width:Math.max(support.x+support.width,tileRect.x+tileRect.width)-x,height:Math.max(support.y+support.height,tileRect.y+tileRect.height)-y}}}
  }
  const result:PagedPuddleSource=Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.snapshot()])) as Record<PagedRawPlane|'water',MaterialFieldSnapshot>
  result.materialSupport={width:size.width,height:size.height,rect:support,rects:supportRects}
  return result
}

export interface PagedWindowRestoreOptions {
  /** QA-only opt-in: omit an exactly zero foreign plane on a fresh scratch entry. */
  omitZeroForeignSolventLoad?:boolean
}

/** Upload a window into an already-owned scratch entry. No material is derived
 * from presentation RGB or a previously computed target. */
export function restorePagedPuddleWindow(source:PagedPuddleSource,rect:MaterialRect,
  scratch:RibbonStrokeScratch,key:Parameters<RibbonStrokeScratch['getOrCreate']>[0],pool:RibbonScratchPool,options:PagedWindowRestoreOptions={}):void {
  if(key.width!==rect.width||key.height!==rect.height)throw new Error('Material window dimensions differ')
  const fresh=scratch.peek(key)===null
  const entry=scratch.getOrCreate(key)
  restoreOwnedEntry(source,rect,entry,()=>pool.acquire(rect.width,rect.height),fresh,options)
}

/** Fresh ownership is supplied only by the scratch factory before publication. */
export function createDetachedPagedPuddleWindow(source:PagedPuddleSource,rect:MaterialRect,
  scratch:RibbonStrokeScratch,options:PagedWindowRestoreOptions={}):ReturnType<RibbonStrokeScratch['createDetachedTile']> {
  return scratch.createDetachedTile(rect.width,rect.height,(entry,acquireOwned)=>
    restoreOwnedEntry(source,rect,entry,acquireOwned,true,options))
}

function restoreOwnedEntry(source:PagedPuddleSource,rect:MaterialRect,entry:RibbonTileScratch,
  acquireOwned:()=>NonNullable<RibbonTileScratch['inkLoad']>,fresh:boolean,options:PagedWindowRestoreOptions):void {
  for(const name of PAGED_RAW_PLANES){
    const pixels=source[name].readRect(rect,'zero')
    // Existing entries retain their plane identity and zero overwrite semantics.
    // Scan every channel: alpha-zero alone does not prove foreign film is zero.
    if(name==='foreignSolventLoad'&&options.omitZeroForeignSolventLoad&&fresh&&!entry[name]){
      let zero=true
      for(let i=0;i<pixels.length;i++)if(pixels[i]!==0){zero=false;break}
      if(zero)continue
    }
    let buffer=entry[name]
    if(!buffer){buffer=acquireOwned();entry[name]=buffer}
    buffer.restorePixels(pixels)
  }
}
