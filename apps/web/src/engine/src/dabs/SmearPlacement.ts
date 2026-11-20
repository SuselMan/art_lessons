import type { BrushTip } from '@grafetto/shared'
import type { WorldRect } from '../buffers/tileMath'

export interface SmearPlacement {
  maskCenter: {x:number;y:number}
  placedCenter: {x:number;y:number}
  rect: WorldRect
}
const roundQt=(v:number)=>v<0?-Math.floor(-v+.5):Math.floor(v+.5)
/** Pinned KisColorSmudgeOp SMEARING_MODE disables dab-cache subpixel precision:
 * split(cursor-hotspot), retain integer origin, zero fractions. The mask's
 * sampling centre and the actual allocation centre are intentionally distinct.
 * Dulling and carried-reservoir brushes must not call this helper. */
export function smearPlacement(tip:BrushTip,x:number,y:number,rx:number,ry:number,angle:number):SmearPlacement {
  if(![x,y,rx,ry,angle].every(Number.isFinite)||rx<=0||ry<=0)throw Error('Invalid smearing geometry')
  const source=tip.imageSampling?.sourceRect,longest=source?Math.max(source.width,source.height):1
  const w=2*rx*(source?source.width/longest:1),h=2*ry*(source?source.height/longest:1)
  const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle)),bx=c*w+s*h,by=s*w+c*h
  const hx=Math.max(1,bx)/2,hy=Math.max(1,by)/2
  const ox=Math.floor(x-hx),oy=Math.floor(y-hy)
  const axis=(v:number)=>{const n=roundQt(v);return Math.max(1,Math.ceil(Math.abs(v-n)<1e-6?n:v))}
  const width=axis(bx),height=axis(by),rect={minX:ox,minY:oy,maxX:ox+width,maxY:oy+height}
  return {rect,maskCenter:{x:ox+hx,y:oy+hy},placedCenter:{x:ox+width/2,y:oy+height/2}}
}
/** Native srcDabRect = current dstRect translated by QPointF::toPoint of the
 * difference of actual placed centres, including signed half-pixel ties. */
export function smearSourceShift(previous:{x:number;y:number},current:SmearPlacement):{x:number;y:number} {
  return {x:roundQt(previous.x-current.placedCenter.x),y:roundQt(previous.y-current.placedCenter.y)}
}
