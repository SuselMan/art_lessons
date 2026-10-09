// Append-only operation log — the source of truth for canvas content (ADR 002).
// Undo/redo never rewrites history: entries flip between three states and
// replay simply skips everything that is not `done`.
//
//   done   — applied, visible on canvas
//   undone — reverted by its author, eligible for redo
//   gone   — unreachable history branch (author acted after undo, or a teacher
//            revoked it); can never return to `done`

import type {
  Operation, StrokeOperation, LayerClearOperation, LayerMergeOperation, LayerDuplicateOperation,
  ImageImportOperation, LayerTransformOperation, AreaTransformOperation, AreaClearOperation,
  AreaPasteOperation, AreaFillOperation, ShapeOperation, LayerFilterOperation,
} from '@grafetto/shared'
import { operationLayerIds } from '@grafetto/shared'

export type OperationState = 'done' | 'undone' | 'gone'

export interface LogEntry {
  op: Operation
  state: OperationState
  /** (#537) This client's own operation, applied optimistically and not yet
   *  confirmed by the server. Pending entries always form the log's tail —
   *  see OperationLog's own doc comment on the two regions. */
  pending?: boolean
  /** (#537) The server's seq, once known: set on every confirmed entry that
   *  arrived with one. Absent on pending entries and on backfilled history
   *  (which is older than everything else anyway). */
  serverSeq?: number
}

/** (#537) Where `append` puts an operation. */
export type Placement =
  /** This client's own operation, applied before the server has ordered it:
   *  goes on the very end, in the pending tail. */
  | { pending: true }
  /** An operation the server has already ordered: goes into the confirmed
   *  region at its seq, below every pending entry. */
  | { pending?: false; serverSeq?: number }

/** Operations that change a layer's pixel buffer (as opposed to structure). */
export type PixelOperation = StrokeOperation | LayerClearOperation | LayerMergeOperation
  | LayerDuplicateOperation | ImageImportOperation | LayerTransformOperation
  | AreaTransformOperation | AreaClearOperation | AreaPasteOperation | AreaFillOperation
  | ShapeOperation | LayerFilterOperation

export function isPixelOperation(op: Operation): op is PixelOperation {
  return op.type === 'stroke' || op.type === 'layer_clear' || op.type === 'layer_merge'
    || op.type === 'layer_duplicate' || op.type === 'image_import' || op.type === 'layer_transform'
    // (#446) The selection operations paint one layer and change nothing
    // else, which is what "pixel operation" means here — they belong in
    // checkpoint counting, per-layer replay and undo exactly like a stroke.
    || op.type === 'area_transform' || op.type === 'area_clear' || op.type === 'area_paste'
    // (#453) The fill, for the same reason: one layer, pixels and nothing else.
    || op.type === 'area_fill'
    // (#527) And a shape, which is the same thing drawn from parameters
    // instead of from a raster.
    || op.type === 'shape'
    // (#574) And a filter: one layer, pixels only, replayed from its numbers.
    || op.type === 'layer_filter'
}

/** (#537) The layers whose pixels `op` writes. Empty for anything that is not
 *  a pixel operation — including undo/redo/revoke, which rebuild their
 *  target's layers themselves. */
export function pixelWriteLayerIds(op: Operation): string[] {
  if (!isPixelOperation(op)) return []
  return op.type === 'layer_transform' ? op.transforms.map(t => t.layerId) : [op.layerId]
}

/** (#537) The layers whose pixels `op` reads without writing: a merge's sources
 *  and a duplicate's source. Their content at the operation's place in the
 *  order is baked into its result, so something landing on them *earlier* in
 *  the order changes that result. */
export function pixelReadLayerIds(op: Operation): string[] {
  if (op.type === 'layer_merge') return op.sources.map(s => s.id)
  if (op.type === 'layer_duplicate') return [op.sourceId]
  return []
}

/** Every PixelOperation but layer_transform targets exactly one layer via its
 *  own `layerId`. layer_transform (#120) is the one exception — a single
 *  operation can bake a matrix into several layers at once (see its
 *  docstring in packages/shared), so membership has to check its
 *  `transforms` array instead of a single field.
 *
 *  (#449) `layer_duplicate` names two layers but belongs to exactly one
 *  history: the copy's, via `layerId`. Its `sourceId` is read, not written —
 *  the source is not changed by being copied. Counting it under `sourceId` as
 *  well would put it in `layerPixelOps(sourceId)`, so any later rebuild of the
 *  source would replay the duplicate into the source's own buffer and paint the
 *  layer onto itself. */
function pixelOpTargetsLayer(op: PixelOperation, layerId: string): boolean {
  return op.type === 'layer_transform'
    ? op.transforms.some(t => t.layerId === layerId)
    : op.layerId === layerId
}

/** Continuous opacity-slider input arrives as a burst of operations; collapse
 *  the burst into one log entry so a single Ctrl+Z reverts the whole slide.
 *
 *  (#412) The slider can now drive several layers at once, so "same target"
 *  is a set comparison rather than one id. Order is not normalised on purpose:
 *  a single slide always emits the same list in the same order (it comes from
 *  one unchanged selection), and two *different* selections that happen to
 *  hold the same layers are still two different gestures a user would expect
 *  to undo separately. */
function coalesces(prev: Operation, next: Operation): boolean {
  if (prev.type !== 'layer_opacity' || next.type !== 'layer_opacity') return false
  if (prev.userId !== next.userId) return false
  const a = operationLayerIds(prev)
  const b = operationLayerIds(next)
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Meta-operations that only ever move *another* entry between states —
 *  they never represent undoable content themselves. Excluded from
 *  undo/redo candidate scans (#103): without this, a second Ctrl+Z would
 *  find the operation_undo entry the first Ctrl+Z just appended and try to
 *  "undo the undo" instead of reaching further back into real content. */
//  (#536, §17.48) `paper_dry` rides along: it is not undoable (there is no
//  "wet it again"), so a Ctrl+Z must reach past it to the stroke before, and
//  pressing it is not "doing something new" that should cost the redo stack.
const META_OP_TYPES = new Set<Operation['type']>(['operation_revoke', 'operation_undo', 'operation_redo', 'paper_dry'])

/** (#537) The log holds two regions, in this order:
 *
 *   - **confirmed** — every operation the server has ordered, sorted by the
 *     server's seq. The room's true history, identical on every client.
 *   - **pending** — this client's own operations, applied the moment they were
 *     made and not yet confirmed, in the order they were made.
 *
 *  That is the order the room *will* have: the stream of confirmations is
 *  ordered, so anything confirmed from now on either is one of the pending
 *  entries or has a seq below all of them. A peer's operation is therefore
 *  inserted below the pending tail rather than appended after it, and an own
 *  operation moves from the tail to its seq when its confirmation arrives.
 *
 *  Pixels are painted when an operation is applied, which is not always in
 *  this order — that is what `append` and `confirm` report back as
 *  `overtaken`: the entries now *after* the operation that were painted
 *  *before* it. The engine re-settles the layers where that matters.
 *
 *  Local `seq` still means "array index" (see append()); every move
 *  renumbers the entries it shifted. */
export class OperationLog {
  private _entries: LogEntry[] = []
  private _revision = 0

  /** Changes whenever journal order or entry state may change. */
  get revision(): number { return this._revision }
  private _nextSeq = 0
  /** (#537) Entries [0, _confirmedCount) are the confirmed region; the rest
   *  are the pending tail. */
  private _confirmedCount = 0
  // (#150) Per-layer count of currently-`done` pixel ops, maintained
  // incrementally alongside every state transition that can change it
  // (append/applyUndo/applyRedo/revoke below) — `_maybeCheckpoint`
  // (engine/index.ts) used to call `layerPixelOps(layerId).length` on
  // *every* stroke/image_import/layer_transform completion just to check
  // "is this a checkpoint-interval multiple," a full O(log length) scan on
  // an interactive path whose cost only grows with session length. This
  // gives the same number in O(targeted layers) instead — `layerPixelOps`
  // itself is untouched and still used wherever the real ops array (not
  // just its count) is actually needed, which is naturally rare (checkpoint
  // taking itself is throttled to 1-in-CHECKPOINT_INTERVAL, replay/rebuild
  // paths aren't on the per-stroke hot path).
  private _pixelOpDoneCount = new Map<string, number>()

  get entries(): readonly LogEntry[] {
    return this._entries
  }

  /** See _pixelOpDoneCount's own field comment. O(1), never scans the log. */
  pixelOpDoneCount(layerId: string): number {
    return this._pixelOpDoneCount.get(layerId) ?? 0
  }

  private _bumpPixelOpCount(op: Operation, delta: number): void {
    if (!isPixelOperation(op)) return
    const layerIds = op.type === 'layer_transform' ? op.transforms.map(t => t.layerId) : [op.layerId]
    for (const layerId of layerIds) {
      this._pixelOpDoneCount.set(layerId, (this._pixelOpDoneCount.get(layerId) ?? 0) + delta)
    }
  }

  /** Appends a new operation. The author's `undone` entries become `gone`:
   *  a linear log cannot express history branching, so a new action makes the
   *  undone branch unreachable and redo past it impossible.
   *
   *  Meta-ops (operation_undo/redo/revoke, #103) are exempt from this: they
   *  aren't "the user did something new" in the sense this rule guards
   *  against — appending an `operation_redo` (now itself logged/broadcast so
   *  every replica converges, not just a direct in-memory mutation) must not
   *  nuke the very entries it and its siblings are about to flip back to
   *  `done`, or a multi-step redo would wipe its own remaining redo stack
   *  after the first step. */
  /**
   *  (#537) Returns the entries that now come *after* `op` although they were
   *  already applied — empty in the common case, where `op` lands on the end
   *  of its region with nothing painted above it. See the class doc comment. */
  append(op: Operation, placement: Placement = {}): LogEntry[] {
    this._revision++
    if (!META_OP_TYPES.has(op.type)) {
      for (const e of this._entries) {
        if (e.state === 'undone' && e.op.userId === op.userId) e.state = 'gone'
      }
    }

    if (placement.pending) {
      // Coalesced only into another pending entry: folding an unconfirmed
      // operation into a confirmed one would leave that entry claiming a
      // confirmation it no longer has.
      const last = this._entries[this._entries.length - 1]
      if (last && last.pending && last.state === 'done' && coalesces(last.op, op)) {
        last.op = { ...op, seq: last.op.seq }
        return []
      }
      this._entries.push({ op: { ...op, seq: this._nextSeq++ }, state: 'done', pending: true })
      this._bumpPixelOpCount(op, 1)
      return []
    }

    const at = this._confirmedSlot(placement.serverSeq)
    const prev = this._entries[at - 1]
    if (prev && !prev.pending && prev.state === 'done' && coalesces(prev.op, op)) {
      prev.op = { ...op, seq: prev.op.seq }
      if (placement.serverSeq !== undefined) prev.serverSeq = placement.serverSeq
      return this._entries.slice(at)
    }
    const entry: LogEntry = { op: { ...op, seq: at }, state: 'done' }
    if (placement.serverSeq !== undefined) entry.serverSeq = placement.serverSeq
    this._entries.splice(at, 0, entry)
    this._confirmedCount++
    this._nextSeq++
    this._renumber(at + 1, this._entries.length)
    this._bumpPixelOpCount(op, 1)
    return this._entries.slice(at + 1)
  }

  /** (#537) The server has ordered one of this client's pending operations at
   *  `serverSeq`: moves it out of the pending tail to its place in the
   *  confirmed region. Returns the entry's operation and the entries it moved
   *  below, or null when there is nothing to confirm — an id that was never
   *  pending here, was already confirmed (the ack and the broadcast both
   *  report it), or was coalesced into a later entry. */
  confirm(opId: string, serverSeq: number): { op: Operation; overtaken: LogEntry[] } | null {
    this._revision++
    let from = -1
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      if (this._entries[i].op.id === opId) { from = i; break }
    }
    if (from === -1) return null
    const [entry] = this._entries.splice(from, 1)
    const at = this._confirmedSlot(serverSeq)
    this._entries.splice(at, 0, entry)
    entry.pending = false
    entry.serverSeq = serverSeq
    this._confirmedCount++
    this._renumber(at, from + 1)
    return { op: entry.op, overtaken: this._entries.slice(at + 1, from + 1) }
  }

  /** (#537) Whether `opId` is one of this client's still-unconfirmed entries. */
  isPending(opId: string): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      if (this._entries[i].op.id === opId) return true
    }
    return false
  }

  /** (#537) Whether any still-`done`, unconfirmed entry writes this layer's
   *  pixels — i.e. whether the layer shows something the room's own history
   *  does not have yet. O(pending tail). */
  hasPendingPixelOps(layerId: string): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      const e = this._entries[i]
      if (e.state === 'done' && pixelWriteLayerIds(e.op).includes(layerId)) return true
    }
    return false
  }

  /** A local dry changes wet-state and canonical pixels on every layer.
   * It cannot be published under the watermark before its confirmation. */
  hasPendingPaperDry(): boolean {
    for (let i = this._confirmedCount; i < this._entries.length; i++) {
      const entry = this._entries[i]
      if (entry.state === 'done' && entry.op.type === 'paper_dry') return true
    }
    return false
  }

  /** Where a confirmed operation with this seq belongs: after every confirmed
   *  entry with a lower (or unknown) seq. Scans back from the region's end,
   *  which is where it almost always goes — the stream is ordered. */
  private _confirmedSlot(serverSeq: number | undefined): number {
    let at = this._confirmedCount
    if (serverSeq === undefined) return at
    while (at > 0) {
      const prevSeq = this._entries[at - 1].serverSeq
      if (prevSeq === undefined || prevSeq <= serverSeq) break
      at--
    }
    return at
  }

  /** Local seq is the array index; re-stamps [from, to) after a move. */
  private _renumber(from: number, to: number): void {
    for (let i = from; i < to; i++) {
      const e = this._entries[i]
      if (e.op.seq !== i) e.op = { ...e.op, seq: i }
    }
  }

  /** Read-only: the user's latest `done` op eligible for undo (excludes
   *  meta-ops — see META_OP_TYPES). Doesn't mutate anything — the caller
   *  (PencilEngine#undo, #103) wraps the result's id into a broadcastable
   *  `operation_undo` and applies it via `applyUndo()` below, so the
   *  author's own client converges through the exact same path as every
   *  peer instead of mutating state ahead of the network. */
  undoTarget(userId: string): Operation | null {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i]
      if (e.state === 'done' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Read-only symmetric counterpart: the user's earliest `undone` op (undo
   *  always takes the highest-seq `done` entry, so a user's undone entries
   *  form a suffix of their history — the redo target is the lowest-seq
   *  one). */
  redoTarget(userId: string): Operation | null {
    for (const e of this._entries) {
      if (e.state === 'undone' && e.op.userId === userId && !META_OP_TYPES.has(e.op.type)) return e.op
    }
    return null
  }

  /** Flips one specific entry (addressed by id, not "whichever is latest")
   *  from `done` to `undone`. This is what every replica actually calls —
   *  the author's own client picked the id once via `undoTarget()` and
   *  broadcasts it in an `operation_undo`; every peer (and the author's own
   *  log, applied through the same `appendOperation` path) flips the exact
   *  same entry, so there's no scan to keep in sync across clients (#103).
   *  Guards `op.userId` against the target's own author: even without real
   *  auth (#41) yet, a client can never undo an op it didn't author. */
  applyUndo(targetOpId: string, userId: string): Operation | null {
    this._revision++
    const target = this._entries.find(e => e.op.id === targetOpId && e.state === 'done' && e.op.userId === userId)
    if (!target) return null
    for (const e of this._gestureEntries(target, 'done')) {
      e.state = 'undone'
      this._bumpPixelOpCount(e.op, -1)
    }
    return target.op
  }

  /** Every entry that belongs to the same gesture as `target` and is currently
   *  in `state` — which is just `[target]` for anything that isn't part of a
   *  multi-operation stroke.
   *
   *  A stroke longer than the engine's dab-chunk limit is recorded as several
   *  operations (see StrokeOperation.strokeId). They are one pen-down-to-pen-up
   *  movement as far as the person drawing is concerned, so one Ctrl+Z has to
   *  take all of them: otherwise a long line needs several presses and stands
   *  there cut short in between, and a marker one comes back seamed, since its
   *  chunks composite as a unit (see the engine's _replayMarkerChunk).
   *
   *  Resolved here rather than by broadcasting several operation_undo ops:
   *  every replica already applies the same single id through this method, so
   *  expanding the id to its gesture keeps them converging on exactly the same
   *  set with nothing added to the wire. Strokes recorded before strokeId
   *  existed carry none, and undo one operation at a time as they always did. */
  private _gestureEntries(target: LogEntry, state: OperationState): LogEntry[] {
    const { op } = target
    const strokeId = op.type === 'stroke' ? op.strokeId : undefined
    if (!strokeId) return [target]
    return this._entries.filter(e =>
      e.state === state && e.op.type === 'stroke' && e.op.userId === op.userId && e.op.strokeId === strokeId)
  }

  /** (#520) Every layer the gesture `op` belongs to has pixels on — `op`'s own
   *  layer alone for anything that isn't part of a multi-operation stroke.
   *
   *  Whoever flips a gesture's state has to rebuild all of them, and until an
   *  eraser could go through layers that was the same thing as rebuilding one:
   *  a chunked stroke's operations all sit on the layer it was drawn on. A
   *  cross-layer erase is one gesture spread over several, so undoing it while
   *  rebuilding only the target's layer brings the ink back on that one layer
   *  and leaves every other one erased — with the log now saying the erase never
   *  happened anywhere, which the next rebuild of those layers would agree with.
   *  A picture that repairs itself only when something unrelated forces a
   *  rebuild is the worst version of this bug, so it is fixed at the source.
   *
   *  Reads entries in *any* state on purpose: the caller has already flipped
   *  them, and which side of the flip they are on says nothing about which
   *  layers need redrawing. */
  gestureLayerIds(op: Operation): string[] {
    const strokeId = op.type === 'stroke' ? op.strokeId : undefined
    // `typeof` and not just `in`: on the operations #412 gave a `layerIds`
    // list to, `layerId` is still declared, optional, and absent — so the
    // property test alone answers `string | undefined`.
    const own = 'layerId' in op && typeof op.layerId === 'string' ? [op.layerId] : []
    if (!strokeId) return own
    const ids = new Set(own)
    for (const e of this._entries) {
      if (e.op.type === 'stroke' && e.op.userId === op.userId && e.op.strokeId === strokeId) ids.add(e.op.layerId)
    }
    return [...ids]
  }

  /** Symmetric with `applyUndo`: undone → done for one specific entry. */
  applyRedo(targetOpId: string, userId: string): Operation | null {
    this._revision++
    const target = this._entries.find(e => e.op.id === targetOpId && e.state === 'undone' && e.op.userId === userId)
    if (!target) return null
    for (const e of this._gestureEntries(target, 'undone')) {
      e.state = 'done'
      this._bumpPixelOpCount(e.op, 1)
    }
    return target.op
  }

  /** Convenience: find-then-flip in one call, for callers that don't need
   *  the id split out (e.g. direct, non-networked use of the log). Not used
   *  by PencilEngine's undo()/redo() (#103) — those need the id up front to
   *  build the broadcastable operation, and apply it via `applyUndo`/
   *  `applyRedo` like any other operation. */
  undo(userId: string): Operation | null {
    const target = this.undoTarget(userId)
    return target ? this.applyUndo(target.id, userId) : null
  }

  /** Convenience counterpart to `undo()` — see its docstring. */
  redo(userId: string): Operation | null {
    const target = this.redoTarget(userId)
    return target ? this.applyRedo(target.id, userId) : null
  }

  /** Privileged removal of someone else's operation (teacher). The target goes
   *  straight to `gone` — no redo, the author's own undo stack is untouched. */
  revoke(targetOpId: string): Operation | null {
    this._revision++
    for (const e of this._entries) {
      if (e.op.id === targetOpId && e.state !== 'gone') {
        // Only a still-`done` entry was ever counted (an `undone` one
        // already wasn't) — revoking that one is the only case that changes
        // the count.
        if (e.state === 'done') this._bumpPixelOpCount(e.op, -1)
        e.state = 'gone'
        return e.op
      }
    }
    return null
  }

  /** Prepends already-resolved historical entries — #169's background
   *  backfill of pre-snapshot history, older than the live tail applied right
   *  after a network-snapshot restore. Not necessarily absent from it, though:
   *  a layer with no pixel snapshot gets its whole history in that tail
   *  (#372), so the caller drops whatever this log already holds (#536,
   *  §17.61) — this method trusts it and does not check. `entries` must arrive with correct
   *  done/undone/gone states already resolved — see
   *  engine/index.ts's absorbHistoricalOperations, the one caller, which
   *  builds them by replaying the historical ops through a scratch
   *  OperationLog's normal append/applyUndo/applyRedo/revoke so their
   *  states come from the exact same state machine live entries do.
   *
   *  Deliberately bypasses append()'s own logic entirely — in particular
   *  its "mark my undone entries gone" side effect, which is meant for a
   *  user genuinely taking a new action, not history arriving late. This
   *  is the reason this exists as its own method rather than teaching
   *  append() to insert: append() stays exactly as it is for every live
   *  call site, and this only ever runs on the background backfill path.
   *
   *  Renumbers every entry's local `seq` to its final array position
   *  afterward. `entries` arrives with its own independent local numbering
   *  (the scratch log's own counter also starts at 0) that would otherwise
   *  collide with this log's existing entries' numbering once merged —
   *  local seq has always meant "array index" (see append()), this keeps
   *  that invariant true across the splice. O(n) in the log's total size;
   *  fine for a background, few-times-per-session operation. */
  prependHistorical(entries: readonly LogEntry[]): void {
    this._revision++
    const incoming = [...entries.map(e => ({ ...e, pending: false })), ...this._entries]
    // A repair may fill a hole inside the known snapshot prefix, rather than
    // merely prepend an older page. Original server order is authoritative;
    // legacy seq-less callers keep their established prepend contract.
    if (incoming.every(e => e.pending || e.serverSeq !== undefined)) {
      incoming.sort((a, b) => a.pending ? (b.pending ? 0 : 1) : b.pending ? -1 : a.serverSeq! - b.serverSeq!)
    }
    const merged = incoming.map((e, i) => ({ ...e, op: { ...e.op, seq: i } }))
    this._entries = merged
    this._nextSeq = merged.length
    this._confirmedCount += entries.length
    for (const e of entries) {
      if (e.state === 'done') this._bumpPixelOpCount(e.op, 1)
    }
  }

  /** Atomic backfill admission: unknown controls never publish provisional done chunks. */
  prependHistoricalReconciled(entries: readonly LogEntry[]): string[] {
    const candidate = new OperationLog()
    candidate._entries = this._entries.map(e => ({ ...e, op: { ...e.op } }))
    candidate._revision = this._revision
    candidate._nextSeq = this._nextSeq
    candidate._confirmedCount = this._confirmedCount
    candidate._pixelOpDoneCount = new Map(this._pixelOpDoneCount)
    candidate.prependHistorical([...entries])
    const unresolved = candidate.reconcileHistoricalGestures(entries.map(e => e.op.id))
    if (unresolved.length) return unresolved
    this._entries = candidate._entries
    this._revision = candidate._revision
    this._nextSeq = candidate._nextSeq
    this._confirmedCount = candidate._confirmedCount
    this._pixelOpDoneCount = candidate._pixelOpDoneCount
    return []
  }

  /** Reconcile only gestures exposed by a new backfill page. Existing journal
   * metadata/order and unrelated states are authoritative and never replaced.
   * A known gone control can be a rejected local intent: do not reapply it. */
  reconcileHistoricalGestures(addedIds: readonly string[]): string[] {
    const added = new Set(addedIds)
    const affected = new Set<string>()
    const identity = (op: Operation): string | null => op.type === 'stroke'
      ? JSON.stringify([op.userId, op.strokeId ?? null, op.strokeId ? null : op.id]) : null
    for (const entry of this._entries) {
      if (!added.has(entry.op.id)) continue
      const own = identity(entry.op)
      if (own) affected.add(own)
      if (entry.op.type === 'operation_undo' || entry.op.type === 'operation_redo' || entry.op.type === 'operation_revoke') {
        const targetId = entry.op.targetOpId
        const target = this._entries.find(e => e.op.id === targetId)
        const key = target && identity(target.op)
        if (key) affected.add(key)
      }
    }
    if (!affected.size) return []
    const witnessed = new Map<string, number>()
    for (const entry of this._entries) {
      const op = entry.op
      if (entry.state === 'gone' || (op.type !== 'operation_undo' && op.type !== 'operation_redo' && op.type !== 'operation_revoke')) continue
      const target = this._entries.find(e => e.op.id === op.targetOpId)
      if (!target || (op.type !== 'operation_revoke' && target.op.userId !== op.userId)) continue
      const key = identity(target.op)
      if (key) witnessed.set(key, this._entries.indexOf(entry))
    }
    const unresolved = new Set<string>()
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (key && affected.has(key) && !added.has(entry.op.id) && entry.state === 'undone' && (witnessed.get(key) ?? -1) <= this._entries.indexOf(entry)) unresolved.add(key)
    }
    const scratch = new OperationLog()
    for (const entry of this._entries) {
      const op = entry.op
      scratch.append(op)
      if (entry.state === 'gone' && META_OP_TYPES.has(op.type)) { scratch.revoke(op.id); continue }
      if (op.type === 'operation_undo') scratch.applyUndo(op.targetOpId, op.userId)
      else if (op.type === 'operation_redo') scratch.applyRedo(op.targetOpId, op.userId)
      else if (op.type === 'operation_revoke') scratch.revoke(op.targetOpId)
      if (entry.state === 'gone') scratch.revoke(op.id)
    }
    const states = new Map(scratch.entries.map(e => [e.op.id, e.state]))
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (key && affected.has(key) && !added.has(entry.op.id) && entry.state === 'undone' && states.get(entry.op.id) !== 'undone') unresolved.add(key)
    }
    for (const entry of this._entries) {
      const key = identity(entry.op)
      if (!key || !affected.has(key) || unresolved.has(key) || entry.state === 'gone') continue
      const state = states.get(entry.op.id)
      if (state === undefined || state === entry.state) continue
      if (entry.state === 'done') this._bumpPixelOpCount(entry.op, -1)
      if (state === 'done') this._bumpPixelOpCount(entry.op, 1)
      entry.state = state
      this._revision++
    }
    return [...unresolved]
  }

  /** All `done` operations in seq order. */
  doneOperations(): Operation[] {
    const out: Operation[] = []
    for (const e of this._entries) {
      if (e.state === 'done') out.push(e.op)
    }
    return out
  }

  /** `done` pixel operations targeting the given layer, optionally only those
   *  ordered strictly before `beforeSeq` (used to reconstruct a merge source
   *  as it was at merge time). */
  layerPixelOps(layerId: string, beforeSeq?: number): PixelOperation[] {
    const out: PixelOperation[] = []
    for (const e of this._entries) {
      if (e.state !== 'done') continue
      const { op } = e
      if (!isPixelOperation(op) || !pixelOpTargetsLayer(op, layerId)) continue
      if (beforeSeq !== undefined && (op.seq ?? 0) >= beforeSeq) continue
      out.push(op)
    }
    return out
  }
}
