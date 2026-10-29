import { sourceImageAllocationExtent, sourceImageBaseTransform, sourceImageMapRect, type SourceImageRect } from './sourceImageTransformAffine'
export interface SourcePngBrush { readonly width: number; readonly height: number; readonly scale: number; readonly angle: number }
export interface SourceDabShape { readonly scale: number; readonly ratio: number; readonly rotation: number }
export { sourceQRound } from './sourceImageTransformAffine'
export function sourceNormalizeAngle(angle: number): number {
  if (angle < 0) angle = 2 * Math.PI + angle % (2 * Math.PI)
  return angle >= 2 * Math.PI ? angle % (2 * Math.PI) : angle
}
function transformed(brush: SourcePngBrush, shape: SourceDabShape, subX: number, subY: number): SourceImageRect {
  if (![brush.width, brush.height].every(v => Number.isInteger(v) && v >= 1 && v <= 100000)
    || ![brush.scale, brush.angle, shape.scale, shape.ratio, shape.rotation, subX, subY].every(Number.isFinite)
    || brush.scale < 0 || shape.scale < 0 || shape.ratio < 0) throw new RangeError('Invalid native PNG brush geometry')
  const scale = shape.scale * brush.scale, sx = scale, sy = scale * shape.ratio
  const angle = sourceNormalizeAngle(shape.rotation + brush.angle)
  return sourceImageMapRect(sourceImageBaseTransform(brush.width, brush.height, sx, sy, angle, subX, subY), brush.width, brush.height)
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
