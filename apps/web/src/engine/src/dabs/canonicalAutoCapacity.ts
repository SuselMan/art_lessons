import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,sourceAutoGeometry,canonicalAutoCost,canonicalSoftAutoCost,
 type CanonicalAutoSource,type CanonicalSoftAutoSource,type AnyCanonicalMaterialRecipe} from '@grafetto/shared'
import {transformedMaskPrepassBudget,type TransformedMaskLimits} from './TransformedMaskPrepass'

type AutoPin=CanonicalAutoSource|CanonicalSoftAutoSource
type AutoCapacitySource=Pick<AutoPin,'kind'|'source'|'brushScale'|'brushAngle'|'coverageProfile'>
const rotating=(pin:AutoCapacitySource)=>pin.kind==='defaultAuto'&&pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
/** Storage bound only. Original pin/profile authorization belongs to the caller's
 * existing shared decoder; this helper neither binds a source nor grants paint. */
export function canonicalAutoMaskCapacity(pin:AutoCapacitySource):TransformedMaskLimits {
 if(pin.brushScale!==1||pin.source.spikes!==2||pin.kind!==pin.source.kind)throw new TypeError('Unsupported fixed canonical layer source')
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.ratio,spikes:2,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
 // L1 bounds the two rotated side projections for scale<=1 and ratio1. +2
 // covers subpixel translation and corner rounding; it changes storage only.
 const extent=Math.ceil((geometry.brushSize[0]+geometry.brushSize[1])*pin.brushScale)+2
 const limits=Object.freeze(rotating(pin)?{width:extent,height:extent,slots:1}:
  {width:Math.ceil(geometry.characteristicSize[0])+1,height:Math.ceil(geometry.characteristicSize[1])+1,slots:1})
 transformedMaskPrepassBudget(limits)
 return limits
}
/** Called after original-snapshot decoding. Repeat the existing shared cost law
 * so standalone use cannot turn a larger workspace into static/geometry authority. */
export function assertCanonicalAutoRecipeCapacity(recipe:AnyCanonicalMaterialRecipe,pin:AutoPin,capacity:TransformedMaskLimits):void {
 transformedMaskPrepassBudget(capacity)
 if(!('kind'in recipe)||recipe.kind!==pin.kind||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1
  ||recipe.ratio!==1||!Number.isFinite(recipe.rotation)||(!rotating(pin)&&recipe.rotation!==0)
  ||recipe.mirrorH!==false||recipe.mirrorV!==false)throw new RangeError('Unsupported fixed canonical layer transform')
 if(pin.kind==='softAuto'&&recipe.kind==='softAuto')canonicalSoftAutoCost(recipe,pin)
 else if(pin.kind!=='softAuto'&&(recipe.kind==='defaultAuto'||recipe.kind==='gaussianAuto'))canonicalAutoCost(recipe,pin)
 else throw new TypeError('Canonical auto source kind mismatch')
 if(recipe.width>capacity.width||recipe.height>capacity.height)throw new RangeError('Canonical auto recipe exceeds admitted workspace')
}
