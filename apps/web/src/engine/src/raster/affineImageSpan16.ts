import type { InverseImageAffine } from './affineImageSpan'

/** Experimental RGBA16 reference for straight-ARGB32 QPainter destinations.
 * Qt5.15 qdrawhelper.cpp fetchTransformedBilinear64_uint32 and qrgba64.h.
 * Initial verified source domain: alpha0/255 (opaque native-gray plus border).
 * Already-covered affine scanline only; no active renderer imports this file.
 * Separate high-word products model SSE2; summed products model NEON. */
export function sampleAffineImageSpan16(
  straightRGBA: Uint8Array, width: number, height: number, inverse: InverseImageAffine,
  x: number, y: number, length: number, products: 'separate' | 'summed' = 'separate',
): Uint16Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width * height > 4 * 1024 * 1024 || straightRGBA.length !== width * height * 4
    || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(length)
    || length < 1 || length > 2048 || inverse.some(v => !Number.isFinite(v))) throw RangeError('Invalid RGBA16 affine span')
  for(let i=3;i<straightRGBA.length;i+=4) if(straightRGBA[i]!==0 && straightRGBA[i]!==255) throw RangeError('Partial source alpha is outside the verified decode domain')
  const [a,b,c,d,tx,ty] = inverse, fixed = 65536
  const normX = a*a+c*c, normY = b*b+d*d
  if (normX <= 1/fixed || normY <= 1/fixed || normX >= 1e4 || normY >= 1e4
    || Math.abs(tx) >= 1e4 || Math.abs(ty) >= 1e4) throw RangeError('Outside affine fast-matrix domain')
  const dx = Math.trunc(a*fixed), dy = Math.trunc(b*fixed)
  let fx = Math.trunc((c*(y+.5)+a*(x+.5)+tx-1/fixed)*fixed)-32768
  let fy = Math.trunc((d*(y+.5)+b*(x+.5)+ty-1/fixed)*fixed)-32768
  if ([fx,fy,fx+dx*length,fy+dy*length].some(v=>Math.abs(v)>=0x7fffffff)) throw RangeError('Affine fixed-point range exceeded')
  const channelAt = (px: number, py: number, channel: number) => {
    const offset = (Math.max(0,Math.min(height-1,py))*width+Math.max(0,Math.min(width-1,px)))*4
    const alpha = straightRGBA[offset+3]*257
    if (channel === 3) return alpha
    const product = straightRGBA[offset+channel]*257*alpha
    return Math.floor((product+Math.floor(product/fixed)+32768)/fixed)
  }
  const interpolate = (left: number, right: number, weight: number) => weight === 0 ? left
    : products === 'separate' ? Math.floor(left*(fixed-weight)/fixed)+Math.floor(right*weight/fixed)
      : Math.floor((left*(fixed-weight)+right*weight)/fixed)
  const result = new Uint16Array(length*4)
  for(let i=0;i<length;i++,fx+=dx,fy+=dy) {
    const ix=Math.floor(fx/fixed), iy=Math.floor(fy/fixed)
    const wx=fx-ix*fixed, wy=fy-iy*fixed
    for(let channel=0;channel<4;channel++) {
      const left=interpolate(channelAt(ix,iy,channel),channelAt(ix,iy+1,channel),wy)
      const right=interpolate(channelAt(ix+1,iy,channel),channelAt(ix+1,iy+1,channel),wy)
      result[i*4+channel]=interpolate(left,right,wx)
    }
  }
  return result
}

const roundEven = (value: number) => {
  const floor=Math.floor(value), fraction=value-floor
  return fraction<.5 ? floor : fraction>.5 ? floor+1 : floor+(floor%2)
}
const byteFrom16 = (value: number) => Math.floor((value+128-Math.floor((value+128)/256))/256)

/** Float32 division and nearest-even store model Qt's SSE4 ARGB32 conversion.
 * Alpha is quantized independently; do not first quantize premultiplied RGB. */
export function affineSpan16Straight(premultiplied: Uint16Array): Uint8Array {
  if(premultiplied.length%4) throw RangeError('Invalid RGBA16 layout')
  const result=new Uint8Array(premultiplied.length)
  const vectorEnd=Math.floor(premultiplied.length/16)*16
  for(let i=0;i<premultiplied.length;i+=4) {
    const alpha=premultiplied[i+3]
    result[i+3]=byteFrom16(alpha)
    for(let channel=0;channel<3;channel++) {
      const value=premultiplied[i+channel]
      if(value>alpha) throw RangeError('Invalid premultiplied RGBA16 channel')
      result[i+channel]=alpha===0 ? 0 : alpha===65535 ? byteFrom16(value)
        : i<vectorEnd ? roundEven(Math.fround(Math.fround(value)*Math.fround(255/alpha)))
          : byteFrom16(Math.min(65535,roundEven(Math.fround(Math.fround(value)*Math.fround(65535/alpha)))))
    }
  }
  return result
}

export function affineSpan16Mask(premultiplied: Uint16Array): Uint8Array {
  const rgba=affineSpan16Straight(premultiplied), result=new Uint8Array(rgba.length/4)
  for(let i=0;i<result.length;i++) {
    const product=(255-rgba[i*4])*rgba[i*4+3]+128
    result[i]=(product+(product>>>8))>>>8
  }
  return result
}
