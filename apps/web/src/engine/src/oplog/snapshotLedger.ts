// (#494) What the engine knows about each layer's standing with the room's
// stored snapshot, out of PencilEngine — part of the snapshot seam of its
// decomposition, beside CheckpointStore. Three questions, each of which used
// to be a bare Map or Set on the engine with its rules spread over the class:
//
//  - is there anything new to publish? (#373)
//  - do this layer's restored pixels already contain an operation? (#374)
//  - may this layer be published at all? (#522)
//
// No GL, no buffers: the engine asks, and tells it what happened.

export class SnapshotLedger {
  // (#373) Monotonic per-layer "the pixels changed" counter, and the value it
  // held when this layer's current pixels last became known to the server.
  // Equal means there is nothing new to send.
  //
  // A counter rather than a comparison of the log: undo changes pixels without
  // adding an operation, and "undid one, drew one" leaves every count in the
  // log exactly where it was. Bumped by `markDirty` from every path that can
  // change a layer's pixels — `index.snapshotDirty.test.ts` exists to hold
  // that list complete, since a path that forgets to bump produces a snapshot
  // that is silently stale rather than one that is obviously missing.
  private readonly revision = new Map<string, number>()
  private readonly published = new Map<string, number>()
  // (#374) layerId -> the room seq this layer's restored pixels reach.
  private readonly coverage = new Map<string, number>()
  // (#522) Layers this engine knows it cannot describe truthfully any more: a
  // rebuild replayed one whose pixels reach below the log window, without the
  // snapshot checkpoint that held them. The canvas is already wrong here and
  // only a reload fixes that — but a *stored* snapshot of it is worse than
  // none, because the server then withholds the operations it claims to cover
  // (rooms.ts's isCoveredBySnapshot) and the loss becomes everyone's, forever.
  // So the bake refuses instead. Cleared by a restore, which makes the layer
  // authoritative again.
  private readonly refused = new Set<string>()

  /** (#373) Records that this layer's pixels changed. Cheap enough to call
   *  from anywhere that might have changed them, and that is how it should be
   *  called — the cost of an unnecessary bump is one redundant bake, the cost
   *  of a missing one is a stored snapshot that quietly no longer matches the
   *  layer it claims to be. */
  markDirty(layerId: string): void {
    this.revision.set(layerId, (this.revision.get(layerId) ?? 0) + 1)
  }

  /** This layer's current pixels are now what the server holds — just baked
   *  and handed over, or just restored from what the server sent. */
  markPublished(layerId: string): void {
    this.published.set(layerId, this.revision.get(layerId) ?? 0)
  }

  /** (#373) Whether this layer holds pixels the server does not have. A layer
   *  nobody has ever painted is not dirty, which is why a room's untouched
   *  `background` never costs a bake. */
  isDirty(layerId: string): boolean {
    const revision = this.revision.get(layerId) ?? 0
    return revision !== 0 && revision !== this.published.get(layerId)
  }

  /** (#374) This layer's restored pixels reach room seq `seq`. */
  setCoverage(layerId: string, seq: number): void {
    this.coverage.set(layerId, seq)
  }

  hasCoverage(layerId: string): boolean {
    return this.coverage.has(layerId)
  }

  /** (#374) Whether this layer's restored pixels already account for an
   *  operation at `seq`. Compared against the *room* seq the operation arrived
   *  with, not the log's own numbering — `OperationLog.append` renumbers
   *  entries to their array index, so only the copy the caller still holds
   *  carries the server's. */
  isCovered(layerId: string, seq: number | undefined): boolean {
    const covered = this.coverage.get(layerId)
    return covered !== undefined && seq !== undefined && seq <= covered
  }

  /** Full authoritative history replaces a stale baked base. */
  forgetCoverage(layerId: string): void {
    this.coverage.delete(layerId)
  }

  /** (#522) Publishing this layer would overwrite the room's record of it
   *  with less than it has. */
  refusePublishing(layerId: string): void {
    this.refused.add(layerId)
  }

  /** A restore made the layer's pixels authoritative again. */
  allowPublishing(layerId: string): void {
    this.refused.delete(layerId)
  }

  mayPublish(layerId: string): boolean {
    return !this.refused.has(layerId)
  }

  /** The buffers are gone (context loss): there is no layer left to refuse to
   *  publish; whatever restores next is what the engine will answer for. */
  clearRefusals(): void {
    this.refused.clear()
  }
}
