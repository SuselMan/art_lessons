import { canonicalImageMaterialPin, sourceImageTransformMetadata, sourcePngRasterShape,
  type CanonicalMaterialAsset, type CanonicalMaterialImageSource, type CanonicalMaterialRecipe } from '@grafetto/shared'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import { transformedMaskPrepassBudget, type TransformedMaskLimits } from './TransformedMaskPrepass'

/** Conservative storage admission only; each actual recipe retains the shared
 * native geometry calculation. The original crop, never the CAS square, owns size. */
export function canonicalImageMaskCapacity(source: CanonicalMaterialImageSource, asset: CanonicalMaterialAsset): TransformedMaskLimits {
  const pin = canonicalImageMaterialPin(source, [asset]), a = pin.assets[0]!, s = pin.primarySource
  const m = sourceImageTransformMetadata(a.width, a.height,
    sourcePngRasterShape({ width: a.width, height: a.height, scale: s.brushScale, angle: s.brushAngle },
      { scale: 1, ratio: 1, rotation: 0 }), 0, 0)
  const extent = m.width + m.height + 2
  const limits = Object.freeze({ width: extent, height: extent, slots: 1 })
  transformedMaskPrepassBudget(limits)
  return limits
}

export function assertCanonicalImageRecipeCapacity(recipe: CanonicalMaterialRecipe, source: CanonicalMaterialImageSource,
  asset: CanonicalMaterialAsset, capacity: TransformedMaskLimits): void {
  const pin = canonicalImageMaterialPin(source, [asset]), s = pin.primarySource
  transformedMaskPrepassBudget(capacity)
  if (!recipe || recipe.asset !== s.asset || !Object.is(recipe.brushScale, s.brushScale)
    || !Object.is(recipe.brushAngle, s.brushAngle) || !Number.isFinite(recipe.scale) || recipe.scale <= 0 || recipe.scale > 1
    || recipe.ratio !== 1 || recipe.mirrorH !== false || recipe.mirrorV !== false)
    throw new RangeError('Canonical image recipe differs from admitted source')
  const m = canonicalTransformedMaskMetadata(recipe, pin.assets[0]!)
  if (m.width > capacity.width || m.height > capacity.height)
    throw new RangeError('Canonical image recipe exceeds admitted workspace')
}
