import { affineSpan16StraightInteger64, affineSpan16Straight, affineStraightMask, sampleAffineImageSpan16, type AffineReciprocalEstimate } from '../raster/affineImageSpan16'
import { sourceImageScalePixels, sourceImageScaleStraightSse } from './sourceImageScalePixels'
import type { SourceDabShape } from './sourcePngGeometry'
import { sourceImageTransformPlan } from './sourceImageTransformPlan'

/** Explicit CPU proof profile. No executing-device detection or wire admission.
 * Straight store selects the old division model or an explicit independently proven
 * SSE reciprocal backend, or the distinct generic Qt wordsize64 store.
 * Decode/interpolation laws remain independently explicit; this is not CPU dispatch. */
export interface SourceImageTransformProfile {
  readonly products: 'separate' | 'summed'
  readonly sourceDecode: 'wide8' | 'narrow4' | 'scalar'
  readonly straightStore: 'sse4-model' | 'sse4-estimate' | 'qt-wordsize64'
  readonly reciprocalEstimate?: AffineReciprocalEstimate
}

function checkedProfile(profile: SourceImageTransformProfile): void {
  if (!profile || !['sse4-model', 'sse4-estimate', 'qt-wordsize64'].includes(profile.straightStore)
    || (profile.straightStore === 'sse4-estimate' ? typeof profile.reciprocalEstimate !== 'function' : profile.reciprocalEstimate !== undefined)
    || (profile.products !== 'separate' && profile.products !== 'summed')
    || !['wide8', 'narrow4', 'scalar'].includes(profile.sourceDecode)) throw new RangeError('Invalid affine image profile')
}

/** Consumes the selected prepared ARGB32 STRAIGHT level, INCLUDING its transparent
 * border1. Level preparation is a separate stage (and can have different SIMD
 * unpremultiply laws); it must not pass coverage or already-premultiplied bytes.
 * Geometry and exact covered rows are computed, never supplied by a fixture. */
export function sourceImageTransformPixels(levelRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  checkedProfile(profile)
  const plan = sourceImageTransformPlan(originalWidth, originalHeight, shape, subX, subY)
  const sourceWidth = plan.levelWidth + 2, sourceHeight = plan.levelHeight + 2
  if (!(levelRGBA instanceof Uint8Array) || levelRGBA.length !== sourceWidth * sourceHeight * 4
    || sourceWidth * sourceHeight > 1048576) throw new RangeError('Invalid prepared level or affine profile')
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
    pixels.set(profile.straightStore === 'qt-wordsize64' ? affineSpan16StraightInteger64(sampled)
      : affineSpan16Straight(sampled, profile.reciprocalEstimate), (span.y * plan.width + span.x) * 4)
  }
  return pixels
}

/** Closed selected-material -> native A8 path. One affine/straight conversion;
 * this applies inverse-red/alpha once without another premultiply stage. */
export function sourceImageTransformMask(levelRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  return affineStraightMask(sourceImageTransformPixels(levelRGBA, originalWidth, originalHeight, shape, subX, subY, profile))
}

/** Closed CPU reference from original prepared straightRGBA8 pixels. The selected
 * level is always built directly from the original, never a previous mip level.
 * Production callers can cache prepared levels and use sourceImageTransformPixels;
 * this reference does not introduce another material cache or resampler. */
export function sourceImageTransformPreparedPixels(originalRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  if (!(originalRGBA instanceof Uint8Array) || originalRGBA.length !== originalWidth * originalHeight * 4
    || !profile || profile.straightStore !== 'sse4-estimate' || typeof profile.reciprocalEstimate !== 'function') throw new RangeError('Invalid original prepared image profile')
  checkedProfile(profile)
  const plan = sourceImageTransformPlan(originalWidth, originalHeight, shape, subX, subY)
  const sourceWidth = plan.levelWidth + 2, sourceHeight = plan.levelHeight + 2
  if (sourceWidth * sourceHeight > 1048576) throw new RangeError('Prepared level border exceeds the image budget')
  const resized = sourceImageScalePixels(originalRGBA, originalWidth, originalHeight, plan.levelWidth, plan.levelHeight, 'simd')
  const straight = sourceImageScaleStraightSse(resized, profile.reciprocalEstimate)
  const level = new Uint8Array(sourceWidth * sourceHeight * 4)
  for (let y = 0; y < plan.levelHeight; y++) level.set(straight.subarray(y * plan.levelWidth * 4,
    (y + 1) * plan.levelWidth * 4), ((y + 1) * sourceWidth + 1) * 4)
  return sourceImageTransformPixels(level, originalWidth, originalHeight, shape, subX, subY, profile)
}

export function sourceImageTransformPreparedMask(originalRGBA: Uint8Array, originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number, profile: SourceImageTransformProfile): Uint8Array {
  return affineStraightMask(sourceImageTransformPreparedPixels(originalRGBA, originalWidth, originalHeight, shape, subX, subY, profile))
}
