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
  /** (#536, §17.56) The washes this checkpoint carries the open state of:
   *  it may stand inside them. What that state is, is the engine's business
   *  (`washes`); the store only needs to know which ones are covered. */
  washIds?: readonly string[]
  washes?: unknown
  /** Frees what the checkpoint holds outside the packed tiles (the washes'
   *  GPU textures) when it is evicted, replaced or cleared. */
  dispose?: () => void
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
    for (const cp of this.list) cp.dispose?.()
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
  /** (#536, §17.56) Drops one checkpoint (and whatever it holds). */
  remove(cp: Checkpoint): void {
    const i = this.list.indexOf(cp)
    if (i < 0) return
    this.list.splice(i, 1)
    this.bytes -= bytesOf(cp)
    cp.dispose?.()
  }

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

  /** The checkpoint to rebuild `layerId` from, and the index in `ops` its
   *  pixels reach to. A checkpoint is usable when its operations are exactly
   *  what the log holds up to some point (compared by id — undone/redone/
   *  revoked ops shift the prefix and silently disqualify stale ones)...
   *
   *  (#536, ADR 011 §17.49) ...not counting operations a restored SNAPSHOT of
   *  this layer already holds. A room opens by replaying its tail over the
   *  snapshot, and the history below the snapshot arrives afterwards (the
   *  backfill) and goes into the log IN FRONT of the tail. Every checkpoint
   *  taken before it - the one right after the tail, above all - then no
   *  longer matched the log's prefix, so an undo fell back to the snapshot
   *  and replayed the whole tail: 63 watercolour operations, each with its
   *  whole settle, 50 s frozen on the tablet ("после undo зависла комната").
   *  Those operations are in the checkpoint's pixels already (they are in
   *  the snapshot it was built on), so they are stepped over, not required. */
  best(layerId: string, ops: readonly WashOp[]): { cp: Checkpoint; start: number } | null {
    let inSnapshot: Set<string> | null = null
    for (const cp of this.list) {
      if (cp.layerId !== layerId || !cp.fromSnapshot || !cp.covered) continue
      inSnapshot ??= new Set()
      for (const id of cp.covered) inSnapshot.add(id)
    }
    let best: { cp: Checkpoint; start: number } | null = null
    let spans: WashSpans | null = null
    for (const cp of this.list) {
      if (cp.layerId !== layerId) continue
      if (best && cp.opIds.length <= best.cp.opIds.length) continue
      if (cp.opIds.length > ops.length) continue
      const start = checkpointPrefixEnd(cp.opIds, ops, inSnapshot)
      if (start < 0) continue
      if (!cp.fromSnapshot && crossesWash(spans ??= washSpans(ops), start, cp.washIds)) continue
      best = { cp, start }
    }
    return best
  }

  /** (#536, §17.53) Where `cp`'s pixels reach in `ops` today, by the same
   *  rule as best(), or -1 when the log has moved away from it (an undo, a
   *  revoke). A sliced rebuild re-checks its checkpoint with this every slice. */
  startOf(cp: Checkpoint, ops: readonly WashOp[]): number {
    let inSnapshot: Set<string> | null = null
    for (const c of this.list) {
      if (c.layerId !== cp.layerId || !c.fromSnapshot || !c.covered) continue
      inSnapshot ??= new Set()
      for (const id of c.covered) inSnapshot.add(id)
    }
    const start = checkpointPrefixEnd(cp.opIds, ops, inSnapshot)
    return start >= 0 && !cp.fromSnapshot && crossesWash(washSpans(ops), start, cp.washIds) ? -1 : start
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
      evicted.dispose?.()
      this.bytes -= bytesOf(evicted)
    }
  }
}

/** An operation as the wash rule sees it: stroke operations of a watercolour
 *  wash carry its id. */
export interface WashOp { id: string; washId?: string }

type WashSpans = Array<[number, number, string]>

/** (#536, §17.55) Each wash's first and last index in `ops`. */
export function washSpans(ops: readonly WashOp[]): WashSpans {
  const at = new Map<string, [number, number, string]>()
  for (let i = 0; i < ops.length; i++) {
    const w = ops[i].washId
    if (!w) continue
    const s = at.get(w)
    if (s) s[1] = i
    else at.set(w, [i, i, w])
  }
  return [...at.values()]
}

/** (#536, §17.55) Whether a wash has operations on both sides of `start`:
 *  a checkpoint there holds the wash half-dried in its pixels, and a replay
 *  from it would begin the rest of the wash afresh over its own beginning
 *  (#468) - unless the checkpoint carries that wash's open state (§17.56).
 *  Checked where a checkpoint is USED, from the log as it stands,
 *  so no rule about when one is taken can make it wrong - a pencil stroke
 *  checkpointing while someone else's wash was open used to. The snapshot
 *  floor is exempt: nothing earlier exists to replay from. */
export function crossesWash(spans: WashSpans, start: number, carried?: readonly string[]): boolean {
  for (const [first, last, id] of spans) {
    if (first < start && last >= start && !carried?.includes(id)) return true
  }
  return false
}

/** (#536, §17.49) Where a checkpoint's operations end in `ops`, or -1 when
 *  they are not the log up to some point. An operation in `inSnapshot` may
 *  stand between them (history backfilled in front of a checkpoint taken over
 *  the snapshot that holds it) - see PencilEngine._bestCheckpoint. */
export function checkpointPrefixEnd(
  opIds: readonly string[], ops: readonly { id: string }[], inSnapshot: ReadonlySet<string> | null,
): number {
  let j = 0, end = 0
  for (let i = 0; i < ops.length && j < opIds.length; i++) {
    if (ops[i].id === opIds[j]) { j++; end = i + 1; continue }
    if (inSnapshot?.has(ops[i].id)) continue
    return -1
  }
  return j === opIds.length ? end : -1
}
