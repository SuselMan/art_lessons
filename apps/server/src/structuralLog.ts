// (#612) A room's structural log, out of rooms.ts: the operations that create
// or destroy a layer/folder id, the three-state fold the client runs over them
// (done / undone / gone — OperationLog.ts), and the alive/deleted ids that
// fold produces. Pure: no room record, no database. rooms.ts keeps the parts
// that touch either — the cold load's one Postgres question
// (resolveUndoneEntries) and writing the ids back onto the record.

import { IMPLICIT_LAYER_IDS, type Operation } from '@grafetto/shared'

/** The operations that create or destroy a layer/folder id — the only ones
 *  `aliveIds`/`deletedIds` are derived from (#368). */
export type StructuralOperation = Extract<Operation, { type: 'layer_add' | 'folder_add' | 'layer_delete' | 'layer_merge' | 'layer_duplicate' }>

export function isStructuralOperation(op: Operation): op is StructuralOperation {
  return op.type === 'layer_add' || op.type === 'folder_add'
    || op.type === 'layer_delete' || op.type === 'layer_merge'
    || op.type === 'layer_duplicate'
}

/** Mirrors the client's own three-state log (see OperationLog.ts's header):
 *  `done` applied, `undone` reverted by its author and eligible for redo,
 *  `gone` unreachable — the author acted after undoing, or a teacher revoked
 *  it, and it can never come back. */
export interface StructuralEntry {
  op: StructuralOperation
  state: 'done' | 'undone' | 'gone'
}

/** Advances the structural log by one recorded operation, returning whether
 *  anything's *done*-ness changed (i.e. whether the derived mirrors need
 *  recomputing).
 *
 *  Deliberately a transcription of `OperationLog`'s state machine rather than
 *  an independent reading of what undo "should" mean — the whole failure this
 *  fixes was two folds of the same log drifting apart, so the rules that
 *  matter here are whatever the client actually does, including the ones that
 *  look like details:
 *
 *   - undo/redo only ever move an entry authored by the same user, and only
 *     from the one state they're defined on. A redo of an entry that has since
 *     gone `gone` does nothing, exactly as `applyRedo` does nothing.
 *   - any non-meta operation makes its author's `undone` entries `gone`: a
 *     linear log can't branch, so acting after an undo puts that branch out of
 *     reach for good. Skipping this would let a late redo revive a layer every
 *     client has already written off.
 *
 *  Two client-side rules have no counterpart here because they can't touch a
 *  structural entry: gesture expansion by `strokeId` (strokes only) and
 *  opacity coalescing (`layer_opacity` only). */
export function advanceStructuralLog(entries: StructuralEntry[], op: Operation): boolean {
  switch (op.type) {
    case 'operation_undo': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state === 'done' && e.op.userId === op.userId)
      if (!target) return false
      target.state = 'undone'
      return true
    }
    case 'operation_redo': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state === 'undone' && e.op.userId === op.userId)
      if (!target) return false
      target.state = 'done'
      return true
    }
    case 'operation_revoke': {
      const target = entries.find(e => e.op.id === op.targetOpId && e.state !== 'gone')
      if (!target) return false
      const wasDone = target.state === 'done'
      target.state = 'gone'
      return wasDone
    }
    default: {
      for (const entry of entries) {
        if (entry.state === 'undone' && entry.op.userId === op.userId) entry.state = 'gone'
      }
      if (!isStructuralOperation(op)) return false
      entries.push({ op, state: 'done' })
      return true
    }
  }
}

export function deriveLayerIds(entries: readonly StructuralEntry[]): { aliveIds: Set<string>; deletedIds: Set<string> } {
  const aliveIds = new Set<string>(IMPLICIT_LAYER_IDS)
  const deletedIds = new Set<string>()
  for (const entry of entries) {
    if (entry.state !== 'done') continue
    switch (entry.op.type) {
      case 'layer_add':
      case 'folder_add':
        aliveIds.add(entry.op.layerId)
        break
      case 'layer_delete':
        for (const id of entry.op.layerIds) { aliveIds.delete(id); deletedIds.add(id) }
        break
      case 'layer_merge':
        aliveIds.add(entry.op.layerId)
        for (const s of entry.op.sources) { aliveIds.delete(s.id); deletedIds.add(s.id) }
        break
      // (#449) Creates one id and destroys none — the source survives being
      // copied. That is the whole difference from the merge above.
      case 'layer_duplicate':
        aliveIds.add(entry.op.layerId)
        break
    }
  }
  return { aliveIds, deletedIds }
}

/** The client's own META_OP_TYPES (OperationLog.ts) — the operations that only
 *  ever move another entry between states, and so never count as their
 *  author "acting" for the undone → gone rule. */
export const META_OP_TYPES = ['operation_undo', 'operation_redo', 'operation_revoke']

/** Builds a room's structural log from its resident operation log — the cold
 *  load's counterpart to `updateAliveIds` below, and the reason
 *  `operation_undo`/`_redo`/`_revoke` have to stay resident at any age (see
 *  RESIDENT_OP_TYPES). */
export function buildStructuralLog(operations: readonly Operation[]): StructuralEntry[] {
  const entries: StructuralEntry[] = []
  for (const op of operations) advanceStructuralLog(entries, op)
  return entries
}
