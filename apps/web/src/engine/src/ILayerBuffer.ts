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
}
