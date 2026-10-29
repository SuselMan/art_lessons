import { KritaRandomSource, type KritaRandomSnapshot } from './nativeRandom'

/** Source-request geometry, independent of placement RNG and visible alpha.
 * Pinned source law: Krita bd6e8d0 KisAutoBrush constructor, KisBrush maskSize,
 * KisQImagePyramid::roundRect and KisPaintOpUtils::checkSizeTooSmall.
 * This does not reproduce stroke-initial direction or fan-corner insertion.
 */
export interface BrushRequestGeometry {
  admitted: boolean
  sourceWidth: number
  sourceHeight: number
  width: number
  height: number
  maskWidth: number
  maskHeight: number
}
/** The integer constructor boundary precedes the operation's F32 encoding. */
export function captureBrushSourceSize(physicalSize: number): number {
  if (!Number.isFinite(physicalSize) || physicalSize < 0 || physicalSize > 100000)
    throw new RangeError('Invalid source brush size')
  return Math.max(1, Math.trunc(physicalSize))
}
function alignedExtent(extent: number): number {
  const rounded = Math.floor(extent + .5)
  return Math.max(1, Math.ceil(Math.abs(extent - rounded) < 1e-6 ? rounded : extent))
}
/** Zero-subpixel maskSize queried before Scatter. The source square's rotated
 * allocation differs from both the continuous circle and its visible pixels.
 * `angle` already includes the static tip angle; never add it a second time.
 */
export function brushRequestGeometry(sourceSize: number, scale: number, angle: number): BrushRequestGeometry {
  if (!Number.isInteger(sourceSize) || sourceSize < 1 || sourceSize > 100000)
    throw new RangeError('Sequential brush requires a canonical integer sourceSize')
  if (!Number.isFinite(scale) || scale < 0 || !Number.isFinite(angle))
    throw new RangeError('Invalid source brush geometry')
  const diameter = sourceSize * scale
  const span = diameter * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)))
  const extent = alignedExtent(span)
  return { admitted: diameter >= .01, sourceWidth: sourceSize, sourceHeight: sourceSize,
    width: diameter, height: diameter, maskWidth: extent, maskHeight: extent }
}

export interface BrushRequestPlacement {
  x: number
  y: number
  snapshot: KritaRandomSnapshot
}
/** Exactly two draws for one admitted XY request, including amplitude zero.
 * Rejected geometry preserves the snapshot and must not become a stamp.
 */
export function placeBrushRequest(geometry: BrushRequestGeometry, x: number, y: number,
  amount: number, snapshot: KritaRandomSnapshot): BrushRequestPlacement {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount) || amount < 0)
    throw new RangeError('Invalid source brush placement')
  if (!geometry.admitted) return { x, y, snapshot }
  const source = KritaRandomSource.restore(snapshot)
  const extent = Math.max(geometry.maskWidth, geometry.maskHeight) * amount
  return { x: x + (2 * source.generateNormalized() - 1) * extent,
    y: y + (2 * source.generateNormalized() - 1) * extent, snapshot: source.snapshot() }
}
