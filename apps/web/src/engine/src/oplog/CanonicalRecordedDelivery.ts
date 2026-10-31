import type { CanonicalPreparedRecordedOperation, CanonicalRecordedReadScope } from '@grafetto/shared'

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
 readonly authorRasterProfile:import('@grafetto/shared').CanonicalStrokeRasterProfile
 readonly tailOperations:readonly import('@grafetto/shared').Operation[]
 readonly preparedAtoms:readonly CanonicalPreparedRecordedOperation[]
 assertEmptyHistoryBase(candidateTail:readonly import('@grafetto/shared').Operation[]):Readonly<import('@grafetto/shared').CanonicalEmptyHistoryBaseV1>
}
