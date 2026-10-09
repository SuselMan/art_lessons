// Frozen pre-index/early-return admission oracle (37825dd7), CPU test only.
import type { Operation } from '@grafetto/shared'
import { OperationLog } from './OperationLog'
const META_OP_TYPES = new Set(['operation_undo', 'operation_redo', 'operation_revoke'])
import type { LogEntry } from './OperationLog'
export interface BaselineAdmissionState { _entries: LogEntry[]; _revision: number; _bumpPixelOpCount(op: Operation, delta: number): void }
export function baselineHistoricalReconciliation(this: BaselineAdmissionState, addedIds: readonly string[]): string[] {
    const added = new Set(addedIds)
    const affected = new Set<string>()
    const identity = (op: Operation): string | null => op.type === 'stroke'
      ? JSON.stringify([op.userId, op.strokeId ?? null, op.strokeId ? null : op.id]) : null
    for (const entry of this._entries) {
      if (!added.has(entry.op.id)) continue
      const own = identity(entry.op)
      if (own) affected.add(own)
      if (entry.op.type === 'operation_undo' || entry.op.type === 'operation_redo' || entry.op.type === 'operation_revoke') {
        const targetId = entry.op.targetOpId
        const target = this._entries.find(e => e.op.id === targetId)
        const key = target && identity(target.op)
        if (key) affected.add(key)
      }
    }
    if (!affected.size) return []
    const witnessed = new Map<string, number>()
    for (const entry of this._entries) {
      const op = entry.op
      if (entry.state === 'gone' || (op.type !== 'operation_undo' && op.type !== 'operation_redo' && op.type !== 'operation_revoke')) continue
      const target = this._entries.find(e => e.op.id === op.targetOpId)
      if (!target || (op.type !== 'operation_revoke' && target.op.userId !== op.userId)) continue
      const key = identity(target.op)
      if (key) witnessed.set(key, this._entries.indexOf(entry))
    }
    const unresolved = new Set<string>()
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (key && affected.has(key) && !added.has(entry.op.id) && entry.state === 'undone' && (witnessed.get(key) ?? -1) <= this._entries.indexOf(entry)) unresolved.add(key)
    }
    const scratch = new OperationLog()
    for (const entry of this._entries) {
      const op = entry.op
      scratch.append(op)
      if (entry.state === 'gone' && META_OP_TYPES.has(op.type)) { scratch.revoke(op.id); continue }
      if (op.type === 'operation_undo') scratch.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') scratch.applyRedo(op.targetOpId, op.userId)
      else if (op.type === 'operation_revoke') scratch.revoke(op.targetOpId)
      if (entry.state === 'gone') scratch.revoke(op.id)
    }
    const states = new Map(scratch.entries.map(e => [e.op.id, e.state]))
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (key && affected.has(key) && !added.has(entry.op.id) && entry.state === 'undone' && states.get(entry.op.id) !== 'undone') unresolved.add(key)
    }
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (!key || !affected.has(key) || unresolved.has(key) || entry.state === 'gone') continue
      const state = states.get(entry.op.id)
      if (state === undefined || state === entry.state) continue
      if (entry.state === 'done') this._bumpPixelOpCount(entry.op, -1)
      if (state === 'done') this._bumpPixelOpCount(entry.op, 1)
      entry.state = state
      this._revision++
    }
    return [...unresolved]
  }

