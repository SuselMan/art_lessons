// (#494) The room snapshot's way in and out of the engine, out of PencilEngine
// (seam С7 of the survey): baking a layer for upload, the independent
// full-replay bake it is verified against, restoring a downloaded one into a
// layer, the restore audit, and merging a backfill page of historical
// operations into the log without painting it.
//
// Built on top of SnapshotLedger (what is new to publish, what a restore
// covers, what may not be published) and CheckpointStore (the pinned snapshot
// checkpoint a restore leaves behind). It never sees the engine, only
// SnapshotIOContext below.
//
// What stays with the engine, on purpose: *whether a layer may be baked right
// now*. That is a question about queued peer operations, open watercolor
// washes, rebuild jobs and out-of-order settling — the engine's replay and
// wash machinery — so it arrives as two context functions, in the order the
// checks always ran (see `bake`).
//
// No GL names are owned here: every buffer this touches is a layer's or a
// throwaway scratch destroyed in the same call, so there is no forget().

import type { Operation } from '@grafetto/shared'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import { packTilePixels } from '../buffers/pinnedTiles'
import { isFullyTransparent, retileSnapshotTiles } from '../buffers/retileSnapshot'
import type { CheckpointStore } from './checkpointStore'
import { OperationLog, type PixelOperation } from './OperationLog'
import type { SnapshotRestoreAudit } from './snapshotAudit'
import { encodeLayerTiles, type SnapshotTile } from './snapshotCodec'
import type { SnapshotLedger } from './snapshotLedger'

/** What SnapshotIO may ask of the engine. */
export interface SnapshotIOContext {
  readonly gl: WebGLRenderingContext
  /** Whether the room has no sheet. Fixed at construction. */
  readonly infinite: boolean
  /** The engine's own ledger — the engine marks layers dirty from every path
   *  that paints; this reads and settles it around bakes and restores. */
  readonly ledger: SnapshotLedger
  /** The sheet's size — see the engine's _pageSize. */
  pageSize(): { w: number; h: number }
  /** The layer tile size — see the engine's _tileSize. */
  tileSize(): { w: number; h: number }
  /** A layer's live buffer. */
  layer(id: string): ILayerBuffer | undefined
  /** The engine's operation log. */
  log(): OperationLog
  /** The engine's checkpoint store. */
  checkpoints(): CheckpointStore
  /** The first half of the engine's "may this layer be baked now" — no peer
   *  operations queued, no wash on it that may still be continued, no
   *  incremental rebuild under way. Pure: asked before the layer is even
   *  looked up. */
  quiet(layerId: string): boolean
  /** The second half, asked after the ledger's own `mayPublish`: settles the
   *  layer if it was painted out of order (a side effect — which is why this
   *  is its own call, reached only once everything before it has passed),
   *  then whether it is settled, has no rebuild pending and holds none of this
   *  client's unconfirmed operations. */
  settled(layerId: string): boolean
  /** A fresh, empty layer buffer for a scratch replay — see _makeLayerBuffer.
   *  The caller destroys it. */
  scratchLayer(layerId: string): ILayerBuffer
  /** The engine's _applyPixelOp: what a first-ever paint of `op` does. */
  applyPixelOp(buf: ILayerBuffer, layerId: string, op: PixelOperation): void
  /** Starts decoding the images `ops` import; never awaited. */
  preloadImages(ops: Operation[]): void
}

export class SnapshotIO {
  private readonly _emptyRevision = new WeakMap<ILayerBuffer, number>()

  // (#474) One record per restore call since the last drain — see
  // takeRestoreAudit. Bounded by the number of layers in a room's snapshot
  // index and emptied by every read, so it cannot grow with session length the
  // way an event log would.
  private _restoreAudit: SnapshotRestoreAudit[] = []
  // (#169) Running total of entries absorbHistorical has ever prepended — see
  // operationsSinceRestore. Entries at local seq < this value are the
  // historical prefix; renumbering on every OperationLog.prependHistorical call
  // keeps that boundary meaningful even across several backfill pages.
  private _historicalEntryCount = 0
  private _historicalGestureUnresolved: string[] = []

  /** Bounded history lacked a known control witness; affected state was left unchanged. */
  historicalGestureUnresolved(): readonly string[] { return [...this._historicalGestureUnresolved] }

  private readonly ctx: SnapshotIOContext

  constructor(ctx: SnapshotIOContext) {
    this.ctx = ctx
  }

  /** (#425) This layer's resident tiles as a snapshot payload, with the part of
   *  each tile that hangs off the sheet left out — see clipTileToPage for the
   *  measurement and for the row arithmetic, which is the part that bites.
   *
   *  Infinite rooms are excluded on purpose: they have no sheet to clip to, and
   *  their tile grid is the coordinate system rather than an overhang.
   *
   *  Shared with bakeByFullReplay deliberately. That one is the oracle these
   *  bytes are compared against (#168, #289), so any difference in geometry
   *  between the two would read as a determinism violation on every bounded
   *  room in existence.
   *
   *  (#467) Fully transparent tiles are left out. Residency is not evidence of
   *  content: `resolveForPaint` makes every tile a stroke's bounding rect
   *  touches resident whether or not a dab darkens it, and an erase empties a
   *  tile without releasing it. Storing those costs 4 MiB of somebody else's
   *  memory each to say what their absence already says — a third of what
   *  production room cdf314dd-153 makes a joiner materialise.
   *
   *  Note this changes what "no tiles" means coming out of here, which `bake`
   *  is careful about — see its own comment. */
  private _bakeTiles(buf: ILayerBuffer): SnapshotTile[] {
    const page = this.ctx.infinite ? null : this.ctx.pageSize()
    return buf.allResident().flatMap(({ buffer, originX, originY }) => {
      // Exactly clipTileToPage's right/bottom geometry; read only its kept
      // top-world rows directly, which are the final rows of the GL texture.
      const width = page ? Math.max(0, Math.min(buffer.width, page.w - originX)) : buffer.width
      const height = page ? Math.max(0, Math.min(buffer.height, page.h - originY)) : buffer.height
      const pixels = width === buffer.width && height === buffer.height
        ? buffer.readPixels()
        : buffer.readPixelsRegion(0, buffer.height - height, width, height)
      const tile = { originX, originY, width, height, pixels }
      return isFullyTransparent(tile.pixels) ? [] : [tile]
    })
  }

  /** PencilEngineAPI.bakeNetworkSnapshot. Same allResident() gather as the
   *  engine's _takeCheckpoint, just serialized (encodeLayerTiles) instead of
   *  kept as an in-memory Checkpoint — this is for network upload (#149 epic),
   *  a parallel, independent mechanism from the local checkpoint list, not a
   *  replacement for it. No context-loss guard needed here the way
   *  _takeCheckpoint has one: a caller only reaches this from Room's own
   *  orchestration on a live seq boundary, never from a code path that could
   *  race a context loss the way idle-scheduled local checkpointing can.
   *
   *  The refusals, in the order they have always been checked (only `settled`
   *  has a side effect, so only its place is load-bearing):
   *   - (§17.58) peers' operations still queued; (#536, §17.59) a wash on the
   *     layer that may still be continued; (§17.53) mid-rebuild — `quiet`;
   *   - unknown layer;
   *   - (#522) the ledger refuses: publishing what this client holds would
   *     overwrite the room's own record of the layer with less than it has;
   *   - (#537) painted out of order and not re-settled yet, or holding this
   *     client's own unconfirmed operations — `settled`. A snapshot claims
   *     "these pixels are the room's history up to the watermark"; either way
   *     the layer is left out, keeps whatever coverage it had, and a joiner
   *     replays its operations instead. */
  bake(layerId: string): Uint8Array | null {
    if (!this.ctx.quiet(layerId)) return null
    const buf = this.ctx.layer(layerId)
    if (!buf) return null
    if (!this.ctx.ledger.mayPublish(layerId)) return null
    if (!this.ctx.settled(layerId)) return null
    // (#373) Content is judged from the buffer, never from the log. It used to
    // bail on `layerPixelOps(layerId).length === 0`, reading "no operations of
    // mine mention this layer" as "this layer is empty" — but the log is a
    // bounded window (HISTORY_BACKFILL_DEPTH), so a layer whose strokes had
    // scrolled out of it, or that was restored from a snapshot rather than
    // painted, looked empty while holding a full drawing. It was then left out
    // of the snapshot entirely, and the next client to restore that snapshot
    // saw a blank layer. That is #369, and this line is where it started.
    // Only confirmed empty pixels are memoized. Guards (including settled's
    // repair side effects) still run first on every attempt. A new write's
    // ledger revision or replacement buffer makes the observation obsolete.
    const revision = this.ctx.ledger.pixelRevision(layerId)
    if (this._emptyRevision.get(buf) === revision) return null
    const tiles = this._bakeTiles(buf)
    // (#467) Since _bakeTiles drops fully transparent tiles, this now also
    // catches a layer that is resident but holds nothing — painted and then
    // erased away. Omitting it leaves it uncovered, so the server sends its
    // operations and the next joiner replays them to the same empty result:
    // more work than storing "it is empty", and never less content. Not
    // storing an explicit empty snapshot instead is a deliberate limit on this
    // change — "no tiles" has meant "nothing to publish" since #373, and
    // giving it a second meaning is its own decision with its own blast
    // radius. The layer keeps whatever older snapshot it already had.
    if (!tiles.length) {
      this._emptyRevision.set(buf, revision)
      return null
    }
    this._emptyRevision.delete(buf)
    // (#373) Whatever the caller does with these bytes, this layer's current
    // pixels have now left the engine — anything that changes them after this
    // point is what makes it dirty again.
    this.ctx.ledger.markPublished(layerId)
    return encodeLayerTiles(tiles)
  }

  /** PencilEngineAPI.bakeLayerByFullReplay — see its doc comment for why this
   *  exists alongside `bake` rather than sharing its code.
   *
   *  The independence is the entire point, so this deliberately does NOT
   *  route through the engine's `_replayInto` (which consults
   *  `CheckpointStore.best` and would reintroduce exactly the shared machinery
   *  being checked) — it walks the done pixel ops itself, from an empty
   *  scratch buffer, applying each via the same `applyPixelOp` primitive a
   *  first-ever paint would. Any future optimization added here would
   *  silently destroy its value as an oracle; keep it dumb. */
  bakeByFullReplay(layerId: string): Uint8Array | null {
    if (!this.ctx.layer(layerId)) return null
    const ops = this.ctx.log().layerPixelOps(layerId)
    if (!ops.length) return null

    const scratch = this.ctx.scratchLayer(layerId)
    try {
      scratch.clear()
      for (const op of ops) this.ctx.applyPixelOp(scratch, layerId, op)
      // (#425) The same clipping as `bake`, and it has to be the same call:
      // this is the oracle those bytes are compared against (#168, #289), so
      // a difference in geometry here would read as a determinism violation
      // on every room with a tile hanging off the sheet.
      const tiles = this._bakeTiles(scratch)
      if (!tiles.length) return null
      return encodeLayerTiles(tiles)
    } finally {
      scratch.destroy()
    }
  }

  /** PencilEngineAPI.restoreLayerFromSnapshot. Mirrors the engine's
   *  _replayInto checkpoint-restore branch exactly (resolveForPaint +
   *  restorePixels + restoreTileContent) — a network snapshot's tiles are
   *  structurally the same kind of "exact historical pixels, not a fresh
   *  paint" data a local checkpoint's tiles are, just sourced from the server
   *  instead of memory.
   *
   *  (#287) Also seeds a *pinned* local checkpoint from these same tiles —
   *  without it, this layer's pre-snapshot content exists only in the buffer
   *  itself, invisible to `CheckpointStore.best`/the engine's _rebuildLayer.
   *  The very next undo/redo/revoke of a stroke/layer_clear/layer_transform on
   *  this layer (this client's own, or any peer's — every replica applies the
   *  same meta-op) would then find no matching checkpoint, `buf.clear()`, and
   *  replay only whatever pixel ops this client's own OperationLog happens to
   *  know about — the live tail plus whatever background backfill has
   *  absorbed so far, which after a room-idle prune (rooms.ts's
   *  pruneOperationsBeforeSnapshot) can permanently exclude everything this
   *  snapshot was restoring in the first place. Pinning this exact state as a
   *  checkpoint with an empty `opIds` prefix makes it the correct fallback
   *  instead: `CheckpointStore.best` matches it trivially against any current
   *  `ops` (an empty array prefixes anything), so replay restores these tiles
   *  and then re-applies only the pixel ops this client actually knows
   *  happened since — exactly what already happens for an ordinary local
   *  checkpoint, just sourced from the network instead of a live paint.
   *  Naturally superseded (never has to be invalidated by hand) once real
   *  historical ops eventually get backfilled in front of it: their presence
   *  shifts the current `ops` prefix, and the id-based prefix match in
   *  `CheckpointStore.best` stops matching this checkpoint on its own. */
  restore(layerId: string, tiles: SnapshotTile[], coveredSeq?: number): void {
    const { gl, ledger } = this.ctx
    // (#474) Counted before anything can return early, so a dropped restore
    // still reports the size of what it dropped.
    const bytes = tiles.reduce((n, t) => n + t.pixels.byteLength, 0)
    const buf = this.ctx.layer(layerId)
    if (!buf) {
      this._restoreAudit.push({
        layerId, known: false, tilesIn: tiles.length, tilesUploaded: 0, bytes,
        glError: 0, residentAfter: 0, withContentAfter: 0,
      })
      return
    }
    // Restore may reuse this very buffer. Its old emptiness is no longer a
    // fact about these pixels, regardless of publication/coverage bookkeeping.
    this._emptyRevision.delete(buf)
    // (#469) A snapshot baked before bounded rooms were subdivided carries one
    // page-sized tile; this room's buffer now wants TILE_SIZE ones. Re-slicing
    // is not optional — uploading a 2480-wide array into a 1024-wide texture
    // is silent corruption, not a near miss. Tiles already on the grid (every
    // infinite room, and every bake after the change) pass through untouched.
    const { w: tw, h: th } = this.ctx.tileSize()
    // (#425) Лист передаётся, чтобы обрезанный по его краю тайл прошёл
    // быстрым путём: он уже на сетке, просто кончается там же, где бумага.
    const retiled = retileSnapshotTiles(tiles, tw, th, this.ctx.infinite ? undefined : this.ctx.pageSize())
    // A tile carrying nothing costs 4 MiB of texture to say exactly what an
    // absent tile already says.
    //
    // (#467) This used to run only on a re-sliced set, on the reasoning that
    // "identity means every tile came off a real bake, which never stores a
    // tile it did not paint". Measured on production room cdf314dd-153, that
    // is false: **38 of its 107 stored tiles are fully transparent, 114 MB of
    // the 349 MB a join materialises**, and every one of them came off an
    // ordinary bake already on the grid. `resolveForPaint` makes every tile a
    // stroke's *bounding rect* touches resident, whether or not a dab ever
    // darkens it, and erasing empties a tile without releasing it — so real
    // bakes produce these constantly. Worse, they ratchet: a client that
    // materialised them re-bakes them for the next joiner, forever.
    //
    // The scan is not free, but it is cheap against what it prevents: it exits
    // on the first non-zero alpha, and a tile it does not exit early on is one
    // whose 4 MiB upload it has just cancelled.
    const painted = retiled.filter(t => !isFullyTransparent(t.pixels))
    // Blank tiles are dropped from the upload only while the layer is
    // genuinely empty. Restoring onto a live buffer — a reconnect re-restoring
    // an engine that already holds pixels — is the one case where an
    // all-transparent tile is *doing* something: clearing what is under it.
    // Nothing clears the layer ahead of this, so that distinction is ours to
    // make, and one cheap check makes it without asking per tile.
    const uploads = buf.allResident().length === 0 ? painted : retiled
    // (#474) Any error already pending is drained first, so what this reads
    // afterward is this restore's own — the same discipline generatePaperMipmaps
    // uses, and for the same reason: an inherited error would accuse the wrong
    // code, and inheriting *silence* is impossible, so only draining can be wrong.
    this._drainGlErrors()
    for (const t of uploads) {
      const rect = { minX: t.originX, minY: t.originY, maxX: t.originX + t.width, maxY: t.originY + t.height }
      // (#425) See the same call in the engine's _replayInto: the payload
      // carries its own size because edge tiles are clipped to the sheet.
      for (const target of buf.resolveForPaint(rect)) target.buffer.restorePixelsRect(t.width, t.height, t.pixels)
      buf.restoreTileContent(rect, t.pixels)
    }
    // One getError for the whole layer rather than one per tile: the question a
    // report has to answer is "did this layer land", and a per-tile scan would
    // add a GPU sync point per tile to a path that runs at join time on the
    // slowest devices we have.
    const glError = gl.getError()
    const resident = buf.allResident()
    this._restoreAudit.push({
      layerId, known: true, tilesIn: tiles.length, tilesUploaded: uploads.length, bytes, glError,
      residentAfter: resident.length,
      withContentAfter: resident.filter(t => t.contentRect !== null).length,
    })
    if (coveredSeq !== undefined) ledger.setCoverage(layerId, coveredSeq)
    // (#373) These pixels *are* what the server already stores, so the layer
    // is marked changed (it is — the buffer was empty a moment ago) and
    // immediately marked as known to the server. Otherwise every joining
    // client would re-bake and re-upload the whole room it just downloaded.
    ledger.markDirty(layerId)
    ledger.markPublished(layerId)
    // The *painted* set, not what arrived: a checkpoint restore clears the
    // buffer before replaying its tiles (see the engine's _rebuildLayerFromLog),
    // so a blank tile there can only ever cost memory, never carry meaning.
    this._pinSnapshotCheckpoint(layerId, painted, coveredSeq)
  }

  /** PencilEngineAPI.takeSnapshotRestoreAudit. */
  takeRestoreAudit(): SnapshotRestoreAudit[] {
    const audit = this._restoreAudit
    this._restoreAudit = []
    return audit
  }

  /** Empties the GL error queue so the next `getError()` reports on its own
   *  work. Capped rather than `while (…)`: a lost context is specified to
   *  answer CONTEXT_LOST_WEBGL until it is restored, and a drain loop that
   *  trusts the queue to empty would hang the join it is supposed to be
   *  reporting on. GL keeps at most a handful of distinct flags, so anything
   *  past this bound is a broken implementation, not a backlog. */
  private _drainGlErrors(): void {
    const { gl } = this.ctx
    for (let i = 0; i < 16; i++) if (gl.getError() === gl.NO_ERROR) return
  }

  /** See restore's own doc comment for why this exists. Replaces (rather than
   *  adds to) any pinned checkpoint this layer already had — only relevant if
   *  restore is ever called twice for the same layer in one engine lifetime
   *  (e.g. a reconnect re-restoring a still-mounted engine); the newer restore
   *  is always a superset, and `CheckpointStore.best`'s "first checkpoint of
   *  the longest matching length wins" tie-break would otherwise let a stale
   *  one linger and win ties against the newer, more complete one at the same
   *  (empty) opIds length. */
  private _pinSnapshotCheckpoint(layerId: string, tiles: SnapshotTile[], coveredSeq?: number): void {
    if (!tiles.length) return
    // These pixels are authoritative again, so whatever made this layer
    // unpublishable no longer holds (#522).
    this.ctx.ledger.allowPublishing(layerId)
    // (#467) Packed here rather than by the caller: this is the only place
    // that knows these tiles are about to be held for the life of the room
    // instead of read and dropped. See pinnedTiles.ts.
    const held = tiles.map(t => ({
      originX: t.originX, originY: t.originY, width: t.width, height: t.height,
      packed: packTilePixels(t.pixels),
    }))
    // Replaces any snapshot checkpoint this layer already had — see
    // CheckpointStore.pinSnapshot for why it is matched on `fromSnapshot`.
    this.ctx.checkpoints().pinSnapshot(layerId, held, coveredSeq)
  }

  /** PencilEngineAPI.absorbHistoricalOperations — see its doc comment and
   *  OperationLog.prependHistorical's own for the full reasoning. Replays
   *  `ops` through a throwaway scratch log using its normal public
   *  append/applyUndo/applyRedo/revoke methods — exactly the same
   *  log-bookkeeping sequence the engine's appendOperation drives for a live
   *  operation, just without ever touching a buffer — so the resulting
   *  entries' done/undone/gone states come from the exact same state machine,
   *  then merges them into the real log in one step. */
  absorbHistorical(pageOps: Operation[]): void {
    const log = this.ctx.log()
    // (#536, §17.61) A backfill page is "everything below the snapshot's seq",
    // but since #372 the join tail is judged per layer: a layer with no pixel
    // snapshot of its own gets its whole history in the tail. So a page can
    // repeat what the log already holds — in room jExxU2EJ all 100 of it, and
    // again on every reconnect's restore. Prepended twice, a stroke is painted
    // twice by every later rebuild: undo darkened the layer it rebuilt.
    const held = new Set(log.entries.map(e => e.op.id))
    const ops = pageOps.filter(op => !held.has(op.id))
    if (ops.length === 0) return
    const scratch = new OperationLog()
    for (const op of ops) {
      scratch.append(op, op.seq === undefined ? undefined : { serverSeq: op.seq })
      if (op.type === 'operation_undo') scratch.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') scratch.applyRedo(op.targetOpId, op.userId)
      else if (op.type === 'operation_revoke') scratch.revoke(op.targetOpId)
    }
    log.prependHistorical(scratch.entries)
    this._historicalGestureUnresolved = log.reconcileHistoricalGestures(ops.map(op => op.id))
    this._historicalEntryCount += scratch.entries.length
    // (#479) These operations are now in the log, and a restored layer's
    // pinned checkpoint already holds the pixels of whichever of them predate
    // its snapshot — record them so a later rebuild skips rather than repaints
    // them. Read from `ops` rather than the log because only these copies
    // still carry the server's seq: `OperationLog.append` renumbers entries to
    // their array index (see SnapshotLedger.isCovered's own comment), so once they
    // are in, "is this older than the snapshot?" is no longer answerable.
    this.ctx.checkpoints().markCovered(ops)
    // (#398) Nothing is painted here — but an undo/redo later rebuilds a
    // layer from exactly these operations, and that rebuild is synchronous.
    // Decoding in the background now is what lets it find the image ready;
    // deliberately not awaited, since backfill itself never blocks anything.
    this.ctx.preloadImages(ops)
  }

  /** A covered history mutation cannot be subtracted from a baked tile.
   *  Discard that base only when every original server operation up to it is
   *  available, so rebuilding from empty cannot discard an unknown prefix. */
  private readonly historyRepairs = new Map<string, number>()

  pendingHistoryRepairs(): Array<{ layerId: string; beforeSeq: number }> {
    const sequences = new Set(this.ctx.log().entries.map(e => e.serverSeq))
    return [...this.historyRepairs].flatMap(([layerId, coveredSeq]) => {
      let missing = coveredSeq
      while (missing > 0 && sequences.has(missing)) missing--
      return missing > 0 ? [{ layerId, beforeSeq: missing + 1 }] : []
    })
  }

  historyRepairPending(layerId: string): boolean { return this.historyRepairs.has(layerId) }

  invalidateCoveredHistory(layerIds: readonly string[], targetId: string): void {
    for (const layerId of layerIds) {
      const snapshot = this.ctx.checkpoints().all().find(cp => cp.layerId === layerId && cp.fromSnapshot && cp.covered?.has(targetId))
      if (!snapshot || snapshot.coveredSeq === undefined) continue
      this.historyRepairs.set(layerId, snapshot.coveredSeq)
      this.ctx.ledger.markDirty(layerId)
      this.ctx.ledger.refusePublishing(layerId)
    }
  }

  /** Resolve only from a complete server prefix; metadata survives lost GL. */
  resolveHistoryRepairs(): string[] {
    const sequences = new Set(this.ctx.log().entries.map(e => e.serverSeq).filter((n): n is number => n !== undefined && n > 0))
    const ready: string[] = []
    for (const [layerId, coveredSeq] of this.historyRepairs) {
      if (sequences.size < coveredSeq) continue
      let complete = true
      for (let seq = 1; seq <= coveredSeq; seq++) if (!sequences.has(seq)) { complete = false; break }
      if (!complete) continue
      for (const cp of [...this.ctx.checkpoints().all()]) if (cp.layerId === layerId) this.ctx.checkpoints().remove(cp)
      this.ctx.ledger.forgetCoverage(layerId)
      this.ctx.ledger.allowPublishing(layerId)
      this.historyRepairs.delete(layerId)
      ready.push(layerId)
    }
    return ready
  }

  /** PencilEngineAPI.getOperationsSinceRestore. */
  operationsSinceRestore(): Operation[] {
    return this.ctx.log().doneOperations().filter(op => (op.seq ?? 0) >= this._historicalEntryCount)
  }
}
