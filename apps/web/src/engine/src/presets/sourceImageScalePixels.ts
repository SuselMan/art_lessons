import { sourceImageSseReciprocal, sourceImageRoundEven, type SourceImageReciprocalEstimate } from './sourceImageTransformReciprocal'
import { assertIntegerImageScaleBudget, scaleIntegerImageU8, type IntegerImageInterpolationLaw } from '../raster/integerImageScale'

/** Both laws occur in Qt: scalar bilinear rounds X then Y, SSE2/NEON Y then X.
 * A future canonical material profile must persist the choice across all peers. */
export type SourceImageInterpolationLaw = IntegerImageInterpolationLaw
export interface SourceScaledImage {
  readonly pixels: Uint8Array
  readonly format: 'straight' | 'premultiplied'
}
const MAX_PIXELS = 1048576

/** Bounded, source-informed independent integer model of ARGB32 QImage::scaled
 * smooth kernels, exposed in platform-independent RGBA byte order. Does not include
 * QPainter affine sampling. The identity shortcut retains straight input pixels.
 * The caller must provide an immutable input while this synchronous call runs. */
export function sourceImageScalePixels(input: Uint8Array, width: number, height: number,
  targetWidth: number, targetHeight: number, law: SourceImageInterpolationLaw): SourceScaledImage {
  // Validate every size and exact input byte count before any output/table allocation.
  if (![width, height, targetWidth, targetHeight].every(n => Number.isInteger(n) && n >= 1 && n <= 4096)
    || width * height > MAX_PIXELS || targetWidth * targetHeight > MAX_PIXELS
    || !(input instanceof Uint8Array) || input.byteLength !== width * height * 4
    || (law !== 'scalar' && law !== 'simd')) throw new RangeError('Invalid bounded smooth image input')
  assertIntegerImageScaleBudget({ width, height }, { width: targetWidth, height: targetHeight }, 4, law)
  if (width === targetWidth && height === targetHeight) return { pixels: new Uint8Array(input), format: 'straight' }
  const src = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i += 4) {
    const alpha = input[i + 3]!
    for (let c = 0; c < 3; c++) {
      const product = input[i + c]! * alpha
      src[i + c] = Math.floor((product + Math.floor(product / 256) + 128) / 256)
    }
    src[i + 3] = alpha
  }
  const pixels = scaleIntegerImageU8(src, { width, height }, { width: targetWidth, height: targetHeight }, 4, law)
  return { pixels, format: 'premultiplied' }
}

/** Native scalar qUnpremultiply law for the subsequent ARGB32 conversion. This
 * cannot recover straight channels lost by premultiplication at low alpha. */
export function sourceImageScaleStraightScalar(image: SourceScaledImage): Uint8Array {
  if (!(image.pixels instanceof Uint8Array) || image.pixels.length % 4 !== 0
    || image.pixels.length > MAX_PIXELS * 4 || (image.format !== 'straight' && image.format !== 'premultiplied')) throw new RangeError('Invalid scaled image bytes')
  if (image.format === 'straight') return new Uint8Array(image.pixels)
  const pixels = new Uint8Array(image.pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const a = image.pixels[i + 3]!
    if (!a) continue
    const inverse = Math.floor(16711935 / a)
    for (let c = 0; c < 3; c++) {
      if (image.pixels[i + c]! > a) throw new RangeError('Invalid premultiplied pixel')
      pixels[i + c] = a === 255 ? image.pixels[i + c]! : Math.floor((image.pixels[i + c]! * inverse + 32768) / 65536)
    }
    pixels[i + 3] = a
  }
  return pixels
}

/** Explicit SSE straight conversion for a backend with independently proven
 * reciprocal estimates. Scalar conversion above remains a different source law.
 * Callback values are validated/latching once per needed alpha before output.
 * Identity straight input preserves all original bytes, including alpha0 RGB. */
export function sourceImageScaleStraightSse(image: SourceScaledImage, estimate: SourceImageReciprocalEstimate): Uint8Array {
  if (!(image.pixels instanceof Uint8Array) || image.pixels.length % 4 !== 0 || image.pixels.length > MAX_PIXELS * 4
    || (image.format !== 'straight' && image.format !== 'premultiplied') || typeof estimate !== 'function') throw new RangeError('Invalid SSE scaled image profile')
  if (image.format === 'straight') return new Uint8Array(image.pixels)
  const factors = new Map<number, number>()
  for (let i = 0; i < image.pixels.length; i += 4) {
    const alpha = image.pixels[i + 3]!
    if (image.pixels[i]! > alpha || image.pixels[i + 1]! > alpha || image.pixels[i + 2]! > alpha) throw new RangeError('Invalid premultiplied pixel')
    if (!alpha || alpha === 255 || factors.has(alpha)) continue
    factors.set(alpha, Math.fround(sourceImageSseReciprocal(alpha, estimate(alpha)) * 255))
  }
  const pixels = new Uint8Array(image.pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = image.pixels[i + 3]!
    pixels[i + 3] = alpha
    if (!alpha) continue
    for (let c = 0; c < 3; c++) pixels[i + c] = alpha === 255 ? image.pixels[i + c]!
      : sourceImageRoundEven(Math.fround(image.pixels[i + c]! * factors.get(alpha)!))
  }
  return pixels
}
