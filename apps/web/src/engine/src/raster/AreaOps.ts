// (#494) Layer transform, selection, paste and fill, out of PencilEngine —
// the first seam of its decomposition that carries real behaviour (seam С19
// of the survey). Everything here is a pixel operation on one layer's tiles:
// the engine's two dispatchers hand it `(buffer, op)` and it bakes, and the
// public API's preview/readback methods are one-line delegates to it.
//
// It never sees the engine itself, only AreaOpsContext below: the GL context,
// the resampling blits, the layers, the room's grid and a few services from
// the composite and export paths. Store and DOM stay out, as everywhere in
// the engine — encoding a PNG goes through the context.

import type {
  AreaFillOperation, AreaPasteOperation, FillSourceMode, ImageImportOperation, LayerTransformMatrix, SelectionShape,
} from '@grafetto/shared'
import { toHomography } from '@grafetto/shared'
import { AccumulationBuffer } from '../buffers/AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from '../buffers/ILayerBuffer'
import { ScratchFreeList } from '../buffers/scratchPools'
import { TiledLayerBuffer } from '../buffers/TiledLayerBuffer'
import { tileWorldRect, tilesOverlappingRect, type WorldRect } from '../buffers/tileMath'
import type { BlitPasses, MaskTexture } from './blitPasses'
import { computeFill, coverageToRgba, FILL_MAX_DIM } from './floodFill'
import { tileBufferAt, type LayerPreviews, type PreviewTile } from './layerPreviews'
import { applyMatrix, composeMatrix, invertMatrix, translationMatrix, type Matrix3 } from './matrix'
import { buildSelectionMask } from './selectionMask'

/** (#446) A copied selection: the pixels, and where on the canvas they were.
 *  Shaped to drop straight into an `area_paste` operation — paste in place is
 *  the default (ADR 008), so the rect travels with the raster rather than
 *  being recomputed from wherever the camera happens to be. */
export interface AreaImage {
  image: string
  x: number
  y: number
  width: number
  height: number
}

/** (#453) What the caller asks a fill for. Coordinates are layer space (canvas
 *  pixels for a bounded room, world units for an infinite one), the same space
 *  `Dab.x/y` and `SelectionShape.points` already use; `color` is 0–1 per
 *  channel like every other tool colour. */
export interface AreaFillRequest {
  layerId: string
  seedX: number
  seedY: number
  color: [number, number, number]
  /** 0–1. How far from the tapped pixel still counts as the same area. */
  tolerance: number
  /** 0–3 px of gap closing — see floodFill.ts. */
  gapClose: number
  /** 0–3 px the paint creeps under the line it stopped at. */
  expand: number
  /** Read boundaries from the target layer alone, or from the composite of
   *  every visible layer (paint still lands only in the target). */
  source: FillSourceMode
}

/** (#453) A computed fill: the raster and where it goes, shaped to drop
 *  straight into an `AreaFillOperation`. */
export type AreaFillRaster = AreaImage

/** (#453) How far past the outermost mark an infinite room's fill domain
 *  reaches. Enough that paint can spread around a drawing rather than stopping
 *  on its bounding box, small enough that it does not meaningfully grow the
 *  readback. */
const INFINITE_FILL_MARGIN = 256

/** Straight-alpha copy of premultiplied RGBA8 bytes. Layer buffers store
 *  colour premultiplied by coverage; PNG (and `<img>` decoding on the way back
 *  in) is straight alpha. Skipping this on the way out darkens every partly
 *  transparent pixel, which for a copied selection is precisely its
 *  antialiased rim — a dark outline that appears on paste and nowhere else. */
function unpremultiply(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.length)
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3]
    out[i + 3] = a
    if (a === 0) continue
    // Rounded, and clamped because a premultiplied buffer can hold rgb
    // marginally above its own alpha after repeated blending.
    out[i] = Math.min(255, Math.round(pixels[i] * 255 / a))
    out[i + 1] = Math.min(255, Math.round(pixels[i + 1] * 255 / a))
    out[i + 2] = Math.min(255, Math.round(pixels[i + 2] * 255 / a))
  }
  return out
}

/** One layer of what a fill reads — the engine's CompositeItem. */
interface SourceLayer {
  id: string
  opacity: number
}

/** What AreaOps may ask of the engine. Narrow on purpose: every entry is
 *  something the moved code already reached for, and nothing else. */
export interface AreaOpsContext {
  readonly gl: WebGLRenderingContext
  /** Whether the room has no sheet — decides a fill's domain. Fixed at
   *  construction, like the room itself. */
  readonly infinite: boolean
  /** The floating previews the composite draws in place of real tiles. */
  readonly previews: LayerPreviews
  /** A function, not a value: _initGL builds a fresh BlitPasses on every
   *  context restore, and AreaOps outlives it. */
  passes(): BlitPasses
  layer(id: string): ILayerBuffer | undefined
  /** A decoded image from the engine's cache, keyed by its data URL. */
  image(src: string): HTMLImageElement | undefined
  /** The room's tile grid — see the engine's _tileSize. */
  tileSize(): { w: number; h: number }
  /** The sheet's size — see the engine's _pageSize. */
  pageSize(): { w: number; h: number }
  /** What the screen composites, bottom to top — see _displayOrder. */
  displayOrder(): SourceLayer[]
  /** The sheet's colour, 0–1 per channel: what a fill treats as blank. */
  paperColor(): [number, number, number]
  compositeTextures(
    items: Array<{ texture: WebGLTexture; opacity: number }>,
    targetFbo: WebGLFramebuffer, targetW: number, targetH: number,
  ): void
  /** Premultiplied or not, GL row order (bottom-up) in, a PNG data URL out;
   *  null when the browser would not encode it. */
  encodePng(pixels: Uint8Array, width: number, height: number): Promise<string | null>
  /** Show the current state now. */
  display(): void
}

/** An `area_paste` in `image_import` clothing. Paste and import differ in
 *  where the pixels come from and what they are allowed to land on — not in
 *  how a straight-alpha raster becomes premultiplied layer content, nor in
 *  what has to happen when its decode finishes after the operations behind
 *  it were already applied. So the whole decoded/undecoded/late-arrival
 *  dance (#398: ImageImport.paintDecoded/paint, the engine's _settleLateImage) is
 *  reused as-is rather than reimplemented for a second raster operation.
 *
 *  Placement rides the `x`/`y` fields image_import added for infinite rooms:
 *  present means "natural size at this world position", which is exactly
 *  what paste-in-place means. */
export function asImportRecord(op: AreaPasteOperation | AreaFillOperation): ImageImportOperation {
  return {
    id: op.id, userId: op.userId, timestamp: op.timestamp, seq: op.seq,
    type: 'image_import', layerId: op.layerId, image: op.image,
    x: op.x, y: op.y, width: op.width, height: op.height,
  }
}

export class AreaOps {
  private readonly gl: WebGLRenderingContext
  private readonly ctx: AreaOpsContext

  // (#155) Scratch buffers for bakeLayerTransform's per-destination-tile
  // pass — unlike the engine's _tipBufPool/_previewBufPool (always exactly
  // one buffer, canvas-sized), a single bake can need many alive at once (one per destination
  // tile, see bakeLayerTransform's own docstring on why they can't be freed
  // until every one has finished rendering). Kept as a size-keyed free list
  // instead: idle between commits, reused instead of reallocated (and
  // re-paying _makeFBO's checkFramebufferStatus GPU sync) on the next one.
  // Every tile a single bake touches is the same size (a room's tile grid
  // never changes shape after construction — see _tileSize), so in practice
  // this settles into a pool of uniformly-sized buffers after the first bake.
  private readonly scratchPool: ScratchFreeList<AccumulationBuffer>

  // (#446) The one uploaded selection mask, cached by the identity of the
  // selection it was built from — see acquireMask.
  private maskCache: { selection: SelectionShape; mask: MaskTexture } | null = null

  constructor(ctx: AreaOpsContext) {
    this.ctx = ctx
    this.gl = ctx.gl
    const { gl } = ctx
    this.scratchPool = new ScratchFreeList((w, h) => new AccumulationBuffer(gl, w, h))
  }

  /** Context loss: every GL object held here is already dead. */
  forget(): void {
    this.scratchPool.forget() // (#155) pooled GL objects are dead too, not worth destroy()ing
    // (#446) The mask texture died with the context. Dropping the cache entry
    // rather than deleting the texture is the point: deleting a name from a
    // lost context is meaningless, and *keeping* the entry would hand the
    // first selection gesture after the restore a texture that no longer
    // exists.
    this.maskCache = null
  }

  destroy(): void {
    this.scratchPool.destroy()
    this.releaseMask()
  }

  // (#155) scratchPool's acquire/release pair — see the field's
  // own comment for why this is a free list rather than a single slot.
  private acquireScratch(width: number, height: number): AccumulationBuffer {
    return this.scratchPool.acquire(width, height)
  }

  private releaseScratch(buf: AccumulationBuffer): void {
    this.scratchPool.release(buf)
  }

  /** Live gizmo-drag preview (#120) — renders each entry's *current* layer
   *  content through the requested transform into one or more scratch tiles
   *  that _drawCompositeItem substitutes in for the real one, called on
   *  every drag frame. Never touches the real layer buffer — the actual
   *  bake only happens once via a real `layer_transform` op through
   *  appendOperation (see clearLayerTransformPreview, which the caller must
   *  call right after committing that op, so the now-stale preview doesn't
   *  keep shadowing the freshly baked real buffer).
   *
   *  #139: generalized to multiple source/destination tiles — same shape as
   *  bakeLayerTransform (read its docstring first): resolve the transformed
   *  content's world bounds from every source tile's corners, then stitch
   *  each overlapping destination tile from every overlapping source tile,
   *  one alpha-blended BlitPasses.transform pass per pair.
   *
   *  #142: every room (bounded or infinite) is backed by TiledLayerBuffer
   *  now, so this is the same code path for both — a bounded layer just
   *  usually has fewer resident tiles (often exactly one, for a canvas
   *  smaller than TILE_SIZE in both dimensions) rather than a structurally
   *  different single-buffer type. Dragging a bounded layer's content past
   *  its visible canvas edge previews (and, on release, actually bakes)
   *  correctly into whichever tile it now covers, the same #133 guarantee
   *  infinite rooms already had — nothing is silently clipped.
   *
   *  Two differences from the real bake, both because this is a
   *  non-destructive per-frame preview rather than a one-shot commit:
   *  destination tiles are plain scratch AccumulationBuffers computed
   *  straight from tileMath, never layerBuf.resolveForPaint() (which would
   *  create real, permanent tiles on the *actual* layer just from a preview
   *  reading it — leaking empty tiles into the layer's real tile map on
   *  every drag frame, including ones the drag never ends up committing);
   *  and there's no swap-into-the-real-tile second phase — the scratch tile
   *  *is* the whole result, read directly by _drawCompositeItem. */
  /** #142-follow-up perf fix: this runs on every single pointermove during a
   *  gizmo drag — often well over 60/s, especially on a pen/touch
   *  digitizer. The tile SET a drag touches is almost always identical
   *  frame-to-frame (you only cross a tile boundary occasionally), so
   *  destroying and recreating every scratch AccumulationBuffer (a real GPU
   *  texture + framebuffer allocation, up to a full page's worth of bytes
   *  for a bounded room — see _tileSize) on *every* frame, as this used to,
   *  was the actual cause of the severe drag-stutter/hang reported testing
   *  on a Surface: GPU alloc/dealloc churn at pointer-event frequency.
   *  Instead this now keys the previous frame's tiles by world origin and
   *  reuses (just gl.clear()s) any buffer whose tile is still needed this
   *  frame — only genuinely new/vacated tiles allocate or free anything,
   *  which is the rare case, not the every-frame one. */
  previewLayerTransform(transforms: Array<{ layerId: string; matrix: LayerTransformMatrix }>): void {
    for (const { layerId, matrix: wireMatrix } of transforms) {
      // (#392) The one widening, at the boundary — see LayerTransformMatrix's
      // docstring in packages/shared for why no consumer branches on length.
      const matrix = toHomography(wireMatrix)
      const source = this.ctx.layer(layerId)
      if (!source) continue
      const sourceTiles = source.allResident()
      const oldByOrigin = new Map(
        (this.ctx.previews.tiles.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
      )

      if (!sourceTiles.length) {
        // Nothing to preview (e.g. an empty layer) — drop any stale tiles
        // from a previous frame rather than leaving them showing.
        for (const t of oldByOrigin.values()) t.buffer.destroy()
        this.ctx.previews.tiles.delete(layerId)
        continue
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      // (#155 Tier 2) Each source tile's own transformed world-space AABB —
      // see bakeLayerTransform's identical precompute (and its doc comment on
      // why this now uses each tile's real tracked contentRect, not its
      // whole tileW x tileH extent) for the full reasoning; must stay in
      // lockstep with it for the live preview to stay pixel-identical to
      // what committing the drag will actually bake (reused below to skip
      // (dest, src) pairs that can't overlap; this method runs every
      // animation frame for the whole duration of a live drag, so avoiding
      // that O(destTiles x sourceTiles) waste matters even more here).
      const srcRects: Array<WorldRect | null> = []
      for (const { contentRect } of sourceTiles) {
        if (!contentRect) { srcRects.push(null); continue }
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
        const corners: Array<[number, number]> = [
          [contentRect.minX, contentRect.minY], [contentRect.maxX, contentRect.minY],
          [contentRect.minX, contentRect.maxY], [contentRect.maxX, contentRect.maxY],
        ]
        for (const [x, y] of corners) {
          const [tx, ty] = applyMatrix(matrix, x, y)
          minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
          minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
          sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
          sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
        }
        srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
      }

      if (maxX <= minX || maxY <= minY || !Number.isFinite(minX + minY + maxX + maxY)) {
        // Degenerate (zero-scale transform, or every source tile empty) —
        // content collapses to nothing, same as bakeLayerTransform's own
        // degenerate-transform branch. The finiteness half is (#392): a
        // homography sends the vanishing line to infinity, so a corner landing
        // on it makes these bounds Infinity/NaN, and an infinite rect handed
        // to tilesOverlappingRect below is not a wrong picture but a hang.
        // Room never builds such a matrix (isFrameInFront), so this only
        // guards a replayed op from somewhere else.
        for (const t of oldByOrigin.values()) t.buffer.destroy()
        this.ctx.previews.tiles.delete(layerId)
        continue
      }

      // #142: every room is tile-backed now, so this always resolves
      // whichever tiles the transformed content actually lands in — a
      // bounded room's live preview can show content dragged past its
      // visible canvas edge just like the real bake (bakeLayerTransform)
      // already could, instead of only ever previewing a single canvas-
      // sized destination rect. Must use this room's own tile size (see
      // _tileSize) — the default (TILE_SIZE) is only correct for infinite
      // rooms; a bounded room's tiles are its own canvas size.
      const { w: tw, h: th } = this.ctx.tileSize()
      const destRects: WorldRect[] =
        tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)
          .map(({ tileX, tileY }) => tileWorldRect(tileX, tileY, tw, th))

      const matrixInv = invertMatrix(matrix)
      const tiles: PreviewTile[] = []
      const reused = new Set<string>()
      for (const rect of destRects) {
        const dw = rect.maxX - rect.minX
        const dh = rect.maxY - rect.minY
        const key = `${rect.minX},${rect.minY}`
        const old = oldByOrigin.get(key)
        // Same tile size is guaranteed for every reused key: a room's tile
        // grid (_tileSize) never changes after construction, so an origin
        // that existed last frame always had — and still needs — the same
        // dw/dh here.
        const scratch = old ? old.buffer : new AccumulationBuffer(this.gl, dw, dh)
        scratch.clear()
        if (old) reused.add(key)
        sourceTiles.forEach((srcTile, i) => {
          // (#155) Skip pairs whose transformed bounding boxes don't
          // overlap at all (including a source with no real content,
          // srcRects[i] === null) — see bakeLayerTransform's identical check
          // for why.
          const r = srcRects[i]
          if (!r || r.maxX <= rect.minX || r.minX >= rect.maxX || r.maxY <= rect.minY || r.minY >= rect.maxY) return
          // dest-tile-local -> world (rect's own origin) -> source world
          // (the transform's inverse) -> src-tile-local (srcTile's own
          // origin) — exactly bakeLayerTransform's own composition; see there.
          const toWorld = translationMatrix(rect.minX, rect.minY)
          const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
          const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
          this.ctx.passes().transform(srcTile.buffer, mc, dw, dh, scratch.fbo, 'add')
        })
        tiles.push({ originX: rect.minX, originY: rect.minY, buffer: scratch })
      }
      // Anything from last frame that isn't part of this frame's tile set
      // (a real, occasional event — the drag crossed a tile boundary) is
      // genuinely done and must still be freed.
      for (const [key, t] of oldByOrigin) {
        if (!reused.has(key)) t.buffer.destroy()
      }
      this.ctx.previews.tiles.set(layerId, tiles)
    }
    this.ctx.display()
  }

  /** Ends a gizmo-drag preview — on commit (a real op just landed and
   *  rebuilt the actual buffers) or on cancel (e.g. Escape, switching tools
   *  mid-drag without releasing). */
  clearLayerTransformPreview(): void {
    this.ctx.previews.clear()
    this.ctx.display()
  }

  /** Bakes a transform into a layer's content, in place (#133 fix) —
   *  destination tiles are resolved from the *transformed* content's world
   *  bounds and created on demand, so content moved/scaled past wherever
   *  its old tile(s) ended is never clipped the way a single fixed-size
   *  buffer would clip it — it simply lands on whichever tile(s) now cover
   *  it. Bounded mode (single tile at origin (0,0), both before and after)
   *  reduces to exactly the old single-buffer bake.
   *
   *  Two-phase to stay WebGL1-safe (can't read and write the same texture
   *  in one draw call, same reasoning AccumulationBuffer.copyTo's read-
   *  into-temp-then-copy pattern exists for — see StructuralOps.mergeLive/
   *  replayMergeInto): every destination tile that overlaps at least one
   *  source tile's transformed bounds is rendered into its own fresh scratch
   *  buffer first, reading only from the untouched original source tiles
   *  (one pass per overlapping source tile, alpha-blended — see
   *  BlitPasses.transform — since a destination tile's content can come from
   *  more than one source tile when the transform includes rotation/scale);
   *  only once every scratch is fully rendered are the original source tiles
   *  cleared and the scratches copied into their real destination tiles
   *  (which can safely be the very same tile objects — the scratch render
   *  already finished reading from them by then). A vacated source tile
   *  stays resident-but-empty rather than being dropped from the tile map —
   *  #155 tried dropping provably-empty tiles here to bound resident count
   *  for a room dragged across a wide area, but reverted it: resolveForPaint
   *  resolves destinations from each source tile's *whole* tileW x tileH
   *  extent rather than its real content, so a realistic non-tile-aligned
   *  drag already spills into several tiles nothing was ever painted on —
   *  dropping only genuinely-empty ones barely reduced growth in practice,
   *  and interacted badly with #144's own eviction/recovery replay cost once
   *  a repeated-drag session crossed the eviction budget. Bounding this for
   *  real needs resolveForPaint (or bakeLayerTransform's own bounds math) to
   *  work from real content, not full-tile extent — left as a follow-up. */
  bakeLayerTransform(layerBuf: ILayerBuffer, wireMatrix: LayerTransformMatrix): void {
    // (#392) Widened here, once, for the same reason previewLayerTransform
    // does it: the two must stay pixel-identical, and a bake that read the
    // six-number form differently from the preview would show one thing during
    // the drag and another after it.
    const matrix = toHomography(wireMatrix)
    const sourceTiles = layerBuf.allResident()
    if (!sourceTiles.length) return

    // (#155) Suspended for the whole bake, same hazard and same fix as
    // _replayInto's own suspendEviction (see its doc comment): resolveForPaint
    // below can create several new destination tiles in one call, pushing
    // this layer's resident count over budget mid-bake — without suspending,
    // its own evictIfOverBudget could then destroy a tile still captured in
    // `sourceTiles` above, moments before the blit loop reads
    // srcTile.buffer.texture from it (a real, reproducible "attempt to use a
    // deleted object" GPU error → silently-wrong/missing pixels, not a
    // thrown exception, so it fails silently rather than loudly). Swept once
    // at the end against the final, settled tile count instead.
    const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
    tiled?.suspendEviction()
    try {
      this.bakeTransformUnsuspended(layerBuf, matrix, sourceTiles)
    } finally {
      tiled?.resumeEviction()
    }
  }

  private bakeTransformUnsuspended(layerBuf: ILayerBuffer, matrix: Matrix3, sourceTiles: PaintTarget[]): void {
    // (#155 Tier 2) Every source tile's buffer is unconditionally cleared at
    // the end of this method (see below) regardless of whether it ends up
    // rewritten as a destination — reset tracked content up front so it
    // can never fall out of sync with that real GPU clear. `contentRect`
    // was already captured above (in `sourceTiles`, from allResident()) at
    // this call's start, so resetting the live tracking now doesn't affect
    // the srcRects computation just below. Any tile that *does* end up a
    // destination gets its real post-bake content re-established via
    // markContentPainted further down, layered on top of this empty
    // baseline.
    for (const s of sourceTiles) layerBuf.clearContentAt(s.originX, s.originY)

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    // (#155 Tier 2) Each source tile's own transformed world-space AABB,
    // computed once here alongside the overall bounding box below — reused
    // in the destTargets loop to skip (dest, src) pairs that can't possibly
    // overlap, instead of unconditionally blitting every combination. Built
    // from each source's *real tracked content* (contentRect), not its
    // whole tileW x tileH extent — a tile that's been fully vacated by an
    // earlier bake (contentRect null) contributes nothing here and is
    // skipped entirely (srcRects[i] stays null), rather than forever
    // dragging the overall bounds (and therefore resident tile footprint)
    // wider on every subsequent drag — see bakeLayerTransform's own docstring
    // for the growing-footprint bug this fixes.
    const srcRects: Array<WorldRect | null> = []
    for (const { contentRect } of sourceTiles) {
      if (!contentRect) { srcRects.push(null); continue }
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity
      const corners: Array<[number, number]> = [
        [contentRect.minX, contentRect.minY], [contentRect.maxX, contentRect.minY],
        [contentRect.minX, contentRect.maxY], [contentRect.maxX, contentRect.maxY],
      ]
      for (const [x, y] of corners) {
        const [tx, ty] = applyMatrix(matrix, x, y)
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
        sMinX = Math.min(sMinX, tx); sMaxX = Math.max(sMaxX, tx)
        sMinY = Math.min(sMinY, ty); sMaxY = Math.max(sMaxY, ty)
      }
      srcRects.push({ minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY })
    }
    if (maxX <= minX || maxY <= minY || !Number.isFinite(minX + minY + maxX + maxY)) {
      // Degenerate (zero-scale transform, or every source tile empty) —
      // content collapses to nothing. See previewLayerTransform's identical
      // check for why non-finite bounds are refused here too (#392).
      for (const s of sourceTiles) s.buffer.clear()
      return
    }

    const destTargets = layerBuf.resolveForPaint({ minX, minY, maxX, maxY })
    const matrixInv = invertMatrix(matrix)
    const scratches: Array<{ target: PaintTarget; scratch: AccumulationBuffer }> = []
    for (const destTarget of destTargets) {
      const destMinX = destTarget.originX, destMinY = destTarget.originY
      const destMaxX = destMinX + destTarget.buffer.width, destMaxY = destMinY + destTarget.buffer.height
      // (#155) resolveForPaint resolves every tile touching the *union* of
      // every source tile's own real-content transformed bounds — for a
      // scale/rotate that union can span tiles no individual source tile's
      // content ever actually reaches (its own transformed rect just
      // happens to pass near, not through, that particular cell). Checking
      // for any overlap at all before acquiring a scratch, rather than after
      // finding none of the per-tile blits below fired, means a destination
      // like that never gets a scratch (or a wasted GPU copy) in the first
      // place — it's already a blank tile fresh out of resolveForPaint, so
      // skipping straight past it leaves it exactly as correct as copying an
      // all-transparent scratch onto it would have.
      if (!srcRects.some(r => r && !(r.maxX <= destMinX || r.minX >= destMaxX || r.maxY <= destMinY || r.minY >= destMaxY))) continue
      // (#155) Pooled rather than `new AccumulationBuffer` + destroy() every
      // commit — see scratchPool's own comment. A bake that
      // touches N tiles otherwise pays N fresh _makeFBO calls (each a real
      // checkFramebufferStatus GPU sync) on every single commit, which
      // dominated an 8s pointerup INP on a room with ~20 resident tiles.
      const scratch = this.acquireScratch(destTarget.buffer.width, destTarget.buffer.height)
      scratch.clear()
      sourceTiles.forEach((srcTile, i) => {
        // (#155) Skip pairs whose transformed bounding boxes don't overlap
        // at all (including a source with no real content, srcRects[i] ===
        // null) — TRANSFORM_BLIT_FRAG would just sample out-of-[0,1] UV and
        // draw fully transparent for every fragment in that case, so the
        // blit call itself is pure waste. Left unconditional, this is
        // O(destTiles x sourceTiles) real GPU draw calls every bake — fine
        // for a fresh layer (usually 1 tile each side) but blows up as a
        // room accumulates more resident tiles from repeated far-off drags:
        // measured a 5.6s `pointerup` INP from exactly this (see #155).
        const r = srcRects[i]
        if (!r || r.maxX <= destMinX || r.minX >= destMaxX || r.maxY <= destMinY || r.minY >= destMaxY) return
        // dest-tile-local -> world (destTarget's own origin) -> source
        // world (the transform's inverse) -> src-tile-local (srcTile's own
        // origin). Bounded mode: both origins are (0,0), so this reduces to
        // exactly matrixInv, unchanged from before this was generalized.
        const toWorld = translationMatrix(destTarget.originX, destTarget.originY)
        const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
        const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
        this.ctx.passes().transform(
          srcTile.buffer, mc, destTarget.buffer.width, destTarget.buffer.height, scratch.fbo, 'add',
        )
        // (#155 Tier 2) The real content this pair just contributed to
        // destTarget is exactly r (the source's transformed content AABB)
        // intersected with destTarget's own world rect — mark it so
        // getContentBounds() reflects reality without ever reading pixels
        // back. Unioned across every contributing source (markContentPainted
        // is monotonic), so call order/count doesn't matter.
        layerBuf.markContentPainted({
          minX: Math.max(r.minX, destMinX), minY: Math.max(r.minY, destMinY),
          maxX: Math.min(r.maxX, destMaxX), maxY: Math.min(r.maxY, destMaxY),
        })
      })
      scratches.push({ target: destTarget, scratch })
    }

    // (#155 follow-up: dropTile was tried here and reverted — see its own
    // removal note below the class for why) — every source tile is cleared
    // once every scratch has finished reading from it, same as before this
    // whole optimization pass; a tile that's *also* a destination target
    // gets fully overwritten by scratch.copyTo right after anyway (a full
    // replace, not a blend), so clearing it first is harmless, just as it
    // always was.
    for (const s of sourceTiles) s.buffer.clear()
    for (const { target, scratch } of scratches) {
      scratch.copyTo(target.buffer)
      this.releaseScratch(scratch)
    }
  }

  // ─── Selection (#446) ────────────────────────────────────────────────────────

  /** Uploads a selection's coverage mask (selectionMask.ts) as an ALPHA
   *  texture, with a one-entry cache keyed by the *identity* of the selection
   *  object.
   *
   *  The cache is what makes a gizmo drag affordable: previewAreaTransform
   *  runs on every pointer move, the selection does not change during a drag,
   *  and rasterizing a canvas-sized lasso is milliseconds of CPU that would
   *  otherwise be spent per frame. Room holds the selection in the store, so
   *  every frame of one drag really does pass the same object; a replayed
   *  operation brings its own, which correctly misses and is released as soon
   *  as the next caller arrives.
   *
   *  Null when the selection has no inside (a tap, a zero-width drag) — every
   *  caller treats that as "nothing to do" rather than as an error, which is
   *  also what makes a stray tap with the selection tool harmless. */
  private acquireMask(selection: SelectionShape): MaskTexture | null {
    if (this.maskCache && this.maskCache.selection === selection) return this.maskCache.mask
    this.releaseMask()
    const built = buildSelectionMask(selection)
    if (!built) return null

    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // Rows are single-byte and the width is whatever the selection happened to
    // be, so the default 4-byte row alignment would shear every mask whose
    // width isn't a multiple of four — a diagonal tear that looks like a
    // rasterizer bug and isn't one.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.ALPHA, built.width, built.height, 0, gl.ALPHA, gl.UNSIGNED_BYTE, built.data,
    )
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const mask: MaskTexture = { tex, rect: built.rect }
    this.maskCache = { selection, mask }
    return mask
  }

  private releaseMask(): void {
    if (!this.maskCache) return
    this.gl.deleteTexture(this.maskCache.mask.tex)
    this.maskCache = null
  }

  /** The whole of an `area_transform`, rendered into scratch tiles — shared
   *  verbatim by the live drag preview and the committed bake, which is the
   *  point: what you see while dragging and what lands when you let go are
   *  the same pixels because they are the same code, not two implementations
   *  kept in step by hand (the failure #392 called out for the whole-layer
   *  path).
   *
   *  Each scratch is one tile of the layer's own grid, holding that tile as it
   *  will look afterwards: its current content, minus the selection (the hole
   *  the lift leaves), plus whatever part of the lifted region lands in it.
   *  Tiles that neither region touches are not built at all — the caller draws
   *  them from the real layer.
   *
   *  Every read happens before any write: the scratches are computed from the
   *  untouched layer, and only the bake copies them back afterwards. Same
   *  two-phase shape as bakeTransformUnsuspended, and for the same WebGL1
   *  reason — a texture cannot be read and written in one draw. */
  private composeAreaTiles(
    layerBuf: ILayerBuffer, mask: MaskTexture, matrix: Matrix3,
    tileRects: WorldRect[], acquire: (w: number, h: number) => AccumulationBuffer,
  ): Array<{ rect: WorldRect; scratch: AccumulationBuffer }> {
    const src = mask.rect
    const corners: Array<[number, number]> = [
      [src.minX, src.minY], [src.maxX, src.minY], [src.minX, src.maxY], [src.maxX, src.maxY],
    ]
    let dstMinX = Infinity, dstMinY = Infinity, dstMaxX = -Infinity, dstMaxY = -Infinity
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      dstMinX = Math.min(dstMinX, tx); dstMaxX = Math.max(dstMaxX, tx)
      dstMinY = Math.min(dstMinY, ty); dstMaxY = Math.max(dstMaxY, ty)
    }
    // A degenerate or projectively-inverted matrix collapses the selection to
    // nothing — the lift still happens (the hole is real), only nothing lands.
    // Same reasoning as bakeLayerTransform's own degenerate branch, including the
    // finiteness half (#392: a homography can send a corner to infinity, and
    // an infinite rect is a hang, not a wrong picture).
    const lands = Number.isFinite(dstMinX + dstMinY + dstMaxX + dstMaxY) && dstMaxX > dstMinX && dstMaxY > dstMinY
    const dst = { minX: dstMinX, minY: dstMinY, maxX: dstMaxX, maxY: dstMaxY }

    // Read-only: the source tiles the selection actually covers. Never
    // resolveForPaint — lifting reads, and a read must not create tiles.
    const sourceTiles = layerBuf.resolveVisible(src)
    const matrixInv = invertMatrix(matrix)
    const out: Array<{ rect: WorldRect; scratch: AccumulationBuffer }> = []

    for (const rect of tileRects) {
      const overlapsSrc = !(src.maxX <= rect.minX || src.minX >= rect.maxX || src.maxY <= rect.minY || src.minY >= rect.maxY)
      const overlapsDst = lands
        && !(dst.maxX <= rect.minX || dst.minX >= rect.maxX || dst.maxY <= rect.minY || dst.minY >= rect.maxY)
      if (!overlapsSrc && !overlapsDst) continue

      const w = rect.maxX - rect.minX
      const h = rect.maxY - rect.minY
      const scratch = acquire(w, h)
      const existing = tileBufferAt(layerBuf, rect)
      if (existing) existing.copyTo(scratch)
      else scratch.clear()

      if (overlapsSrc) this.ctx.passes().areaMask(scratch, rect.minX, rect.minY, mask, 'erase')
      if (overlapsDst) {
        // (#507) A selection lying inside one tile can be drawn straight onto
        // that tile's remaining content. A selection spanning several cannot:
        // along each source-tile boundary every pass carries only its own
        // share of one bilinear kernel (see TILE_BILINEAR in shaders.ts), and
        // those shares have to sum before anything is composited — "over"
        // against a destination that already holds the layer scales each
        // share by the previous one's coverage and leaves a hairline through
        // the lifted piece. So the piece is accumulated on its own,
        // transparent, and laid down in one pass.
        //
        // Pooled through this class's own scratch pool rather than the
        // caller's `acquire`: this buffer never leaves this method, and the
        // preview's acquire deliberately allocates fresh every time (see its
        // own comment there).
        const lift = sourceTiles.length > 1 ? this.acquireScratch(w, h) : null
        lift?.clear()
        for (const srcTile of sourceTiles) {
          const toWorld = translationMatrix(rect.minX, rect.minY)
          const toSrcLocal = translationMatrix(-srcTile.originX, -srcTile.originY)
          const mc = composeMatrix(toSrcLocal, composeMatrix(matrixInv, toWorld))
          this.ctx.passes().areaTransform(
            srcTile.buffer, srcTile.originX, srcTile.originY, mc, mask,
            w, h, lift ? lift.fbo : scratch.fbo, lift ? 'add' : 'over',
          )
        }
        if (lift) {
          this.ctx.compositeTextures([{ texture: lift.texture, opacity: 1 }], scratch.fbo, w, h)
          this.releaseScratch(lift)
        }
      }
      out.push({ rect, scratch })
    }
    return out
  }

  /** Every tile of this room's grid that the selection, or where it is going,
   *  touches. */
  private areaTileRects(mask: MaskTexture, matrix: Matrix3): WorldRect[] {
    const { w: tw, h: th } = this.ctx.tileSize()
    const r = mask.rect
    const corners: Array<[number, number]> = [
      [r.minX, r.minY], [r.maxX, r.minY], [r.minX, r.maxY], [r.maxX, r.maxY],
    ]
    let minX = r.minX, minY = r.minY, maxX = r.maxX, maxY = r.maxY
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      if (Number.isFinite(tx) && Number.isFinite(ty)) {
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
      }
    }
    return tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)
      .map(({ tileX, tileY }) => tileWorldRect(tileX, tileY, tw, th))
  }

  /** Bakes an `area_transform` into a layer for real. Mirrors bakeLayerTransform's
   *  eviction suspension for the same reason: resolveForPaint below can create
   *  several tiles at once and push this layer over its resident budget
   *  mid-bake, and an eviction firing then could destroy a tile the blit loop
   *  is still reading from — a silent GPU error, not a thrown one. */
  bakeAreaTransform(layerBuf: ILayerBuffer, selection: SelectionShape, wireMatrix: LayerTransformMatrix): void {
    const mask = this.acquireMask(selection)
    if (!mask) return
    const matrix = toHomography(wireMatrix)
    const tiled = layerBuf instanceof TiledLayerBuffer ? layerBuf : null
    tiled?.suspendEviction()
    try {
      const rects = this.areaTileRects(mask, matrix)
      // resolveForPaint per rect rather than once over the union: the union of
      // "where it was" and "where it went" can cover tiles neither region
      // actually reaches (a long diagonal drag), and creating those would leak
      // permanently empty tiles into the layer.
      for (const rect of rects) layerBuf.resolveForPaint(rect)
      const composed = this.composeAreaTiles(
        layerBuf, mask, matrix, rects, (w, h) => this.acquireScratch(w, h),
      )
      for (const { rect, scratch } of composed) {
        const target = tileBufferAt(layerBuf, rect)
        if (target) {
          scratch.copyTo(target)
          // Conservative, like every other tracker update here: the moved
          // content's own AABB clipped to this tile. The hole the lift leaves
          // is deliberately not subtracted — markContentPainted only ever
          // grows, and tightenContentRects (#421) is what corrects it, on the
          // transform gizmo's own schedule.
          layerBuf.markContentPainted(rect)
        }
        this.releaseScratch(scratch)
      }
    } finally {
      tiled?.resumeEviction()
    }
  }

  /** `area_clear`: erases the selection from a layer, touching only the tiles
   *  it covers. No scratch and no two-phase dance — nothing is read from the
   *  layer here, every pixel is multiplied in place.
   *
   *  (#503) resolveExistingForPaint, not resolveVisible: this writes. It used
   *  to reach for the read resolver — correct about not creating tiles, wrong
   *  about saying nothing — so the erase landed on the fine tiles and no
   *  coarse level ever heard about it. The layer went on showing the erased
   *  content at every zoom that draws from a level. */
  clearArea(layerBuf: ILayerBuffer, selection: SelectionShape): void {
    const mask = this.acquireMask(selection)
    if (!mask) return
    for (const target of layerBuf.resolveExistingForPaint(mask.rect)) {
      this.ctx.passes().areaMask(target.buffer, target.originX, target.originY, mask, 'erase')
    }
  }

  /** Draws a decoded raster into `target` — whose world origin is
   *  (originX, originY) — placed at `rect` and then moved by `matrix`.
   *
   *  Two passes rather than one, and the intermediate buffer is the reason:
   *  the image arrives with straight alpha and everything downstream works in
   *  premultiplied, so it goes through IMAGE_BLIT_FRAG (which premultiplies)
   *  into a scratch the size of its own rect, and only then through the
   *  ordinary transform blit, which resamples premultiplied content correctly.
   *  Sampling the raw image through the transform blit directly would blend
   *  straight-alpha texels at every filtered edge — a dark rim around
   *  everything pasted, which is precisely what un-premultiplied filtering
   *  looks like. */
  drawImageThroughMatrix(
    target: AccumulationBuffer, originX: number, originY: number,
    img: HTMLImageElement, rect: { x: number; y: number; width: number; height: number },
    matrix: Matrix3,
  ): void {
    const { gl } = this
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    const scratch = this.acquireScratch(w, h)
    scratch.clear()

    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    scratch.beginDraw()
    this.ctx.passes().image(texture, w, h, 0, 0, w, h)
    scratch.endDraw()
    gl.deleteTexture(texture)

    // target-local -> world -> pre-matrix world -> scratch-local (the rect's
    // own origin). Same composition the masked transform builds, with the
    // raster's rect standing in for a source tile.
    const toWorld = translationMatrix(originX, originY)
    const toRectLocal = translationMatrix(-rect.x, -rect.y)
    const mc = composeMatrix(toRectLocal, composeMatrix(invertMatrix(matrix), toWorld))
    // (#714) This is a write to a resident tile too, not just a fresh preview.
    // beginDraw invalidates its old mip chain; binding the FBO in transform
    // alone leaves zoomed-out display sampling the pixels before this paste.
    target.beginDraw()
    this.ctx.passes().transform(scratch, mc, target.width, target.height, target.fbo)
    target.endDraw()
    this.releaseScratch(scratch)
  }

  /** See PencilEngineAPI's doc comment. */
  previewAreaPaste(
    layerId: string, image: string,
    rect: { x: number; y: number; width: number; height: number },
    wireMatrix: LayerTransformMatrix,
  ): void {
    const layerBuf = this.ctx.layer(layerId)
    const img = this.ctx.image(image)
    const oldByOrigin = new Map(
      (this.ctx.previews.tiles.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
    )
    if (!layerBuf || !img) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this.ctx.previews.tiles.delete(layerId)
      this.ctx.previews.areaLayers.delete(layerId)
      this.ctx.display()
      return
    }

    const matrix = toHomography(wireMatrix)
    // Which tiles the piece covers *now* — its rect through the matrix. The
    // layer's own content is untouched by a paste, so unlike the lift there is
    // no second region (the hole) to account for.
    const { w: tw, h: th } = this.ctx.tileSize()
    const corners: Array<[number, number]> = [
      [rect.x, rect.y], [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
    ]
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of corners) {
      const [tx, ty] = applyMatrix(matrix, x, y)
      minX = Math.min(minX, tx); maxX = Math.max(maxX, tx)
      minY = Math.min(minY, ty); maxY = Math.max(maxY, ty)
    }
    if (!(maxX > minX) || !(maxY > minY) || !Number.isFinite(minX + minY + maxX + maxY)) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this.ctx.previews.tiles.delete(layerId)
      this.ctx.previews.areaLayers.delete(layerId)
      this.ctx.display()
      return
    }

    const tiles: PreviewTile[] = []
    const reused = new Set<string>()
    for (const { tileX, tileY } of tilesOverlappingRect({ minX, minY, maxX, maxY }, tw, th)) {
      const tileRect = tileWorldRect(tileX, tileY, tw, th)
      const key = `${tileRect.minX},${tileRect.minY}`
      const old = oldByOrigin.get(key)
      const scratch = old ? old.buffer : new AccumulationBuffer(this.gl, tw, th)
      if (old) reused.add(key)
      const existing = tileBufferAt(layerBuf, tileRect)
      if (existing) existing.copyTo(scratch)
      else scratch.clear()
      this.drawImageThroughMatrix(scratch, tileRect.minX, tileRect.minY, img, rect, matrix)
      tiles.push(old ?? { originX: tileRect.minX, originY: tileRect.minY, buffer: scratch })
    }
    for (const [key, t] of oldByOrigin) {
      if (!reused.has(key)) t.buffer.destroy()
    }

    this.ctx.previews.tiles.set(layerId, tiles)
    this.ctx.previews.areaLayers.add(layerId)
    this.ctx.display()
  }

  /** See PencilEngineAPI's doc comment. Same lifecycle as
   *  previewLayerTransform — call per drag frame, then
   *  clearLayerTransformPreview once the operation is appended or the drag is
   *  abandoned.
   *
   *  The tile buffers here are plain AccumulationBuffers keyed by origin and
   *  reused between frames, exactly as the whole-layer preview does it and for
   *  the same measured reason: allocating a tile-sized texture + FBO per
   *  pointer move is what made dragging stutter on a Surface (#142
   *  follow-up). */
  previewAreaTransform(layerId: string, selection: SelectionShape, matrix: LayerTransformMatrix): void {
    const layerBuf = this.ctx.layer(layerId)
    const mask = layerBuf ? this.acquireMask(selection) : null
    const oldByOrigin = new Map(
      (this.ctx.previews.tiles.get(layerId) ?? []).map(t => [`${t.originX},${t.originY}`, t]),
    )
    if (!layerBuf || !mask) {
      for (const t of oldByOrigin.values()) t.buffer.destroy()
      this.ctx.previews.tiles.delete(layerId)
      this.ctx.previews.areaLayers.delete(layerId)
      this.ctx.display()
      return
    }

    const reused = new Set<string>()
    const composed = this.composeAreaTiles(
      layerBuf, mask, toHomography(matrix), this.areaTileRects(mask, toHomography(matrix)),
      (w, h) => {
        // Keyed on size alone would be wrong if a room could change its tile
        // grid mid-session; it cannot (see _tileSize), so the origin key below
        // is enough and this only has to hand back *a* buffer of the right
        // size. The origin match happens in the loop that consumes this.
        void w; void h
        return new AccumulationBuffer(this.gl, w, h)
      },
    )

    // The acquire callback above cannot see which origin it is being called
    // for, so reuse is settled here: a tile that existed last frame keeps its
    // buffer and the freshly allocated one is thrown away. Wasteful only on
    // the frames where nothing changed — and those are precisely the frames
    // where the *content* changed, which is why the buffer has to be redrawn
    // anyway.
    const tiles: PreviewTile[] = []
    for (const { rect, scratch } of composed) {
      const key = `${rect.minX},${rect.minY}`
      const old = oldByOrigin.get(key)
      if (old) {
        scratch.copyTo(old.buffer)
        scratch.destroy()
        reused.add(key)
        tiles.push(old)
      } else {
        tiles.push({ originX: rect.minX, originY: rect.minY, buffer: scratch })
      }
    }
    for (const [key, t] of oldByOrigin) {
      if (!reused.has(key)) t.buffer.destroy()
    }

    this.ctx.previews.tiles.set(layerId, tiles)
    // The flag that makes _drawCompositeItem draw the rest of this layer from
    // its real tiles instead of treating the preview as the whole layer.
    this.ctx.previews.areaLayers.add(layerId)
    this.ctx.display()
  }

  /** See PencilEngineAPI's doc comment.
   *
   *  Flattens the selection's bounding box out of the layer's tiles into one
   *  patch, cuts it down to the selection's own shape (AREA_MASK_FRAG in
   *  'keep' mode), un-premultiplies on the way out and encodes a PNG. The
   *  un-premultiply is not optional: layer buffers store premultiplied colour
   *  and PNG is straight alpha, so skipping it would darken every partly
   *  transparent pixel — i.e. exactly the antialiased rim of every lasso. */
  async readAreaImage(layerId: string, selection: SelectionShape): Promise<AreaImage | null> {
    const layerBuf = this.ctx.layer(layerId)
    if (!layerBuf) return null
    const mask = this.acquireMask(selection)
    if (!mask) return null

    const { gl } = this
    const { minX, minY, maxX, maxY } = mask.rect
    const w = maxX - minX, h = maxY - minY
    if (w <= 0 || h <= 0) return null

    const patch = new AccumulationBuffer(gl, w, h)
    patch.clear()
    // Straight world-aligned copies rather than _drawTileComposite, which
    // draws through a CameraFrame and would need one built for this patch. A pure
    // translation through the transform blit is the same pixels with none of
    // that: patch-local (0,0) is world (minX, minY) by construction.
    for (const { buffer, originX, originY } of layerBuf.resolveVisible(mask.rect)) {
      this.ctx.passes().transform(buffer, translationMatrix(minX - originX, minY - originY), w, h, patch.fbo)
    }
    this.ctx.passes().areaMask(patch, minX, minY, mask, 'keep')

    const pixels = patch.readPixels()
    patch.destroy()
    const image = await this.ctx.encodePng(unpremultiply(pixels), w, h)
    return image ? { image, x: minX, y: minY, width: w, height: h } : null
  }

  /** (#453) The rect a fill is allowed to spread over.
   *
   *  A flood fill needs an edge to stop at, and on this canvas that is not a
   *  given: layer storage is a sparse map of tiles that come into existence
   *  when something is painted on them, so "outward from an untouched pixel"
   *  has no end. A room with a sheet has the obvious answer and uses it — the
   *  sheet, exactly as a bucket behaves in every editor with a page. An
   *  infinite room (#436 took those off the create screen, but rooms made
   *  before it are still in production) has no page, so the drawing itself
   *  stands in for one: the content bounds of whatever the fill is reading,
   *  with a margin so paint can spread a little past the outermost mark.
   *
   *  Capped to a `FILL_MAX_DIM` box centred on the seed in both cases. That
   *  cap is a real limit on what a single fill can cover, and it is deliberate
   *  rather than defensive: the alternative on a drawing spanning tens of
   *  thousands of world units is a readback and a scan nobody's tablet
   *  finishes. A fill poured into an outline that is not closed stops at the
   *  cap rather than at the drawing, and that is the intended behaviour: it
   *  fills, and the way back is undo. */
  private fillDomain(items: SourceLayer[], seedX: number, seedY: number): WorldRect {
    const half = FILL_MAX_DIM / 2
    const cap: WorldRect = {
      minX: Math.floor(seedX - half), minY: Math.floor(seedY - half),
      maxX: Math.ceil(seedX + half), maxY: Math.ceil(seedY + half),
    }
    let rect: WorldRect
    if (!this.ctx.infinite) {
      // (#607) The sheet, not the canvas element. Until #470 those were the
      // same size; since then the canvas is the on-screen surface (the size
      // of the window), and a domain read off it left every tap below or
      // right of that rectangle with no region at all — the fill silently did
      // nothing on most of an A4 page.
      const page = this.ctx.pageSize()
      rect = { minX: 0, minY: 0, maxX: page.w, maxY: page.h }
    } else {
      // Union of what the source layers actually hold. Tracked per tile and
      // never read back from the GPU (see ILayerBuffer.getContentBoundsWorld),
      // so this costs nothing even on a long room.
      let union: WorldRect | null = null
      for (const { id } of items) {
        const bounds = this.ctx.layer(id)?.getContentBoundsWorld()
        if (!bounds) continue
        union = union === null ? bounds : {
          minX: Math.min(union.minX, bounds.minX), minY: Math.min(union.minY, bounds.minY),
          maxX: Math.max(union.maxX, bounds.maxX), maxY: Math.max(union.maxY, bounds.maxY),
        }
      }
      // A tap outside the drawing (or on a blank canvas) still has to fill
      // *something*, so the seed's own neighbourhood joins the domain rather
      // than the fill silently doing nothing.
      const margin = INFINITE_FILL_MARGIN
      rect = union === null ? cap : {
        minX: Math.min(union.minX - margin, seedX - margin), minY: Math.min(union.minY - margin, seedY - margin),
        maxX: Math.max(union.maxX + margin, seedX + margin), maxY: Math.max(union.maxY + margin, seedY + margin),
      }
    }
    return {
      minX: Math.max(Math.floor(rect.minX), cap.minX), minY: Math.max(Math.floor(rect.minY), cap.minY),
      maxX: Math.min(Math.ceil(rect.maxX), cap.maxX), maxY: Math.min(Math.ceil(rect.maxY), cap.maxY),
    }
  }

  /** (#453) Flattens `items` (bottom→top, each at its own effective opacity)
   *  over `rect` into one premultiplied RGBA8 buffer — the pixels a fill reads
   *  its boundaries from.
   *
   *  World-aligned blits rather than the real composite path, for the reason
   *  readAreaImage gives: `_runComposite` is written against the live camera,
   *  and a fill's domain has nothing to do with where the camera is looking.
   *  It also must not include the paper pass — paper is composited at display
   *  time and is not in any layer, and sampling it back in would hand the fill
   *  the grain as if it were drawing, which is exactly how a naive bucket
   *  shatters a region into islands.
   *
   *  Rows come back in GL order (bottom-up); see computeAreaFill for where
   *  that is undone. */
  private readFillSource(rect: WorldRect, items: SourceLayer[]): Uint8Array | null {
    const { gl } = this
    const w = rect.maxX - rect.minX
    const h = rect.maxY - rect.minY
    if (w <= 0 || h <= 0) return null

    const patch = new AccumulationBuffer(gl, w, h)
    patch.clear()
    const single = items.length === 1 && items[0].opacity >= 1
    const layerPatch = single ? null : new AccumulationBuffer(gl, w, h)
    for (const { id, opacity } of items) {
      const layerBuf = this.ctx.layer(id)
      if (!layerBuf || opacity <= 0) continue
      // One layer at full opacity is the common case (filling against the
      // active layer alone) and needs no intermediate at all.
      const dest = layerPatch ?? patch
      if (layerPatch) layerPatch.clear()
      for (const { buffer, originX, originY } of layerBuf.resolveVisible(rect)) {
        this.ctx.passes().transform(buffer, translationMatrix(rect.minX - originX, rect.minY - originY), w, h, dest.fbo)
      }
      if (layerPatch) this.ctx.compositeTextures([{ texture: layerPatch.texture, opacity }], patch.fbo, w, h)
    }
    const pixels = patch.readPixels()
    patch.destroy()
    layerPatch?.destroy()
    return pixels
  }

  /** See PencilEngineAPI's doc comment. */
  async computeAreaFill(request: AreaFillRequest): Promise<AreaFillRaster | null> {
    const { layerId, seedX, seedY, color, tolerance, gapClose, expand, source } = request
    if (!this.ctx.layer(layerId)) return null
    // 'visible' reads the composite of every visible layer — lineart on top,
    // colour going into the layer underneath, which is the whole reason the
    // mode exists (ADR 010). 'layer' reads only the target. (#557) "Visible"
    // means what is on this screen, so it goes through the display filter: a
    // fill that read layers the solo has put out of view would flood past
    // edges the user cannot see.
    const items = source === 'visible'
      ? this.ctx.displayOrder().filter(it => this.ctx.layer(it.id) !== undefined)
      : [{ id: layerId, opacity: 1 }]
    if (items.length === 0) return null

    const rect = this.fillDomain(items, seedX, seedY)
    const w = rect.maxX - rect.minX
    const h = rect.maxY - rect.minY
    if (w <= 0 || h <= 0) return null
    const pixels = this.readFillSource(rect, items)
    if (!pixels) return null

    // readPixels hands back rows bottom-up, and flipping a domain-sized buffer
    // to fix that would be a pointless copy of up to 64 MB: the fill itself is
    // orientation-blind, so it runs in GL rows and only the two y coordinates
    // that leave this method are converted back. `encodePng` flips on
    // the way out, so the cropped raster is already in the order it wants.
    const seedCol = Math.floor(seedX) - rect.minX
    const seedRow = (h - 1) - (Math.floor(seedY) - rect.minY)
    const paper = this.ctx.paperColor()
    const result = computeFill(
      {
        pixels, width: w, height: h,
        background: [
          Math.round(paper[0] * 255), Math.round(paper[1] * 255), Math.round(paper[2] * 255),
        ],
      },
      { seedX: seedCol, seedY: seedRow, tolerance, gapClose, expand },
    )
    if (!result.bounds) return null

    const rgb: [number, number, number] = [
      Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255),
    ]
    const cropped = coverageToRgba(result.coverage, w, result.bounds, rgb)
    const image = await this.ctx.encodePng(cropped.pixels, cropped.width, cropped.height)
    if (!image) return null
    return {
      image,
      x: rect.minX + result.bounds.minX,
      // GL rows counted from the bottom of the domain, world y counted from
      // its top: the crop's *last* row is the one nearest the top edge.
      y: rect.minY + (h - result.bounds.maxY),
      width: cropped.width,
      height: cropped.height,
    }
  }
}
