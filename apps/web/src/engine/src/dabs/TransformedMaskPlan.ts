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
  if (!source || !source.brush || !source.shape || !source.key || !Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height)
    || source.width < 1 || source.height < 1 || source.width !== source.key.width || source.height !== source.key.height)
    throw new RangeError('Invalid saved source material');
  const { brush, shape, key } = source;
  const plan = sourceImageTransformPlan(brush.width, brush.height, sourcePngRasterShape(brush, shape), key.subPixelX, key.subPixelY);
  if (plan.width !== source.width || plan.height !== source.height)
    throw new RangeError('Saved material allocation differs from its source plan');
  return plan;
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
