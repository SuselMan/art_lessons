export interface SourceCurvePoint { readonly x: number; readonly y: number }
export interface SourceCurvePolynomial {
  readonly points: readonly SourceCurvePoint[]
  /** Global a*x³+b*x²+c*x+d coefficients from native SparseLU, per interval. */
  readonly coefficients: readonly (readonly [number, number, number, number])[]
}
/** The exact polynomial evaluation/sampling law, not an alternative spline
 * solver. Arbitrary control-point compilation still needs native SparseLU. */
export function sourceCurveTransfer(curve: SourceCurvePolynomial): readonly number[] {
  const { points, coefficients } = curve
  if (points.length < 1 || points.length > 256 || coefficients.length !== Math.max(1, points.length - 1)
    || points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || (i > 0 && p.x <= points[i - 1].x))
    || coefficients.some(c => c.length !== 4 || !c.every(Number.isFinite))) throw new RangeError('Invalid native spline program')
  const end = 1 / 255
  return Array.from({ length: 256 }, (_, i) => {
    const x = Math.max(points[0].x, Math.min(i * end, points[points.length - 1].x))
    let interval = 0
    while (interval < coefficients.length - 1 && !(x < points[interval + 1].x)) interval++
    const [a, b, c, d] = coefficients[interval]
    const squared = x * x, cubed = squared * x
    const value = a * cubed + b * squared + c * x + d
    return Math.max(0, Math.min(value, 1))
  })
}
/** KisCubicCurve::isIdentity ignores corner flags and uses Qt's relative
 * qFuzzyCompare ONLY for interior knots. Endpoints must match exactly. */
export { sourceStampCurveIsIdentity as sourceCurveIsIdentity } from '@grafetto/shared'
