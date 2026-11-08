import {hasBristleInitializationScope,bristleInitializationSourceSide,type BrushDescriptor,type Dab} from '@grafetto/shared'
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
