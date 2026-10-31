import { canonicalImageMaterialPin, sourceImageTransformMetadata, sourcePngRasterShape,
  type CanonicalMaterialAsset, type CanonicalMaterialImageSource, type CanonicalMaterialRecipe } from '@grafetto/shared'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import { transformedMaskPrepassBudget, type TransformedMaskLimits } from './TransformedMaskPrepass'

type ImageAssets=CanonicalMaterialAsset|readonly CanonicalMaterialAsset[]
function capture(source:CanonicalMaterialImageSource,assets:ImageAssets){
  return canonicalImageMaterialPin(source,'id' in assets?[assets]:assets)
}

/** Conservative storage admission only; every unique pinned crop contributes,
 * independently of which frame a particular recorded recipe selected. */
export function canonicalImageMaskCapacity(source: CanonicalMaterialImageSource, assets: ImageAssets): TransformedMaskLimits {
  const pin=capture(source,assets),s=pin.primarySource
  let extent=0
  for(const a of pin.assets){
    const m=sourceImageTransformMetadata(a.width,a.height,
      sourcePngRasterShape({width:a.width,height:a.height,scale:s.brushScale,angle:s.brushAngle},
        {scale:1,ratio:1,rotation:0}),0,0)
    extent=Math.max(extent,m.width+m.height+2)
  }
  const limits=Object.freeze({width:extent,height:extent,slots:1})
  transformedMaskPrepassBudget(limits)
  return limits
}

export function assertCanonicalImageRecipeCapacity(recipe: CanonicalMaterialRecipe, source: CanonicalMaterialImageSource,
  assets: ImageAssets, capacity: TransformedMaskLimits): void {
  const pin=capture(source,assets),s=pin.primarySource
  transformedMaskPrepassBudget(capacity)
  if (!recipe || !Object.is(recipe.brushScale, s.brushScale)
    || !Object.is(recipe.brushAngle, s.brushAngle) || !Number.isFinite(recipe.scale) || recipe.scale <= 0 || recipe.scale > 1
    || recipe.ratio !== 1 || recipe.mirrorH !== false || recipe.mirrorV !== false)
    throw new RangeError('Canonical image recipe differs from admitted source')
  const selected=pin.assets.find(asset=>asset.id===recipe.asset)
  if(!selected)throw new RangeError('Canonical image recipe asset is not pinned')
  const m=canonicalTransformedMaskMetadata(recipe,selected)
  if (m.width > capacity.width || m.height > capacity.height)
    throw new RangeError('Canonical image recipe exceeds admitted workspace')
}
