// Append-only operation log — the source of truth for canvas content (ADR 002).
// Undo/redo never rewrites history: entries flip between three states and
// replay simply skips everything that is not `done`.
//
//   done   — applied, visible on canvas
//   undone — reverted by its author, eligible for redo
//   gone   — unreachable history branch (author acted after undo, or a teacher
//            revoked it); can never return to `done`

import type { Operation, StrokeOperation, LayerClearOperation, LayerMergeOperation } from '@art-lessons/shared'

export type OperationState = 'done' | 'undone' | 'gone'

export interface LogEntry {
  op: Operation
  state: OperationState
}

/** Operations that change a layer's pixel buffer (as opposed to structure). */
export type PixelOperation = StrokeOperation | LayerClearOperation | LayerMergeOperation

export function isPixelOperation(op: Operation): op is PixelOperation {
  return op.type === 'stroke' || op.type === 'layer_clear' || op.type === 'layer_merge'
}

/** Continuous opacity-slider input arrives as a burst of operations; collapse
 *  the burst into one log entry so a single Ctrl+Z reverts the whole slide. */
function coalesces(prev: Operation, next: Operation): boolean {
  return prev.type === 'layer_opacity' && next.type === 'layer_opacity'
    && prev.layerId === next.layerId && prev.userId === next.userId
}

export class OperationLog {
  private _entries: LogEntry[] = []
  private _nextSeq = 0

  get entries(): readonly LogEntry[] {
    return this._entries
  }

  /** Appends a new operation. The author's `undone` entries become `gone`:
   *  a linear log cannot express history branching, so a new action makes the
   *  undone branch unreachable and redo past it impossible. */
  append(op: Operation): void {
    for (const e of this._entries) {
      if (e.state === 'undone' && e.op.userId === op.userId) e.state = 'gone'
    }

    const last = this._entries[this._entries.length - 1]
    if (last && last.state === 'done' && coalesces(last.op, op)) {
      last.op = { ...op, seq: last.op.seq }
      return
    }

    this._entries.push({ op: { ...op, seq: this._nextSeq++ }, state: 'done' })
  }

  /** Marks the user's latest `done` operation as `undone` and returns it. */
  undo(userId: string): Operation | null {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i]
      if (e.state === 'done' && e.op.userId === userId && e.op.type !== 'operation_revoke') {
        e.state = 'undone'
        return e.op
      }
    }
    return null
  }

  /** Returns the user's most recently undone operation to `done`. Undo always
   *  takes the highest-seq `done` entry, so the user's undone entries form a
   *  suffix of their history — the redo target is the lowest-seq one. */
  redo(userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.state === 'undone' && e.op.userId === userId) {
        e.state = 'done'
        return e.op
      }
    }
    return null
  }

  /** Privileged removal of someone else's operation (teacher). The target goes
   *  straight to `gone` — no redo, the author's own undo stack is untouched. */
  revoke(targetOpId: string): Operation | null {
    for (const e of this._entries) {
      if (e.op.id === targetOpId && e.state !== 'gone') {
        e.state = 'gone'
        return e.op
      }
    }
    return null
  }

  /** All `done` operations in seq order. */
  doneOperations(): Operation[] {
    const out: Operation[] = []
    for (const e of this._entries) {
      if (e.state === 'done') out.push(e.op)
    }
    return out
  }

  /** `done` pixel operations targeting the given layer, optionally only those
   *  ordered strictly before `beforeSeq` (used to reconstruct a merge source
   *  as it was at merge time). */
  layerPixelOps(layerId: string, beforeSeq?: number): PixelOperation[] {
    const out: PixelOperation[] = []
    for (const e of this._entries) {
      if (e.state !== 'done') continue
      const { op } = e
      if (!isPixelOperation(op) || op.layerId !== layerId) continue
      if (beforeSeq !== undefined && (op.seq ?? 0) >= beforeSeq) continue
      out.push(op)
    }
    return out
  }
}
