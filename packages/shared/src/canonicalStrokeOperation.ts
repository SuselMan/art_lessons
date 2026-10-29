import type { OperationBase } from './operationBase.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import type { CanonicalStrokeComposition, CanonicalStrokeFrameEnvelope, CANONICAL_STROKE_RASTER_PROFILE } from './canonicalStrokeFrame.js'

/** Deliberately separate from legacy stroke/dabs. Server begin pins authority;
 * recorded frames carry immutable canonical material, not source author state. */
export type CanonicalStrokeOperation = OperationBase & {
  type: 'canonical_stroke'
  layerId: string
  frame: CanonicalStrokeFrameEnvelope
}
export interface CanonicalStrokeBegin {
  readonly layerId: string
  readonly brush: string
  readonly strokeId: string
  readonly pigmentRgb8: readonly [number, number, number]
  readonly outerResourceOpacity: number
  readonly alphaDarken: 'creamy' | 'hard'
}
export interface CanonicalStrokeLive { readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope }
/** Server-produced data snapshot. A client echo is never an execution grant. */
export interface CanonicalStrokeSnapshot {
  readonly layerId: string
  readonly brush: string
  readonly strokeId: string
  readonly boardEpoch: number
  readonly descriptorSha256: string
  readonly rasterProfile: typeof CANONICAL_STROKE_RASTER_PROFILE
  readonly pigmentRgb8: readonly [number, number, number]
  readonly composition: CanonicalStrokeComposition
  readonly assets: readonly CanonicalMaterialAsset[]
}
export type CanonicalStrokeBeginResult = { readonly ok: true; readonly snapshot: CanonicalStrokeSnapshot; readonly recordedNext: number; readonly liveNext: number; readonly ended: boolean }
  | { readonly ok: false; readonly reason: 'invalid_operation' | 'not_joined' | 'server_error' | 'canonical_repair_required' }
export type CanonicalStrokeLiveResult = { readonly ok: true; readonly duplicate: boolean }
  | { readonly ok: false; readonly reason: 'invalid_operation' | 'not_joined' | 'server_error' | 'canonical_repair_required' }
