import {importedAssetPixels} from './importedBrushes'
import {hasBristleInitializationScope,hasBristleSource143Scope,bristleInitializationSourceSide,type BrushDescriptor,type Dab} from '@grafetto/shared'
export interface BristleInitialization140 {readonly side:number;readonly hairs:[number,number,number][]}
export function assertBristleInitializationSize140(initialization:BristleInitialization140|undefined,dabs:readonly Dab[]):number {
 let side=initialization?.side
 for(const dab of dabs){
  const size=dab.sourceSize
  if(typeof size!=='number'||!Number.isInteger(size)||size<1||size>64)throw Error('Bristle initialization requires captured sourceSize1..64')
  if(side!==undefined&&side!==size)throw Error('Bristle initialization size changed during gesture')
  side=size
 }
 if(side===undefined)throw Error('Bristle initialization source size missing')
 return side
}
/** Full-mask population, fixed at BEGIN. Pixel centres, clamped edges and
 * integer bilinear weights make U8 rounding independent of float filter noise. */
export function buildBristleInitialization140(brush:BrushDescriptor,sourceSize:number):BristleInitialization140 {
 if(brush.bristle?.version===1&&brush.bristle.initialization?.resizePolicy==='source-area143-v1')return buildBristleInitialization143(brush,sourceSize)
 const side=bristleInitializationSourceSide(brush)
 if(!hasBristleInitializationScope(brush)||side===undefined||!Number.isInteger(sourceSize)||sourceSize<1||sourceSize>64)throw Error('Invalid Bristle mask-population initialization')
 const b=brush.bristle!,half=Math.floor(side/2),alpha=new Uint8Array(side*side),seen=new Set<number>()
 for(const[x,y,length]of b.hairs){
  const ix=Math.round(x*side)+half,iy=Math.round(y*side)+half,index=iy*side+ix,value=Math.round(length*255)
  if(ix<0||ix>=side||iy<0||iy>=side||seen.has(index)||value<1||value>255)throw Error('Invalid full Bristle source mask')
  seen.add(index);alpha[index]=value
 }
 // Preserve the canonical source hair order when no resize is requested.
 if(sourceSize===side)return{side:sourceSize,hairs:b.hairs.map(([x,y,length])=>[Math.round(x*side)/side,Math.round(y*side)/side,Math.round(length*255)/255])}
 const hairs:[number,number,number][]=[],denominator=2*sourceSize,divisor=denominator*denominator,outputHalf=Math.floor(sourceSize/2)
 for(let y=0;y<sourceSize;y++)for(let x=0;x<sourceSize;x++){
  const sx=Math.max(0,Math.min((side-1)*denominator,(2*x+1)*side-sourceSize)),sy=Math.max(0,Math.min((side-1)*denominator,(2*y+1)*side-sourceSize))
  const x0=Math.floor(sx/denominator),y0=Math.floor(sy/denominator),x1=Math.min(side-1,x0+1),y1=Math.min(side-1,y0+1),fx=sx-x0*denominator,fy=sy-y0*denominator
  const sum=alpha[y0*side+x0]*(denominator-fx)*(denominator-fy)+alpha[y0*side+x1]*fx*(denominator-fy)+alpha[y1*side+x0]*(denominator-fx)*fy+alpha[y1*side+x1]*fx*fy
  const value=Math.floor((sum+divisor/2)/divisor)
  if(value>0)hairs.push([(x-outputHalf)/sourceSize,(y-outputHalf)/sourceSize,value/255])
 }
 return{side:sourceSize,hairs}
}

function source143(brush:BrushDescriptor){
 const h=brush.bristle
 if(!hasBristleSource143Scope(brush)||h?.version!==1||h.initialization?.resizePolicy!=='source-area143-v1')throw Error('Invalid Bristle source-area143 scope')
 const policy=h.initialization,raw=importedAssetPixels(policy.sourceMask)
 if(raw.length!==policy.sourceSide*policy.sourceSide)throw Error('Bristle source-area143 CAS dimensions differ')
 return{policy,raw}
}
/** CPU readiness only; does not resize, mutate the registry, or upload a texture. */
export function assertBristleSource143Ready(brush:BrushDescriptor):void{if(brush.bristle?.version===1&&brush.bristle.initialization?.resizePolicy==='source-area143-v1')source143(brush)}
/** Area reduction reads ORIGINAL alpha, never the saved-default hair grid.
 * Integer interval overlaps conserve the original aspect/alpha without boost. */
export function buildBristleInitialization143(brush:BrushDescriptor,size:number):BristleInitialization140 {
 if(!Number.isInteger(size)||size<1||size>64)throw Error('Invalid Bristle source-area143 captured size')
 const{policy,raw}=source143(brush),{x:bx,y:by,width:W,height:H}=policy.sourceBounds,M=Math.max(W,H),w=Math.max(1,Math.floor(W*size/M+.5)),h=Math.max(1,Math.floor(H*size/M+.5)),base=new Uint8Array(w*h),area=W*H
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let sum=0
  for(let sy=Math.floor(y*H/h);sy<Math.ceil((y+1)*H/h);sy++){
   const wy=Math.min((sy+1)*h,(y+1)*H)-Math.max(sy*h,y*H)
   for(let sx=Math.floor(x*W/w);sx<Math.ceil((x+1)*W/w);sx++){
    const wx=Math.min((sx+1)*w,(x+1)*W)-Math.max(sx*w,x*W)
    sum+=raw[(by+sy)*policy.sourceSide+bx+sx]*wx*wy
   }
  }
  base[y*w+x]=Math.floor((sum+area/2)/area)
 }
 const[c,s]=policy.rotation,Q=65536,quarter=(c===Q&&s===0)||(c===0&&Math.abs(s)===Q)||(c===-Q&&s===0),rw=Math.ceil((Math.abs(c)*w+Math.abs(s)*h)/Q),rh=Math.ceil((Math.abs(s)*w+Math.abs(c)*h)/Q),rotated=new Uint8Array(rw*rh)
 if(quarter){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const xx=c===Q?x:c===-Q?w-1-x:s===Q?h-1-y:y,yy=c===Q?y:c===-Q?h-1-y:s===Q?x:w-1-x
   rotated[yy*rw+xx]=base[y*w+x]
  }
 }else{
  const denominator=Q*Q
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
   const tx=2*x+1-rw,ty=2*y+1-rh,sx=Math.floor((c*tx+s*ty+(w-1)*Q+1)/2),sy=Math.floor((-s*tx+c*ty+(h-1)*Q+1)/2),x0=Math.floor(sx/Q),y0=Math.floor(sy/Q),fx=sx-x0*Q,fy=sy-y0*Q
   let sum=0
   for(let oy=0;oy<=1;oy++)for(let ox=0;ox<=1;ox++){const xx=x0+ox,yy=y0+oy;if(xx>=0&&xx<w&&yy>=0&&yy<h)sum+=base[yy*w+xx]*(ox?fx:Q-fx)*(oy?fy:Q-fy)}
   rotated[y*rw+x]=Math.floor((sum+denominator/2)/denominator)
  }
 }
 const hairs:[number,number,number][]=[],hx=Math.floor(rw/2),hy=Math.floor(rh/2)
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const alpha=rotated[y*rw+x];if(alpha){if(hairs.length===8192)throw Error('Bristle source-area143 population exceeds8192');hairs.push([(x-hx)/size,(y-hy)/size,alpha/255])}}
 // Publish only a complete, detached result. No partially installed anchor/state.
 return{side:size,hairs}
}
