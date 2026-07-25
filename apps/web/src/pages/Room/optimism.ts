import type { Operation } from '@art-lessons/shared'

// (#297 epic, reliable history spec v0.2 §2/§4) Whether an operation is safe
// to apply optimistically right now, given which layer/folder ids this
// client itself created but the server hasn't confirmed yet (`pendingIds` —
// see Room/index.tsx's pendingIdsRef). Only layer_delete/layer_merge/
// layer_transform can invalidate a reference someone *else* already
// considers live, so they're the only types gated at all — and even then,
// only when at least one id they touch predates this client's own pending
// work (i.e. isn't in `pendingIds`), since nothing else could possibly know
// about (or conflict over) an id nobody's been told about yet. Every other
// operation type (stroke/layer_add/opacity/etc.) stays unconditionally safe:
// either it can't invalidate anything (new id, or a plain property change
// that's fine as last-write-wins) or it degrades gracefully client-side if
// its target turns out to be gone (see engine/index.ts's appendOperation,
// which revokes rather than corrupts).
export function isLocalIslandSafe(op: Operation, pendingIds: ReadonlySet<string>): boolean {
  switch (op.type) {
    case 'layer_delete': return op.layerIds.every(id => pendingIds.has(id))
    case 'layer_merge': return op.sources.every(s => pendingIds.has(s.id))
    case 'layer_transform': return op.transforms.every(t => pendingIds.has(t.layerId))
    default: return true
  }
}
