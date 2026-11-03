import {sourceAutoSector} from './sourceAutoSector'
import { sourceCoverageEvaluator, type SourceCoverageEvaluator } from './sourceCoverageEvaluator'
import { sourceFmaF64 as fma64 } from './sourceFmaF64'
import { sourceFmaF32 as fma32 } from './sourceFmaF32'
import { arm64ReciprocalEstimateF32 } from './sourceArmFrecpe'

export interface SourceDefaultAutoMaskTip {
  readonly kind: 'auto'
  readonly generator: 'default'
  readonly shape: 'circle' | 'rect'
  readonly diameter: number
  readonly ratio: number
  readonly horizontalFade: number
  readonly verticalFade: number
  readonly antialias: boolean
  readonly spikes: number
  readonly softness: 1
  readonly randomness: 0
  readonly density: 1
}
export interface SourceDefaultAutoMaskRequest {
  readonly softness?:number
  readonly tip: SourceDefaultAutoMaskTip
  readonly profile: 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1' | 'browser-number-coverage-v1'
  readonly scaleX: number
  readonly scaleY: number
  readonly cos: number
  readonly sin: number
  readonly centerX: number
  readonly centerY: number
  readonly width: number
  readonly height: number
  /** Caller must reserve output bytes and sampled work before evaluation. */
  readonly maxPixels: number
  readonly maxWorkSamples: number
}
export interface SourceDefaultAutoMaskResult {
  readonly mask: Uint8Array
  readonly route: 'scalar' | 'neon64-vector' | 'browser-number'
  readonly samplesPerPixel: 1 | 9 | 36
}
const f = Math.fround
function rne(value: number): number {
  const whole = Math.floor(value), remainder = value - whole
  return remainder > .5 ? whole + 1 : remainder < .5 ? whole : whole + whole % 2
}
function refinedDivision(numerator: number, denominator: number): number {
  // ARM reciprocal-step defines 0*Inf as a special 2 result. A zero divisor
  // therefore follows IEEE division here; later native integer conversion
  // maps NaN to0. These intermediates do not enter the finite FMA reference.
  if (denominator === 0) return numerator / denominator
  let reciprocal = arm64ReciprocalEstimateF32(denominator)
  reciprocal = f(reciprocal * fma32(-denominator, reciprocal, 2))
  reciprocal = f(reciprocal * fma32(-denominator, reciprocal, 2))
  return f(numerator * reciprocal)
}
/** CPU reference with explicit allocation/work preflight. It does not select
 * the installed GUI factory, multiply ink alpha, or implement a hot GPU path. */
export function prepareSourceDefaultAutoMask(request: SourceDefaultAutoMaskRequest): SourceDefaultAutoMaskEvaluator {
  request = Object.freeze({ ...request, tip: Object.freeze({ ...request.tip }) })
  const { tip, width, height } = request
  const softness=request.softness??1
  if(!Number.isFinite(softness)||softness<0||softness>1)throw new RangeError('Invalid Auto softness')
  if (tip.kind !== 'auto' || tip.generator !== 'default' || !['circle', 'rect'].includes(tip.shape)
    || (!Number.isSafeInteger(tip.spikes)||tip.spikes<2||tip.spikes>64) || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || typeof tip.antialias !== 'boolean'
    || !['scalar-f64-fma-v1', 'neon64-f32-fma-v1', 'browser-number-coverage-v1'].includes(request.profile)
    || ![tip.diameter, tip.ratio, tip.horizontalFade, tip.verticalFade, request.scaleX, request.scaleY,
      request.cos, request.sin, request.centerX, request.centerY].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || request.scaleX <= 0 || request.scaleY <= 0
    || tip.horizontalFade < 0 || tip.horizontalFade > 1 || tip.verticalFade < 0 || tip.verticalFade > 1
    || Math.abs(request.cos) > 1 || Math.abs(request.sin) > 1
    || ![width, height, request.maxPixels, request.maxWorkSamples].every(v => Number.isSafeInteger(v) && v > 0)
    || request.maxPixels > 4 * 1024 * 1024 || request.maxWorkSamples > 16 * 1024 * 1024) throw new RangeError('Unsupported default auto mask reference input')
  const effectiveWidth = tip.diameter * request.scaleX, effectiveHeight = (tip.diameter * tip.ratio) * request.scaleY
  const samples = tip.antialias && (effectiveWidth < 10 || effectiveHeight < 10)
    ? effectiveWidth < 1 || effectiveHeight < 1 ? 6 : 3 : 1
  const samplesPerPixel = samples * samples as 1 | 9 | 36
  const pixels = width * height
  if (!Number.isSafeInteger(pixels) || pixels > request.maxPixels || pixels * samplesPerPixel > request.maxWorkSamples) throw new RangeError('Auto mask reference exceeds reserved budget')
  const xCoefficient = 2 / effectiveWidth, yCoefficient = 2 / effectiveHeight
  const xFade = (tip.horizontalFade === 0 ? 1 : 2 / (tip.horizontalFade * effectiveWidth))/Math.max(.01,softness)
  const yFade = (tip.verticalFade === 0 ? 1 : 2 / (tip.verticalFade * effectiveHeight))/Math.max(.01,softness)
  if (![xCoefficient, yCoefficient, xFade, yFade].every(v => Number.isFinite(v) && Number.isFinite(f(v)))) throw new RangeError('Auto mask coefficients exceed finite reference profile')
  const vector = request.profile === 'neon64-f32-fma-v1' && samples === 1 && tip.spikes===2, rectangle = tip.shape === 'rect'
  // Bound every intermediate before allocating. This finite reference does
  // not model overflow/NaN propagation of arbitrary malformed ABI state.
  const bx = Math.abs(request.centerX) + width + 1, by = Math.abs(request.centerY) + height + 1
  const rxBound = Math.abs(request.cos) * bx + Math.abs(request.sin) * by
  const ryBound = Math.abs(request.sin) * bx + Math.abs(request.cos) * by
  const coefficientBound = Math.max(rxBound * xCoefficient, ryBound * yCoefficient,
    (rxBound + 1) * xFade, (ryBound + 1) * yFade)
  if (!Number.isFinite(coefficientBound) || coefficientBound > 2 ** (vector ? 60 : 500)
    || Math.max(rxBound, ryBound) > 2 ** (vector ? 120 : 500)) throw new RangeError('Auto mask intermediates exceed finite reference profile')
  const browser=request.profile==='browser-number-coverage-v1'
  const mulAdd=browser?(a:number,b:number,c:number)=>a*b+c:fma64
  function scalarValue(rawX: number, rawY: number): number {
    const folded=sourceAutoSector(rawX,rawY,tip.spikes), x = rectangle ? Math.abs(folded[0]) : folded[0], y = Math.abs(folded[1])
    const nx = x * xCoefficient, ny = y * yCoefficient
    if (rectangle) {
      if (nx > 1 || ny > 1) return 255
      const fx = (Math.abs(x) + (tip.antialias ? 1 : 0)) * xFade, fy = (y + (tip.antialias ? 1 : 0)) * yFade
      const vx = nx * (fx - 1) / (fx - nx), vy = ny * (fy - 1) / (fy - ny)
      let value = fx > 1 ? vx : 0
      if (vx < vy && fy > 1) value = vy
      return Math.trunc(value * 255) & 255
    }
    const radius = mulAdd(nx, nx, ny * ny)
    if (radius > 1) return 255
    const fx = (tip.antialias ? Math.abs(x) + 1 : x) * xFade, fy = (tip.antialias ? y + 1 : y) * yFade
    const fadeRadius = mulAdd(fx, fx, fy * fy)
    return fadeRadius < 1 ? 0 : Math.trunc(((255 * radius) * (fadeRadius - 1)) / (fadeRadius - radius)) & 255
  }
  function* evaluate(): Generator<number | null, void> {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!vector) {
      let sum = 0
      for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
        const px = mulAdd(sx, 1 / samples, x) - request.centerX, py = mulAdd(sy, 1 / samples, y) - request.centerY
        sum += scalarValue(mulAdd(request.cos, px, -(request.sin * py)), mulAdd(request.sin, px, request.cos * py))
        yield sy === samples - 1 && sx === samples - 1 ? 255 - Math.trunc(sum / samplesPerPixel) : null
      }
      continue
    }
    const px = f(f(x) - f(request.centerX)), py = f(f(y) - f(request.centerY)), cos = f(request.cos), sin = f(request.sin)
    const sinY = f(sin * py), cosY = f(cos * py)
    let rx = rectangle ? f(f(px * cos) - sinY) : fma32(px, cos, -sinY), ry = fma32(px, sin, cosY)
    let nx = f(rx * f(xCoefficient)), ny = f(ry * f(yCoefficient)), fade: number
    if (rectangle) {
      rx = Math.abs(rx); ry = Math.abs(ry); nx = f(rx * f(xCoefficient)); ny = f(ry * f(yCoefficient))
      if (Math.max(nx, ny) > 1) fade = 1
      else {
        const fx = f(f(rx + (tip.antialias ? 1 : 0)) * f(xFade)), fy = f(f(ry + (tip.antialias ? 1 : 0)) * f(yFade))
        const a = refinedDivision(f(nx * f(fx - 1)), f(fx - nx))
        const b = refinedDivision(f(ny * f(fy - 1)), f(fy - ny))
        // Comparison consumes the unmasked axis values, including NaN at0/0.
        fade = fx > 1 ? a : 0
        if (a < b && fy > 1) fade = b
      }
    } else {
      const radius = fma32(nx, nx, f(ny * ny))
      if (radius > 1) fade = 1
      else {
        rx = tip.antialias ? f(Math.abs(rx) + 1) : rx; ry = tip.antialias ? f(Math.abs(ry) + 1) : ry
        nx = f(rx * f(xFade)); ny = f(ry * f(yFade))
        const fadeRadius = fma32(nx, nx, f(ny * ny))
        fade = fadeRadius < 1 ? 0 : refinedDivision(f(radius * f(fadeRadius - 1)), f(fadeRadius - radius))
      }
    }
    const alpha = f(f(1 - fade) * 255)
    yield (x < Math.floor(width / 4) * 4 ? rne(alpha) : Math.trunc(alpha)) & 255
  }
  }
  return sourceCoverageEvaluator({ pixels, samplesPerPixel, route: browser ? 'browser-number' : vector ? 'neon64-vector' : 'scalar', stream: evaluate() })
}

export type SourceDefaultAutoMaskEvaluator = SourceCoverageEvaluator

export function sourceDefaultAutoMaskReference(request: SourceDefaultAutoMaskRequest): SourceDefaultAutoMaskResult {
  const evaluator = prepareSourceDefaultAutoMask(request)
  const mask = new Uint8Array(evaluator.pixels)
  while (!evaluator.done) evaluator.advance(mask, evaluator.completedPixels, 65536)
  return { mask, route: evaluator.route, samplesPerPixel: evaluator.samplesPerPixel }
}
