import { sourceImageScaleAxis } from '../presets/sourceImageScaleAxis'

/** Deterministic U8 image scaling for a precomputed integer destination grid.
 * Independent arithmetic implementation of the behavior documented by Qt
 * 5.15.13 QImage::smoothScaled/qimagescale (SSE2/NEON interpolation order).
 * See https://code.qt.io/cgit/qt/qtbase.git/tree/src/gui/painting/qimagescale.cpp?h=v5.15.13-lts-lgpl
 * and qdrawhelper_p.h. No Qt implementation code is included here.
 *
 * One channel is an opaque grayscale intensity, not an inverted coverage mask.
 * Four channels must already be premultiplied RGBA. No colorspace conversion,
 * premultiplication, border, aspect fitting or QPainter transform occurs here.
 * The older generic Qt up/up fallback has a different rounding order; this
 * function never selects behavior from the executing CPU; default SIMD preserves
 * existing outputs and an explicit scalar law supports native source conformance.
 */
export interface IntegerImageSize { width: number; height: number }
export type IntegerImageInterpolationLaw = 'scalar' | 'simd'

const MAX_SIDE = 4096
const MAX_PIXELS = 4 * 1024 * 1024
const MAX_CHANNEL_SAMPLES = 64 * 1024 * 1024
const AREA_UNIT = 16384

interface AxisSample { start: number; weights: number[] }
interface ScaleAxis { shrinking: boolean; samples: AxisSample[]; taps: number }

function checkedPixels(size: IntegerImageSize): number {
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)
    || size.width < 1 || size.height < 1 || size.width > MAX_SIDE || size.height > MAX_SIDE
    || size.width * size.height > MAX_PIXELS) throw new RangeError('Integer image dimensions exceed the scaling budget')
  return size.width * size.height
}

/** Fixed-point center positions for enlargement, footprint starts for reduction. */
function scaleAxis(source: number, destination: number): ScaleAxis {
  const axis = sourceImageScaleAxis(source, destination), shrinking = !axis.up
  const samples: AxisSample[] = []
  let taps = 0
  for (let i = 0; i < destination; i++) {
    const start = axis.positions[i], packed = axis.weights[i]
    let weights: number[]
    if (shrinking) {
      const fullWeight = Math.floor(packed / 65536), first = packed % 65536
      weights = [first]
      let remaining = AREA_UNIT - first
      while (remaining > 0) {
        const weight = Math.min(fullWeight, remaining)
        weights.push(weight)
        remaining -= weight
      }
    } else weights = packed ? [256 - packed, packed] : [256]
    if (start + weights.length > source) throw new RangeError('Integer scaling footprint exceeds its source')
    taps += weights.length
    samples.push({ start, weights })
  }
  return { shrinking, samples, taps }
}

function checkedPlan(sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4, law: IntegerImageInterpolationLaw): { xAxis: ScaleAxis; yAxis: ScaleAxis } {
  checkedPixels(sourceSize)
  checkedPixels(destinationSize)
  if ((channels !== 1 && channels !== 4) || (law !== 'scalar' && law !== 'simd')) throw new RangeError('Invalid integer scaling channel count or interpolation law')
  const xAxis = scaleAxis(sourceSize.width, destinationSize.width)
  const yAxis = scaleAxis(sourceSize.height, destinationSize.height)
  if (xAxis.taps * yAxis.taps * channels > MAX_CHANNEL_SAMPLES) throw new RangeError('Integer image scaling work exceeds the budget')
  return { xAxis, yAxis }
}

/** Shared admission for wrappers which must allocate/convert their source pixels
 * before invoking the kernel. Does not allocate any image-sized pixel buffer. */
export function assertIntegerImageScaleBudget(sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4 = 1, law: IntegerImageInterpolationLaw = 'simd'): void {
  checkedPlan(sourceSize, destinationSize, channels, law)
}

/** Returns fresh bytes; source bytes and both size objects remain untouched.
 * Rejects inputs requiring more than64M channel samples, rather than silently
 * changing the filter or allowing an unbounded preparation task. */
export function scaleIntegerImageU8(
  source: Uint8Array, sourceSize: IntegerImageSize, destinationSize: IntegerImageSize,
  channels: 1 | 4 = 1, law: IntegerImageInterpolationLaw = 'simd',
): Uint8Array {
  const sourcePixels = checkedPixels(sourceSize), destinationPixels = checkedPixels(destinationSize)
  if ((channels !== 1 && channels !== 4) || (law !== 'scalar' && law !== 'simd') || source.length !== sourcePixels * channels) throw new RangeError('Invalid integer image byte layout')
  if (sourceSize.width === destinationSize.width && sourceSize.height === destinationSize.height) return new Uint8Array(source)
  const { xAxis, yAxis } = checkedPlan(sourceSize, destinationSize, channels, law)
  const output = new Uint8Array(destinationPixels * channels)
  for (let y = 0; y < destinationSize.height; y++) {
    const vertical = yAxis.samples[y]
    for (let x = 0; x < destinationSize.width; x++) {
      const horizontal = xAxis.samples[x]
      for (let channel = 0; channel < channels; channel++) {
        let value = 0
        if (!xAxis.shrinking && !yAxis.shrinking && law === 'scalar') {
          for (let iy = 0; iy < vertical.weights.length; iy++) {
            let row = 0
            for (let ix = 0; ix < horizontal.weights.length; ix++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              row += source[offset] * horizontal.weights[ix]
            }
            value += Math.floor(row / 256) * vertical.weights[iy]
          }
          value = Math.floor(value / 256)
        } else if (!xAxis.shrinking && !yAxis.shrinking) {
          // SIMD Qt interpolates vertically first, truncating before X.
          for (let ix = 0; ix < horizontal.weights.length; ix++) {
            let column = 0
            for (let iy = 0; iy < vertical.weights.length; iy++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              column += source[offset] * vertical.weights[iy]
            }
            value += Math.floor(column / 256) * horizontal.weights[ix]
          }
          value = Math.floor(value / 256)
        } else {
          for (let iy = 0; iy < vertical.weights.length; iy++) {
            let row = 0
            for (let ix = 0; ix < horizontal.weights.length; ix++) {
              const offset = ((vertical.start + iy) * sourceSize.width + horizontal.start + ix) * channels + channel
              row += source[offset] * horizontal.weights[ix]
            }
            // Keep integer precision through the first reduction. Arithmetic
            // division avoids JS signed32 overflow in the second-axis sum.
            if (xAxis.shrinking && yAxis.shrinking) row = Math.floor(row / 16)
            value += row * vertical.weights[iy]
          }
          value = Math.floor(value / (xAxis.shrinking && yAxis.shrinking ? 16777216 : 4194304))
        }
        output[(y * destinationSize.width + x) * channels + channel] = value
      }
    }
  }
  return output
}
