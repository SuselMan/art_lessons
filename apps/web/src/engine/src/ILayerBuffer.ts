import type { AccumulationBuffer } from './AccumulationBuffer'
import type { WorldRect } from './tileMath'

// Infinite canvas (Phase 1, #133/#122/#121) — the buffer-storage abstraction
// PencilEngine paints/reads/clears through instead of touching an
// AccumulationBuffer directly. Fixed-canvas rooms get BoundedLayerBuffer (one
// AccumulationBuffer, unchanged behavior); infinite rooms get
// TiledLayerBuffer (many AccumulationBuffers, one per resident tile). Both
// resolve to a list of PaintTargets — real (buffer, world-origin) pairs a
// caller paints/reads through with dab/pixel coordinates translated by
// (originX, originY) — so the shader/draw-call code in engine/index.ts stays
// identical between modes; only which buffer(s) it targets differs.

export interface PaintTarget {
  buffer: AccumulationBuffer
  // World-space coordinate of this buffer's local (0,0) texel. A world point
  // (x,y) lands at buffer-local (x - originX, y - originY).
  originX: number
  originY: number
}

export interface ILayerBuffer {
  /** Wipes all content. Bounded: clears the one buffer. Tiled: destroys every
   *  resident tile (equivalent — a fresh tile painted on demand starts
   *  cleared, same as AccumulationBuffer's own constructor+clear). */
  clear(): void

  /** Releases all GPU resources. */
  destroy(): void

  /** Every underlying buffer touching worldRect, creating any missing ones
   *  on demand — the target list for a paint/bake operation, which must
   *  never lose content because a tile didn't exist yet. Bounded mode
   *  ignores worldRect and always returns its single buffer at origin
   *  (0,0), exactly like today (off-buffer content is GL-viewport-clipped,
   *  unchanged fixed-canvas behavior). */
  resolveForPaint(worldRect: WorldRect): PaintTarget[]

  /** Same resolution, but read-only — never creates a tile that doesn't
   *  already exist. Used by composite/display/content-bounds scanning,
   *  where an untouched region simply contributes nothing. */
  resolveVisible(worldRect: WorldRect): PaintTarget[]

  /** Every currently resident buffer, with no rect filtering — "everything
   *  this layer actually holds right now." Used where there's no natural
   *  bounding rect to filter by (merge, content-bounds scan, transform
   *  bake): Bounded mode always returns its single buffer; Tiled mode
   *  returns every resident tile. */
  allResident(): PaintTarget[]
}
