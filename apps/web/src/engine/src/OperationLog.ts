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

/** Meta-operations that only ever move *another* entry between states —
 *  they never represent undoable content themselves. Excluded from
 *  undo/redo candidate scans (#103): without this, a second Ctrl+Z would
 *  find the operation_undo entry the first Ctrl+Z just appended and try to
 *  "undo the undo" instead of reaching further back into real content. */
const META_OP_TYPES = new Set<Operation['type']>(['operation_revoke', 'operation_undo', 'operation_redo'])

export class OperationLog {
  private _entries: LogEntry[] = []
  private _nextSeq = 0

  get entries(): readonly LogEntry[] {
    return this._entries
  }

  /** Appends a new operation. The author's `undone` entries become `gone`:
   *  a linear log cannot express history branching, so a new action makes the
   *  undone branch unreachable and redo past it impossible.
   *
   *  Meta-ops (operation_undo/redo/revoke, #103) are exempt from this: they
   *  aren't "the user did something new" in the sense this rule guards
   *  against — appending an `operation_redo` (now itself logged/broadcast so
   *  every replica converges, not just a direct in-memory mutation) must not
   *  nuke the very entries it and its siblings are about to flip back to
   *  `done`, or a multi-step redo would wipe its own remaining redo stack
   *  after the first step. */
  append(op: Operation): void {
    if (!META_OP_TYPES.has(op.type)) {
      for (const e of this._entries) {
        if (e.state === 'undone' && e.op.userId === op.userId) e.state = 'gone'
      }
    }

    const last = this._entries[this._entries.length - 1]
    if (last && last.state === 'done' && coalesces(last.op, op)) {
      last.op = { ...op, seq: last.op.seq }
      return
    }

    this._entries.push({ op: { ...op, seq: this._nextSeq++ }, state: 'done' })
  }

  /** Read-only: the user's latest `done` op eligible for undo (excludes
   *  meta-ops — see META_OP_TYPES). Doesn't mutate anything — the caller
   *  (PencilEngine#undo, #103) wraps the result's id into a broadcastable
   *  `operation_undo` and applies it via `applyUndo()` below, so the
   *  author's own client converges through the exact same path as every
   *  peer instead of mutating state ahead of the network. */
  undoTarget(userId: string): Operation | null {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i]
      if (e.state === 'done' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Read-only symmetric counterpart: the user's earliest `undone` op (undo
   *  always takes the highest-seq `done` entry, so a user's undone entries
   *  form a suffix of their history — the redo target is the lowest-seq
   *  one). */
  redoTarget(userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.state === 'undone' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Flips one specific entry (addressed by id, not "whichever is latest")
   *  from `done` to `undone`. This is what every replica actually calls —
   *  the author's own client picked the id once via `undoTarget()` and
   *  broadcasts it in an `operation_undo`; every peer (and the author's own
   *  log, applied through the same `appendOperation` path) flips the exact
   *  same entry, so there's no scan to keep in sync across clients (#103).
   *  Guards `op.userId` against the target's own author: even without real
   *  auth (#41) yet, a client can never undo an op it didn't author. */
  applyUndo(targetOpId: string, userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.op.id === targetOpId && e.state === 'done' && e.op.userId === userId) {
        e.state = 'undone'
        return e.op
      }
    }
    return null
  }

  /** Symmetric with `applyUndo`: undone → done for one specific entry. */
  applyRedo(targetOpId: string, userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.op.id === targetOpId && e.state === 'undone' && e.op.userId === userId) {
        e.state = 'done'
        return e.op
      }
    }
    return null
  }

  /** Convenience: find-then-flip in one call, for callers that don't need
   *  the id split out (e.g. direct, non-networked use of the log). Not used
   *  by PencilEngine's undo()/redo() (#103) — those need the id up front to
   *  build the broadcastable operation, and apply it via `applyUndo`/
   *  `applyRedo` like any other operation. */
  undo(userId: string): Operation | null {
    const target = this.undoTarget(userId)
    return target ? this.applyUndo(target.id, userId) : null
  }

  /** Convenience counterpart to `undo()` — see its docstring. */
  redo(userId: string): Operation | null {
    const target = this.redoTarget(userId)
    return target ? this.applyRedo(target.id, userId) : null
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
