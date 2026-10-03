import type { Operation, OperationDraft } from '@grafetto/shared'

export function isAnnotationOperation(op: OperationDraft): boolean {
  return op.type === 'annotation_add' || op.type === 'annotation_update' || op.type === 'annotation_delete'
}

/** Only annotation entries and their undo/redo/revoke are needed for the
 *  early review projection. Pixels and layer history stay with the engine. */
export function mergeReviewHistory(current: readonly Operation[], arrivals: readonly Operation[]): Operation[] {
  const all = new Map(current.map(op => [op.id, op]))
  for (const op of arrivals) if (isAnnotationOperation(op)) all.set(op.id, op)
  for (const op of arrivals) {
    if ((op.type === 'operation_undo' || op.type === 'operation_redo' || op.type === 'operation_revoke')
      && all.has(op.targetOpId)) all.set(op.id, op)
  }
  return [...all.values()].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))
}

/** Annotation gestures each have one entry. The same author/status rules as
 *  OperationLog, without constructing GL resources or replaying any paint. */
export function reviewEntries(history: readonly Operation[]): { op: Operation; state: 'done' | 'undone' | 'revoked' }[] {
  const entries = new Map<string, { op: Operation; state: 'done' | 'undone' | 'revoked' }>()
  for (const op of history) {
    if (isAnnotationOperation(op)) { entries.set(op.id, { op, state: 'done' }); continue }
    if (op.type !== 'operation_undo' && op.type !== 'operation_redo' && op.type !== 'operation_revoke') continue
    const target = entries.get(op.targetOpId)
    if (!target) continue
    if (op.type === 'operation_revoke') { target.state = 'revoked'; continue }
    if (target.op.userId !== op.userId || target.state === 'revoked') continue
    target.state = op.type === 'operation_undo' ? 'undone' : 'done'
  }
  return [...entries.values()]
}

export function reviewDoneOperations(history: readonly Operation[]): Operation[] {
  return reviewEntries(history).filter(entry => entry.state === 'done').map(entry => entry.op)
}

export function isReviewAnnotationDraft(draft: OperationDraft, history: readonly Operation[]): boolean {
  return isAnnotationOperation(draft)
    || ((draft.type === 'operation_undo' || draft.type === 'operation_redo')
      && history.some(op => op.id === draft.targetOpId && isAnnotationOperation(op)))
}
