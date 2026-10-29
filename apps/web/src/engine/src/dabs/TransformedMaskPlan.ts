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
  if(source?.geometry?.kind==='defaultAuto')throw new RangeError('Default auto requires a typed procedural material resolver');
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
export type TransformedMaskMaterial = SourceDabMaterialSpec | { readonly kind: 'savedSource'; readonly source: SourceDabMaterialSpec } | CanonicalTransformedMaskMaterial;
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
