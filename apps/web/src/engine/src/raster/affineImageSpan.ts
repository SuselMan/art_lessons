/** Independent numeric model of Qt5.15's SSE2/NEON affine image fetch.
 * Source: qtbase4e158f6, qdrawhelper.cpp fetchTransformedBilinearARGB32PM,
 * qdrawhelper_p.h interpolation and qrgb.h qUnpremultiply.
 * NOT a polygon rasterizer: callers supply an already-covered scanline span.
 * No production renderer imports this experimental reference helper. */
export type InverseImageAffine = readonly [number, number, number, number, number, number]
const FIXED = 65536
const clampIndex = (value: number, size: number) => Math.max(0, Math.min(size - 1, value))

export function sampleAffineImageSpan(
  premultiplied: Uint8Array, width: number, height: number,
  inverse: InverseImageAffine, x: number, y: number, length: number,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width * height > 4 * 1024 * 1024 || premultiplied.length !== width * height * 4
    || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(length) || length < 1 || length > 2048
    || inverse.some(value => !Number.isFinite(value))) throw RangeError('Invalid bounded affine image span')
  const [a, b, c, d, tx, ty] = inverse
  const normX = a * a + c * c, normY = b * b + d * d
  if (normX <= 1 / FIXED || normY <= 1 / FIXED || normX >= 1e4 || normY >= 1e4
    || Math.abs(tx) >= 1e4 || Math.abs(ty) >= 1e4) throw RangeError('Outside the affine fast-matrix domain')
  const dx = Math.trunc(a * FIXED), dy = Math.trunc(b * FIXED)
  if (dy === 0 && Math.abs(dx) > 2 * FIXED) throw RangeError('Downscale dispatch is outside the verified span domain')
  // QSpanData::setupMatrix adds source translation(+1/65536) BEFORE
  // inversion. Its inverse subtracts one fixed-point unit from both axes.
  let fx = Math.trunc((c * (y + .5) + a * (x + .5) + tx - 1 / FIXED) * FIXED) - FIXED / 2
  let fy = Math.trunc((d * (y + .5) + b * (x + .5) + ty - 1 / FIXED) * FIXED) - FIXED / 2
  for (const value of [fx, fy, fx + dx * length, fy + dy * length]) {
    if (Math.abs(value) >= 0x7fffffff) throw RangeError('Affine fixed-point range exceeded')
  }
  const fastRotate = dy !== 0 && Math.abs(a) >= .125 && Math.abs(d) >= .125
  // FastRotate's bounded interior uses four-lane rounded4-bit interpolation;
  // the prefix/suffix and remaining scalar lanes use8-bit Y-then-X fetch.
  let prefix = 0, bounded = length
  if (fastRotate) {
    while (prefix < length) {
      const ix = Math.floor((fx + dx * prefix) / FIXED), iy = Math.floor((fy + dy * prefix) / FIXED)
      if (ix >= 0 && ix < width - 1 && iy >= 0 && iy < height - 1) break
      prefix++
    }
    const axisEnd = (point: number, step: number, size: number) => step > 0
      ? prefix + Math.trunc(((size - 1) * FIXED - point) / step)
      : step < 0 ? prefix + Math.trunc(-point / step) : length
    bounded = Math.min(length, axisEnd(fx + dx * prefix, dx, width), axisEnd(fy + dy * prefix, dy, height))
  }
  const vectorEnd = prefix + Math.max(0, Math.floor((bounded - prefix) / 4)) * 4
  const result = new Uint8Array(length * 4)
  for (let i = 0; i < length; i++, fx += dx, fy += dy) {
    const ix = Math.floor(fx / FIXED), iy = Math.floor(fy / FIXED)
    const fractX = fx - ix * FIXED, fractY = fy - iy * FIXED
    const four = fastRotate && i >= prefix && i < vectorEnd
    const wx = four ? Math.floor((fractX + 2048) / 4096) : Math.floor(fractX / 256)
    const wy = four ? Math.floor((fractY + 2048) / 4096) : Math.floor(fractY / 256)
    const at = (px: number, py: number, channel: number) => premultiplied[(clampIndex(py, height) * width + clampIndex(px, width)) * 4 + channel]
    for (let channel = 0; channel < 4; channel++) {
      const tl = at(ix, iy, channel), tr = at(ix + 1, iy, channel)
      const bl = at(ix, iy + 1, channel), br = at(ix + 1, iy + 1, channel)
      result[i * 4 + channel] = four
        ? Math.floor((tl * (16 - wx) * (16 - wy) + tr * wx * (16 - wy) + bl * (16 - wx) * wy + br * wx * wy) / 256)
        : Math.floor((Math.floor((tl * (256 - wy) + bl * wy) / 256) * (256 - wx)
          + Math.floor((tr * (256 - wy) + br * wy) / 256) * wx) / 256)
    }
  }
  return result
}

/** Straight ARGB32 export stage before native inverse-red/alpha mask extraction. */
export function affineSpanMask(premultiplied: Uint8Array): Uint8Array {
  if (premultiplied.length % 4) throw RangeError('Invalid premultiplied span layout')
  const result = new Uint8Array(premultiplied.length / 4)
  for (let i = 0; i < result.length; i++) {
    const alpha = premultiplied[i * 4 + 3], red = premultiplied[i * 4]
    if (red > alpha) throw RangeError('Invalid premultiplied red channel')
    const straight = alpha === 0 ? 0 : alpha === 255 ? red
      : Math.floor((red * Math.floor(0x00ff00ff / alpha) + 32768) / 65536)
    const product = (255 - straight) * alpha + 128
    result[i] = (product + (product >>> 8)) >>> 8
  }
  return result
}
