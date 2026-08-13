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
 *  server gates exactly this set on a destroyed target (see
 *  `hasMissingAliveTarget` in apps/server/src/rooms.ts) — property-only
 *  operations are deliberately not in it, since a rejected opacity change
 *  costs nothing to redo. */
const CONTENT_OP_TYPES = new Set(['stroke', 'image_import', 'layer_clear'])

/** An operation that both targets a single layer and carries content — what
 *  `isRecoverableContentOp` narrows to, and the only thing recovery ever
 *  re-emits. */
export type LostContentOp = Extract<Operation, { layerId: string }>

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
