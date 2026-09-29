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

// (#365) The reduced-resolution levels each layer keeps alongside its fine
// tiles, as "how many fine tiles this level's tile covers along each axis".
// A level's tile is stored in a texture the same size as a fine one
// (TILE_SIZE square), so factor F holds F² fine tiles' worth of world area at
// 1/F of their resolution.
//
// This is the draw-call fix rather than the quality fix (mip levels are
// that): the composite issues one draw per visible tile, and tiles in view
// grow with 1/zoom². A single level was not enough — it left the band just
// above its own threshold as the worst case in the whole range, and worse,
// crossing back up into that band meant resolving hundreds of fine tiles that
// had sat evicted while the coarse level was on screen, each one an Operation
// Log replay's worth of readback and re-upload. That is a freeze at one
// specific zoom, not a slowdown. A pyramid removes the cliff: see
// coarseFactorFor, which always has a level within a factor of two of what
// the camera is asking for, so no zoom ever has to fall back to hundreds of
// fine tiles.
//
// Powers of two so a level's slot size divides TILE_SIZE exactly, and capped
// at 8 by the room's own zoom floor (0.1, see cameraMath's minZoom): at the
// furthest the camera can go, a factor-8 tile still draws to ~819 screen px
// from a 1024-texel texture, minified rather than magnified.
export const COARSE_FACTORS = [2, 4, 8] as const

export type CoarseFactor = typeof COARSE_FACTORS[number]

/** (#365) Which level to composite from at a given world-to-screen scale, or
 *  null for "use the fine tiles".
 *
 *  Picks the *coarsest* level that still is not magnified. A level with
 *  factor F holds F * tileW world units in tileW texels, so it draws
 *  unmagnified exactly while F <= 1/scale — and among the levels that
 *  qualify, the coarsest is both the cheapest (fewest draws) and no worse to
 *  look at, since mip levels handle the extra minification. Below every
 *  level's threshold there is nothing to pick and the fine tiles are already
 *  the right choice.
 *
 *  The consequence worth stating: the level in use is never more than a
 *  factor of two away from 1:1, at any zoom the camera can reach. That is
 *  what keeps the visible tile count flat instead of exploding just above a
 *  threshold. */
export function coarseFactorFor(scale: number): CoarseFactor | null {
  if (!(scale > 0)) return null
  let chosen: CoarseFactor | null = null
  for (const factor of COARSE_FACTORS) {
    if (factor <= 1 / scale) chosen = factor
  }
  return chosen
}

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

/** (#365) The tile of level `factor` a fine tile belongs to. Floor division,
 *  so it is correct for negative coordinates too — an infinite room's tile
 *  grid runs in both directions from world origin, and `Math.trunc` would
 *  fold tiles -7..-1 and 0..7 onto the same coarse tile. */
export function fineToCoarseTile(tileX: number, tileY: number, factor: number): TileCoord {
  return { tileX: Math.floor(tileX / factor), tileY: Math.floor(tileY / factor) }
}

/** Where a fine tile's downsampled content sits inside its coarse tile's
 *  texture, in coarse-texture pixels, top-down (the convention every buffer
 *  pixel value in this engine uses). Always a `size` x `size` square with
 *  size = tileW / COARSE_FACTOR.
 *
 *  Uses the same floor-based modulo as fineToCoarseTile for the same reason:
 *  JS `%` keeps the sign of the dividend, so tile -1 would land at offset -1
 *  rather than at the last slot of the coarse tile to its left. */
export function fineTileSlot(
  tileX: number, tileY: number, factor: number, tileW = TILE_SIZE, tileH = TILE_SIZE,
): { x: number; y: number; w: number; h: number } {
  const slotW = tileW / factor
  const slotH = tileH / factor
  const col = tileX - Math.floor(tileX / factor) * factor
  const row = tileY - Math.floor(tileY / factor) * factor
  return { x: col * slotW, y: row * slotH, w: slotW, h: slotH }
}

/** World-space rect one of level `factor`'s tiles occupies — `factor` fine
 *  tiles across in each direction. */
export function coarseTileWorldRect(
  tileX: number, tileY: number, factor: number, tileW = TILE_SIZE, tileH = TILE_SIZE,
): WorldRect {
  return tileWorldRect(tileX, tileY, tileW * factor, tileH * factor)
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
