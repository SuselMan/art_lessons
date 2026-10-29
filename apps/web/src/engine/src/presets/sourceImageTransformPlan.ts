import { sourceImageTransformMetadata } from '@grafetto/shared'
import type { SourceDabShape } from './sourcePngGeometry'
import { sourceImageTransformSpans } from './sourceImageTransformSpans'
export { sourceImageTransformMetadata } from '@grafetto/shared'

/** Allocate covered rows only after the caller has accepted aggregate work and
 * residency budgets. Geometry/matrices share the metadata-only preflight owner. */
export function sourceImageTransformPlan(originalWidth: number, originalHeight: number,
  shape: SourceDabShape, subX: number, subY: number) {
  const metadata = sourceImageTransformMetadata(originalWidth, originalHeight, shape, subX, subY)
  return { ...metadata, spans: metadata.directCopy ? [] : sourceImageTransformSpans(
    metadata.levelWidth + 2, metadata.levelHeight + 2, metadata.width, metadata.height, metadata.forward) }
}
