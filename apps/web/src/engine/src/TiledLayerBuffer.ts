import { AccumulationBuffer } from './AccumulationBuffer'
import type { ILayerBuffer, PaintTarget } from './ILayerBuffer'
import { TILE_SIZE, tileKey, tileWorldRect, tilesOverlappingRect, type WorldRect } from './tileMath'

/** Infinite-canvas ILayerBuffer (Phase 1, #133) — a sparse
 *  Map<tileKey, AccumulationBuffer>, one TILE_SIZE x TILE_SIZE
 *  AccumulationBuffer per resident tile, created lazily the first time
 *  something paints into it. No eviction/paging yet (Phase 2) — once
 *  created, a tile stays resident until clear()/destroy(). This is what
 *  makes the #133 fix possible: a destination tile is simply created on
 *  demand rather than being a hard, fixed-size clip boundary. */
export class TiledLayerBuffer implements ILayerBuffer {
  private readonly gl: WebGLRenderingContext
  private readonly tiles = new Map<string, AccumulationBuffer>()

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl
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
      tile = new AccumulationBuffer(this.gl, TILE_SIZE, TILE_SIZE)
      tile.clear()
      this.tiles.set(key, tile)
    }
    return tile
  }

  resolveForPaint(worldRect: WorldRect): PaintTarget[] {
    return tilesOverlappingRect(worldRect).map(({ tileX, tileY }) => {
      const rect = tileWorldRect(tileX, tileY)
      return { buffer: this.getOrCreateTile(tileX, tileY), originX: rect.minX, originY: rect.minY }
    })
  }

  resolveVisible(worldRect: WorldRect): PaintTarget[] {
    const targets: PaintTarget[] = []
    for (const { tileX, tileY } of tilesOverlappingRect(worldRect)) {
      const tile = this.tiles.get(tileKey(tileX, tileY))
      if (!tile) continue
      const rect = tileWorldRect(tileX, tileY)
      targets.push({ buffer: tile, originX: rect.minX, originY: rect.minY })
    }
    return targets
  }
}
