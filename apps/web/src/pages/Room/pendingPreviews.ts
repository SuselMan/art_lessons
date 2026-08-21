/** (#477) The peer strokes this client has received but has not finished
 *  revealing yet — a single set, because there is exactly one fact here.
 *
 *  A peer stroke does not commit on arrival: it plays back progressively
 *  (`previewOperation`/`onPreviewApplied`, paced by the stroke's own recorded
 *  dab timing). Two things need to know about that in-flight state, and they
 *  need it keyed differently:
 *
 *  - the reveal machinery, by operation id — "is this op still animating?"
 *  - `snapshotGate`, by seq — the snapshot watermark may never pass the
 *    smallest still-unpainted seq, or a bake would claim to cover an
 *    operation whose pixels are not on the layer yet.
 *
 *  Those used to be two refs in Room, a `Set<string>` and a `Set<number>`,
 *  added together at one site and removed at four. One of the four — the
 *  reconnect catch-up loop — removed the id and forgot the seq, so any peer
 *  stroke that happened to be mid-reveal when the connection dropped left its
 *  seq behind forever. `observe` takes the watermark from the smallest
 *  pending seq, so a single stranded entry pinned it below the committed
 *  watermark and this client never baked another snapshot for the rest of the
 *  mount. That is not a bug a fifth call site can be trusted not to repeat:
 *  it is what having two structures for one fact costs. Hence one map, and a
 *  `remove` that cannot take half the entry away.
 *
 *  Found on the 2026-08-21 lesson (room `Igy2jy_i`): baking stopped at seq
 *  1500 with 1428 operations still to come, so every rejoin for the last half
 *  hour had to replay all of them on top of a 5.8 MB snapshot download, and
 *  by the end stopped completing at all.
 *
 *  Two things follow from *how* an entry gets stranded, and both are handled
 *  where the catch-up runs rather than here:
 *
 *  - The reconnect tail cannot be trusted to name them. A stroke's seq is
 *    folded into `latestKnownSeqRef` the moment it *arrives*, before the
 *    reveal starts, and that is what `join_room` sends as `lastKnownSeq` — so
 *    the server considers a still-revealing stroke already delivered and
 *    leaves it out of `tailOperations` entirely. Retiring previews by walking
 *    the tail therefore misses precisely the ones that leak.
 *  - The engine can lose them without saying so. `_peerPreviews` is cleared
 *    wholesale on WebGL context loss (#385) — realistic on a tablet under
 *    memory pressure — and `onPreviewApplied` never fires for what was in it.
 *
 *  So the catch-up retires every entry itself, and `snapshotGate` ignores any
 *  that still somehow sits below the baked watermark. Between them, no single
 *  lost reveal can silence this client's snapshots again.
 */
export interface PendingPreviews {
  /** How many reveals are queued — the backlog `shouldEnterCatchUp` watches. */
  readonly size: number
  /** A peer stroke has arrived and been handed to the engine to reveal. */
  add(opId: string, seq: number): void
  has(opId: string): boolean
  /** Every still-revealing op id, materialised — callers retire entries while
   *  walking it. */
  ids(): string[]
  /** Drops the op from both views at once. Returns the seq it was holding, or
   *  `undefined` if it wasn't pending, for callers that only act when they
   *  actually took something off. */
  remove(opId: string): number | undefined
  /** Every arrived-but-unpainted seq, for `snapshotGate.observe`. An iterable
   *  rather than a set: the gate only ever scans it, and this is called on
   *  every confirmed operation. */
  commitSeqs(): Iterable<number>
}

export function createPendingPreviews(): PendingPreviews {
  const bySeq = new Map<string, number>()
  return {
    get size() {
      return bySeq.size
    },
    add(opId, seq) {
      bySeq.set(opId, seq)
    },
    has(opId) {
      return bySeq.has(opId)
    },
    ids() {
      return [...bySeq.keys()]
    },
    remove(opId) {
      const seq = bySeq.get(opId)
      bySeq.delete(opId)
      return seq
    },
    commitSeqs() {
      return bySeq.values()
    },
  }
}
