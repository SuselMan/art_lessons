import { sourceAutoGeometry, type SourceAutoGeometry, type SourceAutoGeometryShape } from './sourceAutoGeometry'
import { sourceDefaultAutoMaskReference, type SourceDefaultAutoMaskRequest, type SourceDefaultAutoMaskTip } from './sourceDefaultAutoMaskReference'

/** Closed default-auto profile, independent of image/CAS materials and PNG. */
export interface SourceDefaultAutoDabRequest {
  readonly dialect: 'krita-default-auto-qt5-arm64-v1'
  readonly tip: SourceDefaultAutoMaskTip
  readonly storedScale: number
  readonly storedAngle: number
  readonly shape: SourceAutoGeometryShape
  readonly subpixelX: number
  readonly subpixelY: number
  /** Explicit requested arithmetic route; native tiny-size scalar fallback applies. */
  readonly coverageProfile: SourceDefaultAutoMaskRequest['profile']
  /** Caller reservation, capped to1M A8 bytes and4096 per side before allocation. */
  readonly maxPixels: number
  readonly maxWorkSamples: number
}
export interface SourceDefaultAutoDab {
  readonly dialect: SourceDefaultAutoDabRequest['dialect']
  readonly geometry: SourceAutoGeometry
  readonly center: readonly [number, number]
  readonly generatorScale: readonly [number, number]
  readonly coverageAngle: number
  readonly requestedProfile: SourceDefaultAutoMaskRequest['profile']
  readonly route: 'scalar' | 'neon64-vector'
  readonly samplesPerPixel: 1 | 9 | 36
  /** Fresh caller-owned A8 plane, row0 corresponds to native local y0.
   * Coverage only: neither ink alpha nor destination/color composition. */
  readonly mask: Uint8Array
}
/** Synchronous bounded CPU fallback. No cache, global state or quota ownership.
 * Math.sin/cos identity is proven only for retained native fixture inputs. */
export function sourceDefaultAutoDab(request: SourceDefaultAutoDabRequest): SourceDefaultAutoDab {
  const { tip, shape } = request
  if (request.dialect !== 'krita-default-auto-qt5-arm64-v1'
    || tip.kind !== 'auto' || tip.generator !== 'default' || !['circle', 'rect'].includes(tip.shape)
    || tip.spikes !== 2 || tip.softness !== 1 || tip.randomness !== 0 || tip.density !== 1 || typeof tip.antialias !== 'boolean'
    || !['scalar-f64-fma-v1', 'neon64-f32-fma-v1'].includes(request.coverageProfile)
    || ![tip.diameter, tip.ratio, tip.horizontalFade, tip.verticalFade, request.storedScale, request.storedAngle,
      shape.scale, shape.ratio, shape.rotation, request.subpixelX, request.subpixelY].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || request.storedScale < 0 || shape.scale <= 0 || shape.ratio <= 0
    || tip.horizontalFade < 0 || tip.horizontalFade > 1 || tip.verticalFade < 0 || tip.verticalFade > 1
    || request.subpixelX < 0 || request.subpixelX >= 1 || request.subpixelY < 0 || request.subpixelY >= 1
    || !Number.isSafeInteger(request.maxPixels) || request.maxPixels <= 0 || request.maxPixels > 1024 * 1024
    || !Number.isSafeInteger(request.maxWorkSamples) || request.maxWorkSamples <= 0 || request.maxWorkSamples > 16 * 1024 * 1024) {
    throw new RangeError('Unsupported source default auto dab')
  }
  const geometry = sourceAutoGeometry({ kind: 'auto', profile: 'default-auto-qt5-arm64-f64-v1',
    diameter: tip.diameter, ratio: tip.ratio, spikes: 2, scale: request.storedScale, angle: request.storedAngle },
  shape, request.subpixelX, request.subpixelY)
  const [width, height] = geometry.maskSize
  // Geometry is allocation-free. Reject both fixed bounds and caller reservation
  // before the mask evaluator can construct its Uint8Array.
  if (width > 4096 || height > 4096 || width * height > request.maxPixels) throw new RangeError('Default auto dab exceeds reserved window')
  const center = [geometry.hotSpot[0] - .5 + request.subpixelX, geometry.hotSpot[1] - .5 + request.subpixelY] as const
  const generatorScale = [shape.scale, shape.scale * shape.ratio] as const
  const coverageAngle = shape.rotation + request.storedAngle
  const result = sourceDefaultAutoMaskReference({ tip, profile: request.coverageProfile,
    scaleX: generatorScale[0], scaleY: generatorScale[1], cos: Math.cos(coverageAngle), sin: Math.sin(coverageAngle),
    centerX: center[0], centerY: center[1], width, height,
    maxPixels: request.maxPixels, maxWorkSamples: request.maxWorkSamples })
  return { dialect: request.dialect, geometry, center, generatorScale, coverageAngle,
    requestedProfile: request.coverageProfile, ...result }
}
