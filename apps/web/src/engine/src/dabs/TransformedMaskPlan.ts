import {sourceSeededAutoMask,SOURCE_SEEDED_AUTO_MASK_PROFILE} from '../presets/sourceSeededAutoMask'
import type {CanonicalMaterialParameters} from '@grafetto/shared'
import { sourceDefaultAutoDensitySeed, type SourceDefaultAutoDensityIdentity } from '../presets/sourceDefaultAutoDensitySeed'
import { canonicalSoftAutoCost, canonicalSoftAutoSourcePin, canonicalSoftAutoDataEqual, type CanonicalSoftAutoRecipe, type CanonicalSoftAutoSource } from '@grafetto/shared';
import { prepareSourceSoftCircleDab } from '../presets/sourceSoftCircleDab';
import { CanonicalSoftCircleProgramOwner } from './CanonicalSoftCircleProgramOwner';
import { CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE, canonicalAutoCost, type CanonicalAutoRecipe, type CanonicalAutoSource } from '@grafetto/shared';
import { prepareSourceGaussianDab } from '../presets/sourceGaussianDab';
import { prepareSourceSeededDefaultAutoDab, prepareSourceDefaultAutoDab } from '../presets/sourceDefaultAutoDab';
import type { CanonicalMaterialAsset, CanonicalMaterialRecipe } from '@grafetto/shared';
import { sourceImageTransformMetadata } from '@grafetto/shared';
import { sourceImageTransformSpans } from '../presets/sourceImageTransformSpans';
import type { SourceDabMaterialSpec } from '../presets/sourceDabCache';
import { sourcePngRasterShape } from '../presets/sourcePngGeometry';
import { affineImageSpan16Coordinates } from '../raster/affineImageSpan16';
import { sourceImageTransformPlan } from '../presets/sourceImageTransformPlan';
export type TransformedMaskPlan = ReturnType<typeof sourceImageTransformPlan>;
export const TRANSFORMED_MASK_VERTEX_FLOATS = 12;
/** Saved material, not a current cache-hit request. Normalize the logical angle
* ONCE then negate; normalizing the negative raster angle loses source phase.
*/
export function resolvedTransformedMaskPlan(source: SourceDabMaterialSpec): TransformedMaskPlan {
  if(source?.geometry?.kind==='softAuto')throw new RangeError('Soft auto requires a typed procedural material resolver');
  if(source?.geometry?.kind==='defaultAuto'||source?.geometry?.kind==='gaussianAuto')throw new RangeError('Default auto requires a typed procedural material resolver');
  if (!source || !source.brush || !source.shape || !source.key || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
    || source.width < 1 || source.height < 1 || source.width !== source.key.width || source.height !== source.key.height)
    throw new RangeError('Invalid saved source material');
  const { brush, shape, key } = source;
  const plan = sourceImageTransformPlan(brush.width, brush.height, sourcePngRasterShape(brush, shape), key.subPixelX, key.subPixelY);
  if (plan.width !== source.width || plan.height !== source.height)
    throw new RangeError('Saved material allocation differs from its source plan');
  return plan;
}
/** Trusted prepare-time identity of one original CAS crop and selected level. */
export interface CanonicalMaskSourceBinding {
  readonly frameIndex?:number
  readonly sourceSlot?:0|1
  readonly imageMaterial?:Readonly<{kind:'lightness-map-v1'|'color-stamp-v1';frameIndex?:number;channels:readonly CanonicalMaterialAsset[]}>
  readonly asset: CanonicalMaterialAsset;
  readonly index: number;
  readonly baseScale: number;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
}
export interface CanonicalTransformedMaskMaterial {
  readonly kind: 'canonical';
  readonly recipe: CanonicalMaterialRecipe;
  readonly asset: CanonicalMaterialAsset;
}
export type CanonicalAutoMaskMaterial = {
  readonly kind: 'canonicalAuto'; readonly coverageScaleFactor?:number; readonly recipe: CanonicalAutoRecipe & {readonly materialParams?:CanonicalMaterialParameters}; readonly trustedSource: CanonicalAutoSource;
  readonly densityIdentity?: SourceDefaultAutoDensityIdentity;
} | {
  readonly kind: 'canonicalAuto'; readonly coverageScaleFactor?:number; readonly recipe: CanonicalSoftAutoRecipe & {readonly materialParams?:CanonicalMaterialParameters}; readonly trustedSource: CanonicalSoftAutoSource;
  readonly programOwner: CanonicalSoftCircleProgramOwner;
};
export function isCanonicalSoftAutoMaterial(m: CanonicalAutoMaskMaterial): m is Extract<CanonicalAutoMaskMaterial, { programOwner: CanonicalSoftCircleProgramOwner }> {
  return m.recipe.kind === 'softAuto';
}
/** Caller supplies the already authenticated source pin; this is not an attestation. */
export function prepareCanonicalAutoMask(material:CanonicalAutoMaskMaterial) {
 if(material.recipe.coverageProfile!==SOURCE_SEEDED_AUTO_MASK_PROFILE)return prepareCanonicalAutoMaskCore(material)
 const r=material.recipe
 if(!Number.isInteger(r.maskSeed)||r.maskSeed!<0||r.maskSeed!>0xffffffff||Object.is(r.maskSeed,-0))throw new TypeError('Explicit recorded mask seed required')
 if(isCanonicalSoftAutoMaterial(material))canonicalSoftAutoCost(material.recipe,material.trustedSource,material.coverageScaleFactor)
 else canonicalAutoCost(material.recipe,material.trustedSource,material.coverageScaleFactor)
 const maskSeed=r.maskSeed
 // Coverage-only base retains all transforms/softness and uses the existing
 // browser arithmetic. Random/density stages are then applied ONCE locally.
 let prepared:ReturnType<typeof prepareCanonicalAutoMaskCore>
 if(isCanonicalSoftAutoMaterial(material)){
  prepared=prepareCanonicalAutoMaskCore({...material,recipe:{...material.recipe,maskSeed:undefined,coverageProfile:'browser-number-coverage-v1',source:{...material.recipe.source,randomness:0,density:1}},trustedSource:{...material.trustedSource,coverageProfile:'browser-number-coverage-v1',source:{...material.trustedSource.source,randomness:0,density:1}}})
 }else if(material.recipe.kind==='defaultAuto'&&material.trustedSource.kind==='defaultAuto'){
  prepared=prepareCanonicalAutoMaskCore({...material,recipe:{...material.recipe,maskSeed:undefined,coverageProfile:'browser-number-coverage-v1',source:{...material.recipe.source,randomness:0,density:1}},trustedSource:{...material.trustedSource,coverageProfile:'browser-number-coverage-v1',source:{...material.trustedSource.source,randomness:0,density:1}}})
 }else if(material.recipe.kind==='gaussianAuto'&&material.trustedSource.kind==='gaussianAuto'){
  prepared=prepareCanonicalAutoMaskCore({...material,recipe:{...material.recipe,maskSeed:undefined,coverageProfile:'browser-number-coverage-v1',source:{...material.recipe.source,randomness:0,density:1}},trustedSource:{...material.trustedSource,coverageProfile:'browser-number-coverage-v1',source:{...material.trustedSource.source,randomness:0,density:1}}})
 }else throw new TypeError('Auto generator mismatch')
 try{return {...prepared,requestedProfile:SOURCE_SEEDED_AUTO_MASK_PROFILE,evaluator:sourceSeededAutoMask(prepared.evaluator,{seed:maskSeed!,randomness:r.source.randomness,density:r.source.density,maxWorkSamples:16*1048576})}}
 catch(error){try{prepared.releaseProgram()}catch{}throw error}
}
function prepareCanonicalAutoMaskCore(material: CanonicalAutoMaskMaterial) {
  if(material.recipe.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE)throw new TypeError('Seeded profile requires the recorded-seed wrapper');
  const recipe = material.recipe;
  if(recipe.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE){
    const identity=densityMaterialIdentity(material)
    if(recipe.kind!=='defaultAuto')throw new TypeError('Seeded density default source required')
    if(material.trustedSource.kind!=='defaultAuto')throw new TypeError('Seeded density source pin required')
    canonicalAutoCost(recipe,material.trustedSource,material.coverageScaleFactor)
    return {...prepareSourceSeededDefaultAutoDab({dialect:'krita-default-auto-qt5-arm64-v1',coverageProfile:CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,tip:{...recipe.source,kind:'auto',softness:1,spikes:2,randomness:0},storedScale:recipe.brushScale,storedAngle:recipe.brushAngle,shape:{scale:recipe.scale,ratio:recipe.ratio,rotation:recipe.rotation},subpixelX:recipe.subX,subpixelY:recipe.subY,maxPixels:1048576,maxWorkSamples:16*1048576},identity),releaseProgram:()=>{}}
  } else if('densityIdentity'in material&&material.densityIdentity!==undefined)throw new TypeError('Unexpected density identity');
  const common = {
    coverageScaleFactor:material.coverageScaleFactor,
    storedScale: recipe.brushScale, storedAngle: recipe.brushAngle,
    shape: { scale: recipe.scale, ratio: recipe.ratio, rotation: recipe.rotation },
    subpixelX: recipe.subX, subpixelY: recipe.subY,
    maxPixels: 1048576, maxWorkSamples: 16 * 1048576,
  };
  if (isCanonicalSoftAutoMaterial(material)) {
    const coverage=material.recipe.coverageProfile;
    canonicalSoftAutoCost(material.recipe, material.trustedSource,material.coverageScaleFactor);
    const pin = canonicalSoftAutoSourcePin(material.trustedSource), lease = material.programOwner.acquire(material.recipe.materialParams?.softness??1);
    try {
      const expectedTip = { kind: 'auto', generator: 'soft', shape: pin.source.shape, diameter: pin.source.diameter,
        ratio: pin.source.ratio, horizontalFade: pin.source.horizontalFade, verticalFade: pin.source.verticalFade,
        spikes: pin.source.spikes, softness: 1, randomness: 0, density: 1, antialias: pin.source.antialias };
      const expectedCurve = { points: pin.radialCurve.source.points.map(p => ({ x: p.x, y: p.y })), coefficients: pin.radialCurve.coefficients };
      if (!canonicalSoftAutoDataEqual(lease.program.tip, expectedTip) || !canonicalSoftAutoDataEqual(lease.program.curve, expectedCurve))
        throw new TypeError('Soft program differs from trusted source');
      return { ...prepareSourceSoftCircleDab({ ...common, dialect: 'krita-soft-circle-qt5-arm64-v1',
        coverageProfile: coverage, program: lease.program,softness:material.recipe.materialParams?.softness,sourceCurvePoints:pin.source.softnessCurve.points }), releaseProgram: lease.release };
    } catch (error) { try { lease.release(); } catch { /* Preserve preparation failure. */ } throw error; }
  }
  canonicalAutoCost(material.recipe, material.trustedSource,material.coverageScaleFactor);
  const r = material.recipe, releaseProgram = () => {};
  if(r.coverageProfile===SOURCE_SEEDED_AUTO_MASK_PROFILE)throw new TypeError('Unexpected seeded core profile');
  if (r.kind === 'gaussianAuto') return { ...prepareSourceGaussianDab({ ...common,
    dialect: 'krita-gaussian-auto-qt5-arm64-v1', coverageProfile: r.coverageProfile,
    tip: { ...r.source, kind: 'auto', spikes: r.source.spikes, softness: 1, randomness: 0, density: 1 } }), releaseProgram };
  if(r.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE)throw new TypeError('Seeded density execution is not prepared');
  return { ...prepareSourceDefaultAutoDab({ ...common, dialect: 'krita-default-auto-qt5-arm64-v1', coverageProfile: r.coverageProfile,softness:r.materialParams?.softness,
    tip: { ...r.source, kind: 'auto', spikes: r.source.spikes, softness: 1, randomness: 0, density: 1 } }), releaseProgram };
}
function densityMaterialIdentity(material:CanonicalAutoMaskMaterial):SourceDefaultAutoDensityIdentity {
  if(isCanonicalSoftAutoMaterial(material)||material.recipe.kind!=='defaultAuto'||material.trustedSource.kind!=='defaultAuto'
    ||material.trustedSource.coverageProfile!==CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE||!material.densityIdentity)
    throw new TypeError('Seeded density execution is not prepared')
  const identity=material.densityIdentity
  sourceDefaultAutoDensitySeed(identity)
  if(identity.descriptorSha256!==material.trustedSource.descriptorSha256)throw new TypeError('Density identity differs from trusted source')
  return identity
}
export function canonicalAutoMaskRevision(material: CanonicalAutoMaskMaterial): string {
  if (isCanonicalSoftAutoMaterial(material)) {
    canonicalSoftAutoCost(material.recipe, material.trustedSource,material.coverageScaleFactor);
    return JSON.stringify(['canonical-soft-auto-v1', canonicalSoftAutoSourcePin(material.trustedSource), material.recipe,material.coverageScaleFactor??1],
      (_key, value: unknown) => typeof value === 'number' && Object.is(value, -0) ? '-0' : value);
  }
  const { recipe: r, trustedSource: t } = material;
  canonicalAutoCost(r, t,material.coverageScaleFactor);
  if(r.coverageProfile===CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE){
    const identity=densityMaterialIdentity(material)
    return JSON.stringify(['canonical-seeded-density-v1',t,r,sourceDefaultAutoDensitySeed(identity),identity.drawOrdinal],(_key,value:unknown)=>typeof value==='number'&&Object.is(value,-0)?'-0':value);
  }
  if(material.densityIdentity!==undefined)throw new TypeError('Unexpected density identity');
  return JSON.stringify(['canonical-auto-v2','coverageScaleFactor',material.coverageScaleFactor??1,t.descriptorId, t.descriptorVersion, t.descriptorSha256,
    r.source.generator, r.source.shape, r.source.diameter, r.source.ratio, r.source.horizontalFade, r.source.verticalFade,
    r.source.antialias, r.source.spikes, r.source.randomness, r.source.density, r.coverageProfile,
    ...r.maskSeed!==undefined?['maskSeed',r.maskSeed,'slot',r.sourceSlot]:[],r.brushScale, r.brushAngle, r.scale, r.ratio, r.rotation, r.subX, r.subY, r.width, r.height,...r.materialParams?['parameters',JSON.stringify(r.materialParams)]:[]]
    .map(v => Object.is(v, -0) ? '-0' : v));
}
export type TransformedMaskMaterial = CanonicalAutoMaskMaterial | SourceDabMaterialSpec | { readonly kind: 'savedSource'; readonly source: SourceDabMaterialSpec } | CanonicalTransformedMaskMaterial;
export function canonicalTransformedMaskMetadata(recipe: CanonicalMaterialRecipe, asset: CanonicalMaterialAsset) {
  if (!asset || !/^asset:[0-9a-f]{64}$/.test(asset.id) || ![asset.size, asset.width, asset.height].every(n => Number.isSafeInteger(n) && n > 0)
    || asset.size > 4096 || ![asset.x, asset.y].every(n => Number.isSafeInteger(n) && n >= 0)
    || asset.x + asset.width > asset.size || asset.y + asset.height > asset.size
    || !recipe || recipe.asset !== asset.id || typeof recipe.mirrorH !== 'boolean' || typeof recipe.mirrorV !== 'boolean')
    throw new RangeError('Invalid canonical mask asset binding');
  const shape = sourcePngRasterShape({ width: asset.width, height: asset.height, scale: recipe.brushScale, angle: recipe.brushAngle },
    { scale: recipe.scale, ratio: recipe.ratio, rotation: recipe.rotation });
  const metadata = sourceImageTransformMetadata(asset.width, asset.height, shape, recipe.subX, recipe.subY);
  if (metadata.width !== recipe.width || metadata.height !== recipe.height)
    throw new RangeError('Canonical mask allocation differs from source plan');
  return metadata;
}
/** Metadata already admitted before deferred covered-row allocation. */
export function canonicalTransformedMaskPlan(recipe: CanonicalMaterialRecipe, asset: CanonicalMaterialAsset): TransformedMaskPlan {
  const m = canonicalTransformedMaskMetadata(recipe, asset);
  return { ...m, spans: m.directCopy ? [] : sourceImageTransformSpans(m.levelWidth + 2, m.levelHeight + 2, m.width, m.height, m.forward) };
}
export function canonicalMaskRevision(profile: string, sourceKey: string, recipe: CanonicalMaterialRecipe, asset: CanonicalMaterialAsset): string {
  // ECMAScript decimal number serialization is round-trip exact for finite F64;
  // distinguish -0 explicitly. Placement and post-raster mirrors are not pixels.
  return JSON.stringify(['canonical-v1', profile, sourceKey, asset.id, asset.size, asset.x, asset.y, asset.width, asset.height,
    recipe.brushScale, recipe.brushAngle, recipe.scale, recipe.ratio, recipe.rotation, recipe.subX, recipe.subY, recipe.width, recipe.height]
    .map(v => Object.is(v, -0) ? '-0' : v));
}
export function transformedMaskVertexCount(plan: TransformedMaskPlan): number {
  return (plan.directCopy ? 1 : plan.spans.length) * 6;
}
/** Writes only into caller-owned reusable staging. No width*height pixel array.
* Integer row seeds are obtained at the existing CPU sampler boundary; no
* shader reconstructs them from an imprecise float inverse transform.
*/
export function writeTransformedMaskVertices(plan: TransformedMaskPlan, staging: Float32Array): number {
  const count = transformedMaskVertexCount(plan), required = count * TRANSFORMED_MASK_VERTEX_FLOATS;
  if (staging.length < required)
    throw new RangeError('Transformed-mask staging capacity exceeded');
  const fixed = 65536;
  const coordinates = { fx: 0, fy: 0, dx: 0, dy: 0 };
  let cursor = 0;
  const row = (x: number, y: number, length: number, height: number) => {
    if (plan.directCopy && length > 2048) {
      coordinates.fx = coordinates.fy = coordinates.dx = coordinates.dy = 0;
    }
    else
      affineImageSpan16Coordinates(plan.samplingInverse, x, y, length, 'sampling', coordinates);
    const { fx, fy, dx, dy } = coordinates;
    const dxWhole = Math.floor(dx / fixed), dxFraction = dx - dxWhole * fixed;
    const dyWhole = Math.floor(dy / fixed), dyFraction = dy - dyWhole * fixed;
    const fxWhole = Math.floor(fx / fixed), fxFraction = fx - fxWhole * fixed;
    const fyWhole = Math.floor(fy / fixed), fyFraction = fy - fyWhole * fixed;
    for (let vertex = 0; vertex < 6; vertex++) {
      staging[cursor++] = vertex === 1 || vertex >= 4 ? x + length : x;
      staging[cursor++] = vertex === 2 || vertex === 3 || vertex === 5 ? y + height : y;
      staging[cursor++] = fxWhole;
      staging[cursor++] = fxFraction;
      staging[cursor++] = fyWhole;
      staging[cursor++] = fyFraction;
      staging[cursor++] = dxWhole;
      staging[cursor++] = dxFraction;
      staging[cursor++] = dyWhole;
      staging[cursor++] = dyFraction;
      staging[cursor++] = x;
      staging[cursor++] = length;
    }
  };
  if (plan.directCopy)
    row(0, 0, plan.width, plan.height);
  else
    for (const span of plan.spans)
      row(span.x, span.y, span.length, 1);
  return count;
}
