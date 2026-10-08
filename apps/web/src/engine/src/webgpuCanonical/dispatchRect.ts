/** Exact set of integer native rows/columns whose GL pixel centres pass the
 * original f32 scissor predicate. Returned offset is native top-down; sampling
 * keeps the full texture dimensions and global pixel coordinates. */
export function canonicalDispatchRect(width:number,height:number,scissor?:readonly[number,number,number,number]):readonly[number,number,number,number] {
 const s=(scissor??[0,0,width,height]).map(Math.fround)
 if(s.some(v=>!Number.isFinite(v)))throw new Error('Canonical dispatch scissor must be finite')
 const x1=Math.fround(s[0]+s[2]),y1=Math.fround(s[1]+s[3])
 const clamp=(n:number,max:number)=>Math.max(0,Math.min(max,n))
 const left=clamp(Math.ceil(s[0]-.5),width),right=clamp(Math.ceil(x1-.5),width)
 const bottom=clamp(Math.ceil(s[1]-.5),height),top=clamp(Math.ceil(y1-.5),height)
 return[left,height-top,Math.max(0,right-left),Math.max(0,top-bottom)]
}
