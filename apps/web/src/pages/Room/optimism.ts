import type { Operation } from '@grafetto/shared'

// (#289 epic, reliable history spec v0.2 §2/§4) Whether an operation is safe
// to apply optimistically right now, given which layer/folder ids this
// client itself created but the server hasn't confirmed yet (`pendingIds` —
// see Room/index.tsx's pendingIdsRef). Only layer_delete/layer_merge/
// layer_duplicate/layer_transform can invalidate a reference someone *else*
// already considers live, so they're the only types gated at all — and even then,
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
    // (#449) Gated on `sourceId` alone: the server refuses a duplicate whose
    // source is gone (rooms.ts's hasMissingAliveTarget), so applying one
    // optimistically against a layer this client did not itself just create is
    // exactly the bet that can come back rejected. `layerId` is brand new and
    // can conflict with nothing.
    case 'layer_duplicate': return pendingIds.has(op.sourceId)
    case 'layer_transform': return op.transforms.every(t => pendingIds.has(t.layerId))
    default: return true
  }
}
