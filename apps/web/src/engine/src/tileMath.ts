// Infinite canvas — world/tile coordinate math (Phase 1 of the tiled-canvas
// redesign, see #133/#122/#121). World space is exactly today's fixed-canvas
// pixel space (top-down, same units as Dab.x/y) just without a [0,width) x
// [0,height) clamp — a tile is one tileW x tileH rectangle of it, addressed
// by integer tile coordinates. Pure, no GL/engine dependency, so it's
// unit-testable in isolation from WebGL.

// Comfortably bigger than any realistic brush radius (so a dab spans at most
// a handful of tiles, never dozens), safely under WebGL1's guaranteed
// MAX_TEXTURE_SIZE (>=2048), and a modest 4MB (RGBA8) per resident tile.
// This is infinite-canvas rooms' own fixed tile size (see TiledLayerBuffer's
// default constructor params) — #142 generalized every function below to
// take its own tileW/tileH explicitly rather than reading this constant
// directly, since a bounded room's TiledLayerBuffer uses its *canvas's own*
// (non-square, non-TILE_SIZE) dimensions as its tile size instead, so a
// canvas smaller than TILE_SIZE keeps exactly one tile per layer (matching
// old BoundedLayerBuffer sizing/pixel-indexing byte-for-byte) while a canvas
// bigger than TILE_SIZE in either dimension (true of every non-custom
// preset, e.g. A4 at 1240x1754) still spans more than one, sized to the
// canvas rather than to this constant.
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

/** Which tile a world point falls in, for a tileW x tileH grid rooted at
 *  world origin. Defaults to TILE_SIZE (square) — infinite rooms' own tile
 *  shape and every existing caller's expectation. */
export function worldToTile(x: number, y: number, tileW = TILE_SIZE, tileH = TILE_SIZE): TileCoord {
  return { tileX: Math.floor(x / tileW), tileY: Math.floor(y / tileH) }
}

/** World point's position local to its own tile (in [0,tileW) x [0,tileH)). */
export function worldToLocal(
  x: number, y: number, tileW = TILE_SIZE, tileH = TILE_SIZE,
): { localX: number; localY: number } {
  return { localX: x - Math.floor(x / tileW) * tileW, localY: y - Math.floor(y / tileH) * tileH }
}

/** Canonical string key for a tile coordinate — stable Map key, and the
 *  serialization checkpoints key on (see Checkpoint.tileKey). Tile-size-
 *  independent: two different TiledLayerBuffer instances (e.g. two
 *  differently-sized bounded layers) never share a Map, so the key itself
 *  doesn't need to encode the grid it belongs to. */
export function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`
}

/** Inverse of tileKey — parses a key produced by tileKey() back into coords. */
export function parseTileKey(key: string): TileCoord {
  const [tileX, tileY] = key.split(',').map(Number)
  return { tileX, tileY }
}

/** World-space rect a tile occupies (its origin + tileW x tileH rect). */
export function tileWorldRect(tileX: number, tileY: number, tileW = TILE_SIZE, tileH = TILE_SIZE): WorldRect {
  const minX = tileX * tileW, minY = tileY * tileH
  return { minX, minY, maxX: minX + tileW, maxY: minY + tileH }
}

/** Every tile-key that overlaps a world-space rect (e.g. a dab's bounding
 *  box, or a transformed layer's content bounds) — the set a paint/bake/
 *  composite operation touching that rect must resolve buffers for. Empty
 *  for a degenerate (zero-or-negative-area) rect. */
export function tilesOverlappingRect(rect: WorldRect, tileW = TILE_SIZE, tileH = TILE_SIZE): TileCoord[] {
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return []
  const minTileX = Math.floor(rect.minX / tileW)
  // maxX is exclusive — a rect ending exactly on a tile boundary must not
  // pull in the next tile (e.g. [0,tileW) belongs entirely to tile 0).
  const maxTileX = Math.ceil(rect.maxX / tileW) - 1
  const minTileY = Math.floor(rect.minY / tileH)
  const maxTileY = Math.ceil(rect.maxY / tileH) - 1
  const tiles: TileCoord[] = []
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    for (let tx = minTileX; tx <= maxTileX; tx++) tiles.push({ tileX: tx, tileY: ty })
  }
  return tiles
}
