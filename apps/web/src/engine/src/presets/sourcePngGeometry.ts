export interface SourcePngBrush { readonly width: number; readonly height: number; readonly scale: number; readonly angle: number }
export interface SourceDabShape { readonly scale: number; readonly ratio: number; readonly rotation: number }
interface Matrix { a: number; b: number; c: number; d: number; x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
const fuzzyNull = (x: number): boolean => Math.abs(x) <= 1e-12
const fuzzyOne = (x: number): boolean => Math.abs(x - 1) * 1e12 <= Math.min(Math.abs(x), 1)
export const sourceQRound = (value: number): number => value >= 0 ? Math.trunc(value + .5) : Math.trunc(value - Math.trunc(value - 1) + .5) + Math.trunc(value - 1)
export function sourceNormalizeAngle(angle: number): number {
  if (angle < 0) angle = 2 * Math.PI + angle % (2 * Math.PI)
  return angle >= 2 * Math.PI ? angle % (2 * Math.PI) : angle
}
function mapRect(m: Matrix, width: number, height: number): Rect {
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
function transformed(brush: SourcePngBrush, shape: SourceDabShape, subX: number, subY: number): Rect {
  if (![brush.width, brush.height].every(v => Number.isInteger(v) && v >= 1 && v <= 100000)
    || ![brush.scale, brush.angle, shape.scale, shape.ratio, shape.rotation, subX, subY].every(Number.isFinite)
    || brush.scale < 0 || shape.scale < 0 || shape.ratio < 0) throw new RangeError('Invalid native PNG brush geometry')
  const scale = shape.scale * brush.scale, sx = scale, sy = scale * shape.ratio
  const angle = sourceNormalizeAngle(shape.rotation + brush.angle)
  let m: Matrix = { a: sx, b: 0, c: 0, d: sy, x: 0, y: 0 }
  if (angle !== 0) {
    const c = Math.cos(angle), s = Math.sin(angle)
    // Preserve the pinned Qt matrix multiplication order, including signed zero terms.
    // oxlint-disable-next-line erasing-op
    m = { a: sx * c + 0 * -s, b: sx * s + 0 * c, c: 0 * c + sy * -s, d: 0 * s + sy * c, x: 0, y: 0 }
    const rotated = mapRect(m, brush.width, brush.height)
    m.x = -rotated.x
    m.y = -rotated.y
  }
  m.x = m.x + subX
  m.y = m.y + subY
  return mapRect(m, brush.width, brush.height)
}
/** KisBrush::characteristicSize/hotSpot for non-animated PNG brushes. */
export function sourcePngHotSpot(brush: SourcePngBrush, shape: SourceDabShape): readonly [number, number] {
  const rect = transformed(brush, shape, 0, 0)
  return [Math.max(1, rect.width) / 2, Math.max(1, rect.height) / 2]
}
/** KisQImagePyramid allocation size (not painted alpha bounds). Scalar Qt
 * transform boundary is checked separately against pinned source fixtures. */
export function sourcePngMaskExtent(brush: SourcePngBrush, shape: SourceDabShape, subX: number, subY: number): readonly [number, number] {
  const rect = transformed(brush, shape, subX, subY)
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
