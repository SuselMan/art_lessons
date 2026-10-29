import { sourceImageAllocationExtent, type SourceImageRect } from './sourceImageTransformAffine.js'
import { sourceFmaF64 } from './sourceFmaF64.js'

/** Geometry only: neither an image/CAS asset nor a procedural coverage recipe. */
export interface SourceAutoGeometryTip {
  readonly kind: 'auto'
  readonly profile: 'default-auto-qt5-arm64-f64-v1'
  readonly diameter: number
  readonly ratio: number
  readonly spikes: 2
  readonly scale: number
  readonly angle: number
}
export interface SourceAutoGeometryShape { readonly scale: number; readonly ratio: number; readonly rotation: number }
export interface SourceAutoGeometry {
  readonly initialSize: readonly [number, number]
  readonly brushSize: readonly [number, number]
  readonly characteristicSize: readonly [number, number]
  readonly hotSpot: readonly [number, number]
  readonly maskSize: readonly [number, number]
}
function normalizeAngle(angle: number): number {
  if (angle < 0) angle = 2 * Math.PI + angle % (2 * Math.PI)
  return angle >= 2 * Math.PI ? angle % (2 * Math.PI) : angle
}
interface Matrix { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly x: number; readonly y: number }
function mapRect(m: Matrix, width: number, height: number): SourceImageRect {
  // Original Qt ARM affine MAP rounds c*y first, then FMA(a,x,c*y),
  // then adds translation. In particular the opposite corner is not two
  // independently rounded products followed by addition.
  const point = (x: number, y: number): readonly [number, number] => [
    sourceFmaF64(m.a, x, m.c * y) + m.x,
    sourceFmaF64(m.b, x, m.d * y) + m.y,
  ]
  if (Math.abs(m.b) <= 1e-12 && Math.abs(m.c) <= 1e-12) {
    if (Math.abs(m.a - 1) <= 1e-12 && Math.abs(m.d - 1) <= 1e-12) return { x: m.x, y: m.y, width, height }
    let w = m.a * width, h = m.d * height, x = m.x, y = m.y
    if (w < 0) { w = -w; x -= w }
    if (h < 0) { h = -h; y -= h }
    return { x, y, width: w, height: h }
  }
  const points = [point(0, 0), point(width, 0), point(width, height), point(0, height)]
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  return { x, y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y }
}
function transformed(width: number, height: number, sx: number, sy: number, angle: number, subX: number, subY: number): SourceImageRect {
  let m: Matrix = { a: sx, b: 0, c: 0, d: sy, x: 0, y: 0 }
  if (angle !== 0) {
    const c = Math.cos(angle), s = Math.sin(angle)
    m = { a: sx * c, b: sx * s, c: sy * -s, d: sy * c, x: 0, y: 0 }
    const rect = mapRect(m, width, height)
    m = { ...m, x: -rect.x, y: -rect.y }
  }
  return mapRect({ ...m, x: m.x + subX, y: m.y + subY }, width, height)
}
/** Isolated CPU source-law reference. Binary64 FMA is exact, but Math.sin/cos
 * match the independent installed Bionic oracle only at the retained inputs;
 * no cross-browser/universal-libm identity or author admission is implied. */
export function sourceAutoGeometry(tip: SourceAutoGeometryTip, shape: SourceAutoGeometryShape, subX = 0, subY = 0): SourceAutoGeometry {
  if (tip.kind !== 'auto' || tip.profile !== 'default-auto-qt5-arm64-f64-v1' || tip.spikes !== 2
    || ![tip.diameter, tip.ratio, tip.scale, tip.angle, shape.scale, shape.ratio, shape.rotation, subX, subY].every(Number.isFinite)
    || tip.diameter <= 0 || tip.ratio <= 0 || tip.scale < 0 || shape.scale < 0 || shape.ratio < 0
    || subX < 0 || subX >= 1 || subY < 0 || subY >= 1) throw new RangeError('Unsupported source auto geometry')
  const rawHeight = tip.diameter * tip.ratio
  if (!Number.isFinite(rawHeight) || Math.max(tip.diameter, rawHeight) > 2147483647) throw new RangeError('Auto dimensions exceed qint32')
  const initialSize = [Math.trunc(Math.max(1, tip.diameter)), Math.trunc(Math.max(1, rawHeight))] as const
  // Native ctor calculates this window before applying the brush angle/scale.
  const brushSize = sourceImageAllocationExtent(transformed(initialSize[0], initialSize[1], 1, 1, 0, 0, 0))
  const scale = shape.scale * tip.scale, ratio = shape.ratio, angle = normalizeAngle(shape.rotation + tip.angle)
  if (![scale, scale * ratio, angle].every(Number.isFinite)) throw new RangeError('Auto transform overflow')
  const rect = transformed(brushSize[0], brushSize[1], scale, scale * ratio, angle, 0, 0)
  const mask = transformed(brushSize[0], brushSize[1], scale, scale * ratio, angle, subX, subY)
  return { initialSize, brushSize, characteristicSize: [rect.width, rect.height],
    hotSpot: [Math.max(1, rect.width) / 2, Math.max(1, rect.height) / 2], maskSize: sourceImageAllocationExtent(mask) }
}
