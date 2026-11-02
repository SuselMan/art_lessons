import type {CanonicalStandaloneStrokeSnapshotV7} from './canonicalTexturedAutoStandalone.js'
import type {CanonicalResolvedTexturePhase} from './canonicalPrimaryTexture.js'
import type { OperationBase } from './operationBase.js'
import type { CanonicalMaterialContextV2, CanonicalMaterialContextV3, CanonicalMaterialContextV4, CanonicalMaterialContextV5,CanonicalMaterialContextV6 } from './canonicalMaterialCodec.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'
import type { CanonicalStrokeComposition, CanonicalStrokeFrameEnvelope, CanonicalStrokeRasterProfile, CANONICAL_STROKE_RASTER_PROFILE, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE } from './canonicalStrokeFrame.js'

/** Deliberately separate from legacy stroke/dabs. Server begin pins authority;
 * recorded frames carry immutable canonical material, not source author state. */
export type CanonicalStrokeOperation = OperationBase & {
  type: 'canonical_stroke'
  layerId: string
  frame: CanonicalStrokeFrameEnvelope
}
export interface CanonicalStrokeBegin {
  /** Ephemeral exact attempt control; excluded from source/snapshot/history. */
  readonly emptyDiscardNonce?:string
  readonly layerId: string
  readonly brush: string
  readonly strokeId: string
  readonly pigmentRgb8: readonly [number, number, number]
  readonly outerResourceOpacity: number
  readonly texturePhase?:CanonicalResolvedTexturePhase
  readonly alphaDarken: 'creamy' | 'hard'
}
export interface CanonicalStrokeLive { readonly layerId: string; readonly frame: CanonicalStrokeFrameEnvelope }
/** Server-produced data snapshot. A client echo is never an execution grant. */
export interface CanonicalStrokeSnapshotV1 {
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
/** Explicit server-pinned recipe2 context; client echoes cannot authorize it.
 * V1 snapshot has no additional fields and retains its exact existing shape. */
export interface CanonicalStrokeSnapshotV2 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'> {
  readonly rasterProfile:CanonicalStrokeRasterProfile
  readonly materialVersion: 2
  readonly material: CanonicalMaterialContextV2
}
/** Explicit material3 snapshot; activation requires the completed protocol cutover. */
export interface CanonicalStrokeSnapshotV3 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'> {
  readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE
  readonly materialVersion:3
  readonly material:CanonicalMaterialContextV3
}
/** Standalone metadata declaration; NOT in actual snapshot/result/read unions. */
export interface CanonicalStrokeSnapshotV4 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'> {
  readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE|typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE
  readonly materialVersion:4
  readonly material:CanonicalMaterialContextV4
}
/** Coherent online5 snapshot DATA, never a client append grant. */
export interface CanonicalStrokeSnapshotV5 extends Omit<CanonicalStrokeSnapshotV1,'rasterProfile'> {
  readonly rasterProfile:typeof CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE|typeof CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE
  readonly materialVersion:5
  readonly material:CanonicalMaterialContextV5
}
/** Coherent Soft6 snapshot DATA; actual server/read authority remains external. */
export interface CanonicalStrokeSnapshotV6 extends Omit<CanonicalStrokeSnapshotV5,'materialVersion'|'material'>{readonly materialVersion:6;readonly material:CanonicalMaterialContextV6}
export type CanonicalStrokeSnapshotV7=CanonicalStandaloneStrokeSnapshotV7
export type CanonicalStrokeSnapshot = CanonicalStrokeSnapshotV1 | CanonicalStrokeSnapshotV2 | CanonicalStrokeSnapshotV3 | CanonicalStrokeSnapshotV4 | CanonicalStrokeSnapshotV5 | CanonicalStrokeSnapshotV6 | CanonicalStrokeSnapshotV7
/** Resume state: ended describes the recorded prefix. A speculative live-only
 * terminal frame does not establish a recorded end. */
export type CanonicalStrokeBeginResult = { readonly ok: true; readonly snapshot: CanonicalStrokeSnapshot; readonly recordedNext: number; readonly liveNext: number; readonly ended: boolean }
  | { readonly ok: false; readonly reason: 'invalid_operation' | 'not_joined' | 'server_error' | 'canonical_repair_required' }
export type CanonicalStrokeLiveResult = { readonly ok: true; readonly duplicate: boolean }
  | { readonly ok: false; readonly reason: 'invalid_operation' | 'not_joined' | 'server_error' | 'canonical_repair_required' }
