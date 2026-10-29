import type { Rgba8 } from './mixWeightedRgba8'
import { validateRgba8Pixel } from './sourceColorRgba8'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'

/** Explicit optimized32 SCALAR source profile: separate IEEE Float32 operations,
 * exact Float32 divide and nearest-even byte stores. No SIMD packet shortcuts,
 * FMA, factory/ARM dispatch inference, hardware reciprocal estimates or tables.
 * averageOpacity is the effective *lastOpacity AFTER ParameterInfo aliasing;
 * native qreal ordered-average update and qFuzzyCompare selection are external.
 * mask is an ADDITIONAL selection byte, not the coverage already in source.a.
 */
export interface SourceAlphaDarken32Control {
  readonly profile:'optimized32-scalar-f32-rne-v1'
  readonly variant:'creamy'|'hard'
  readonly opacity:number;readonly averageOpacity:number;readonly flow:number
  readonly mask?:number
}
const f=Math.fround,INV255=f(1/255),INV65025=f(1/(255*255))
const lerp=(a:number,b:number,t:number)=>f(f(f(b-a)*t)+a)
const byte=(v:number)=>sourceImageRoundEven(v)||0
export function compositeSourceAlphaDarken32(source:Rgba8,destination:Rgba8,control:SourceAlphaDarken32Control):Rgba8 {
  validateRgba8Pixel(source);validateRgba8Pixel(destination)
  if(!control||control.profile!=='optimized32-scalar-f32-rne-v1'||!['creamy','hard'].includes(control.variant)
    ||![control.opacity,control.averageOpacity,control.flow].every(v=>Number.isFinite(v)&&v>=0&&v<=1)
    ||control.mask!==undefined&&(!Number.isInteger(control.mask)||control.mask<0||control.mask>255))throw new RangeError('Invalid optimized32 scalar AlphaDarken control')
  const flow=f(control.flow),rawOpacity=f(control.opacity),rawAverage=f(control.averageOpacity)
  const opacity=control.variant==='hard'?f(flow*rawOpacity):rawOpacity
  const average=control.variant==='hard'?f(flow*rawAverage):rawAverage
  const dstAlpha=destination[3]?f(destination[3]*INV255):0
  const maskAlpha=control.mask===undefined?f(source[3]*INV255):f(f(control.mask*INV65025)*source[3])
  const srcAlpha=f(maskAlpha*opacity)
  const color=(i:number)=>destination[3]?byte(f(f((source[i]-destination[i])*srcAlpha)+destination[i])):source[i]
  // Native Arithmetic::lerp delegates to float blend(b,a,t), not a byte lerp or
  // normalized union approximation. The average branch uses ordinary divide.
  const full=average>opacity?(average>dstAlpha?lerp(srcAlpha,average,f(dstAlpha/average)):dstAlpha)
    :opacity>dstAlpha?lerp(dstAlpha,opacity,maskAlpha):dstAlpha
  const zero=control.variant==='hard'?f(f(srcAlpha+dstAlpha)-f(srcAlpha*dstAlpha)):dstAlpha
  const alpha=f((flow===1?full:lerp(zero,full,flow))*255)
  return[color(0),color(1),color(2),byte(alpha)]
}
