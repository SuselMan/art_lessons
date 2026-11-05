import type { Operation } from '@grafetto/shared'

/** A pixel snapshot cannot carry a brush's coverage scratch or smudge reservoir.
 * Inspect the ordered, done-operation prefix that the snapshot would cover.
 * Gesture identity is (userId, strokeId), shared across touched layers, exactly
 * as in OperationLog. Pen-up anywhere closes the group; a new gesture from the
 * same user supersedes an unfinished one. Metadata does not imply pen-up.
 * Legacy strokes without strokeId replay as standalone, complete operations. */
export function hasOpenBrushStroke(ops: readonly Operation[], layerId: string): boolean {
  const openByUser = new Map<string, { strokeId: string; layers: Set<string> }>()
  for (const op of ops) {
    if (op.type !== 'stroke') continue
    if ((op.tool !== 'digitalBrush' && op.tool !== 'smudge') || !op.strokeId || op.strokeEnd) {
      openByUser.delete(op.userId)
      continue
    }
    const previous = openByUser.get(op.userId)
    if (previous?.strokeId === op.strokeId) previous.layers.add(op.layerId)
    else openByUser.set(op.userId, { strokeId: op.strokeId, layers: new Set([op.layerId]) })
  }
  return [...openByUser.values()].some(gesture => gesture.layers.has(layerId))
}
