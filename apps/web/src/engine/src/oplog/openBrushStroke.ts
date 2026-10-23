import type { Operation } from '@grafetto/shared'

/** A pixel snapshot cannot carry a brush's coverage scratch or smudge reservoir.
 * Inspect the ordered, done-operation prefix that the snapshot would cover.
 * Non-stroke operations do not imply pen-up. Each user's next gesture on this
 * layer supersedes an unfinished one; other users and layers remain independent.
 * Legacy strokes without strokeId replay as standalone, complete operations. */
export function hasOpenBrushStroke(ops: readonly Operation[], layerId: string): boolean {
  const openByUser = new Map<string, string>()
  for (const op of ops) {
    if (op.type !== 'stroke' || op.layerId !== layerId) continue
    if ((op.tool === 'digitalBrush' || op.tool === 'smudge') && op.strokeId && !op.strokeEnd) {
      openByUser.set(op.userId, op.strokeId)
    } else {
      openByUser.delete(op.userId)
    }
  }
  return openByUser.size > 0
}
