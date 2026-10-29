import { sourceQRound } from './sourcePngGeometry'

export type SourceImageAffine = readonly [number, number, number, number, number, number]
export interface SourceImageSpan { readonly x: number; readonly y: number; readonly length: number; readonly coverage: 255 }
type Point = readonly [number, number]
const fixed = 65536
const fuzzyEqual = (a: number, b: number): boolean => Math.abs(a - b) * 1e12 <= Math.min(Math.abs(a), Math.abs(b))
const close26 = (a: number, b: number): boolean => Math.trunc((b - a) * 64) === 0
const safeFixed = (value: number): number => Math.max(-2147483647, Math.min(2147483647, Math.trunc(value * fixed)))
const fixedProduct = (a: number, b: number): number => {
  const product = a * b
  return Number.isSafeInteger(product) ? Math.floor(product / fixed) : Number((BigInt(a) * BigInt(b)) >> 16n)
}
const bound = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value))
const slope = (a: Point, b: Point): number => b[1] === a[1] ? (b[0] > a[0] ? 1e20 : -1e20) : (b[0] - a[0]) / (b[1] - a[1])

/** Source-informed mathematical AA-off rectangle coverage model. Not a clean-room
 * or license-clearance claim. Distinguishes Qt's rounded scale rectangles,
 * floored uniform-rotate vertices, and truncated general-path vertices. It emits
 * whole covered rows for the existing affine16 sampler, not a bilinear substitute.
 * Perspective, AA, legacy rounding and arbitrary paths are outside this contract. */
export function sourceImageTransformSpans(sourceWidth: number, sourceHeight: number,
  width: number, height: number, forward: SourceImageAffine): readonly SourceImageSpan[] {
  if (![sourceWidth, sourceHeight, width, height].every(v => Number.isSafeInteger(v) && v >= 1 && v <= 4096)
    || width * height > 1048576 || sourceWidth * sourceHeight > 1048576
    || forward.length !== 6 || forward.some(v => !Number.isFinite(v))) throw new RangeError('Invalid bounded image transform')
  const [a, b, c, d, tx, ty] = forward
  const map = (x: number, y: number): Point => [a * x + c * y + tx, b * x + d * y + ty]
  const corners = [map(0, 0), map(sourceWidth, 0), map(sourceWidth, sourceHeight), map(0, sourceHeight)]
  if (corners.some(p => p.some(v => Math.abs(v) > 16384))) throw new RangeError('Image transform exceeds fixed-point domain')
  const result: SourceImageSpan[] = []
  const add = (left: number, right: number, y: number): void => {
    const x = bound(left, 0, width), end = bound(right, 0, width)
    if (y >= 0 && y < height && end > x) result.push({ x, y, length: end - x, coverage: 255 })
  }
  if (Math.abs(b) <= 1e-12 && Math.abs(c) <= 1e-12) {
    const left = sourceQRound(Math.min(corners[0]![0], corners[2]![0]))
    const right = sourceQRound(Math.max(corners[0]![0], corners[2]![0]))
    const top = sourceQRound(Math.min(corners[0]![1], corners[2]![1]))
    const bottom = sourceQRound(Math.max(corners[0]![1], corners[2]![1]))
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y++) add(left, right, y)
    return result
  }
  const uniform = Math.abs(a * c + b * d) <= 1e-12
    && fuzzyEqual(a * a + b * b, c * c + d * d)
  if (!uniform) {
    // AA-off QPainterPath vertices truncate to26.6. Edge starts are evaluated
    // once in16.16; independent per-row float intersections would drift.
    const points = corners.map(p => [Math.trunc(p[0] * 64), Math.trunc(p[1] * 64)] as Point)
    const edges = points.map((p, i) => {
      let start = p, end = points[(i + 1) % 4]!
      if (start[1] > end[1]) [start, end] = [end, start]
      const first = Math.max(0, Math.floor((start[1] + 32) / 64))
      const last = Math.min(height - 1, Math.floor((end[1] - 32) / 64))
      const step = start[1] === end[1] ? 0 : Math.trunc((end[0] - start[0]) / (end[1] - start[1]) * fixed)
      if (Math.abs(step) > 2147483647) throw new RangeError('Unproven native fixed-point slope range')
      const initial = 32768 + start[0] * 1024 + fixedProduct(step, first * fixed + 32768 - start[1] * 1024)
      return { first, last, step, initial }
    })
    for (let y = 0; y < height; y++) {
      const intersections = edges.filter(e => y >= e.first && y <= e.last)
        .map(e => Math.floor((e.initial + e.step * (y - e.first)) / fixed)).sort((x, y) => x - y)
      if (intersections.length >= 2) add(intersections[0]!, intersections[intersections.length - 1]!, y)
    }
    return result
  }
  // Uniform transformed rectangle is represented by its longitudinal centerline.
  let pa = map(0, sourceHeight * .5), pb = map(sourceWidth, sourceHeight * .5)
  let relativeWidth = sourceHeight / sourceWidth
  const originalLength2 = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2
  if (!originalLength2) return result
  const offsetX = Math.abs(pb[1] - pa[1]) * relativeWidth * .5
  const offsetY = Math.abs(pb[0] - pa[0]) * relativeWidth * .5
  let from = 0, to = 1
  for (const axis of [0, 1] as const) {
    const delta = pb[axis] - pa[axis], low = axis === 0 ? -offsetX : -offsetY
    const high = axis === 0 ? width + offsetX : height + offsetY
    if (delta === 0) { if (pa[axis] <= low || pa[axis] >= high) return result; continue }
    let t0 = (low - pa[axis]) / delta, t1 = (high - pa[axis]) / delta
    if (t0 > t1) [t0, t1] = [t1, t0]
    from = Math.max(from, t0); to = Math.min(to, t1)
    if (from >= to) return result
  }
  const delta: Point = [pb[0] - pa[0], pb[1] - pa[1]]
  const end: Point = [pa[0] + delta[0] * to, pa[1] + delta[1] * to]
  pa = [pa[0] + delta[0] * from, pa[1] + delta[1] * from]; pb = end
  const clippedLength2 = (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2
  if (!clippedLength2) return result
  relativeWidth *= Math.sqrt(originalLength2 / clippedLength2)
  if (close26(pa[1], pb[1])) {
    const x = (pa[0] + pb[0]) * .5, y = pa[1], half = relativeWidth * Math.abs(pb[0] - pa[0]) * .5
    pa = [x, y - half]; pb = [x, y + half]; relativeWidth = 1 / relativeWidth
  }
  if (pa[1] > pb[1]) [pa, pb] = [pb, pa]
  if (close26(pa[0], pb[0])) {
    const half = .5 * relativeWidth * (pb[1] - pa[1])
    const left = bound(pa[0] - half, 0, width), right = bound(pa[0] + half, 0, width)
    const top = bound(pa[1], 0, height), bottom = bound(pb[1], 0, height)
    if (close26(left, right) || close26(top, bottom)) return result
    for (let y = Math.trunc(top + .5); y <= (bottom < .5 ? -1 : Math.trunc(bottom - .5)); y++) {
      add(Math.trunc(left + .5), right < .5 ? 0 : Math.trunc(right - .5) + 1, y)
    }
    return result
  }
  const px = (pb[1] - pa[1]) * (.5 * relativeWidth), py = -(pb[0] - pa[0]) * (.5 * relativeWidth)
  const move = (p: Point, sign: number): Point => [Math.floor((p[0] + px * sign) * 64) / 64, Math.floor((p[1] + py * sign) * 64) / 64]
  const positive = pa[0] < pb[0]
  const top = move(pa, positive ? 1 : -1), bottom = move(pb, positive ? -1 : 1)
  const left = move(positive ? pa : pb, -1), right = move(positive ? pb : pa, 1)
  const first = Math.trunc(top[1] + .5), last = bottom[1] < .5 ? -1 : Math.trunc(bottom[1] - .5)
  const leftEnd = left[1] < .5 ? -1 : Math.trunc(left[1] - .5), rightEnd = right[1] < .5 ? -1 : Math.trunc(right[1] - .5)
  const edge = (p: Point, q: Point, anchor: number, bias: number, y: number): number => {
    const m = slope(p, q)
    return Math.floor((safeFixed(p[0] + bias + (anchor + .5 - p[1]) * m) + safeFixed(m) * (y - anchor)) / fixed)
  }
  for (let y = Math.max(0, first); y <= Math.min(height - 1, last); y++) {
    const l = y <= leftEnd ? edge(top, left, first, .5, y) : edge(left, bottom, leftEnd + 1, .5, y)
    const r = y <= rightEnd ? edge(top, right, first, -.5, y) : edge(right, bottom, rightEnd + 1, -.5, y)
    add(l, r + 1, y)
  }
  return result
}
