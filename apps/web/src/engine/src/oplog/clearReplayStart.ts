import type { LogEntry, PixelOperation } from './OperationLog'

/** A clear is a raster replay boundary, never a journal/history boundary.
 * Only use it after the entire confirmed prefix is present. A retained tail
 * alone cannot prove that a gesture or a watercolour wash ended before it.
 * Historical source reconstruction and synchronous replay keep their existing
 * path; this conservative plan only shortens a fresh sliced layer rebuild. */
export function clearReplayStart(entries: readonly LogEntry[], ops: readonly PixelOperation[]): number {
  let cut = -1
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'layer_clear') { cut = i; break }
  }
  if (cut <= 0) return 0
  // Structural operations can carry other layer/material state. Watercolour
  // also publishes wetness outside this layer's pixel buffer. Leave both alone.
  if (ops.some(op => op.type !== 'stroke' && op.type !== 'layer_clear'
    || op.type === 'stroke' && op.tool === 'watercolor')) return 0
  const clear = ops[cut]
  if (clear.type !== 'layer_clear') return 0
  const boundary = entries.findIndex(entry => entry.op.id === clear.id)
  if (boundary < 0) return 0
  const layerId = clear.layerId
  const open = new Map<string, { id: string; layers: Set<string> }>()
  const discardedGestures = new Map<string, Set<string>>()
  for (let i = 0; i <= boundary; i++) {
    const entry = entries[i]
    if (entry.pending || entry.serverSeq !== i + 1) return 0
    if (entry.state !== 'done' || entry.op.type !== 'stroke') continue
    const op = entry.op
    if (op.layerId === layerId && op.strokeId) {
      let ids = discardedGestures.get(op.userId)
      if (!ids) discardedGestures.set(op.userId, ids = new Set())
      ids.add(op.strokeId)
    }
    if (!op.strokeId || op.strokeEnd) open.delete(op.userId)
    else {
      const previous = open.get(op.userId)
      if (previous?.id === op.strokeId) previous.layers.add(op.layerId)
      else open.set(op.userId, { id: op.strokeId, layers: new Set([op.layerId]) })
    }
  }
  if ([...open.values()].some(gesture => gesture.layers.has(layerId))) return 0
  // Even a malformed/legacy gesture that resumes after an explicit END must
  // not accidentally resume from an empty reservoir rather than its old one.
  for (let i = cut + 1; i < ops.length; i++) {
    const op = ops[i]
    if (op.type === 'stroke' && op.strokeId && discardedGestures.get(op.userId)?.has(op.strokeId)) return 0
  }
  return cut // Include the clear itself; retain every original operation.
}
