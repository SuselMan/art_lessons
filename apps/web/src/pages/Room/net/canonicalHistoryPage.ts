import { canonicalRecordedRasterProfiles, prepareCanonicalRecordedAttachment, type CanonicalRecordedReadScope, type CanonicalPreparedRecordedOperation, type Operation } from '@grafetto/shared'

export interface CanonicalHistoryScope extends CanonicalRecordedReadScope { readonly isCurrent: () => boolean }
export interface PreparedCanonicalHistoryPage {
  readonly operations: readonly Operation[]
  readonly prepared: readonly CanonicalPreparedRecordedOperation[]
}
export type PreparedHistoryPage = Operation[] | PreparedCanonicalHistoryPage
/** This failure cannot mean a successful empty/end-of-history page. */
export class CanonicalHistoryReadError extends Error {
  constructor(cause?: unknown) { super('Canonical history requires a current, complete recorded capability', { cause }); this.name = 'CanonicalHistoryReadError' }
}
export function captureCanonicalHistoryScope(scope: CanonicalHistoryScope | undefined): CanonicalHistoryScope | undefined {
  return scope ? Object.freeze({ roomId: scope.roomId, boardEpoch: scope.boardEpoch,
    allowedRasterProfiles: canonicalRecordedRasterProfiles(scope), isCurrent: scope.isCurrent }) : undefined
}
export function assertCanonicalHistoryCurrent(scope: CanonicalHistoryScope | undefined): void {
  if (scope && !scope.isCurrent()) throw new CanonicalHistoryReadError()
}
/** Scope comes from captured room_state, never this page. Legacy arrays retain
 * their old lane; the new scoped reader rejects unattached canonical rows. */
export function prepareCanonicalHistoryPage(value: unknown, roomId: string, scope?: CanonicalHistoryScope): PreparedHistoryPage {
  try {
    assertCanonicalHistoryCurrent(scope)
    if (Array.isArray(value)) {
      if (value.some(op => op?.type === 'canonical_stroke_close')) throw new CanonicalHistoryReadError()
      if (scope && value.some(op => op?.type === 'canonical_stroke')) throw new CanonicalHistoryReadError()
      return value as Operation[]
    }
    if (!scope || scope.roomId !== roomId || !value || typeof value !== 'object'
      || Reflect.ownKeys(value).length !== 2 || !Object.hasOwn(value, 'operations') || !Object.hasOwn(value, 'canonicalCapabilities')) throw new CanonicalHistoryReadError()
    const page = value as { operations: Operation[]; canonicalCapabilities: unknown }
    if (Array.isArray(page.operations) && page.operations.some(op => (op.type as string) === 'canonical_stroke_close')) throw new CanonicalHistoryReadError()
    const prepared = prepareCanonicalRecordedAttachment(page.canonicalCapabilities, page.operations, scope)
    assertCanonicalHistoryCurrent(scope)
    return Object.freeze({ operations: Object.freeze(prepared.map(atom => atom.operation)), prepared })
  } catch (error) { if (error instanceof CanonicalHistoryReadError) throw error; throw new CanonicalHistoryReadError(error) }
}
