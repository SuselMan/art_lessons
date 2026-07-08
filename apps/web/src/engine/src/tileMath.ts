// Infinite canvas — world/tile coordinate math (Phase 1 of the tiled-canvas
// redesign, see #133/#122/#121). World space is exactly today's fixed-canvas
// pixel space (top-down, same units as Dab.x/y) just without a [0,width) x
// [0,height) clamp — a tile is one TILE_SIZE x TILE_SIZE square of it,
// addressed by integer tile coordinates. Pure, no GL/engine dependency, so
// it's unit-testable in isolation from WebGL.

// Comfortably bigger than any realistic brush radius (so a dab spans at most
// a handful of tiles, never dozens), safely under WebGL1's guaranteed
// MAX_TEXTURE_SIZE (>=2048), and a modest 4MB (RGBA8) per resident tile.
export const TILE_SIZE = 1024

export interface TileCoord {
  tileX: number
  tileY: number
}

/** World-space axis-aligned rect, [minX,maxX) x [minY,maxY). */
export interface WorldRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Which tile a world point falls in. */
export function worldToTile(x: number, y: number): TileCoord {
  return { tileX: Math.floor(x / TILE_SIZE), tileY: Math.floor(y / TILE_SIZE) }
}

/** World point's position local to its own tile (both in [0, TILE_SIZE)). */
export function worldToLocal(x: number, y: number): { localX: number; localY: number } {
  return { localX: x - Math.floor(x / TILE_SIZE) * TILE_SIZE, localY: y - Math.floor(y / TILE_SIZE) * TILE_SIZE }
}

/** Canonical string key for a tile coordinate — stable Map key, and the
 *  serialization checkpoints key on (see Checkpoint.tileKey). */
export function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`
}

/** Inverse of tileKey — parses a key produced by tileKey() back into coords. */
export function parseTileKey(key: string): TileCoord {
  const [tileX, tileY] = key.split(',').map(Number)
  return { tileX, tileY }
}

/** World-space rect a tile occupies (its origin + TILE_SIZE square). */
export function tileWorldRect(tileX: number, tileY: number): WorldRect {
  const minX = tileX * TILE_SIZE, minY = tileY * TILE_SIZE
  return { minX, minY, maxX: minX + TILE_SIZE, maxY: minY + TILE_SIZE }
}

/** Every tile-key that overlaps a world-space rect (e.g. a dab's bounding
 *  box, or a transformed layer's content bounds) — the set a paint/bake/
 *  composite operation touching that rect must resolve buffers for. Empty
 *  for a degenerate (zero-or-negative-area) rect. */
export function tilesOverlappingRect(rect: WorldRect): TileCoord[] {
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return []
  const minTileX = Math.floor(rect.minX / TILE_SIZE)
  // maxX is exclusive — a rect ending exactly on a tile boundary must not
  // pull in the next tile (e.g. [0,1024) belongs entirely to tile 0).
  const maxTileX = Math.ceil(rect.maxX / TILE_SIZE) - 1
  const minTileY = Math.floor(rect.minY / TILE_SIZE)
  const maxTileY = Math.ceil(rect.maxY / TILE_SIZE) - 1
  const tiles: TileCoord[] = []
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) tiles.push({ tileX: tx, tileY: ty })
  }
  return tiles
}
