import type { WorldRect } from '../buffers/tileMath'

/** Native-like aligned mask rectangle from the common continuous footprint.
 * Dulling preserves the fractional hotspot phase: an odd or fractional size
 * can need an extra pixel. Bitmap original dimensions/cache reuse may differ. */
export function canvasMeanDabRect(x:number,y:number,width:number,height:number):WorldRect {
  const axis=(position:number,length:number)=>{
    length=Math.max(1,length)
    const point=position-length/2,whole=Math.floor(point),fraction=point-whole
    // The native image alignment removes near-zero translation and repairs
    // near-integer floating-point dimensions before outward alignment.
    let start=fraction,span=length
    if(start<1e-6){span+=start;start=0}
    const nearest=Math.floor(span+.5)
    if(Math.abs(span-nearest)<1e-6)span=nearest
    return [whole,whole+Math.ceil(start+span)] as const
  }
  const [minX,maxX]=axis(x,width),[minY,maxY]=axis(y,height)
  return {minX,minY,maxX,maxY}
}
export function canvasMeanPlacedCenter(rect:WorldRect):{x:number;y:number} {
  return {x:(rect.minX+rect.maxX)/2,y:(rect.minY+rect.maxY)/2}
}
const roundQt=(v:number)=>v<0?-Math.floor(-v+.5):Math.floor(v+.5)

/** Translate current integer dimensions from the actual previous placed
 * centre, then apply integer radius offsets and QRect's signed centre law. */
export function canvasMeanSourceRect(previous:{x:number;y:number},current:WorldRect,radius:number):WorldRect {
  const center=canvasMeanPlacedCenter(current)
  const axis=(lo:number,hi:number,shift:number)=>{
    lo+=shift;hi+=shift
    const size=hi-lo,centre=Math.trunc((lo+hi-1)/2)
    if(radius<=0)return [centre,centre+1] as const
    const inset=Math.trunc(size*(radius-1)/2)
    return [Math.min(lo-inset,centre),Math.max(hi+inset,centre+1)] as const
  }
  const [minX,maxX]=axis(current.minX,current.maxX,roundQt(previous.x-center.x))
  const [minY,maxY]=axis(current.minY,current.maxY,roundQt(previous.y-center.y))
  return {minX,minY,maxX,maxY}
}
