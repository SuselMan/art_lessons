import type { AccumulationBuffer } from './AccumulationBuffer'
import type { WorldRect } from './tileMath'

// Infinite canvas (Phase 1, #133/#122/#121) — the buffer-storage abstraction
// PencilEngine paints/reads/clears through instead of touching an
// AccumulationBuffer directly. TiledLayerBuffer (its one implementation as of
// #142 — bounded rooms used to get a separate, single-buffer
// BoundedLayerBuffer instead, removed once its "clip anything past the
// canvas edge" behavior turned out to be an unwanted bug rather than
// intentional) is a sparse Map of AccumulationBuffers, one per resident
// TILE_SIZE x TILE_SIZE tile — a bounded room just usually has few of them
// (as few as one, for a canvas smaller than TILE_SIZE in both dimensions).
// Every method resolves to a list of PaintTargets — real (buffer, world-
// origin) pairs a caller paints/reads through with dab/pixel coordinates
// translated by (originX, originY) — so the shader/draw-call code in
// engine/index.ts never needs to know how many tiles it's dealing with.

export interface PaintTarget {
  buffer: AccumulationBuffer
  // World-space coordinate of this buffer's local (0,0) texel. A world point
  // (x,y) lands at buffer-local (x - originX, y - originY).
  originX: number
  originY: number
  // (#155 Tier 2) World-space rect bounding this tile's *real* painted
  // content right now, or null if this tile currently holds no content at
  // all (freshly created, or fully vacated — e.g. a transform bake moved its
  // content elsewhere and cleared it). Incrementally tracked by the
  // implementation (see markContentPainted/clearContentAt/restoreTileContent
  // below) — never computed by reading pixels back from the GPU. A
  // conservative axis-aligned approximation (e.g. a dab's full bounding box,
  // or a rotated transform's AABB), same spirit as _dabsWorldBounds — never
  // smaller than the real content, occasionally a little bigger. Any caller
  // that cares about a layer's real content (getContentBounds,
  // _bakeTransform/previewLayerTransform's source-tile bounds) must skip a
  // target entirely when this is null rather than falling back to "assume
  // the whole tile" — that fallback is exactly the unbounded resident-tile-
  // footprint-growth bug #155 diagnosed (a vacated tile kept contributing
  // its whole extent to every later bake's bounds forever).
  contentRect: WorldRect | null
}

export interface ILayerBuffer {
  /** Wipes all content — destroys every resident tile (a fresh tile painted
   *  on demand afterward starts cleared, same as AccumulationBuffer's own
   *  constructor+clear). */
  clear(): void

  /** Releases all GPU resources. */
  destroy(): void

  /** Every underlying tile touching worldRect, creating any missing ones on
   *  demand — the target list for a paint/bake operation, which must never
   *  lose content because a tile didn't exist yet (#133/#142: this is what
   *  makes a transform that drags content past a canvas's visible edge non-
   *  destructive, bounded rooms included — the tile it lands in is simply
   *  created). */
  resolveForPaint(worldRect: WorldRect): PaintTarget[]

  /** Same resolution, but read-only — never creates a tile that doesn't
   *  already exist. Used by composite/display/content-bounds scanning,
   *  where an untouched region simply contributes nothing. */
  resolveVisible(worldRect: WorldRect): PaintTarget[]

  /** Every currently resident tile, with no rect filtering — "everything
   *  this layer actually holds right now." Used where there's no natural
   *  bounding rect to filter by (merge, content-bounds scan, transform
   *  bake, checkpointing). */
  allResident(): PaintTarget[]

  /** (#155 Tier 2) Marks worldRect as freshly painted — expands (never
   *  shrinks) every tile it overlaps' own tracked contentRect to include its
   *  share of worldRect, rounded outward to integer pixel bounds (see
   *  PaintTarget.contentRect's own doc comment on why this stays a
   *  conservative approximation, and getContentBounds' doc comment on why
   *  integer). Called once per paint/bake operation, not per pixel — an
   *  intentionally cheap tracker, never a readPixels-based scan. The target
   *  tile(s) must already exist (i.e. this follows a resolveForPaint call
   *  for the same rect) — a tile this hits that doesn't exist yet is simply
   *  skipped, there is nothing to mark. */
  markContentPainted(worldRect: WorldRect): void

  /** (#155 Tier 2) Resets the one resident tile whose local (0,0) texel is
   *  at world position (originX, originY) back to "no content" — used right
   *  before a transform bake's unconditional per-source-tile buffer clear()
   *  (see _bakeTransform), so tracked content state never lies about a tile
   *  that's about to genuinely become empty. A no-op if no tile exists at
   *  that origin. */
  clearContentAt(originX: number, originY: number): void

  /** (#155 Tier 2) `rect` is an exact, tile-aligned world rect and `pixels`
   *  its resident tile's exact RGBA8 content (tileW*tileH*4 bytes) — used
   *  wherever a tile's pixels are restored wholesale from historical data
   *  (checkpoint restore) rather than freshly painted. Scans `pixels` once
   *  for their real content bbox and *sets* (not unions) that tile's tracked
   *  contentRect to match, rather than assuming the whole rect is content —
   *  the same scan cost restoring already pays elsewhere, just paid once
   *  here instead of on every later getContentBounds() call. A no-op if no
   *  tile exists at rect's origin. */
  restoreTileContent(rect: WorldRect, pixels: Uint8Array): void

  /** (#155 Tier 2) Union of every tile's tracked contentRect (resident or
   *  evicted — eviction never forgets tracked content, same as it never
   *  forgets the pixels themselves, see TiledLayerBuffer's own docstring),
   *  rounded outward to integer bounds. Replaces the old readPixels + full
   *  per-pixel CPU scan getContentBounds used to do on every call — this is
   *  now a cheap union over however many tiles this layer has ever held
   *  content on, no GPU readback at all. Null if every tile is empty (or
   *  there are no tiles at all). */
  getContentBoundsWorld(): WorldRect | null
}
