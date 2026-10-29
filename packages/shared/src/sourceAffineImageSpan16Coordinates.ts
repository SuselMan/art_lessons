import type { SourceImageAffine } from './sourceImageTransformAffine.js'

export interface AffineImageSpan16Coordinates { fx: number; fy: number; dx: number; dy: number }
/** Shared fixed-point seed/domain law for CPU sampling and reusable GPU row VBOs.
 * Optional caller-owned output avoids per-row object allocation in staging. */
export function affineImageSpan16Coordinates(inverse: SourceImageAffine, x: number, y: number, length: number,
  inverseOrigin: 'unbiased' | 'sampling' = 'unbiased', into?: AffineImageSpan16Coordinates): AffineImageSpan16Coordinates {
  if (inverse.length !== 6 || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(length)
    || length < 1 || length > 2048 || (inverseOrigin !== 'unbiased' && inverseOrigin !== 'sampling')) throw new RangeError('Invalid RGBA16 affine row')
  for (let i = 0; i < 6; i++) if (!Number.isFinite(inverse[i])) throw new RangeError('Invalid RGBA16 affine row')
  const [a,b,c,d,tx,ty] = inverse, fixed = 65536
  const normX = a*a+c*c, normY = b*b+d*d
  if (normX <= 1/fixed || normY <= 1/fixed || normX >= 1e4 || normY >= 1e4
    || Math.abs(tx) >= 1e4 || Math.abs(ty) >= 1e4) throw RangeError('Outside affine fast-matrix domain')
  const dx = Math.trunc(a*fixed), dy = Math.trunc(b*fixed)
  const originBias = inverseOrigin === 'sampling' ? 0 : 1/fixed
  const fx = Math.trunc((c*(y+.5)+a*(x+.5)+tx-originBias)*fixed)-32768
  const fy = Math.trunc((d*(y+.5)+b*(x+.5)+ty-originBias)*fixed)-32768
  if (Math.abs(fx) >= 0x7fffffff || Math.abs(fy) >= 0x7fffffff
    || Math.abs(fx + dx * length) >= 0x7fffffff || Math.abs(fy + dy * length) >= 0x7fffffff) throw RangeError('Affine fixed-point range exceeded')
  const result = into ?? { fx: 0, fy: 0, dx: 0, dy: 0 }
  result.fx = fx; result.fy = fy; result.dx = dx; result.dy = dy
  return result
}
