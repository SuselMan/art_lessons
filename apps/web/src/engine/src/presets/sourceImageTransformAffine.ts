/** Shared scalar affine geometry. Source-informed Qt matrix arithmetic, not a
 * clean-room provenance or license-clearance claim. Rotation is RAW: callers
 * choose logical normalized angle or native raster negative angle explicitly. */
export interface SourceImageMatrix { a: number; b: number; c: number; d: number; x: number; y: number }
export interface SourceImageRect { x: number; y: number; width: number; height: number }
const fuzzyNull = (x: number): boolean => Math.abs(x) <= 1e-12
const fuzzyOne = (x: number): boolean => Math.abs(x - 1) * 1e12 <= Math.min(Math.abs(x), 1)
export function sourceImageMapRect(m: SourceImageMatrix, width: number, height: number): SourceImageRect {
  if (fuzzyNull(m.b) && fuzzyNull(m.c)) {
    if (fuzzyOne(m.a) && fuzzyOne(m.d)) return { x: m.x, y: m.y, width, height }
    let w = m.a * width, h = m.d * height, x = m.x, y = m.y
    if (w < 0) { w = -w; x -= w }
    if (h < 0) { h = -h; y -= h }
    return { x, y, width: w, height: h }
  }
  // Qt affine MAP evaluates each original rectangle corner in this order.
  const xs = [m.x, m.a * width + m.x, m.a * width + m.c * height + m.x, m.c * height + m.x]
  const ys = [m.y, m.b * width + m.y, m.b * width + m.d * height + m.y, m.d * height + m.y]
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
export function sourceImageBaseTransform(width: number, height: number, sx: number, sy: number,
  angle: number, subX: number, subY: number): SourceImageMatrix {
  let m: SourceImageMatrix = { a: sx, b: 0, c: 0, d: sy, x: 0, y: 0 }
  if (angle !== 0) {
    const c = Math.cos(angle), s = Math.sin(angle)
    // Preserve the pinned Qt matrix multiplication order, including signed zero terms.
    // oxlint-disable-next-line erasing-op
    m = { a: sx * c + 0 * -s, b: sx * s + 0 * c, c: 0 * c + sy * -s, d: 0 * s + sy * c, x: 0, y: 0 }
    const rotated = sourceImageMapRect(m, width, height)
    m.x = -rotated.x
    m.y = -rotated.y
  }
  m.x = m.x + subX
  m.y = m.y + subY
  return m
}

export const sourceQRound = (value: number): number => value >= 0 ? Math.trunc(value + .5) : Math.trunc(value - Math.trunc(value - 1) + .5) + Math.trunc(value - 1)
/** Shared allocation rule; logical PNG geometry and raw raster plans use the
 * same ceil/near-integer boundary without re-normalizing the raster angle. */
export function sourceImageAllocationExtent(rect: SourceImageRect): readonly [number, number] {
  if (!(rect.width > 0 && rect.height > 0)) return [1, 1]
  let x = rect.x, y = rect.y, width = rect.width, height = rect.height
  if (x < 1e-6) { width += x; x = 0 }
  if (y < 1e-6) { height += y; y = 0 }
  const roundedWidth = sourceQRound(width), roundedHeight = sourceQRound(height)
  if (Math.abs(width - roundedWidth) < 1e-6) width = roundedWidth
  if (Math.abs(height - roundedHeight) < 1e-6) height = roundedHeight
  const result: readonly [number, number] = [Math.max(1, Math.ceil(x + width)), Math.max(1, Math.ceil(y + height))]
  if (result.some(v => v > 2147483647)) throw new RangeError('Native PNG allocation exceeds integer geometry')
  return result
}
export function sourceImageAffineType(m: SourceImageMatrix): 0 | 1 | 2 | 4 | 8 {
  if (!fuzzyNull(m.b) || !fuzzyNull(m.c)) return fuzzyNull(m.a * m.c + m.b * m.d) ? 4 : 8
  if (!fuzzyNull(m.a - 1) || !fuzzyNull(m.d - 1)) return 2
  return !fuzzyNull(m.x) || !fuzzyNull(m.y) ? 1 : 0
}
export function sourceImageCompose(left: SourceImageMatrix, right: SourceImageMatrix): SourceImageMatrix {
  const lt = sourceImageAffineType(left), rt = sourceImageAffineType(right)
  if (!rt) return { ...left }
  if (!lt) return { ...right }
  const type = Math.max(lt, rt)
  if (type === 1) return { a: 1, b: 0, c: 0, d: 1, x: left.x + right.x, y: left.y + right.y }
  if (type === 2) return { a: left.a * right.a, b: 0, c: 0, d: left.d * right.d,
    x: left.x * right.a + right.x, y: left.y * right.d + right.y }
  return { a: left.a * right.a + left.b * right.c, b: left.a * right.b + left.b * right.d,
    c: left.c * right.a + left.d * right.c, d: left.c * right.b + left.d * right.d,
    x: left.x * right.a + left.y * right.c + right.x, y: left.x * right.b + left.y * right.d + right.y }
}
export function sourceImageInverse(m: SourceImageMatrix): SourceImageMatrix {
  const type = sourceImageAffineType(m)
  if (type <= 1) return { a: 1, b: 0, c: 0, d: 1, x: -m.x, y: -m.y }
  if (type === 2) {
    if (fuzzyNull(m.a) || fuzzyNull(m.d)) throw new RangeError('Noninvertible image scale')
    const a = 1 / m.a, d = 1 / m.d
    return { a, b: 0, c: 0, d, x: -m.x * a, y: -m.y * d }
  }
  const determinant = m.a * m.d - m.b * m.c
  if (determinant === 0) throw new RangeError('Noninvertible image affine')
  const reciprocal = 1 / determinant
  return { a: m.d * reciprocal, b: -m.b * reciprocal, c: -m.c * reciprocal, d: m.a * reciprocal,
    x: (m.c * m.y - m.d * m.x) * reciprocal, y: (m.b * m.x - m.a * m.y) * reciprocal }
}
