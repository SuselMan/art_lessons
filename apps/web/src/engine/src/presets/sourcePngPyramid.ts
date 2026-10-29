import { sourceQRound, type SourceDabShape } from './sourcePngGeometry'

/** Metadata only: every resized level reads the original prepared image. */
export interface SourcePngLevel {
  readonly scale: number
  readonly width: number
  readonly height: number
  readonly storedWidth: number
  readonly storedHeight: number
  readonly filter: 'original' | 'smooth' | 'nearest'
}
export interface SourcePngPyramid {
  readonly width: number
  readonly height: number
  readonly levels: readonly SourcePngLevel[]
}
/** Independent scalar model of the pinned pyramid layout, without allocating pixels.
 * The border is transparent; it must not be replaced with texture edge clamping. */
export function sourcePngPyramid(width: number, height: number, smoothEnlarging = true): SourcePngPyramid {
  if (![width, height].every(v => Number.isInteger(v) && v >= 1 && v <= 100000)
    || typeof smoothEnlarging !== 'boolean') throw new RangeError('Invalid PNG pyramid input')
  const levels: SourcePngLevel[] = []
  const add = (scale: number, filter: SourcePngLevel['filter']): void => {
    const w = sourceQRound(width * scale), h = sourceQRound(height * scale)
    levels.push(Object.freeze({ scale, width: w, height: h, storedWidth: w + 2, storedHeight: h + 2, filter }))
  }
  for (let scale = 8; scale > 1; scale *= .5) {
    if (width * scale <= 512 || height * scale <= 512) add(scale, smoothEnlarging ? 'smooth' : 'nearest')
  }
  add(1, 'original')
  for (let scale = .5; sourceQRound(width * scale) !== 0 && sourceQRound(height * scale) !== 0; scale *= .5) add(scale, 'smooth')
  return Object.freeze({ width, height, levels: Object.freeze(levels) })
}
export function sourcePngSelectLevel(pyramid: { readonly levels: readonly Pick<SourcePngLevel, 'scale'>[] }, scale: number): number {
  if (!Number.isFinite(scale) || scale < 0) throw new RangeError('Invalid PNG requested scale')
  let index = 0
  while (index < pyramid.levels.length - 1) {
    const half = pyramid.levels[index]!.scale * .5
    if (!(half > scale || Math.abs(half - scale) < 1e-6)) break
    index++
  }
  return index
}
/** Input rotation is already the native raster rotation (negative normalized brush
 * rotation), distinct from the positive logical geometry/cache-key rotation. */
export function sourcePngLevelShape(pyramid: SourcePngPyramid, shape: SourceDabShape): { readonly index: number; readonly shape: SourceDabShape } {
  if (![shape.scale, shape.ratio, shape.rotation].every(Number.isFinite) || shape.scale <= 0 || shape.ratio < 0) throw new RangeError('Invalid PNG raster shape')
  const index = sourcePngSelectLevel(pyramid, shape.scale), level = pyramid.levels[index]!
  const sx = shape.scale / (level.width / pyramid.width)
  const sy = (shape.scale * shape.ratio) / (level.height / pyramid.height)
  return { index, shape: { scale: sx, ratio: sy / sx, rotation: shape.rotation } }
}
