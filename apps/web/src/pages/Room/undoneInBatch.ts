import type { Operation } from '@grafetto/shared'

/** (#536, ADR 011 §17.49) The strokes of a history batch (a room's tail) that
 *  the same batch leaves undone - every chunk of the gesture, as the log's own
 *  undo flips it (OperationLog: same author, same strokeId).
 *
 *  A restore used to paint them as they arrived and then, at the batch's
 *  `operation_undo`, rebuild the whole layer to take them out again: in a
 *  watercolour room that rebuild replays every settle since the snapshot, and
 *  one undo in the tail doubled a 45 s tablet load. The engine logs these
 *  without painting them (setUnpaintedInBatch), which is exactly the picture
 *  the rebuild would have produced - a rebuild is the same sequence replayed
 *  without them. Folded in order, so an undo the batch later redoes is not
 *  in the set. */
export function undoneInBatch(ops: readonly Operation[]): Set<string> {
  const byId = new Map<string, Operation>()
  for (const op of ops) byId.set(op.id, op)
  const gesture = (target: Operation): string[] => {
    if (target.type !== 'stroke') return []
    return ops
      .filter(o => o.type === 'stroke' && o.userId === target.userId && o.strokeId === target.strokeId)
      .map(o => o.id)
  }
  const undone = new Set<string>()
  for (const op of ops) {
    if (op.type !== 'operation_undo' && op.type !== 'operation_redo') continue
    const target = byId.get(op.targetOpId)
    if (!target) continue
    for (const id of gesture(target)) {
      if (op.type === 'operation_undo') undone.add(id)
      else undone.delete(id)
    }
  }
  return undone
}

/** (#536, ADR 011 §17.50) The strokes of a history batch after which their
 *  wash (or, without one, their gesture) has no more operations in the batch,
 *  skipping the ones the batch leaves undone - see
 *  PencilEngineAPI.setBatchGroupEnds. Keyed as the engine keys its replay
 *  cache: the wash id, else the stroke id. */
export function groupEndsInBatch(ops: readonly Operation[], unpainted: ReadonlySet<string>): Set<string> {
  const last = new Map<string, string>()
  for (const op of ops) {
    if (op.type !== 'stroke' || unpainted.has(op.id)) continue
    const key = op.washId ?? op.strokeId
    if (key) last.set(key, op.id)
  }
  return new Set(last.values())
}
