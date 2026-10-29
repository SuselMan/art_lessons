import { affineSpan16Straight, affineStraightMask, sampleAffineImageSpan16, type AffineReciprocalEstimate } from '../raster/affineImageSpan16'
import type { SourceDabShape } from './sourcePngGeometry'
import { sourceImageTransformPlan } from './sourceImageTransformPlan'

/** Explicit CPU proof profile. No executing-device detection or wire admission.
 * Straight store selects the old division model or an explicit independently proven
 * SSE reciprocal backend. Android NEON store remains a separate source law. */
export interface SourceImageTransformProfile {
  readonly products: 'separate' | 'summed'
  readonly sourceDecode: 'wide8' | 'narrow4' | 'scalar'
  readonly straightStore: 'sse4-model' | 'sse4-estimate'
  readonly reciprocalEstimate?: AffineReciprocalEstimate
}

/** Consumes the selected prepared ARGB32 STRAIGHT level, INCLUDING its transparent
 * border1. Level preparation is a separate stage (and can have different SIMD
 * unpremultiply laws); it must not pass coverage or already-premultiplied bytes.
 * Geometry and exact covered rows are computed, never supplied by a fixture. */
export function sourceImageTransformPixels(levelRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  const plan = sourceImageTransformPlan(originalWidth, originalHeight, shape, subX, subY)
  const sourceWidth = plan.levelWidth + 2, sourceHeight = plan.levelHeight + 2
  if (!(levelRGBA instanceof Uint8Array) || levelRGBA.length !== sourceWidth * sourceHeight * 4
    || sourceWidth * sourceHeight > 1048576 || !profile || !['sse4-model', 'sse4-estimate'].includes(profile.straightStore)
    || (profile.straightStore === 'sse4-estimate' ? typeof profile.reciprocalEstimate !== 'function' : profile.reciprocalEstimate !== undefined)
    || (profile.products !== 'separate' && profile.products !== 'summed')
    || !['wide8', 'narrow4', 'scalar'].includes(profile.sourceDecode)) throw new RangeError('Invalid prepared level or affine profile')
  if (plan.spans.some(span => span.length > 2048)) throw new RangeError('Affine image span exceeds the verified sampler budget')
  const pixels = new Uint8Array(plan.width * plan.height * 4)
  if (plan.directCopy) {
    for (let y = 0; y < plan.height; y++) pixels.set(levelRGBA.subarray(((y + 1) * sourceWidth + 1) * 4,
      ((y + 1) * sourceWidth + 1 + plan.width) * 4), y * plan.width * 4)
    return pixels
  }
  for (const span of plan.spans) {
    const sampled = sampleAffineImageSpan16(levelRGBA, sourceWidth, sourceHeight, plan.samplingInverse,
      span.x, span.y, span.length, profile.products, profile.sourceDecode, 'sampling')
    pixels.set(affineSpan16Straight(sampled, profile.reciprocalEstimate), (span.y * plan.width + span.x) * 4)
  }
  return pixels
}

/** Closed selected-material -> native A8 path. One affine/straight conversion;
 * this applies inverse-red/alpha once without another premultiply stage. */
export function sourceImageTransformMask(levelRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  return affineStraightMask(sourceImageTransformPixels(levelRGBA, originalWidth, originalHeight, shape, subX, subY, profile))
}
