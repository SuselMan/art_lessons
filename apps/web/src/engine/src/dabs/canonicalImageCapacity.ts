import { canonicalImageFrameAsset,canonicalSourceMaterialContext,CANONICAL_MATERIAL_LIMITS,canonicalImageMaterialPin, sourceImageTransformMetadata, sourcePngRasterShape, sourcePngPyramid, sourcePngSelectLevel,
  type CanonicalMaterialAsset, type CanonicalMaterialImageSource, type CanonicalMaterialRecipe } from '@grafetto/shared'
import type { CanonicalMaskSourceLevelRequirement } from './CanonicalMaskSourceBank'
import { canonicalTransformedMaskMetadata } from './TransformedMaskPlan'
import { transformedMaskPrepassBudget, type TransformedMaskLimits } from './TransformedMaskPrepass'

type ImageAssets=CanonicalMaterialAsset|readonly CanonicalMaterialAsset[]
function capture(source:CanonicalMaterialImageSource,assets:ImageAssets){
  const inventory='id' in assets?[assets]:assets
  if(Object.hasOwn(source,'frameBounds')){
    const context=canonicalSourceMaterialContext({version:2,primarySource:source,assets:inventory,imageFrameIndices:'source-image-pipe-frame-v1',budget:{workUnits:CANONICAL_MATERIAL_LIMITS.workUnits,outputBytes:CANONICAL_MATERIAL_LIMITS.outputBytes,drawPixels:CANONICAL_MATERIAL_LIMITS.drawPixels}})
    if(context.primarySource.kind!=='image')throw new TypeError('Expected original image geometry')
    return {primarySource:context.primarySource,assets:context.assets}
  }
  return canonicalImageMaterialPin(source,inventory)
}

/** Covers every CURRENT engine-admitted image recipe (0<scale<=1), not the
 * wider shared material domain. Selection is original source LOD, never a clamp.
 * No reader/GL/source permission. Callers own retained metadata reservations. */
export function canonicalImageRequiredSourceLevels(source:CanonicalMaterialImageSource,assets:ImageAssets):readonly CanonicalMaskSourceLevelRequirement[] {
  const pin=capture(source,assets)
  const selected=pin.primarySource.frameBounds?(pin.primarySource.frames??[pin.primarySource.asset]).map((_,i)=>canonicalImageFrameAsset(pin.primarySource,pin.assets,i)):pin.assets
  const unique=new Map(selected.map(asset=>[JSON.stringify(asset),asset]))
  return Object.freeze([...unique.values()].map(asset=>{
    const pyramid=sourcePngPyramid(asset.width,asset.height),first=sourcePngSelectLevel(pyramid,pin.primarySource.brushScale)
    return Object.freeze({asset,indexes:Object.freeze(Array.from({length:pyramid.levels.length-first},(_,i)=>first+i))})
  }))
}

/** Conservative storage admission only; every unique pinned crop contributes,
 * independently of which frame a particular recorded recipe selected. */
export function canonicalImageMaskCapacity(source: CanonicalMaterialImageSource, assets: ImageAssets): TransformedMaskLimits {
  const pin=capture(source,assets),s=pin.primarySource
  let extent=0
  for(const a of s.frameBounds?(s.frames??[s.asset]).map((_,i)=>canonicalImageFrameAsset(s,pin.assets,i)):pin.assets){
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
    || (s.frameBounds ? !Number.isFinite(recipe.ratio)||recipe.ratio<=0||recipe.ratio>1||!Number.isFinite(recipe.rotation)||Math.abs(recipe.rotation)>1e6||typeof recipe.mirrorH!=='boolean'||typeof recipe.mirrorV!=='boolean' : recipe.ratio !== 1 || recipe.mirrorH !== false || recipe.mirrorV !== false))
    throw new RangeError('Canonical image recipe differs from admitted source')
  const selected=s.frameBounds?(recipe.imageFrameIndex===undefined?undefined:canonicalImageFrameAsset(s,pin.assets,recipe.imageFrameIndex)):pin.assets.find(asset=>asset.id===recipe.asset)
  if(!selected||selected.id!==recipe.asset)throw new RangeError('Canonical image recipe asset is not pinned')
  const m=canonicalTransformedMaskMetadata(recipe,selected)
  if (m.width > capacity.width || m.height > capacity.height)
    throw new RangeError('Canonical image recipe exceeds admitted workspace')
}
