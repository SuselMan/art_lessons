import { sourceFmaF64 } from './sourceFmaF64'
export interface SourceCurvePoint { readonly x: number; readonly y: number }
export interface SourceCurvePolynomial {
  readonly points: readonly SourceCurvePoint[]
  /** Global a*x³+b*x²+c*x+d coefficients from native SparseLU, per interval. */
  readonly coefficients: readonly (readonly [number, number, number, number])[]
}
export interface SourceCurveDenseLayout {
  /** Native radial-mask resolution is chosen once from ORIGINAL generator
   * dimensions. The table has resolution+2 entries, sampled at i/(size-1).
   * This is not a resampling of the256-entry option/sensor table. */
  readonly layout: 'soft-mask'
  readonly resolution: number
  readonly arithmetic: 'installed-arm64-fused-v1'
}
export interface SourceCurveSensorLayout {
  readonly layout: 'sensor'
  readonly arithmetic: 'installed-arm64-fused-v1'
}
/** The exact polynomial evaluation/sampling law, not an alternative spline
 * solver. Arbitrary control-point compilation still needs native SparseLU. */
export function sourceCurveTransfer(curve: SourceCurvePolynomial, dense?: SourceCurveDenseLayout | SourceCurveSensorLayout): readonly number[] {
  const { points, coefficients } = curve
  if (points.length < 1 || points.length > 256 || coefficients.length !== Math.max(1, points.length - 1)
    || points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || (i > 0 && p.x <= points[i - 1].x))
    || coefficients.some(c => c.length !== 4 || !c.every(Number.isFinite))) throw new RangeError('Invalid native spline program')
  if (dense !== undefined && (dense.arithmetic !== 'installed-arm64-fused-v1' || !['soft-mask','sensor'].includes(dense.layout)
    || dense.layout === 'soft-mask' && (!Number.isSafeInteger(dense.resolution) || dense.resolution < 0 || dense.resolution > 16382))) throw new RangeError('Invalid native radial curve layout')
  const size = dense === undefined || dense.layout === 'sensor' ? 256 : dense.resolution + 2
  const end = 1 / (size - 1)
  return Array.from({ length: size }, (_, i) => {
    const x = Math.max(points[0].x, Math.min(i * end, points[points.length - 1].x))
    let interval = 0
    while (interval < coefficients.length - 1 && !(x < points[interval + 1].x)) interval++
    const [a, b, c, d] = coefficients[interval]
    const squared = x * x, cubed = squared * x
    // Installed image0x42538c..a0: b*x², two FMADDs, then a separate
    // final add of d. Preserve the original host/separate option law by default.
    const value = dense === undefined ? a * cubed + b * squared + c * x + d
      : d + sourceFmaF64(c, x, sourceFmaF64(a, cubed, b * squared))
    return Math.max(0, Math.min(value, 1))
  })
}
/** KisCubicCurve::isIdentity ignores corner flags and uses Qt's relative
 * qFuzzyCompare ONLY for interior knots. Endpoints must match exactly. */
export { sourceStampCurveIsIdentity as sourceCurveIsIdentity } from '@grafetto/shared'
