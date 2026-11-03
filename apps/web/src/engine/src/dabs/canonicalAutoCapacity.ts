import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,sourceAutoGeometry,canonicalAutoCost,canonicalSoftAutoCost,canonicalGaussianAutoStatic,
 type CanonicalAutoSource,type CanonicalSoftAutoSource,type AnyCanonicalMaterialRecipe,type CanonicalMaterialContextV7} from '@grafetto/shared'
import {transformedMaskPrepassBudget,type TransformedMaskLimits} from './TransformedMaskPrepass'

type AutoPin=CanonicalAutoSource|CanonicalSoftAutoSource
type AutoCapacitySource=Pick<AutoPin,'kind'|'source'|'brushScale'|'brushAngle'|'coverageProfile'>
/** Executable recipe mechanism, not a read/author/source grant. Scatter/fan
 * remain recorded draw positions/rotations; no RNG or sensor evaluation here. */
export type CanonicalAutoGeometryMechanism='dynamic-auto-geometry-v1'
function dynamic(mechanism:CanonicalAutoGeometryMechanism|undefined):boolean {
 if(mechanism!==undefined&&mechanism!=='dynamic-auto-geometry-v1')throw new TypeError('Unknown Auto geometry mechanism')
 return mechanism!==undefined
}
const rotating=(pin:AutoCapacitySource)=>pin.kind==='defaultAuto'&&pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE
/** Storage bound only. Original pin/profile authorization belongs to the caller's
 * existing shared decoder; this helper neither binds a source nor grants paint. */
export function canonicalAutoMaskCapacity(pin:AutoCapacitySource,mechanism?:CanonicalAutoGeometryMechanism):TransformedMaskLimits {const enabled=dynamic(mechanism);return maskCapacity(pin,enabled||rotating(pin),enabled)}
/** Version7 storage-only envelope after successful original generic7 extraction.
 * Geometry DATA is allowed before descriptor digest/program reservation; it is
 * not a source/profile/BEGIN grant. Recorded callers supply captured source7. */
export function canonicalTexturedAuto7MaskCapacity(pin:AutoCapacitySource):TransformedMaskLimits {
 if(pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)throw new TypeError('Textured Auto7 density unsupported')
 return maskCapacity(pin,true)
}
function maskCapacity(pin:AutoCapacitySource,allRotations:boolean,dynamicGeometry=false):TransformedMaskLimits {
 if((dynamicGeometry?(!Number.isFinite(pin.brushScale)||pin.brushScale<=0):pin.brushScale!==1)||(dynamicGeometry?(!Number.isSafeInteger(pin.source.spikes)||pin.source.spikes<2||pin.source.spikes>64):pin.source.spikes!==2)||pin.kind!==pin.source.kind)throw new TypeError('Unsupported fixed canonical layer source')
 const geometry=sourceAutoGeometry({kind:'auto',profile:'default-auto-qt5-arm64-f64-v1',diameter:pin.source.diameter,ratio:pin.source.spikes>2?1:pin.source.ratio,spikes:pin.source.spikes,scale:pin.brushScale,angle:pin.brushAngle},{scale:1,ratio:1,rotation:0})
 // L1 bounds the two rotated side projections for scale<=1 and ratio<=1. +2
 // covers subpixel translation and corner rounding; it changes storage only.
 const extent=Math.ceil((geometry.brushSize[0]+geometry.brushSize[1])*pin.brushScale)+2
 const limits=Object.freeze(allRotations?{width:extent,height:extent,slots:1}:
  {width:Math.ceil(geometry.characteristicSize[0])+1,height:Math.ceil(geometry.characteristicSize[1])+1,slots:1})
 transformedMaskPrepassBudget(limits)
 return limits
}
/** Called after original-snapshot decoding. Repeat the existing shared cost law
 * so standalone use cannot turn a larger workspace into static/geometry authority. */
export function assertCanonicalAutoRecipeCapacity(recipe:AnyCanonicalMaterialRecipe,pin:AutoPin,capacity:TransformedMaskLimits,mechanism?:CanonicalAutoGeometryMechanism,coverageScaleFactor?:number):void {
 const enabled=dynamic(mechanism)
 transformedMaskPrepassBudget(capacity)
 if(!('kind'in recipe)||recipe.kind!==pin.kind||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1
  ||!Number.isFinite(recipe.ratio)||recipe.ratio<=0||recipe.ratio>1||(!enabled&&recipe.ratio!==1)||!Number.isFinite(recipe.rotation)||(enabled&&Math.abs(recipe.rotation)>1e6)||(!enabled&&!rotating(pin)&&recipe.rotation!==0)
  ||(enabled?(typeof recipe.mirrorH!=='boolean'||typeof recipe.mirrorV!=='boolean'):(recipe.mirrorH!==false||recipe.mirrorV!==false)))throw new RangeError('Unsupported fixed canonical layer transform')
 if(pin.kind==='softAuto'&&recipe.kind==='softAuto')canonicalSoftAutoCost(recipe,pin,coverageScaleFactor)
 else if(pin.kind!=='softAuto'&&(recipe.kind==='defaultAuto'||recipe.kind==='gaussianAuto'))canonicalAutoCost(recipe,pin,coverageScaleFactor)
 else throw new TypeError('Canonical auto source kind mismatch')
 if(recipe.width>capacity.width||recipe.height>capacity.height)throw new RangeError('Canonical auto recipe exceeds admitted workspace')
}

/** Snapshot/context7 was already captured by the normal decoder. Reuse the SAME
 * static/cost law, accepting its saved rotation/mirror DATA within L1 storage. */
export function assertCanonicalTexturedAuto7RecipeCapacity(recipe:AnyCanonicalMaterialRecipe,context:CanonicalMaterialContextV7,capacity:TransformedMaskLimits):void {
 const pin=context.primarySource
 if(context.version!==7||pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)throw new TypeError('Expected textured Auto7 source')
 transformedMaskPrepassBudget(capacity)
 if(!('kind'in recipe)||recipe.kind!==pin.kind||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1||recipe.ratio!==1||!Number.isFinite(recipe.rotation)||typeof recipe.mirrorH!=='boolean'||typeof recipe.mirrorV!=='boolean')throw new RangeError('Unsupported textured Auto7 transform')
 if(pin.kind==='softAuto'&&recipe.kind==='softAuto')canonicalSoftAutoCost(recipe,pin)
 else if(pin.kind!=='softAuto'&&(recipe.kind==='defaultAuto'||recipe.kind==='gaussianAuto'))canonicalAutoCost(recipe,pin)
 else throw new TypeError('Textured Auto7 source kind mismatch')
 if(recipe.width>capacity.width||recipe.height>capacity.height)throw new RangeError('Textured Auto7 recipe exceeds admitted workspace')
}

/** Original READ-selected DefaultAuto storage only; no descriptor/author grant. */
export function canonicalPlainAutoGeometryMaskCapacity(pin:AutoCapacitySource):TransformedMaskLimits {
 if(pin.kind!=='defaultAuto')throw new TypeError('Plain geometry requires DefaultAuto')
 return maskCapacity(pin,true)
}
export function assertCanonicalPlainAutoGeometryRecipeCapacity(recipe:AnyCanonicalMaterialRecipe,pin:AutoPin,capacity:TransformedMaskLimits):void {
 canonicalPlainAutoGeometryMaskCapacity(pin)
 transformedMaskPrepassBudget(capacity)
 if(pin.kind!=='defaultAuto'||!('kind'in recipe)||recipe.kind!=='defaultAuto'||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1||!Number.isFinite(recipe.ratio)||recipe.ratio<=0||recipe.ratio>1||!Number.isFinite(recipe.rotation)||recipe.mirrorH!==false||recipe.mirrorV!==false)throw new RangeError('Unsupported plain geometry transform')
 canonicalAutoCost(recipe,pin)
 if(recipe.width>capacity.width||recipe.height>capacity.height)throw new RangeError('Plain geometry recipe exceeds admitted workspace')
}

/** Storage-only rotating Gaussian envelope. Caller must already own its source
 * pin/context; this helper supplies neither READ nor author permission. */
export function canonicalRotatingGaussianMaskCapacity(pin:AutoCapacitySource):TransformedMaskLimits {
 if(pin.kind!=='gaussianAuto'||pin.source.kind!=='gaussianAuto'||pin.source.shape!=='circle'||pin.source.ratio!==1||pin.source.density!==1||pin.source.randomness!==0||pin.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)throw new TypeError('Unsupported rotating Gaussian source')
 canonicalGaussianAutoStatic(pin.source,pin.brushScale,pin.brushAngle)
 return maskCapacity(pin,true)
}
/** Repeat SAME source/cost checks before any later caller may allocate/enqueue.
 * Resolved scatter positions retain the normal independent target/work budgets. */
export function assertCanonicalRotatingGaussianRecipeCapacity(recipe:AnyCanonicalMaterialRecipe,pin:AutoPin,capacity:TransformedMaskLimits):void {
 canonicalRotatingGaussianMaskCapacity(pin)
 transformedMaskPrepassBudget(capacity)
 if(pin.kind!=='gaussianAuto'||!('kind'in recipe)||recipe.kind!=='gaussianAuto'||!Number.isFinite(recipe.scale)||recipe.scale<=0||recipe.scale>1||recipe.ratio!==1||!Number.isFinite(recipe.rotation)||recipe.mirrorH!==false||recipe.mirrorV!==false)throw new RangeError('Unsupported rotating Gaussian transform')
 canonicalAutoCost(recipe,pin)
 if(recipe.width>capacity.width||recipe.height>capacity.height)throw new RangeError('Rotating Gaussian recipe exceeds admitted workspace')
}
