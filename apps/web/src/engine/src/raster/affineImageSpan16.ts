import type { InverseImageAffine } from './affineImageSpan'

/** Experimental RGBA16 reference for straight-ARGB32 QPainter destinations.
 * Qt5.15 qdrawhelper.cpp fetchTransformedBilinear64_uint32 and qrgba64.h.
 * Source conversion models separately-selected wide8 or narrow4 SIMD groups.
 * Already-covered affine scanline only; no active renderer imports this file.
 * Separate high-word products model SSE2; summed products model NEON. */
export function sampleAffineImageSpan16(
  straightRGBA: Uint8Array, width: number, height: number, inverse: InverseImageAffine,
  x: number, y: number, length: number, products: 'separate' | 'summed' = 'separate', sourceDecode: 'wide8' | 'narrow4' | 'scalar' = 'wide8', inverseOrigin: 'unbiased' | 'sampling' = 'unbiased',
): Uint16Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width * height > 4 * 1024 * 1024 || straightRGBA.length !== width * height * 4
    || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(length)
    || length < 1 || length > 2048 || inverse.some(v => !Number.isFinite(v)) || (products !== 'separate' && products !== 'summed')
    || !['wide8', 'narrow4', 'scalar'].includes(sourceDecode) || !['unbiased', 'sampling'].includes(inverseOrigin)) throw RangeError('Invalid RGBA16 affine span')
  const [a,b,c,d,tx,ty] = inverse, fixed = 65536
  const normX = a*a+c*c, normY = b*b+d*d
  if (normX <= 1/fixed || normY <= 1/fixed || normX >= 1e4 || normY >= 1e4
    || Math.abs(tx) >= 1e4 || Math.abs(ty) >= 1e4) throw RangeError('Outside affine fast-matrix domain')
  const dx = Math.trunc(a*fixed), dy = Math.trunc(b*fixed)
  const originBias = inverseOrigin === 'sampling' ? 0 : 1/fixed
  let fx = Math.trunc((c*(y+.5)+a*(x+.5)+tx-originBias)*fixed)-32768
  let fy = Math.trunc((d*(y+.5)+b*(x+.5)+ty-originBias)*fixed)-32768
  if ([fx,fy,fx+dx*length,fy+dy*length].some(v=>Math.abs(v)>=0x7fffffff)) throw RangeError('Affine fixed-point range exceeded')
  // The fetcher materializes two adjacent texels per destination pixel.
  // Conversion SIMD groups therefore span multiple destination pixels; a
  // mixed-alpha neighbour changes even an opaque texel's rounding.
  const fetchRow = (bottom: boolean) => {
    const raw = new Uint8Array(length * 8)
    for(let i=0;i<length;i++) {
      const ix=Math.floor((fx+dx*i)/fixed), iy=Math.floor((fy+dy*i)/fixed)+(bottom ? 1 : 0)
      for(let side=0;side<2;side++) {
        const offset=(Math.max(0,Math.min(height-1,iy))*width+Math.max(0,Math.min(width-1,ix+side)))*4
        raw.set(straightRGBA.subarray(offset,offset+4),(i*2+side)*4)
      }
    }
    const result=new Uint16Array(raw.length), count=length*2
    const groupSize=sourceDecode==='wide8' ? 8 : sourceDecode==='narrow4' ? 4 : 1
    for(let start=0;start<count;start+=groupSize) {
      const end=Math.min(count,start+groupSize)
      const vector=sourceDecode==='wide8' || sourceDecode==='narrow4' && end-start===4
      let opaque=true
      for(let i=start;i<end;i++)if(raw[i*4+3]!==255)opaque=false
      for(let i=start;i<end;i++) {
        const alpha=raw[i*4+3]*257
        result[i*4+3]=alpha
        for(let channel=0;channel<3;channel++) {
          const value=raw[i*4+channel]*257, product=value*alpha
          const high=Math.floor(product/fixed)
          result[i*4+channel]=opaque ? value : vector ? high+Math.floor(high/32768)
            : Math.floor((product+high+32768)/fixed)
        }
      }
    }
    return result
  }
  const top=fetchRow(false), bottom=fetchRow(true)
  const interpolate = (left: number, right: number, weight: number) => weight === 0 ? left
    : products === 'separate' ? Math.floor(left*(fixed-weight)/fixed)+Math.floor(right*weight/fixed)
      : Math.floor((left*(fixed-weight)+right*weight)/fixed)
  const result = new Uint16Array(length*4)
  for(let i=0;i<length;i++,fx+=dx,fy+=dy) {
    const ix=Math.floor(fx/fixed), iy=Math.floor(fy/fixed)
    const wx=fx-ix*fixed, wy=fy-iy*fixed
    for(let channel=0;channel<4;channel++) {
      const left=interpolate(top[i*8+channel],bottom[i*8+channel],wy)
      const right=interpolate(top[i*8+4+channel],bottom[i*8+4+channel],wy)
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
