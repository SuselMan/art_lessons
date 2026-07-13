import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from './ILayerBuffer'
import { TILE_SIZE, parseTileKey, tileKey, tileWorldRect, tilesOverlappingRect, type WorldRect } from './tileMath'

/** Tile-backed ILayerBuffer (Phase 1, #133; #142 generalized to bounded
 *  rooms too) — a sparse Map<tileKey, AccumulationBuffer>, one tileW x
 *  tileH AccumulationBuffer per resident tile, created lazily the first
 *  time something paints into it. No eviction/paging yet (Phase 2) — once
 *  created, a tile stays resident until clear()/destroy(). This is what
 *  makes the #133 fix possible: a destination tile is simply created on
 *  demand rather than being a hard, fixed-size clip boundary.
 *
 *  tileW/tileH default to TILE_SIZE (infinite rooms' own fixed, square tile
 *  size), but a bounded room's own layer buffers are constructed with
 *  tileW/tileH set to that room's canvas.width/canvas.height instead (see
 *  engine/index.ts's _makeLayerBuffer) — its "tile grid" is rooted at world
 *  origin with cells the size of its own visible page, so a canvas smaller
 *  than TILE_SIZE in both dimensions (matching old BoundedLayerBuffer
 *  sizing/pixel-indexing byte-for-byte) still resolves to exactly one
 *  resident tile once painted, while a layer_transform dragging content
 *  past that visible page's edge creates an *adjacent*, identically-sized
 *  tile rather than clipping it away. */
export class TiledLayerBuffer implements ILayerBuffer {
  private readonly gl: WebGLRenderingContext
  private readonly tileW: number
  private readonly tileH: number
  private readonly tiles = new Map<string, AccumulationBuffer>()

  constructor(gl: WebGLRenderingContext, tileW: number = TILE_SIZE, tileH: number = TILE_SIZE) {
    this.gl = gl
    this.tileW = tileW
    this.tileH = tileH
  }

  /** Resident tile count — exposed for tests/diagnostics, not part of
   *  ILayerBuffer (paging/eviction, Phase 2, will read this too). */
  get tileCount(): number { return this.tiles.size }

  clear(): void {
    for (const tile of this.tiles.values()) tile.destroy()
    this.tiles.clear()
  }

  destroy(): void {
    for (const tile of this.tiles.values()) tile.destroy()
    this.tiles.clear()
  }

  private getOrCreateTile(tileX: number, tileY: number): AccumulationBuffer {
    const key = tileKey(tileX, tileY)
    let tile = this.tiles.get(key)
    if (!tile) {
      tile = new AccumulationBuffer(this.gl, this.tileW, this.tileH)
      tile.clear()
      this.tiles.set(key, tile)
    }
    return tile
  }

  resolveForPaint(worldRect: WorldRect): PaintTarget[] {
    return tilesOverlappingRect(worldRect, this.tileW, this.tileH).map(({ tileX, tileY }) => {
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      return { buffer: this.getOrCreateTile(tileX, tileY), originX: rect.minX, originY: rect.minY }
    })
  }

  resolveVisible(worldRect: WorldRect): PaintTarget[] {
    const targets: PaintTarget[] = []
    for (const { tileX, tileY } of tilesOverlappingRect(worldRect, this.tileW, this.tileH)) {
      const tile = this.tiles.get(tileKey(tileX, tileY))
      if (!tile) continue
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      targets.push({ buffer: tile, originX: rect.minX, originY: rect.minY })
    }
    return targets
  }

  allResident(): PaintTarget[] {
    const targets: PaintTarget[] = []
    for (const [key, tile] of this.tiles) {
      const { tileX, tileY } = parseTileKey(key)
      const rect = tileWorldRect(tileX, tileY, this.tileW, this.tileH)
      targets.push({ buffer: tile, originX: rect.minX, originY: rect.minY })
    }
    return targets
  }
}
