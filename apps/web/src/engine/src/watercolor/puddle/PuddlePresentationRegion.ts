import {RibbonStrokeScratch} from '../../buffers/RibbonStrokeScratch'
import type {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
import type {PaintTarget} from '../../buffers/ILayerBuffer'
import type {PuddleRoomHost} from './PuddleRoomController'
export interface PresentationBounds {minX:number;minY:number;maxX:number;maxY:number}
/** Local bottom-up physical texture pixels. */
export interface PresentationRegion {x:number;y:number;width:number;height:number}
export function regionIsFull(r:PresentationRegion,buffer:{width:number;height:number}):boolean{return r.x===0&&r.y===0&&r.width===buffer.width&&r.height===buffer.height}
export function presentationRegion(tile:PaintTarget,b:PresentationBounds,margin=64):PresentationRegion|null{
  if(!Object.values(b).every(Number.isFinite)||b.maxX<b.minX||b.maxY<b.minY)return null
  const w=tile.buffer.width,h=tile.buffer.height
  const x0=Math.max(0,Math.min(w,Math.floor((b.minX-tile.originX-margin)/64)*64))
  const x1=Math.max(0,Math.min(w,Math.ceil((b.maxX-tile.originX+margin)/64)*64))
  const y0=Math.max(0,Math.min(h,Math.floor((h-(b.maxY-tile.originY+margin))/64)*64))
  const y1=Math.max(0,Math.min(h,Math.ceil((h-(b.minY-tile.originY-margin))/64)*64))
  if(x1<=x0||y1<=y0)return null
  // Rounding alone must not turn an empty physical intersection into input.
  if(b.maxX+margin<=tile.originX||b.minX-margin>=tile.originX+w||b.maxY+margin<=tile.originY||b.minY-margin>=tile.originY+h)return null
  return {x:x0,y:y0,width:x1-x0,height:y1-y0}
}
export function unionPresentationRegion(a:PresentationRegion,b:PresentationRegion):PresentationRegion{
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y)
 return {x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y}
}
/** GPU-only four-plane crop. It never feeds a material solver or mutates source.
 * The ephemeral ROI key is the output, so no fifth texture/key is allocated. */
export function renderPuddleRegion(host:PuddleRoomHost,source:RibbonStrokeScratch,tile:PaintTarget,context:NonNullable<RibbonStrokeScratch['finishContext']>,out:AccumulationBuffer,material:{p:AccumulationBuffer;c:AccumulationBuffer;coverage:AccumulationBuffer},region:PresentationRegion):void{
 const original=source.peek(tile.buffer)!.original
 const cropped=new RibbonStrokeScratch(host.pool,true,true)
 try{
  const entry=cropped.getOrCreate(out)
  for(const [input,target]of [[original,entry.original],[material.p,entry.inkLoad!],[material.c,entry.inkColor!],[material.coverage,entry.coverage]] as const)
   input.copyRegionInto(target,region.x,region.y,0,0,region.width,region.height)
  cropped.compositeScalars=make=>source.compositeScalars(make)
  cropped.noteDirection=(dx,dy)=>source.noteDirection(dx,dy)
  for(const paint of source.paints)cropped.paints.add(paint)
  cropped.noteFinish({...context})
  const synthetic={...tile,buffer:out,originX:tile.originX+region.x,originY:tile.originY+tile.buffer.height-region.y-region.height,contentRect:null}
  host.render(cropped,synthetic,context,out,{p:entry.inkLoad!,c:entry.inkColor!,coverage:entry.coverage},[tile.originX+region.x,-tile.originY+region.y])
 }finally{cropped.destroy()}
}
