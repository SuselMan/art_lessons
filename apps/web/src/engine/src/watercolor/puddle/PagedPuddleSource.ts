import type {CapturedReadScope} from './CapturedReadScope'
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
export interface PagedCaptureStep {
  phase:'read'|'write';plane:PagedRawPlane|'water';tileIndex:number;bytes:number;rows:number;elapsedMs:number
}
export interface PagedCaptureOptions {
  captureReads?:CapturedReadScope
  reuseSingleWaterRead?:boolean
  /** Generator only; synchronous adapter keeps its original unyielded contract. */
  rowBatchHeight?:number
  validateRevision?:boolean
}
/** Synchronous callers drain the EXACT same logical read/write implementation. */
export function capturePagedPuddleSource(source:RibbonStrokeScratch,target:ILayerBuffer,
  size:{width:number;height:number},pool:RibbonScratchPool,passes:WatercolorPasses,options:PagedCaptureOptions={}):PagedPuddleSource {
  const capture=capturePagedPuddleSourceSteps(source,target,size,pool,passes,{...options,validateRevision:false,rowBatchHeight:Number.MAX_SAFE_INTEGER})
  while(true){const next=capture.next();if(next.done){if(!next.value)throw Error('Paged capture cancelled');return next.value}}
}
/** Yielded capture publishes NOTHING until every physical plane is frozen.
 * Callers must close this generator and dispose captureReads in their finally. */
export function* capturePagedPuddleSourceSteps(source:RibbonStrokeScratch,target:ILayerBuffer,
  size:{width:number;height:number},pool:RibbonScratchPool,passes:WatercolorPasses,options:PagedCaptureOptions={}):Generator<PagedCaptureStep,PagedPuddleSource|undefined> {
  const batch=options.rowBatchHeight??256
  if(!Number.isSafeInteger(batch)||batch<1)throw new RangeError('Invalid capture row batch')
  const fields=Object.fromEntries([...PAGED_RAW_PLANES,'water'].map(name=>[name,new MaterialFieldPages(size)])) as Record<PagedRawPlane|'water',MaterialFieldPages>
  const tiles=target.allResident(),strict=options.validateRevision!==false,capturedWidth=size.width,capturedHeight=size.height
  const gesture=source.gesture,context=source.finishContext,foreign=source.foreignSources,foreignLength=Array.isArray(foreign)?foreign.length:undefined
  const records=strict?tiles.filter(tile=>{const entry=source.peek(tile.buffer);return !!entry?.inkLoad&&!!entry.inkColor}).map(tile=>{
    const entry=source.peek(tile.buffer)
    const planes=PAGED_RAW_PLANES.map(name=>({name,buffer:entry?.[name],revision:entry?.[name]?.contentRevision}))
    for(const plane of planes)if(plane.buffer&&!Number.isSafeInteger(plane.revision))throw Error('Paged capture needs a stable material revision')
    return {tile,buffer:tile.buffer,entry,planes,originX:tile.originX,originY:tile.originY,width:tile.buffer.width,height:tile.buffer.height}
  }):undefined
  const validate=()=>{
    if(!records)return
    const current=target.allResident().filter(tile=>{const entry=source.peek(tile.buffer);return !!entry?.inkLoad&&!!entry.inkColor})
    const currentByBuffer=new Map(current.map(tile=>[tile.buffer,tile]))
    if(size.width!==capturedWidth||size.height!==capturedHeight||current.length!==records.length||source.gesture!==gesture||source.finishContext!==context||source.foreignSources!==foreign||(Array.isArray(foreign)&&foreign.length!==foreignLength))throw Error('Paged material source changed during capture')
    for(let i=0;i<records.length;i++){
      const record=records[i]!,tile=currentByBuffer.get(record.buffer)
      if(!tile)throw Error('Paged material source changed during capture')
      if(tile.buffer!==record.buffer||tile.originX!==record.originX||tile.originY!==record.originY||tile.buffer.width!==record.width||tile.buffer.height!==record.height||source.peek(tile.buffer)!==record.entry)throw Error('Paged material source changed during capture')
      for(const plane of record.planes)if(record.entry?.[plane.name]!==plane.buffer||plane.buffer&&plane.buffer.contentRevision!==plane.revision)throw Error('Paged material source changed during capture')
    }
  }
  let support:MaterialRect|null=null
  const supportRects:MaterialRect[]=[]
  for(let tileIndex=0;tileIndex<tiles.length;tileIndex++){
    validate()
    const tile=tiles[tileIndex]!,entry=records?records.find(record=>record.buffer===tile.buffer)?.entry:source.peek(tile.buffer)
    if(!entry?.inkLoad||!entry.inkColor)continue
    const clip=materialTileIntersection(size,{...tile,width:tile.buffer.width,height:tile.buffer.height})
    if(!clip)continue
    const tileSupport={rect:null as MaterialRect|null}
    function* write(name:PagedRawPlane|'water',pixels:Uint8Array):Generator<PagedCaptureStep,void> {
      for(let y=0;y<clip!.texture.height;y+=batch){
        validate();const started=performance.now(),rows=Math.min(batch,clip!.texture.height-y)
        const rect={...clip!.texture,y:clip!.texture.y+y,height:rows},field={...clip!.field,y:clip!.field.y+y,height:rows}
        const bytes=extractMaterialTileRect(pixels,tile.buffer.width,tile.buffer.height,rect)
        fields[name].writeRect(field,bytes)
        if(name!=='original')tileSupport.rect=unionM70Support(tileSupport.rect,field,bytes)
        validate();yield {phase:'write',plane:name,tileIndex,bytes:bytes.byteLength,rows,elapsedMs:performance.now()-started}
      }
    }
    let soleWaterPixels:Uint8Array|undefined
    for(const name of PAGED_RAW_PLANES){const buffer=entry[name];if(buffer){
      validate();const started=performance.now(),pixels=options.captureReads?options.captureReads.read(buffer):buffer.readPixels()
      validate();yield {phase:'read',plane:name,tileIndex,bytes:pixels.byteLength,rows:buffer.height,elapsedMs:performance.now()-started}
      yield* write(name,pixels)
      if(options.reuseSingleWaterRead&&((name==='solventLoad'&&!entry.foreignSolventLoad)||(name==='foreignSolventLoad'&&!entry.solventLoad)))soleWaterPixels=pixels
    }}
    if(entry.solventLoad&&entry.foreignSolventLoad){
      validate();const started=performance.now(),combined=pool.acquire(tile.buffer.width,tile.buffer.height)
      let pixels:Uint8Array
      try{passes.fieldOp(combined,entry.solventLoad,entry.foreignSolventLoad,1,1);pixels=combined.readPixels()}
      finally{pool.release(combined)}
      validate();yield {phase:'read',plane:'water',tileIndex,bytes:pixels.byteLength,rows:combined.height,elapsedMs:performance.now()-started}
      yield* write('water',pixels)
    }else{const water=entry.solventLoad??entry.foreignSolventLoad;if(water){
      let pixels=soleWaterPixels
      if(!pixels){validate();const started=performance.now();pixels=water.readPixels();validate();yield {phase:'read',plane:'water',tileIndex,bytes:pixels.byteLength,rows:water.height,elapsedMs:performance.now()-started}}
      yield* write('water',pixels)
    }}
    if(tileSupport.rect){const tileRect=tileSupport.rect;supportRects.push(tileRect);if(!support)support={...tileRect};else{const x=Math.min(support.x,tileRect.x),y=Math.min(support.y,tileRect.y);support={x,y,width:Math.max(support.x+support.width,tileRect.x+tileRect.width)-x,height:Math.max(support.y+support.height,tileRect.y+tileRect.height)-y}}}
  }
  validate()
  const result:PagedPuddleSource=Object.fromEntries(Object.entries(fields).map(([name,field])=>[name,field.snapshot()])) as Record<PagedRawPlane|'water',MaterialFieldSnapshot>
  const noForeign=source.foreignSources===null||(Array.isArray(source.foreignSources)&&source.foreignSources.length===0)
  result.materialSupport={width:size.width,height:size.height,rect:support,rects:supportRects,...(noForeign?{noForeignStencil:true as const}:{})}
  return result
}

export interface PagedWindowRestoreOptions {
  captureReads?:CapturedReadScope
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
    if(options.captureReads)options.captureReads.upload(buffer,pixels)
    else buffer.restorePixels(pixels)
  }
}
