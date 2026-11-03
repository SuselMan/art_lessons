import { sourceFmaF64 } from './sourceFmaF64'
export type SourceCurveArithmetic='installed-arm64-fused-v1'|'source-functional-fused-f64-v1'
export function isSourceCurveArithmetic(value:unknown):value is SourceCurveArithmetic {return value==='installed-arm64-fused-v1'||value==='source-functional-fused-f64-v1'}
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
  readonly layout: 'soft-mask'|'soft-rectangle-mask'
  readonly resolution: number
  readonly arithmetic: SourceCurveArithmetic
}
export interface SourceCurveSensorLayout {
  readonly layout: 'sensor'
  readonly arithmetic: SourceCurveArithmetic
}
/** The exact polynomial evaluation/sampling law, not an alternative spline
 * solver. Arbitrary control-point compilation still needs native SparseLU. */
function curveEvaluation(input: SourceCurvePolynomial, dense: SourceCurveDenseLayout | SourceCurveSensorLayout | undefined, snapshot: boolean) {
  let {points,coefficients}=input
  if (points.length < 1 || points.length > 256 || coefficients.length !== Math.max(1, points.length - 1)
    || points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 || (i > 0 && p.x <= points[i - 1].x))
    || coefficients.some(c => c.length !== 4 || !c.every(Number.isFinite))) throw new RangeError('Invalid native spline program')
  if (dense !== undefined && (!isSourceCurveArithmetic(dense.arithmetic) || !['soft-mask','soft-rectangle-mask','sensor'].includes(dense.layout)
    || (dense.layout === 'soft-mask'||dense.layout==='soft-rectangle-mask') && (!Number.isSafeInteger(dense.resolution) || dense.resolution < 0 || dense.resolution > (dense.layout==='soft-rectangle-mask'?16383:16382)))) throw new RangeError('Invalid native radial curve layout')
  const curve:SourceCurvePolynomial=snapshot?Object.freeze({points:Object.freeze(points.map(p=>Object.freeze({x:p.x,y:p.y}))),
    coefficients:Object.freeze(coefficients.map(c=>Object.freeze([c[0],c[1],c[2],c[3]] as const)))}):input
  points=curve.points;coefficients=curve.coefficients
  const size = dense === undefined || dense.layout === 'sensor' ? 256 : dense.resolution + (dense.layout==='soft-rectangle-mask'?1:2)
  const end = 1 / (size - 1)
  const fused=dense!==undefined
  const evaluate=(i:number) => {
    const x = Math.max(points[0].x, Math.min(i * end, points[points.length - 1].x))
    let interval = 0
    while (interval < coefficients.length - 1 && !(x < points[interval + 1].x)) interval++
    const [a, b, c, d] = coefficients[interval]
    const squared = x * x, cubed = squared * x
    // Installed image0x42538c..a0: b*x², two FMADDs, then a separate
    // final add of d. The functional coefficient profile reuses this same
    // evaluation graph with its own provenance; it does not claim ISA identity.
    // Preserve the original host/separate option law by default.
    const value = !fused ? a * cubed + b * squared + c * x + d
      : d + sourceFmaF64(c, x, sourceFmaF64(a, cubed, b * squared))
    return Math.max(0, Math.min(value, 1))
  }
  return {size,curve,evaluate}
}
export function sourceCurveTransfer(curve:SourceCurvePolynomial,dense?:SourceCurveDenseLayout|SourceCurveSensorLayout):readonly number[] {
  const plan=curveEvaluation(curve,dense,false)
  return Array.from({length:plan.size},(_,i)=>plan.evaluate(i))
}
/** Owns only bounded source metadata. Caller owns/reserves output storage. */
export function prepareSourceCurveTransfer(curve:SourceCurvePolynomial,dense?:SourceCurveDenseLayout|SourceCurveSensorLayout) {
  const plan=curveEvaluation(curve,dense,true)
  let completed=0,cancelled=false
  return Object.freeze({
    size:plan.size,curve:plan.curve,
    get completedValues(){return completed},
    get done(){return completed===plan.size},
    advance(target:Float64Array,offset:number,maxValues:number) {
      if(cancelled)throw new Error('Curve transfer cancelled')
      if(!(target instanceof Float64Array)||!Number.isSafeInteger(offset)||offset<0||offset>target.length
        ||!Number.isSafeInteger(maxValues)||maxValues<=0)throw new RangeError('Invalid curve transfer continuation')
      const written=Math.min(maxValues,target.length-offset,plan.size-completed)
      for(let i=0;i<written;i++)target[offset+i]=plan.evaluate(completed++)
      return {written,done:completed===plan.size}
    },
    cancel(){cancelled=true},
  })
}
/** KisCubicCurve::isIdentity ignores corner flags and uses Qt's relative
 * qFuzzyCompare ONLY for interior knots. Endpoints must match exactly. */
export { sourceStampCurveIsIdentity as sourceCurveIsIdentity } from '@grafetto/shared'
