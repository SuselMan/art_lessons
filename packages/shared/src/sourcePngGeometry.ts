import { sourceImageAllocationExtent, sourceImageBaseTransform, sourceImageMapRect, type SourceImageRect } from './sourceImageTransformAffine.js'
export interface SourcePngBrush { readonly width: number; readonly height: number; readonly scale: number; readonly angle: number }
export interface SourceDabShape { readonly scale: number; readonly ratio: number; readonly rotation: number }
export { sourceQRound } from './sourceImageTransformAffine.js'
export function sourceNormalizeAngle(angle: number): number {
  if (angle < 0) angle = 2 * Math.PI + angle % (2 * Math.PI)
  return angle >= 2 * Math.PI ? angle % (2 * Math.PI) : angle
}
/** Convert logical brush/cache shape to the native raster shape. Normalize the
 * positive logical angle once, then negate it; do not normalize the negative.
 * Positive geometry uses the opposite sign of this same resolved rotation. */
export function sourcePngRasterShape(brush: SourcePngBrush, shape: SourceDabShape): SourceDabShape {
  if (![brush.width, brush.height].every(v => Number.isInteger(v) && v >= 1 && v <= 100000)
    || ![brush.scale, brush.angle, shape.scale, shape.ratio, shape.rotation].every(Number.isFinite)
    || brush.scale < 0 || shape.scale < 0 || shape.ratio < 0) throw new RangeError('Invalid native PNG brush geometry')
  return { scale: shape.scale * brush.scale, ratio: shape.ratio, rotation: -sourceNormalizeAngle(shape.rotation + brush.angle) }
}
function transformed(brush: SourcePngBrush, shape: SourceDabShape, subX: number, subY: number): SourceImageRect {
  if (!Number.isFinite(subX) || !Number.isFinite(subY)) throw new RangeError('Invalid native PNG brush geometry')
  const raster = sourcePngRasterShape(brush, shape)
  return sourceImageMapRect(sourceImageBaseTransform(brush.width, brush.height, raster.scale, raster.scale * raster.ratio,
    -raster.rotation, subX, subY), brush.width, brush.height)
}
/** Native continuous mask dimensions, before hotspot min1 or allocation rounding. */
export function sourcePngCharacteristicSize(brush: SourcePngBrush, shape: SourceDabShape): readonly [number, number] {
  const rect = transformed(brush, shape, 0, 0)
  return [rect.width, rect.height]
}
/** KisBrush::characteristicSize/hotSpot for non-animated PNG brushes. */
export function sourcePngHotSpot(brush: SourcePngBrush, shape: SourceDabShape): readonly [number, number] {
  const rect = transformed(brush, shape, 0, 0)
  return [Math.max(1, rect.width) / 2, Math.max(1, rect.height) / 2]
}
/** KisQImagePyramid allocation size (not painted alpha bounds). Scalar Qt
 * transform boundary is checked separately against pinned source fixtures. */
export function sourcePngMaskExtent(brush: SourcePngBrush, shape: SourceDabShape, subX: number, subY: number): readonly [number, number] {
  return sourceImageAllocationExtent(transformed(brush, shape, subX, subY))
}
