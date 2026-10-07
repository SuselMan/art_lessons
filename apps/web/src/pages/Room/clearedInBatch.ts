import type { Operation } from '@grafetto/shared'

/** Diagnostic only: a complete first join's watercolor strokes overwritten
 * by a later clear. Every operation still enters the canonical log. Unknown
 * history, cross-layer readers, structural edits and undo of a clear all use
 * the ordinary replay. The caller also rejects snapshots/catch-up. */
export function clearedInBatch(ops: readonly Operation[], liveLayerIds: readonly string[]): Set<string> {
  const none = new Set<string>()
  const layers = new Set(liveLayerIds)
  const byId = new Map<string, Operation>()
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.seq !== i + 1 || byId.has(op.id)) return none
    byId.set(op.id, op)
    switch (op.type) {
      case 'stroke':
        // Smudge/sample/copy and unknown tools may read another layer. A
        // watercolor stroke consumes only its recorded dabs and its own film.
        if (op.tool !== 'watercolor' || !layers.has(op.layerId) || !op.strokeId) return none
        break
      case 'layer_clear':
        if (!layers.has(op.layerId)) return none
        break
      case 'paper_dry':
      case 'operation_undo':
        break
      default:
        return none
    }
  }
  for (const op of ops) {
    if (op.type !== 'operation_undo') continue
    const target = byId.get(op.targetOpId)
    // A clear undone anywhere in the batch, unknown prefix target, or an
    // author mismatch is not evidence that earlier pixels are disposable.
    if (!target || target.type !== 'stroke' || target.userId !== op.userId) return none
  }
  const clears = new Map<string, number>()
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'layer_clear') clears.set(op.layerId, i)
  }
  // A gesture's retained chunk must not inherit a partly omitted wash. Keep
  // every chunk when even one falls after that layer's final clear.
  const retainedGestures = new Set<string>()
  const retainedWashes = new Set<string>()
  const gesture = (op: Extract<Operation, { type: 'stroke' }>) => JSON.stringify([op.userId, op.strokeId])
  const wash = (op: Extract<Operation, { type: 'stroke' }>) => op.washId ? JSON.stringify([op.layerId, op.userId, op.washId]) : null
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'stroke' && i > (clears.get(op.layerId) ?? -1)) {
      retainedGestures.add(gesture(op))
      const key = wash(op)
      if (key) retainedWashes.add(key)
    }
  }
  const skipped = new Set<string>()
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'stroke' && i < (clears.get(op.layerId) ?? -1) && !retainedGestures.has(gesture(op))
      && !(wash(op) && retainedWashes.has(wash(op)!))) skipped.add(op.id)
  }
  return skipped
}
