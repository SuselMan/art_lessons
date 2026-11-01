import type { CanonicalPreparedRecordedOperation, CanonicalRecordedReadScope, CanonicalAuthorPrimaryTextureSource } from '@grafetto/shared'

/** Local captured read lifetime. Wire data and immutable log copies cannot mint it. */
export interface CanonicalRecordedLifetime {
  assertCurrent(this: CanonicalRecordedLifetime): Readonly<CanonicalRecordedReadScope>
}

/** Origin-owned exact-input proof; implementations remain with network ingress. */
export interface CanonicalRecordedDelivery {
  readonly lifetime: CanonicalRecordedLifetime
  assertCurrent(this: CanonicalRecordedDelivery, candidate: CanonicalRecordedInput): void
}

export interface CanonicalRecordedInput extends CanonicalPreparedRecordedOperation {
  readonly delivery: CanonicalRecordedDelivery
}

/** Original authenticated room read. Methods belong to its ingress owner;
 * copying metadata or a tail cannot mint this lifetime. */
export interface CanonicalRecordedEmptyRoomRead extends CanonicalRecordedLifetime {
 readonly roomGeometry:Readonly<{width:number|undefined;height:number|undefined;infinite:boolean}>
 readonly scope:Readonly<CanonicalRecordedReadScope>
 readonly authorPrimaryTextureSource?:CanonicalAuthorPrimaryTextureSource
 readonly authorRasterProfile:import('@grafetto/shared').CanonicalStrokeRasterProfile
 readonly tailOperations:readonly import('@grafetto/shared').Operation[]
 readonly preparedAtoms:readonly CanonicalPreparedRecordedOperation[]
 readonly assertFullHistoryBase?: (candidateTail:readonly import('@grafetto/shared').Operation[])=>ReturnType<typeof import('@grafetto/shared').verifyCanonicalFullHistoryBase>
 assertEmptyHistoryBase(candidateTail:readonly import('@grafetto/shared').Operation[]):Readonly<import('@grafetto/shared').CanonicalEmptyHistoryBaseV1>
}

/** Indexed containers belong to one finite cursor; original input provenance
 * belongs to its joined origin and survives release of an old page payload. */
export interface CanonicalIndexedPage {
 readonly afterSeq:number
 readonly nextAfterSeq:number
 readonly terminal:boolean
 inputs(this:CanonicalIndexedPage):readonly CanonicalRecordedInput[]
 assertCurrent(this:CanonicalIndexedPage,candidate:CanonicalIndexedPage):void
 release(this:CanonicalIndexedPage):void
}
export interface CanonicalRootWitnesses {
 readonly root:Readonly<import('@grafetto/shared').CanonicalIndexedRootV1>
 readonly first:CanonicalRecordedInput
 readonly terminal:CanonicalRecordedInput|null
 readonly lastMetadata:CanonicalRecordedInput|null
 readonly latestRedo:CanonicalRecordedInput|null
 readonly firstUndoAfterLatestRedo:CanonicalRecordedInput|null
 readonly ownBranchAfterUndo:CanonicalRecordedInput|null
}
export interface CanonicalIndexedRootProof {
 assertCurrent(this:CanonicalIndexedRootProof,candidate:CanonicalIndexedRootProof,input:CanonicalRecordedInput):Readonly<CanonicalRootWitnesses>
 release(this:CanonicalIndexedRootProof):void
}
export interface CanonicalAcceptedCut {
 readonly lifetime:CanonicalRecordedLifetime
 readonly throughSeq:number
 readonly operationCount:number
 readonly roomGeometry:Readonly<import('@grafetto/shared').CanonicalIndexedRoomGeometry>
 readonly authorPrimaryTextureSource?:CanonicalAuthorPrimaryTextureSource
 readonly authorRasterProfile:import('@grafetto/shared').CanonicalStrokeRasterProfile
 readonly scope:Readonly<CanonicalRecordedReadScope>
 assertCurrent(this:CanonicalAcceptedCut,candidate:CanonicalAcceptedCut):void
}
export interface CanonicalIndexedHistoryCandidate {
 readonly target:CanonicalRecordedInput
 readonly proof:CanonicalIndexedRootProof
 assertCurrent(this:CanonicalIndexedHistoryCandidate,candidate:CanonicalIndexedHistoryCandidate,cut:CanonicalAcceptedCut):void
 release(this:CanonicalIndexedHistoryCandidate):void
}
export interface CanonicalIndexedOrigin extends CanonicalRecordedLifetime {
 readonly authorPrimaryTextureSource?:CanonicalAuthorPrimaryTextureSource
 reopen(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut):Promise<CanonicalIndexedRead>
 follow(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut):Promise<CanonicalIndexedRead>
 selectHistory(this:CanonicalIndexedOrigin,cut:CanonicalAcceptedCut,action:'undo'|'redo'):Promise<CanonicalIndexedHistoryCandidate|null>
}
export interface CanonicalIndexedRead {
 readonly kind:'full'|'follow'
 readonly floor:number
 readonly latestObservedSeq:number
 readonly lifetime:CanonicalIndexedOrigin
 readonly throughSeq:number
 readonly operationCount:number
 readonly roomGeometry:Readonly<import('@grafetto/shared').CanonicalIndexedRoomGeometry>
 readonly authorPrimaryTextureSource?:CanonicalAuthorPrimaryTextureSource
 readonly authorRasterProfile:import('@grafetto/shared').CanonicalStrokeRasterProfile
 readonly scope:Readonly<CanonicalRecordedReadScope>
 assertCurrent(this:CanonicalIndexedRead,candidate:CanonicalIndexedRead):void
 nextPage(this:CanonicalIndexedRead):Promise<CanonicalIndexedPage>
 rootEvidence(this:CanonicalIndexedRead,input:CanonicalRecordedInput):Promise<CanonicalIndexedRootProof>
 finish(this:CanonicalIndexedRead,actualEmptyTerminalPage:CanonicalIndexedPage):CanonicalAcceptedCut
 cancel(this:CanonicalIndexedRead):void|Promise<void>
}
