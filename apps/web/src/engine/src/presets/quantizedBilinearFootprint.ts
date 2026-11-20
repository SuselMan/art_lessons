/** Integer-weight sampling footprint, independent of pixel format and storage.
 * Source-law provenance: Krita bd6e8d061d2f0388c5b10278786cf0fe62e3135f,
 * libs/image/kis_random_sub_accessor.cpp sampledOldRawData().
 * This computes coordinates/weights only: callers must supply the appropriate
 * immutable source and colorspace mixing operation. It does not imply ordinary
 * straight-RGBA interpolation or hardware bilinear filtering is equivalent.
 */
export interface WeightedPixelCoordinate { x: number; y: number; weight: number }
export interface QuantizedBilinearFootprint {
  /** Top-left, top-right, bottom-left, bottom-right; keep zero-weight reads. */
  pixels: [WeightedPixelCoordinate, WeightedPixelCoordinate, WeightedPixelCoordinate, WeightedPixelCoordinate]
  /** Sum of independently rounded weights; do not assume 255. */
  weightSum: number
}

export function quantizedBilinearFootprint(x: number, y: number): QuantizedBilinearFootprint {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Nonfinite sample position')
  const left = Math.floor(x), top = Math.floor(y)
  // Source accessor coordinates are signed 32-bit. All four neighbors must be
  // representable even when their weights happen to be zero.
  if (left < -0x80000000 || left >= 0x7fffffff || top < -0x80000000 || top >= 0x7fffffff)
    throw new RangeError('Sampling footprint exceeds signed 32-bit coordinates')
  const fx = x - left, fy = y - top
  const pixels: QuantizedBilinearFootprint['pixels'] = [
    { x: left, y: top, weight: Math.floor((1 - fx) * (1 - fy) * 255 + 0.5) },
    { x: left + 1, y: top, weight: Math.floor((1 - fy) * fx * 255 + 0.5) },
    { x: left, y: top + 1, weight: Math.floor(fy * (1 - fx) * 255 + 0.5) },
    { x: left + 1, y: top + 1, weight: Math.floor(fx * fy * 255 + 0.5) },
  ]
  return { pixels, weightSum: pixels.reduce((sum, pixel) => sum + pixel.weight, 0) }
}
