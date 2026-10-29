import { rgba64UnpremultiplyFactor } from './affineImageSpan16'

export interface Rgba64FactorLut {
  readonly width: 256
  readonly height: 256
  /** Little-endian factor bytes0..3, one entry for each alpha16. */
  readonly low: Uint8Array
  /** Factor bytes4..5, then two zero bytes. */
  readonly high: Uint8Array
  readonly bytes: 524288
}
/** Mathematical canonical LUT, not a hardware-reciprocal receipt or pixel table.
 * Build once during explicit profile preparation; caller owns its two arrays.
 * Both RGBA8/NEAREST/CLAMP textures must be charged to the existing GPU budget.
 */
export function buildRgba64FactorLut(): Rgba64FactorLut {
  const low = new Uint8Array(256 * 256 * 4), high = new Uint8Array(low.length)
  for (let alpha = 1; alpha < 65535; alpha++) {
    let factor = rgba64UnpremultiplyFactor(alpha)
    for (let byte = 0; byte < 6; byte++) {
      const value = factor % 256
      if (byte < 4) low[alpha * 4 + byte] = value
      else high[alpha * 4 + byte - 4] = value
      factor = Math.floor(factor / 256)
    }
  }
  return { width: 256, height: 256, low, high, bytes: 524288 }
}

/** Explicit Qt wordsize64 value law. No active renderer/prepass imports this.
 * Requires highp precision>=23 and valid PM16 c<=alpha, exact NEAREST RGBA8
 * reads. Factor convolution uses <=17-bit intermediates. No integer64/uint,
 * reciprocal estimate, per-dab CPU mask or WebGL2 requirement is implicit.
 */
export const SOURCE_RGBA64_STRAIGHT_GLSL = `
float rgba64StraightWord(float c,float alpha,vec4 low,vec2 high) {
 if(alpha==0.0 || alpha==65535.0)return c;
 float c0=mod(c,256.0),c1=floor(c/256.0);
 float carry=floor(c0*low.x/256.0);
 carry=floor((c0*low.y+c1*low.x+carry)/256.0);
 carry=floor((c0*low.z+c1*low.y+carry)/256.0);
 carry=floor((c0*low.w+c1*low.z+carry+128.0)/256.0);
 float sum=c0*high.x+c1*low.w+carry;
 float lower=mod(sum,256.0);
 carry=floor(sum/256.0);
 float upper=mod(c0*high.y+c1*high.x+carry,256.0);
 return lower+upper*256.0;
}
float rgba64ByteFromWord(float word) {
 float biased=word+128.0;
 return floor((biased-floor(biased/256.0))/256.0);
}
float rgba64MaskByte(float gray,float alpha) {
 float product=(255.0-gray)*alpha+128.0;
 return floor((product+floor(product/256.0))/256.0);
}
vec4 sourceRgba64StraightGrayPacked(highp sampler2D factorLow,highp sampler2D factorHigh,vec4 packedPM) {
 vec4 bytes=floor(packedPM*255.0+0.5);
 float c=bytes.x*256.0+bytes.y;
 float alpha=bytes.z*256.0+bytes.w;
 vec2 uv=(vec2(mod(alpha,256.0),floor(alpha/256.0))+0.5)/256.0;
 vec4 low=floor(texture2D(factorLow,uv)*255.0+0.5);
 vec2 high=floor(texture2D(factorHigh,uv).rg*255.0+0.5);
 float gray8=rgba64ByteFromWord(rgba64StraightWord(c,alpha,low,high));
 float alpha8=rgba64ByteFromWord(alpha);
 return vec4(gray8,alpha8,rgba64MaskByte(gray8,alpha8),255.0)/255.0;
}
`
