import { CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE, canonicalSoftAutoCost, canonicalSoftAutoSourcePin, canonicalSoftAutoDataEqual, type CanonicalSoftAutoRecipe, type CanonicalSoftAutoSource } from '@grafetto/shared';
import { prepareSourceSoftCircleDab } from '../presets/sourceSoftCircleDab';
import { CanonicalSoftCircleProgramOwner } from './CanonicalSoftCircleProgramOwner';
import { canonicalAutoCost, type CanonicalAutoRecipe, type CanonicalAutoSource } from '@grafetto/shared';
import { prepareSourceGaussianDab } from '../presets/sourceGaussianDab';
import { prepareSourceDefaultAutoDab } from '../presets/sourceDefaultAutoDab';
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
  readonly kind: 'canonicalAuto'; readonly recipe: CanonicalAutoRecipe; readonly trustedSource: CanonicalAutoSource;
} | {
  readonly kind: 'canonicalAuto'; readonly recipe: CanonicalSoftAutoRecipe; readonly trustedSource: CanonicalSoftAutoSource;
  readonly programOwner: CanonicalSoftCircleProgramOwner;
};
export function isCanonicalSoftAutoMaterial(m: CanonicalAutoMaskMaterial): m is Extract<CanonicalAutoMaskMaterial, { programOwner: CanonicalSoftCircleProgramOwner }> {
  return m.recipe.kind === 'softAuto';
}
/** Caller supplies the already authenticated source pin; this is not an attestation. */
export function prepareCanonicalAutoMask(material: CanonicalAutoMaskMaterial) {
  if(material.recipe.coverageProfile===CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE)throw new TypeError('Browser coverage renderer unavailable');
  const recipe = material.recipe;
  const common = {
    storedScale: recipe.brushScale, storedAngle: recipe.brushAngle,
    shape: { scale: recipe.scale, ratio: recipe.ratio, rotation: recipe.rotation },
    subpixelX: recipe.subX, subpixelY: recipe.subY,
    maxPixels: 1048576, maxWorkSamples: 16 * 1048576,
  };
  if (isCanonicalSoftAutoMaterial(material)) {
    canonicalSoftAutoCost(material.recipe, material.trustedSource);
    const pin = canonicalSoftAutoSourcePin(material.trustedSource), lease = material.programOwner.acquire();
    try {
      const expectedTip = { kind: 'auto', generator: 'soft', shape: 'circle', diameter: pin.source.diameter,
        ratio: pin.source.ratio, horizontalFade: pin.source.horizontalFade, verticalFade: pin.source.verticalFade,
        spikes: 2, softness: 1, randomness: 0, density: 1, antialias: false };
      const expectedCurve = { points: pin.radialCurve.source.points.map(p => ({ x: p.x, y: p.y })), coefficients: pin.radialCurve.coefficients };
      if (!canonicalSoftAutoDataEqual(lease.program.tip, expectedTip) || !canonicalSoftAutoDataEqual(lease.program.curve, expectedCurve))
        throw new TypeError('Soft program differs from trusted source');
      return { ...prepareSourceSoftCircleDab({ ...common, dialect: 'krita-soft-circle-qt5-arm64-v1',
        coverageProfile: material.recipe.coverageProfile, program: lease.program }), releaseProgram: lease.release };
    } catch (error) { try { lease.release(); } catch { /* Preserve preparation failure. */ } throw error; }
  }
  canonicalAutoCost(material.recipe, material.trustedSource);
  const r = material.recipe, releaseProgram = () => {};
  if (r.coverageProfile === CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE) throw new TypeError('Browser coverage renderer unavailable');
  if (r.kind === 'gaussianAuto') return { ...prepareSourceGaussianDab({ ...common,
    dialect: 'krita-gaussian-auto-qt5-arm64-v1', coverageProfile: r.coverageProfile,
    tip: { ...r.source, kind: 'auto', spikes: 2, softness: 1, randomness: 0, density: 1 } }), releaseProgram };
  return { ...prepareSourceDefaultAutoDab({ ...common, dialect: 'krita-default-auto-qt5-arm64-v1', coverageProfile: r.coverageProfile,
    tip: { ...r.source, kind: 'auto', spikes: 2, softness: 1, randomness: 0, density: 1 } }), releaseProgram };
}
export function canonicalAutoMaskRevision(material: CanonicalAutoMaskMaterial): string {
  if (isCanonicalSoftAutoMaterial(material)) {
    canonicalSoftAutoCost(material.recipe, material.trustedSource);
    return JSON.stringify(['canonical-soft-auto-v1', canonicalSoftAutoSourcePin(material.trustedSource), material.recipe],
      (_key, value: unknown) => typeof value === 'number' && Object.is(value, -0) ? '-0' : value);
  }
  const { recipe: r, trustedSource: t } = material;
  canonicalAutoCost(r, t);
  return JSON.stringify(['canonical-auto-v2', t.descriptorId, t.descriptorVersion, t.descriptorSha256,
    r.source.generator, r.source.shape, r.source.diameter, r.source.ratio, r.source.horizontalFade, r.source.verticalFade,
    r.source.antialias, r.source.spikes, r.source.randomness, r.source.density, r.coverageProfile,
    r.brushScale, r.brushAngle, r.scale, r.ratio, r.rotation, r.subX, r.subY, r.width, r.height]
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
