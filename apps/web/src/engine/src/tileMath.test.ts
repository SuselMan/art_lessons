import { describe, expect, it } from 'vitest'

import {
  TILE_SIZE, parseTileKey, tileKey, tileWorldRect, tilesOverlappingRect, worldToLocal, worldToTile,
} from './tileMath'

describe('worldToTile', () => {
  it('maps the origin tile', () => {
    expect(worldToTile(0, 0)).toEqual({ tileX: 0, tileY: 0 })
    expect(worldToTile(TILE_SIZE - 1, TILE_SIZE - 1)).toEqual({ tileX: 0, tileY: 0 })
  })

  it('maps exactly on a tile boundary to the next tile (half-open [start,end) convention)', () => {
    expect(worldToTile(TILE_SIZE, 0)).toEqual({ tileX: 1, tileY: 0 })
  })

  it('maps negative coordinates to negative tile indices, floor not truncate', () => {
    expect(worldToTile(-1, -1)).toEqual({ tileX: -1, tileY: -1 })
    expect(worldToTile(-TILE_SIZE, 0)).toEqual({ tileX: -1, tileY: 0 })
  })
})

describe('worldToLocal', () => {
  it('is the point itself within the origin tile', () => {
    expect(worldToLocal(5, 7)).toEqual({ localX: 5, localY: 7 })
  })

  it('wraps into [0, TILE_SIZE) for positive coordinates in later tiles', () => {
    expect(worldToLocal(TILE_SIZE + 5, TILE_SIZE * 2 + 7)).toEqual({ localX: 5, localY: 7 })
  })

  it('wraps correctly for negative coordinates (never negative itself)', () => {
    const { localX, localY } = worldToLocal(-1, -TILE_SIZE + 3)
    expect(localX).toBeCloseTo(TILE_SIZE - 1)
    expect(localY).toBeCloseTo(3)
  })
})

describe('tileKey / parseTileKey', () => {
  it('round-trips', () => {
    expect(parseTileKey(tileKey(3, -5))).toEqual({ tileX: 3, tileY: -5 })
  })

  it('produces distinct keys for distinct coordinates', () => {
    expect(tileKey(1, 2)).not.toBe(tileKey(2, 1))
  })
})

describe('tileWorldRect', () => {
  it('returns the tile\'s own TILE_SIZE square', () => {
    expect(tileWorldRect(2, -1)).toEqual({
      minX: 2 * TILE_SIZE, minY: -1 * TILE_SIZE, maxX: 3 * TILE_SIZE, maxY: 0,
    })
  })
})

describe('tilesOverlappingRect', () => {
  it('returns a single tile for a rect fully inside it', () => {
    const tiles = tilesOverlappingRect({ minX: 10, minY: 10, maxX: 20, maxY: 20 })
    expect(tiles).toEqual([{ tileX: 0, tileY: 0 }])
  })

  it('returns an empty array for a degenerate (zero-area) rect', () => {
    expect(tilesOverlappingRect({ minX: 5, minY: 5, maxX: 5, maxY: 5 })).toEqual([])
    expect(tilesOverlappingRect({ minX: 5, minY: 5, maxX: 0, maxY: 10 })).toEqual([])
  })

  it('excludes the next tile when maxX/maxY lands exactly on a boundary', () => {
    const tiles = tilesOverlappingRect({ minX: 0, minY: 0, maxX: TILE_SIZE, maxY: TILE_SIZE })
    expect(tiles).toEqual([{ tileX: 0, tileY: 0 }])
  })

  it('spans 2x2 tiles for a rect straddling a corner', () => {
    const half = TILE_SIZE / 2
    const tiles = tilesOverlappingRect({
      minX: TILE_SIZE - half, minY: TILE_SIZE - half, maxX: TILE_SIZE + half, maxY: TILE_SIZE + half,
    })
    const keys = tiles.map(t => tileKey(t.tileX, t.tileY)).sort()
    expect(keys).toEqual([
      tileKey(0, 0), tileKey(0, 1), tileKey(1, 0), tileKey(1, 1),
    ].sort())
  })

  it('spans negative-coordinate tiles correctly', () => {
    const tiles = tilesOverlappingRect({ minX: -10, minY: -10, maxX: 10, maxY: 10 })
    const keys = tiles.map(t => tileKey(t.tileX, t.tileY)).sort()
    expect(keys).toEqual([
      tileKey(-1, -1), tileKey(-1, 0), tileKey(0, -1), tileKey(0, 0),
    ].sort())
  })
})
