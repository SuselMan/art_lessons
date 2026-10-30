import { sourceAutoGeometry, type SourceAutoGeometryShape } from './sourceAutoGeometry'
import { sourceCurveTransfer, type SourceCurvePolynomial } from './sourceCurve'
import { sourceFmaF64 as fma64 } from './sourceFmaF64'
import { sourceFmaF32 as fma32 } from './sourceFmaF32'
import { sourceImageRoundEven } from './sourceImageTransformReciprocal'

export interface SourceSoftCircleTip {
  readonly kind: 'auto'; readonly generator: 'soft'; readonly shape: 'circle'
  readonly diameter: number; readonly ratio: number; readonly horizontalFade: number; readonly verticalFade: number
  readonly spikes: 2; readonly softness: 1; readonly randomness: 0; readonly density: 1; readonly antialias: false
}
export interface SourceSoftCircleProgram {
  readonly tip: SourceSoftCircleTip
  /** Explicit supplied native SparseLU polynomial; no portable point solver. */
  readonly curve: SourceCurvePolynomial
  readonly resolution: number
  readonly table: readonly number[]
}
const ownedPrograms = new WeakSet<SourceSoftCircleProgram>()
/** Compile the original-resolution table ONCE. This is not raw-points admission
 * or a lookup of static stock tables. Caller supplies authoritative coefficients. */
export function compileSourceSoftCircleProgram(tip: SourceSoftCircleTip, nativeCurve: SourceCurvePolynomial, maxTableValues: number): SourceSoftCircleProgram {
  if (tip.kind !== 'auto' || tip.generator !== 'soft' || tip.shape !== 'circle'
    || tip.spikes !== 2 || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || tip.antialias !== false
    || ![tip.diameter, tip.ratio, tip.horizontalFade, tip.verticalFade].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || tip.ratio > 1
    || tip.horizontalFade < 0 || tip.horizontalFade > 1 || tip.verticalFade < 0 || tip.verticalFade > 1
    || !Number.isSafeInteger(maxTableValues) || maxTableValues < 2 || maxTableValues > 16384) throw new RangeError('Unsupported source soft-circle program')
  // In this closed spikes2/ratio<=1 domain original width is the diameter and
  // dominates original height. Physical/request scale never changes this size.
  const resolution = Math.floor(tip.diameter * 4 + .5)
  if (!Number.isSafeInteger(resolution) || resolution + 2 > maxTableValues) throw new RangeError('Soft-circle table exceeds reserved budget')
  const values = sourceCurveTransfer(nativeCurve, { layout: 'soft-mask', resolution, arithmetic: 'installed-arm64-fused-v1' })
  if (!values.every(Number.isFinite)) throw new RangeError('Soft-circle table outside finite domain')
  const table = Object.freeze(values)
  const curve = Object.freeze({
    points: Object.freeze(nativeCurve.points.map(p => Object.freeze({ x: p.x, y: p.y }))),
    coefficients: Object.freeze(nativeCurve.coefficients.map(c => Object.freeze([c[0], c[1], c[2], c[3]] as const))),
  })
  const program = Object.freeze({ tip: Object.freeze({ ...tip }), curve, resolution, table })
  ownedPrograms.add(program)
  return program
}
export interface SourceSoftCircleDabRequest {
  readonly dialect: 'krita-soft-circle-qt5-arm64-v1'
  readonly program: SourceSoftCircleProgram
  readonly storedScale: number; readonly storedAngle: number; readonly shape: SourceAutoGeometryShape
  readonly subpixelX: number; readonly subpixelY: number
  readonly coverageProfile: 'scalar-f64-fma-v1' | 'neon64-f32-fma-v1'
  readonly maxPixels: number; readonly maxWorkSamples: number
}
const f = Math.fround
/** One bounded CPU coverage body for scalar/NEON, reused by the whole-dab API.
 * OFF from author/importer/renderer/wire. AA and nonunit softness are not admitted. */
export function sourceSoftCircleDab(request: SourceSoftCircleDabRequest) {
  const { program, shape } = request
  if (request.dialect !== 'krita-soft-circle-qt5-arm64-v1' || !ownedPrograms.has(program)
    || !['scalar-f64-fma-v1', 'neon64-f32-fma-v1'].includes(request.coverageProfile)
    || ![request.storedScale, request.storedAngle, shape.scale, shape.ratio, shape.rotation, request.subpixelX, request.subpixelY].every(Number.isFinite)
    || request.storedScale < 0 || shape.scale <= 0 || shape.ratio <= 0
    || request.subpixelX < 0 || request.subpixelX >= 1 || request.subpixelY < 0 || request.subpixelY >= 1
    || !Number.isSafeInteger(request.maxPixels) || request.maxPixels <= 0 || request.maxPixels > 1024 * 1024
    || !Number.isSafeInteger(request.maxWorkSamples) || request.maxWorkSamples <= 0 || request.maxWorkSamples > 16 * 1024 * 1024) throw new RangeError('Unsupported source soft-circle dab')
  const tip = program.tip
  const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
    diameter: tip.diameter, ratio: tip.ratio, spikes: 2, scale: request.storedScale, angle: request.storedAngle },
  shape, request.subpixelX, request.subpixelY)
  const [width, height] = geometry.maskSize, pixels = width * height
  if (width > 4096 || height > 4096 || pixels > request.maxPixels || pixels > request.maxWorkSamples) throw new RangeError('Soft-circle dab exceeds reserved window/work')
  const center = [geometry.hotSpot[0] - .5 + request.subpixelX, geometry.hotSpot[1] - .5 + request.subpixelY] as const
  const generatorScale = [shape.scale, shape.scale * shape.ratio] as const
  const xcoef = 2 / (tip.diameter * generatorScale[0]), ycoef = 2 / ((tip.diameter * tip.ratio) * generatorScale[1])
  const coverageAngle = shape.rotation + request.storedAngle, cos = Math.cos(coverageAngle), sin = Math.sin(coverageAngle)
  const vector = request.coverageProfile === 'neon64-f32-fma-v1'
  const bound = (Math.abs(center[0]) + width + Math.abs(center[1]) + height + 1) * Math.max(xcoef, ycoef)
  if (![xcoef, ycoef, cos, sin, bound].every(Number.isFinite) || xcoef <= 0 || ycoef <= 0
    || bound > 2 ** (vector ? 60 : 400) || (vector && ![xcoef, ycoef].every(v => Number.isFinite(f(v))))) throw new RangeError('Soft-circle intermediates outside finite domain')
  const mask = new Uint8Array(pixels), table = program.table, resolution = program.resolution
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let alpha: number
    if (!vector) {
      const px = x - center[0], py = y - center[1]
      const rx = fma64(cos, px, -(sin * py)) * xcoef, ry = fma64(sin, px, cos * py) * ycoef
      const distance = fma64(rx, rx, ry * ry)
      if (distance > 1) alpha = 0
      else {
        const scaled = distance * resolution, index = Math.trunc(scaled), fraction = scaled - index
        const full = fma64(fraction, table[index + 1], (1 - fraction) * table[index])
        alpha = (255 - Math.trunc((1 - full) * 255)) & 255
      }
    } else {
      const px = f(f(x) - f(center[0])), py = f(f(y) - f(center[1]))
      const rx = f(fma32(px, f(cos), -f(f(sin) * py)) * f(xcoef))
      const ry = f(fma32(px, f(sin), f(f(cos) * py)) * f(ycoef))
      const distance = fma32(rx, rx, f(ry * ry))
      if (distance > 1) alpha = 0
      else {
        const scaled = f(distance * f(resolution)), index = Math.trunc(scaled), fraction = f(scaled - f(index))
        const full = Math.max(0, fma32(fraction, f(table[index + 1]), f(f(1 - fraction) * f(table[index]))))
        const fade = full >= 1 ? 0 : f(1 - full), value = f(f(1 - fade) * 255)
        alpha = (x < Math.floor(width / 4) * 4 ? sourceImageRoundEven(value) : Math.trunc(value)) & 255
      }
    }
    mask[y * width + x] = alpha
  }
  return { dialect: request.dialect, geometry, center, generatorScale, coverageAngle,
    route: vector ? 'neon64-vector' as const : 'scalar' as const, samplesPerPixel: 1 as const, mask }
}
