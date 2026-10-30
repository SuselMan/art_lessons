import { sourceAutoGeometry, type SourceAutoGeometryShape } from './sourceAutoGeometry'
import { sourceGaussianCoefficients } from './sourceGaussianCoefficients'
import { prepareSourceGaussianResolvedMask, type SourceGaussianResolvedMaskRequest } from './sourceGaussianResolvedMaskReference'

export interface SourceGaussianTip {
  readonly kind: 'auto'; readonly generator: 'gauss'; readonly shape: 'circle'
  readonly diameter: number; readonly ratio: number; readonly horizontalFade: number; readonly verticalFade: number
  readonly spikes: 2; readonly softness: 1; readonly randomness: 0; readonly density: 1; readonly antialias: boolean
}
export interface SourceGaussianDabRequest {
  readonly dialect: 'krita-gaussian-auto-qt5-arm64-v1'
  readonly tip: SourceGaussianTip
  readonly storedScale: number; readonly storedAngle: number; readonly shape: SourceAutoGeometryShape
  readonly subpixelX: number; readonly subpixelY: number
  readonly coverageProfile: SourceGaussianResolvedMaskRequest['profile']
  readonly maxPixels: number; readonly maxWorkSamples: number
}
/** Bounded, isolated CPU service. No descriptor/importer/author/cache admission.
 * Reuses the common original auto-brush geometry law; coverage consumes raw
 * angle and shape scale, whereas geometry also consumes stored brush scale. */
export function prepareSourceGaussianDab(request: SourceGaussianDabRequest) {
  const { tip, shape } = request
  if (request.dialect !== 'krita-gaussian-auto-qt5-arm64-v1'
    || tip.kind !== 'auto' || tip.generator !== 'gauss' || tip.shape !== 'circle'
    || tip.spikes !== 2 || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || typeof tip.antialias !== 'boolean'
    || !['scalar-bionic-f64-fma-v1', 'neon64-f32-fma-v1'].includes(request.coverageProfile)
    || ![request.storedScale, request.storedAngle, shape.scale, shape.ratio, shape.rotation, request.subpixelX, request.subpixelY].every(Number.isFinite)
    || request.storedScale < 0 || shape.scale <= 0 || shape.ratio <= 0
    || request.subpixelX < 0 || request.subpixelX >= 1 || request.subpixelY < 0 || request.subpixelY >= 1
    || !Number.isSafeInteger(request.maxPixels) || request.maxPixels <= 0 || request.maxPixels > 1024 * 1024
    || !Number.isSafeInteger(request.maxWorkSamples) || request.maxWorkSamples <= 0 || request.maxWorkSamples > 16 * 1024 * 1024) throw new RangeError('Unsupported source Gaussian dab')
  const generatorScale = [shape.scale, shape.scale * shape.ratio] as const
  const { coefficients, effectiveWidth, effectiveHeight } = sourceGaussianCoefficients({
    diameter: tip.diameter, ratio: tip.ratio, horizontalFade: tip.horizontalFade, verticalFade: tip.verticalFade,
    scaleX: generatorScale[0], scaleY: generatorScale[1],
  })
  // The profile name is preserved: this is reuse of an existing geometric law,
  // not a claim that the Gaussian generator is a default-mask generator.
  const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
    diameter: tip.diameter, ratio: tip.ratio, spikes: 2, scale: request.storedScale, angle: request.storedAngle },
  shape, request.subpixelX, request.subpixelY)
  const [width, height] = geometry.maskSize
  if (width > 4096 || height > 4096 || width * height > request.maxPixels) throw new RangeError('Gaussian dab exceeds reserved window')
  const center = [geometry.hotSpot[0] - .5 + request.subpixelX, geometry.hotSpot[1] - .5 + request.subpixelY] as const
  const coverageAngle = shape.rotation + request.storedAngle
  const evaluator = prepareSourceGaussianResolvedMask({ profile: request.coverageProfile, coefficients,
    effectiveWidth, effectiveHeight, antialias: tip.antialias,
    centerX: center[0], centerY: center[1], cos: Math.cos(coverageAngle), sin: Math.sin(coverageAngle),
    width, height, maxPixels: request.maxPixels, maxWorkSamples: request.maxWorkSamples })
  return { dialect: request.dialect, geometry, center, generatorScale, coverageAngle,
    requestedProfile: request.coverageProfile, coefficients, evaluator }
}

/** Synchronous convenience path over the single bounded sample cursor. */
export function sourceGaussianDab(request: SourceGaussianDabRequest) {
  const { evaluator, ...metadata } = prepareSourceGaussianDab(request)
  const mask = new Uint8Array(evaluator.pixels)
  while (!evaluator.done) evaluator.advance(mask, evaluator.completedPixels, 65536)
  return { ...metadata, mask, route: evaluator.route, samplesPerPixel: evaluator.samplesPerPixel }
}
