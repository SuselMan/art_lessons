// (#494) The engine's checkpoints, out of PencilEngine: the list, its byte
// budget, eviction, the pinned checkpoint a snapshot restore seeds, and the
// lookup a replay starts from. The first seam of the engine's decomposition —
// state that was already a subsystem of its own, spread over eleven places in
// the class. What goes *into* a checkpoint (reading tiles off a buffer,
// packing them) and what a replay does with one stay in the engine.

// Valid only while those exact operations are still the layer's done prefix —
// checked at lookup time, so undo/redo never has to invalidate anything.
// One entry per buffer the layer held at snapshot time (#137: bounded layers
// always have exactly one, at origin (0,0); tiled layers have one per tile
// resident then — a tile not yet resident at snapshot time simply has no
// entry, same as it has no content, and restore leaves it absent rather than
// materializing an empty tile).
export interface CheckpointTile {
  originX: number
  originY: number
  width: number
  height: number
  /** (#467) Run-length packed, not raw RGBA — see pinnedTiles.ts for the
   *  format and for the 235 MB of production room this saves. Unpacked in
   *  `_replayInto`, one tile at a time, and dropped again with the iteration
   *  that read it. `width * height * 4` is the size to unpack back to. */
  packed: Uint8Array
}

export interface Checkpoint {
  layerId: string
  opIds: string[]
  tiles: CheckpointTile[]
  // (#287) Set only for the synthetic checkpoint restoreLayerFromSnapshot
  // seeds — the pixels a network snapshot brought in, for which this
  // checkpoint is the only local record: the operations that painted them are
  // below the log window and will never arrive.
  //
  // (#522) Split from `pinned`, which used to mean both "came from a snapshot"
  // and "exempt from eviction". Those two stop coinciding the moment the
  // layer's buffer is destroyed — see _destroyBuffer.
  fromSnapshot?: boolean
  // Exempt from the byte-budget eviction an ordinary checkpoint is subject to,
  // because losing this one loses content rather than just speed. Held only
  // while the layer is alive; a destroyed layer's checkpoint stays but becomes
  // evictable (#522).
  pinned?: boolean
  // (#479) Pinned checkpoints only. The room seq the restored pixels were
  // baked at, and the ids of log operations those pixels already contain.
  //
  // A pinned checkpoint carries `opIds: []` because at restore time the log
  // holds nothing for this layer — which is true then and stops being true
  // the moment background backfill *prepends* the pre-snapshot history
  // (`absorbHistoricalOperations`). From then on the checkpoint's pixels are
  // a superset of what its opIds claim, and a rebuild replays operations the
  // snapshot already contains on top of it. `opIds` cannot simply absorb
  // them: a prefix mismatch (one of those operations later undone) would
  // disqualify the checkpoint entirely and fall back to a replay from empty,
  // which for a restored layer means losing everything below the backfill
  // window. So the covered set is consulted as a filter instead — the
  // checkpoint always applies, and the operations it already holds are
  // skipped rather than repainted.
  coveredSeq?: number
  covered?: Set<string>
}

const bytesOf = (cp: Checkpoint): number => cp.tiles.reduce((sum, t) => sum + t.packed.byteLength, 0)

export class CheckpointStore {
  private list: Checkpoint[] = []
  private bytes = 0
  private budget: number

  /** @param budget How many packed bytes ordinary checkpoints may hold before
   *  the oldest are evicted. Pinned ones are never evicted, whatever it says. */
  constructor(budget: number) {
    this.budget = budget
  }

  /** Every checkpoint, oldest first — for inspection, not for editing. */
  all(): readonly Checkpoint[] { return this.list }

  /** Packed bytes currently held. */
  totalBytes(): number { return this.bytes }

  clear(): void {
    this.list = []
    this.bytes = 0
  }

  /** Changes the budget and evicts down to it at once. Undo depth is bounded
   *  by the log, not by memory — checkpoints only shorten the replay tail — so
   *  the number is a starting point to be tuned by measurement (#76). */
  setBudget(bytes: number): void {
    this.budget = bytes
    this.evictOverBudget()
  }

  /** An ordinary checkpoint, taken at a CHECKPOINT_INTERVAL boundary. */
  add(cp: Checkpoint): void {
    this.list.push(cp)
    this.bytes += bytesOf(cp)
    this.evictOverBudget()
  }

  /** The pinned checkpoint a snapshot restore seeds — see
   *  restoreLayerFromSnapshot's own doc comment for why it exists.
   *
   *  Replaces (rather than adds to) any snapshot checkpoint this layer already
   *  had — a reconnect re-restoring a still-mounted engine, or a layer
   *  destroyed and restored again. Matched on `fromSnapshot`, not on `pinned`
   *  (#522): a destroyed-then-restored layer has an unpinned snapshot
   *  checkpoint of its own, and leaving it behind would put two in the list —
   *  `best` prefers neither (both claim `opIds: []`), so the stale one could
   *  win and repaint the layer as it was two restores ago. */
  pinSnapshot(layerId: string, tiles: CheckpointTile[], coveredSeq?: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const cp = this.list[i]
      if (cp.fromSnapshot && cp.layerId === layerId) {
        this.bytes -= bytesOf(cp)
        this.list.splice(i, 1)
      }
    }
    this.add({ layerId, opIds: [], tiles, fromSnapshot: true, pinned: true, coveredSeq, covered: new Set() })
  }

  /** (#522) The layer's buffer is gone: its snapshot checkpoint stays findable
   *  if the layer is revived, but becomes an ordinary eviction candidate, so a
   *  genuinely dead layer's bytes come back under memory pressure. The sweep
   *  is immediate, so a room that deletes many restored layers does not sit
   *  above budget until the next checkpoint is taken. */
  unpinSnapshot(layerId: string): void {
    for (const cp of this.list) {
      if (cp.fromSnapshot && cp.layerId === layerId) cp.pinned = false
    }
    this.evictOverBudget()
  }

  hasSnapshotFor(layerId: string): boolean {
    return this.list.some(cp => cp.fromSnapshot && cp.layerId === layerId)
  }

  /** Deepest checkpoint whose baked operations are exactly the current done
   *  prefix of `ops` (compared by id — undone/redone/revoked ops shift the
   *  prefix and silently disqualify stale snapshots). */
  best(layerId: string, ops: readonly { id: string }[]): Checkpoint | null {
    let best: Checkpoint | null = null
    for (const cp of this.list) {
      if (cp.layerId !== layerId) continue
      if (best && cp.opIds.length <= best.opIds.length) continue
      if (cp.opIds.length > ops.length) continue
      if (cp.opIds.every((id, i) => ops[i].id === id)) best = cp
    }
    return best
  }

  /** (#479) Backfill has put these operations in the log: record, on every
   *  pinned checkpoint, those its pixels already contain — so a rebuild skips
   *  rather than repaints them. Takes the server's seq off the copies the
   *  caller still holds; the log renumbers its own. */
  markCovered(ops: readonly { id: string; seq?: number }[]): void {
    for (const { coveredSeq, covered } of this.list) {
      if (coveredSeq === undefined || !covered) continue
      for (const op of ops) if ((op.seq ?? 0) <= coveredSeq) covered.add(op.id)
    }
  }

  /** Evicts the oldest *unpinned* checkpoints (in insertion order) until
   *  either the byte budget is satisfied or nothing evictable is left.
   *  Pinned checkpoints (#287) are never touched: unlike an ordinary
   *  checkpoint, whose eviction only makes the next undo/redo/revoke replay
   *  fall back to a slower-but-still-correct full from-log replay, a pinned
   *  one is the *only* record of a layer's pre-snapshot content — evicting it
   *  would silently wipe real content on the next replay instead. If every
   *  remaining checkpoint is pinned, this simply stops rather than exceeding
   *  the budget — never impossible, just slower/bigger. */
  private evictOverBudget(): void {
    while (this.bytes > this.budget) {
      const index = this.list.findIndex(cp => !cp.pinned)
      if (index === -1) break
      const [evicted] = this.list.splice(index, 1)
      this.bytes -= bytesOf(evicted)
    }
  }
}
