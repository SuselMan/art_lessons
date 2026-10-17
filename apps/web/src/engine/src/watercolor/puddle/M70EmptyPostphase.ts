import type {MaterialRect} from './MaterialFieldPages'
import type {M70CapturedSupport} from './M70FixedWindowSkip'
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0
const valid=(r:MaterialRect,w:number,h:number)=>!!r&&typeof r==='object'&&[r.x,r.y,r.width,r.height,r.x+r.width,r.y+r.height].every(Number.isSafeInteger)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=w&&r.y+r.height<=h
/** Image of every allocated integer pixel under MaterialFieldSnapshot.readRect's
 * CLAMP boundary. A wholly exterior halo still samples the edge pixel. */
export function postphaseClampedRect(page:{width:number;height:number},rect:MaterialRect):MaterialRect|null {
 if(!positive(page.width)||!positive(page.height)||!rect||![rect.x,rect.y,rect.width,rect.height,rect.x+rect.width,rect.y+rect.height].every(Number.isSafeInteger)||!positive(rect.width)||!positive(rect.height))return null
 const clamp=(v:number,size:number)=>Math.min(size-1,Math.max(0,v)),x=clamp(rect.x,page.width),y=clamp(rect.y,page.height)
 const right=clamp(rect.x+rect.width-1,page.width)+1,top=clamp(rect.y+rect.height-1,page.height)+1
 return{x,y,width:right-x,height:top-y}
}
/** True ONLY when all clamped raw pixels in the whole allocated halo are
 * certified zero. Capture support includes every channel of P/C, water, local
 * and foreign planes and coverage. Dry nonzero P/C therefore cannot skip.
 * No solved/global result, shader phase, or field geometry is altered here. */
export function emptyM70PostphaseRect(page:{width:number;height:number},allocated:MaterialRect,support:M70CapturedSupport|undefined):boolean {
 const sampled=postphaseClampedRect(page,allocated)
 if(!sampled||!support||support.width!==page.width||support.height!==page.height)return false
 const rects=support.rects
 if(rects!==undefined){
  if(!Array.isArray(rects))return false
  if(support.rect===null)return rects.length===0
  if(!valid(support.rect,page.width,page.height)||!rects.length)return false
  const union=support.rect
  if(!rects.every(r=>valid(r,page.width,page.height)&&r.x>=union.x&&r.y>=union.y&&r.x+r.width<=union.x+union.width&&r.y+r.height<=union.y+union.height))return false
  let x=page.width,y=page.height,right=0,top=0
  for(const r of rects){x=Math.min(x,r.x);y=Math.min(y,r.y);right=Math.max(right,r.x+r.width);top=Math.max(top,r.y+r.height)}
  if(x!==union.x||y!==union.y||right!==union.x+union.width||top!==union.y+union.height)return false
 }else if(support.rect===null)return true
 const regions=rects??[support.rect!]
 if(!regions.every(r=>valid(r,page.width,page.height)))return false
 return !regions.some(r=>sampled.x<r.x+r.width&&sampled.x+sampled.width>r.x&&sampled.y<r.y+r.height&&sampled.y+sampled.height>r.y)
}
