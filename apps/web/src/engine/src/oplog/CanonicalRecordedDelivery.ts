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
