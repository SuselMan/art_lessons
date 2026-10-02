import type { LayerState, Operation } from '@grafetto/shared'

// (#312) Recovering work the server refused as `target_gone` — in practice:
// strokes made while offline onto a layer another participant deleted in the
// meantime. The server now hands those operations back intact instead of
// swallowing them (#311), which is what makes recovery possible at all.
//
// The pure parts live here so they can be tested without an engine, a
// socket, or IndexedDB; Room/index.tsx owns the side-effecting half
// (minting ids, appending to the engine, the banner state).

/** Operation types that carry content a user would perceive as lost. The
 *  Shapes, fills and pastes carry their own pixels or geometry and can be
 *  replayed on a new layer. Transforms and filters depend on the deleted
 *  layer's existing pixels and cannot reconstruct them. */
const CONTENT_OP_TYPES: ReadonlySet<Operation['type']> = new Set([
  'stroke', 'image_import', 'layer_clear', 'shape', 'area_paste', 'area_fill',
])

/** An operation that both targets a single layer and carries content — what
 *  `isRecoverableContentOp` narrows to, and the only thing recovery ever
 *  re-emits. */
export type LostContentOp = Extract<Operation, {
  type: 'stroke' | 'image_import' | 'layer_clear' | 'shape' | 'area_paste' | 'area_fill'
}>

type ContentOp = LostContentOp

/** Whether a `target_gone` rejection of this operation means real lost work
 *  (and so is worth recovering) rather than a redo-in-one-click annoyance. */
export function isRecoverableContentOp(op: Operation): op is ContentOp {
  return CONTENT_OP_TYPES.has(op.type) && 'layerId' in op
}

/** Groups rejected operations by the dead layer they targeted, each group
 *  restored to the order they were originally made in.
 *
 *  Order matters and cannot be taken from arrival: the outbox drains up to
 *  MAX_CONCURRENT_SENDS at a time (#298), so `onSettled` fires in whatever
 *  order the acks come back. Replaying a stroke before the `layer_clear`
 *  that was meant to wipe it would restore something the user had already
 *  erased. `timestamp` is stamped once at dispatch and never changes across
 *  retries, so it's the authoritative original order. */
export function groupLostOpsByLayer(ops: readonly ContentOp[]): Map<string, ContentOp[]> {
  const byLayer = new Map<string, ContentOp[]>()
  for (const op of ops) {
    const group = byLayer.get(op.layerId)
    if (group) group.push(op)
    else byLayer.set(op.layerId, [op])
  }
  for (const group of byLayer.values()) group.sort((a, b) => a.timestamp - b.timestamp)
  return byLayer
}

/** Best-effort name of a layer that no longer exists, for the banner and the
 *  replacement layer's own name.
 *
 *  Three sources, most to least current. The live `LayerState` normally
 *  won't have it any more (applying the peer's delete is what removed it),
 *  but it's checked first because when it *does* still have it — a
 *  rejection that raced ahead of the delete's own arrival — it's the only
 *  one reflecting renames that happened after a snapshot. Then the local
 *  operation log, walked backwards so the newest `layer_rename` wins over
 *  the original `layer_add`. Then the snapshot's own layerState, for a
 *  layer created before the snapshot this client restored from (its
 *  `layer_add` predates the log entirely).
 *
 *  Null means all three came up empty — the caller falls back to a generic
 *  name rather than inventing one. */
export function resolveDeletedLayerName(
  layerId: string,
  live: LayerState,
  log: readonly Operation[],
  restored: LayerState | null,
): string | null {
  const liveItem = live.items[layerId]
  if (liveItem) return liveItem.name

  for (let i = log.length - 1; i >= 0; i--) {
    const op = log[i]
    if (op.type === 'layer_rename' && op.layerId === layerId) return op.name
    if (op.type === 'layer_add' && op.layerId === layerId) return op.name
    if (op.type === 'layer_merge' && op.layerId === layerId) return op.name
    if (op.type === 'layer_duplicate' && op.layerId === layerId) return op.name
  }

  const restoredItem = restored?.items[layerId]
  return restoredItem ? restoredItem.name : null
}

/** Re-points one rejected operation at a freshly created layer.
 *
 *  A new `id` is mandatory, not cosmetic: the server dedups by
 *  client-generated `Operation.id` (`findDuplicateOperation`), so reusing it
 *  would resolve to the original — the very record that was just rejected —
 *  instead of recording the retargeted copy. `timestamp` is restamped too,
 *  since this genuinely is a new operation in the room's timeline; the
 *  original ordering has already been baked into the sequence these are
 *  emitted in. */
export function retargetToLayer<T extends ContentOp>(op: T, newLayerId: string, newId: string, now: number): T {
  return { ...op, id: newId, layerId: newLayerId, timestamp: now }
}

/** (#312, #493) The operations that bring lost work back: per dead layer, one
 *  `layer_add` for a fresh layer named after the one that was deleted, and
 *  this client's rejected operations retargeted onto it. Pure — the caller
 *  appends them and shows the banner.
 *
 *  A *new* layer rather than resurrecting the deleted one: `aliveIds` on the
 *  server is a monotonic fold over the log, and un-deleting an id would break
 *  it. The content comes from this client's own rejected operations, never
 *  from a pixel bake of the dead layer. */
export function recoveryOperations(input: {
  lost: readonly ContentOp[]
  live: LayerState
  log: readonly Operation[]
  restored: LayerState | null
  userId: string
  /** The name when nothing anywhere remembers the deleted layer's. */
  unnamedLayer: string
  /** "Recovered: <name>" — the new layer's name. */
  restoredName: (originalName: string) => string
  newId: () => string
  now: () => number
}): { operations: Operation[]; layerNames: string[]; restoredLayerIds: string[] } {
  const operations: Operation[] = []
  const layerNames: string[] = []
  const restoredLayerIds: string[] = []
  for (const [deadLayerId, ops] of groupLostOpsByLayer(input.lost)) {
    const originalName = resolveDeletedLayerName(deadLayerId, input.live, input.log, input.restored)
      ?? input.unnamedLayer
    const newLayerId = input.newId()
    operations.push({
      id: input.newId(), type: 'layer_add', userId: input.userId, timestamp: input.now(),
      layerId: newLayerId, name: input.restoredName(originalName),
    })
    for (const op of ops) operations.push(retargetToLayer(op, newLayerId, input.newId(), input.now()))
    layerNames.push(originalName)
    restoredLayerIds.push(newLayerId)
  }
  return { operations, layerNames, restoredLayerIds }
}

export interface Timers {
  set: (fn: () => void, ms: number) => number
  clear: (id: number) => void
}

/** (#312, #493) Collects rejected content operations and hands them over as
 *  one batch.
 *
 *  Debounced because they arrive one ack at a time as the outbox drains:
 *  reacting per operation would mint one replacement layer per lost stroke.
 *  Debounce alone would never fire on a long enough backlog, so it is capped
 *  — `maxWaitMs` after the first rejection the batch goes through regardless,
 *  and anything still arriving forms the next one. */
export function createLostWorkBatcher({ onFlush, quietMs, maxWaitMs, timers, now }: {
  onFlush: (ops: ContentOp[]) => void
  quietMs: number
  maxWaitMs: number
  timers: Timers
  now: () => number
}) {
  let queued: ContentOp[] = []
  let timer: number | null = null
  let firstAt: number | null = null
  const stopTimer = () => { if (timer !== null) { timers.clear(timer); timer = null } }
  const flush = () => {
    timer = null
    firstAt = null
    const batch = queued
    queued = []
    onFlush(batch)
  }
  return {
    add(op: ContentOp) {
      queued.push(op)
      const t = now()
      firstAt ??= t
      stopTimer()
      if (t - firstAt >= maxWaitMs) { flush(); return }
      timer = timers.set(flush, quietMs)
    },
    /** Drops whatever is waiting — a page turn, a room left. */
    reset() {
      stopTimer()
      firstAt = null
      queued = []
    },
  }
}
