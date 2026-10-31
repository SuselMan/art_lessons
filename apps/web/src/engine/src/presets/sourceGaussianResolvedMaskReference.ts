import { sourceCoverageEvaluator, type SourceCoverageEvaluator } from './sourceCoverageEvaluator'
import { sourceFmaF64 as fma64 } from './sourceFmaF64'
import { sourceFmaF32 as fma32 } from './sourceFmaF32'
import { sourceGaussianBionicErf, sourceGaussianBrowserErf } from './sourceGaussianBionicErf'
import { sourceGaussianNeonSqrt, sourceGaussianNeonErf } from './sourceGaussianNeonMath'
import { sourceVector32RefinedDivide } from './sourceVector32'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'
export interface SourceGaussianResolvedCoefficients {
  readonly ycoef: number; readonly center: number; readonly distfactor: number; readonly alphafactor: number
  readonly radius: number; readonly fadeStartValue: number; readonly fadeStart: number; readonly fadeCoeff: number
}
export interface SourceGaussianResolvedMaskRequest {
  readonly profile: 'scalar-bionic-f64-fma-v1' | 'neon64-f32-fma-v1' | 'browser-number-coverage-v1'
  /** Explicit native-derived coefficient input; this API does not assert
   * that arbitrary client coefficients came from a valid KPP/native query. */
  readonly coefficients: SourceGaussianResolvedCoefficients
  readonly effectiveWidth: number; readonly effectiveHeight: number; readonly antialias: boolean
  readonly centerX: number; readonly centerY: number; readonly cos: number; readonly sin: number
  readonly width: number; readonly height: number; readonly maxPixels: number; readonly maxWorkSamples: number
}
const f = Math.fround
/** Isolated CPU value reference, OFF from author/renderer/importer hooks. */
export function prepareSourceGaussianResolvedMask(r: SourceGaussianResolvedMaskRequest): SourceCoverageEvaluator {
  // Own scalar inputs: caller mutation between continuations cannot change a dab.
  r = { ...r, coefficients: { ...r.coefficients } }
  const c = r.coefficients
  if (!['scalar-bionic-f64-fma-v1', 'neon64-f32-fma-v1', 'browser-number-coverage-v1'].includes(r.profile) || typeof r.antialias !== 'boolean'
    || ![c.ycoef, c.center, c.distfactor, c.alphafactor, c.radius, c.fadeStartValue, c.fadeStart, c.fadeCoeff, r.effectiveWidth, r.effectiveHeight, r.centerX, r.centerY, r.cos, r.sin].every(Number.isFinite)
    || ![c.ycoef, c.distfactor, c.radius, r.effectiveWidth, r.effectiveHeight].every(x => x > 0)
    || c.alphafactor < -256 || c.alphafactor > -127 || c.center >= 0 || c.fadeCoeff < 0 || c.fadeStart < 0 || c.fadeStart >= c.radius
    || c.fadeCoeff * (c.radius - c.fadeStart) > 256
    || !Number.isInteger(c.fadeStartValue) || c.fadeStartValue < 0 || c.fadeStartValue > 255
    || Math.abs(r.cos) > 1 || Math.abs(r.sin) > 1
    || ![r.width, r.height, r.maxPixels, r.maxWorkSamples].every(x => Number.isSafeInteger(x) && x > 0)
    || r.width > 4096 || r.height > 4096 || r.maxPixels > 4 * 1024 * 1024 || r.maxWorkSamples > 16 * 1024 * 1024) throw new RangeError('Unsupported resolved Gaussian reference input')
  const n = r.antialias && Math.min(r.effectiveWidth, r.effectiveHeight) < 10
    ? Math.min(r.effectiveWidth, r.effectiveHeight) < 1 ? 6 : 3 : 1
  const samplesPerPixel = n * n as 1 | 9 | 36, pixels = r.width * r.height
  if (pixels > r.maxPixels || pixels * samplesPerPixel > r.maxWorkSamples) throw new RangeError('Resolved Gaussian reference exceeds reserved budget')
  const vector = r.profile === 'neon64-f32-fma-v1' && n === 1
  const bound = (Math.abs(r.centerX) + r.width + Math.abs(r.centerY) + r.height + 1) * Math.max(1, c.ycoef)
  if (!Number.isFinite(bound) || bound > 2 ** (vector ? 50 : 400) || bound * c.distfactor + Math.abs(c.center) > 2 ** (vector ? 120 : 500)
    || (vector && !Object.values(c).every(x => Number.isFinite(f(x))))) throw new RangeError('Resolved Gaussian intermediates exceed finite reference domain')
  const browser=r.profile==='browser-number-coverage-v1'
  const mulAdd=browser?(a:number,b:number,c:number)=>a*b+c:fma64
  const erf=browser?sourceGaussianBrowserErf:sourceGaussianBionicErf
  function scalarTransparency(distance: number): number {
    if (distance > c.radius) return 255
    if (r.antialias && distance > c.fadeStart) return Math.trunc(mulAdd(distance - c.fadeStart, c.fadeCoeff, c.fadeStartValue)) & 255
    const scaled = distance * c.distfactor
    return (255 - Math.trunc(c.alphafactor * (erf(scaled + c.center) - erf(scaled - c.center)))) & 255
  }
  function* evaluate(): Generator<number | null, void> {
    for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) {
      if (!vector) {
        let sum = 0
        for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
          const px = mulAdd(sx, 1 / n, x) - r.centerX, py = mulAdd(sy, 1 / n, y) - r.centerY
          const rx = mulAdd(r.cos, px, -(r.sin * py)), ry = mulAdd(r.sin, px, r.cos * py) * c.ycoef
          sum += scalarTransparency(Math.sqrt(mulAdd(rx, rx, ry * ry)))
          yield sy === n - 1 && sx === n - 1 ? 255 - Math.trunc(sum / samplesPerPixel) : null
        }
        continue
      }
      const px = f(f(x) - f(r.centerX)), py = f(f(y) - f(r.centerY))
      const rx = fma32(px, f(r.cos), -f(f(r.sin) * py))
      const ry = f(fma32(px, f(r.sin), f(f(r.cos) * py)) * f(c.ycoef))
      const distance = sourceGaussianNeonSqrt(fma32(rx, rx, f(ry * ry)))
      let transparency: number
      if (distance > f(c.radius)) transparency = 1
      else if (r.antialias && distance > f(c.fadeStart)) transparency = sourceVector32RefinedDivide(fma32(f(distance - f(c.fadeStart)), f(c.fadeCoeff), f(c.fadeStartValue)), 255)
      else {
        const scaled = f(distance * f(c.distfactor))
        let fullFade = f(f(c.alphafactor) * f(sourceGaussianNeonErf(f(scaled + f(c.center))) - sourceGaussianNeonErf(f(scaled - f(c.center)))))
        if (fullFade < 0) fullFade = 0
        if (fullFade > f(254.974)) fullFade = 255
        transparency = sourceVector32RefinedDivide(f(255 - fullFade), 255)
      }
      const alpha = f(f(1 - transparency) * 255)
      yield (x < Math.floor(r.width / 4) * 4 ? sourceImageRoundEven(alpha) : Math.trunc(alpha)) & 255
    }
  }
  return sourceCoverageEvaluator({ pixels, samplesPerPixel, route: browser ? 'browser-number' : vector ? 'neon64-vector' : 'scalar', stream: evaluate() })
}

/** Off-path synchronous wrapper drains the SAME sample stream. */
export function sourceGaussianResolvedMaskReference(r: SourceGaussianResolvedMaskRequest) {
  const evaluator = prepareSourceGaussianResolvedMask(r)
  const mask = new Uint8Array(evaluator.pixels)
  while (!evaluator.done) evaluator.advance(mask, evaluator.completedPixels, 65536)
  return { mask, route: evaluator.route, samplesPerPixel: evaluator.samplesPerPixel }
}
