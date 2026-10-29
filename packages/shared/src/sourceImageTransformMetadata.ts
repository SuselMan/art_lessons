import type { SourceDabShape } from './sourcePngGeometry.js'
import { sourcePngLevelShape, sourcePngPyramid } from './sourcePngPyramid.js'
import { sourceImageAffineType, sourceImageAllocationExtent, sourceImageBaseTransform, sourceImageCompose,
  sourceImageInverse, sourceImageMapRect, type SourceImageMatrix } from './sourceImageTransformAffine.js'
import type { SourceImageAffine } from './sourceImageTransformAffine.js'

const tuple = (m: SourceImageMatrix): SourceImageAffine => [m.a, m.b, m.c, m.d, m.x, m.y]
const translation = (x: number, y: number): SourceImageMatrix => ({ a: 1, b: 0, c: 0, d: 1, x, y })

/** Raw effective raster shape: brush static scale/angle have already been applied;
 * rotation is the native NEGATIVE normalized angle, never normalized again here.
 * This plan owns geometry, not source decoding, interpolation or storage profiles. */
export function sourceImageTransformMetadata(originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number) {
  if (![originalWidth, originalHeight].every(v => Number.isSafeInteger(v) && v >= 1 && v <= 4096)
    || originalWidth * originalHeight > 1048576 || ![subX, subY].every(v => Number.isFinite(v) && v >= 0 && v < 1)
    || ![shape.scale, shape.ratio, shape.rotation].every(Number.isFinite) || shape.scale <= 0 || shape.ratio <= 0) throw new RangeError('Invalid native image transform plan')
  const pyramid = sourcePngPyramid(originalWidth, originalHeight)
  const adjusted = sourcePngLevelShape(pyramid, shape), level = pyramid.levels[adjusted.index]!
  const original = sourceImageBaseTransform(originalWidth, originalHeight, shape.scale, shape.scale * shape.ratio, shape.rotation, subX, subY)
  let transform = sourceImageBaseTransform(level.width, level.height, adjusted.shape.scale, adjusted.shape.scale * adjusted.shape.ratio, shape.rotation, subX, subY)
  const [width, height] = sourceImageAllocationExtent(sourceImageMapRect(original, originalWidth, originalHeight))
  if (width > 4096 || height > 4096 || width * height > 1048576) throw new RangeError('Native transformed image exceeds the allocation budget')
  const directCopy = sourceImageAffineType(transform) === 0
  let iterations = 0
  if (!directCopy) while (sourceImageAffineType(transform) === 1) {
    const fakeScale = transform.a - 10 * Number.EPSILON
    // fromScale caches TxScale even while its coefficients are fuzzy identity.
    // Preserve operator*= scale dispatch rather than reclassifying that factory.
    transform = { a: transform.a * fakeScale, b: transform.b, c: transform.c, d: transform.d * fakeScale,
      x: transform.x * fakeScale, y: transform.y * fakeScale }
    if (++iterations > 10000) throw new RangeError('Native translation workaround failed to converge')
  }
  const forward = sourceImageCompose(translation(-1, -1), transform)
  const inverse = sourceImageInverse(forward)
  const samplingInverse = sourceImageInverse(sourceImageCompose(translation(1 / 65536, 1 / 65536), forward))
  const actualWidth = directCopy ? level.width : width, actualHeight = directCopy ? level.height : height
  return { index: adjusted.index, baseScale: level.scale, levelWidth: level.width, levelHeight: level.height,
    width: actualWidth, height: actualHeight, directCopy, iterations, transform: tuple(transform), forward: tuple(forward), inverse: tuple(inverse),
    samplingInverse: tuple(samplingInverse) }
}
