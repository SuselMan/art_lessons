import type {MaterialRect} from './MaterialFieldPages'
/** Capture-only proof, GL bottom-up coordinates; absent metadata fails closed. */
export interface M70CapturedSupport {width:number;height:number;rect:MaterialRect|null;rects?:readonly MaterialRect[];noForeignStencil?:true}
type Group={field:MaterialRect;cores:readonly MaterialRect[]}
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0
const valid=(r:MaterialRect,w:number,h:number)=>!!r&&typeof r==='object'&&[r.x,r.y,r.width,r.height,r.x+r.width,r.y+r.height].every(Number.isSafeInteger)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=w&&r.y+r.height<=h
/** Geometry is NEVER changed. Keep every unknown/invalid case. */
export function keepM70FixedGroup(page:{width:number;height:number},group:Group,support:M70CapturedSupport|undefined,requestedRadius:32|612=612):boolean {
 const radius=requestedRadius===32&&support?.noForeignStencil===true?32:612
 if(!positive(page.width)||!positive(page.height)||!support||support.width!==page.width||support.height!==page.height)return true
 if(!group.cores.length||!group.cores.every(r=>valid(r,page.width,page.height)))return true
 // A present list is authoritative only when every rectangle is valid and
 // contained in the compatibility union; malformed metadata fails closed.
 const rects=support.rects
 if(rects!==undefined){
  if(!Array.isArray(rects))return true
  if(support.rect===null)return rects.length!==0
  if(!valid(support.rect,page.width,page.height)||!rects.length)return true
  const union=support.rect
  if(!rects.every(r=>valid(r,page.width,page.height)&&r.x>=union.x&&r.y>=union.y&&r.x+r.width<=union.x+union.width&&r.y+r.height<=union.y+union.height))return true
  let x=page.width,y=page.height,right=0,top=0
  for(const r of rects){x=Math.min(x,r.x);y=Math.min(y,r.y);right=Math.max(right,r.x+r.width);top=Math.max(top,r.y+r.height)}
  if(x!==union.x||y!==union.y||right!==union.x+union.width||top!==union.y+union.height)return true
 }else if(support.rect===null)return false
 const regions=rects??[support.rect!]
 if(!regions.every(r=>valid(r,page.width,page.height)))return true
 return regions.some(r=>{
  // Integer world top-down: capture rectangles are GL bottom-up.
  const left=r.x-radius,right=r.x+r.width+radius,top=page.height-r.y-r.height-radius,bottom=page.height-r.y+radius
  if(![left,right,top,bottom].every(Number.isSafeInteger))return true
  return group.cores.some(c=>c.x<right&&c.x+c.width>left&&c.y<bottom&&c.y+c.height>top)
 })
}
/** Scan bytes already read for source capture; original presentation RGB excluded. */
export function unionM70Support(current:MaterialRect|null,rect:MaterialRect,pixels:Uint8Array):MaterialRect|null {
 if(![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)||rect.width<0||rect.height<0||pixels.length!==rect.width*rect.height*4)throw new RangeError('Invalid captured material support')
 let left=rect.width,right=0,bottom=rect.height,top=0
 for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
  const at=(y*rect.width+x)*4
  if(pixels[at]||pixels[at+1]||pixels[at+2]||pixels[at+3]){left=Math.min(left,x);right=Math.max(right,x+1);bottom=Math.min(bottom,y);top=Math.max(top,y+1)}
 }
 if(right<=left)return current
 const found={x:rect.x+left,y:rect.y+bottom,width:right-left,height:top-bottom}
 if(!current)return found
 const x=Math.min(current.x,found.x),y=Math.min(current.y,found.y)
 return{x,y,width:Math.max(current.x+current.width,found.x+found.width)-x,height:Math.max(current.y+current.height,found.y+found.height)-y}
}
