// (#494) Layer merge and duplicate, out of PencilEngine (seam С5 of the
// survey). Both are structural operations with a pixel side: a merge folds
// its sources into one new layer and destroys them, a duplicate copies one
// layer into a new one. Each has three paths, and all three live here:
//
// - live (`exec` from appendOperation): the sources' buffers already hold
//   their replayed state, so they are composited directly, and a checkpoint
//   is taken at once;
// - structural only (`exec` again, when a restored snapshot already covers
//   the operation): the result's pixels came back from the snapshot, so only
//   the layer bookkeeping happens;
// - replay (`replayMergeInto`/`replayDuplicateInto` from the engine's
//   _replayInto): each source is rebuilt as it was just before the operation
//   into a scratch buffer and composited from there.
//
// It never sees the engine, only StructuralOpsContext below. The replay
// itself, checkpoints, layer creation and destruction stay with the engine —
// they arrive as context functions, so the order they run in is exactly the
// one the engine had. No GL names are owned here: every scratch buffer is
// destroyed in the call that made it, so there is no initGL or forget().

import type { LayerDuplicateOperation, LayerMergeOperation } from '@grafetto/shared'
import type { ILayerBuffer } from '../buffers/ILayerBuffer'
import type { WorldRect } from '../buffers/tileMath'
import type { OperationLog, PixelOperation } from './OperationLog'
import type { SnapshotLedger } from './snapshotLedger'

/** What StructuralOps may ask of the engine. Functions for everything the
 *  engine assigns after construction (the layer map, the log) or owns the
 *  rules of (replay, checkpoints, a layer's creation and destruction). */
export interface StructuralOpsContext {
  /** What the room's snapshots cover and what has changed since. */
  readonly ledger: SnapshotLedger
  log(): OperationLog
  layer(id: string): ILayerBuffer | undefined
  hasLayer(id: string): boolean
  setLayer(id: string, buf: ILayerBuffer): void
  /** A layer buffer: persistent with an id, a throwaway scratch without —
   *  see the engine's _makeLayerBuffer. */
  makeLayerBuffer(layerId?: string): ILayerBuffer
  /** An empty layer under this id, unless one is there already. */
  createBuffer(id: string): void
  destroyBuffer(id: string): void
  /** Rebuilds `layerId`'s pixels from `ops` into `buf` — the engine's
   *  _replayInto, which comes back here for a nested merge or duplicate. */
  replayInto(buf: ILayerBuffer, layerId: string, ops: PixelOperation[]): void
  compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void
  takeCheckpoint(layerId: string): void
  /** The layer stack changed shape — see the engine's _invalidateSplitCache. */
  invalidateSplitCache(): void
  displayIfNotSuspended(): void
}

export class StructuralOps {
  private readonly ctx: StructuralOpsContext

  constructor(ctx: StructuralOpsContext) {
    this.ctx = ctx
  }

  /** A merge arriving through appendOperation. */
  execMerge(op: LayerMergeOperation): void {
    // (#374) A merge that a restored snapshot already accounts for still
    // has to happen structurally — the result layer exists, its sources
    // do not — but must not composite anything: the result's pixels came
    // back from the snapshot, and `mergeLive` would replace that
    // buffer with a freshly composited one, discarding them.
    if (this.ctx.ledger.isCovered(op.layerId, op.seq)) this.mergeStructuralOnly(op)
    else this.mergeLive(op)
  }

  /** A duplicate arriving through appendOperation. */
  execDuplicate(op: LayerDuplicateOperation): void {
    // (#449) Same two-way split as execMerge above and for the same
    // reason: the copy's pixels can already have come back from a restored
    // snapshot, and re-copying the source over them would be wrong twice —
    // it discards whatever was painted on the copy after the duplicate, and
    // the source itself has moved on since.
    if (this.ctx.ledger.isCovered(op.layerId, op.seq)) this.duplicateStructuralOnly(op)
    else this.duplicateLive(op)
  }

  /** Replays a merge: rebuilds each source as it was just before the merge
   *  (done ops with lower seq) into a temp buffer and composites bottom→top
   *  with the opacities captured in the operation. Recursive when a source is
   *  itself a merge result. */
  replayMergeInto(buf: ILayerBuffer, op: LayerMergeOperation): void {
    buf.clear()
    for (const src of op.sources) {
      const temp = this.ctx.makeLayerBuffer()
      this.ctx.replayInto(temp, src.id, this.ctx.log().layerPixelOps(src.id, op.seq))
      this.compositeLayerInto(temp, buf, src.opacity)
      temp.destroy()
    }
  }

  /** (#449) Replays a duplicate: rebuilds the source as it was just before the
   *  duplicate (done ops with lower seq) into a temp buffer and copies it in.
   *  Recursive when the source is itself a merge or duplicate result.
   *
   *  Composited at 1, not at the source's opacity: the copy carries that
   *  opacity as its own layer property (see applyContentOp's layer_duplicate
   *  case), so applying it to the pixels as well would show it twice — a copy
   *  of a 50% layer would land at 25%. This is the one place a duplicate
   *  deliberately differs from a merge, which has no layer of its own left to
   *  hold the source opacities and must bake them. */
  replayDuplicateInto(buf: ILayerBuffer, op: LayerDuplicateOperation): void {
    buf.clear()
    const temp = this.ctx.makeLayerBuffer()
    this.ctx.replayInto(temp, op.sourceId, this.ctx.log().layerPixelOps(op.sourceId, op.seq))
    this.compositeLayerInto(temp, buf, 1)
    temp.destroy()
  }

  /** Composites every buffer `source` currently holds into the
   *  corresponding buffer(s) of `dest` at the same world position, at
   *  `opacity` — the tile-generalized form of a single
   *  `compositeTextures([{texture: source.texture, opacity}], dest.fbo)`
   *  call. Bounded mode: source/dest each have exactly one buffer at origin
   *  (0,0), so this reduces to exactly that one call. Infinite mode: each
   *  of source's resident tiles lands on the one dest tile at the same
   *  world position (both use the same TILE_SIZE grid rooted at the same
   *  origin, so tile boundaries always line up — no cross-tile blending
   *  needed here, unlike a transform bake). */
  private compositeLayerInto(source: ILayerBuffer, dest: ILayerBuffer, opacity: number): void {
    for (const src of source.allResident()) {
      const rect: WorldRect = {
        minX: src.originX, minY: src.originY,
        maxX: src.originX + src.buffer.width, maxY: src.originY + src.buffer.height,
      }
      for (const destTarget of dest.resolveForPaint(rect)) {
        this.ctx.compositeTextures(
          [{ texture: src.buffer.texture, opacity }], destTarget.buffer.fbo,
          destTarget.buffer.width, destTarget.buffer.height,
        )
      }
      // (#155 Tier 2) Same grid, same origin (see this method's own doc
      // comment) — src's real content rect lands on dest at the exact same
      // world coordinates, no transform to reason about. null (src tile
      // fully empty) means nothing to mark, same as skipping the composite
      // itself would (the blend above is just a no-op in that case).
      if (src.contentRect) dest.markContentPainted(src.contentRect)
    }
  }

  /** (#374) The structural half of a merge, for one whose pixel result a
   *  restored snapshot already holds.
   *
   *  Deliberately keeps the existing target buffer rather than making a new
   *  one: that buffer is what `restoreLayerFromSnapshot` filled, and it is the
   *  merge's result, arrived by a shorter route. Sources still have to go —
   *  a merge consumes them, and leaving them alive would show every merged
   *  layer twice, once inside the result and once beside it.
   *
   *  No checkpoint is taken: the restore already pinned one holding exactly
   *  these pixels. */
  private mergeStructuralOnly(op: LayerMergeOperation): void {
    const { ctx } = this
    ctx.invalidateSplitCache()
    if (!ctx.hasLayer(op.layerId)) ctx.createBuffer(op.layerId)
    for (const s of op.sources) ctx.destroyBuffer(s.id)
    ctx.displayIfNotSuspended()
  }

  /** Live merge fast path: sources' buffers already hold replay state, so
   *  composite them directly instead of rebuilding. The immediate checkpoint
   *  spares the recursive source rebuild on any later undo above this layer. */
  private mergeLive(op: LayerMergeOperation): void {
    const { ctx } = this
    // #122: sources are destroyed and a new target buffer object takes their
    // place — always structural, regardless of whether any of the ids
    // involved happen to be the active layer.
    ctx.invalidateSplitCache()
    const target = ctx.makeLayerBuffer(op.layerId)
    target.clear()
    for (const s of op.sources) {
      const buf = ctx.layer(s.id)
      if (buf) this.compositeLayerInto(buf, target, s.opacity)
    }
    ctx.setLayer(op.layerId, target)
    ctx.ledger.markDirty(op.layerId)
    for (const s of op.sources) ctx.destroyBuffer(s.id)
    ctx.takeCheckpoint(op.layerId)
    ctx.displayIfNotSuspended()
  }

  /** (#449) The structural half of a duplicate whose pixel result a restored
   *  snapshot already holds — the copy is a layer in its own right by then,
   *  restored like any other, so there is nothing left to copy into it.
   *
   *  Shorter than its merge counterpart because a duplicate consumes nothing:
   *  no sources to destroy, and the source layer is meant to still be there. */
  private duplicateStructuralOnly(op: LayerDuplicateOperation): void {
    const { ctx } = this
    ctx.invalidateSplitCache()
    if (!ctx.hasLayer(op.layerId)) ctx.createBuffer(op.layerId)
    ctx.displayIfNotSuspended()
  }

  /** Live duplicate fast path, the counterpart of mergeLive: the source's
   *  buffer already holds replay state, so copy it directly instead of
   *  rebuilding its whole history into a scratch buffer.
   *
   *  A missing source buffer produces an empty copy rather than a refusal.
   *  Operations apply in true seq order, and the server rejects a duplicate
   *  naming a dead id (rooms.ts's getOperationRejectReason), so the only way to
   *  reach that is a source this client has not built yet — the same condition
   *  every other pixel branch in the engine treats as "skip, the log is the
   *  truth" (see appendOperation's own doc comment).
   *
   *  The immediate checkpoint matters more here than it does for a merge: a
   *  duplicate's replay is a full from-scratch rebuild of *another* layer's
   *  entire history into a temp buffer, which the checkpoint spares every
   *  later undo above this one. */
  private duplicateLive(op: LayerDuplicateOperation): void {
    const { ctx } = this
    ctx.invalidateSplitCache()
    const target = ctx.makeLayerBuffer(op.layerId)
    target.clear()
    const source = ctx.layer(op.sourceId)
    // Opacity 1 — see replayDuplicateInto for why the source's own opacity
    // must not be baked into the pixels here.
    if (source) this.compositeLayerInto(source, target, 1)
    ctx.setLayer(op.layerId, target)
    ctx.ledger.markDirty(op.layerId)
    ctx.takeCheckpoint(op.layerId)
    ctx.displayIfNotSuspended()
  }
}
