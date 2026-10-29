import type { CanonicalMaterialAsset, CanonicalMaterialCost, CanonicalMaterialRecipe } from './canonicalMaterialCodec.js'
import { affineImageSpan16Coordinates } from './sourceAffineImageSpan16Coordinates.js'
import { sourceImageTransformMetadata } from './sourceImageTransformMetadata.js'
import { sourcePngRasterShape } from './sourcePngGeometry.js'

/** Same metadata-only validation for server admission and client preparation.
 * No engine import, covered-row enumeration, source fetch, pixel allocation or GL.
 * Work units are a conservative scheduling weight, not a latency measurement.
 * Exact row seeds/ranges are checked again during deferred plan/VBO generation.
 */
export function canonicalMaterialGeometryCost(recipe: CanonicalMaterialRecipe, asset: CanonicalMaterialAsset): CanonicalMaterialCost {
  if (recipe.asset !== asset.id) throw new RangeError('Canonical material asset binding mismatch')
  const shape = sourcePngRasterShape({ width: asset.width, height: asset.height, scale: recipe.brushScale, angle: recipe.brushAngle },
    { scale: recipe.scale, ratio: recipe.ratio, rotation: recipe.rotation })
  const metadata = sourceImageTransformMetadata(asset.width, asset.height, shape, recipe.subX, recipe.subY)
  if (metadata.width !== recipe.width || metadata.height !== recipe.height) throw new RangeError('Canonical material allocation mismatch')
  const sourceWidth = metadata.levelWidth + 2, sourceHeight = metadata.levelHeight + 2
  if (sourceWidth > 4096 || sourceHeight > 4096 || sourceWidth * sourceHeight > 1048576) throw new RangeError('Canonical prepared source exceeds the verified image budget')
  if (metadata.width > 2048) throw new RangeError('Canonical material exceeds the verified sampler row capacity')
  if (!metadata.directCopy) affineImageSpan16Coordinates(metadata.samplingInverse, 0, 0, 1, 'sampling')
  const pixels = metadata.width * metadata.height
  return { workUnits: pixels * 16 + metadata.height * 32 + metadata.iterations * 32, outputBytes: pixels * 4 }
}
