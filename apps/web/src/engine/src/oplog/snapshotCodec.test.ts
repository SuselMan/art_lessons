import { describe, expect, it } from 'vitest'

import { compressLayerTiles, decodeLayerTiles, decompressLayerTiles, encodeLayerTiles, type SnapshotTile } from './snapshotCodec'

function makeTile(overrides: Partial<SnapshotTile> = {}): SnapshotTile {
  const width = overrides.width ?? 2
  const height = overrides.height ?? 2
  return {
    originX: overrides.originX ?? 0,
    originY: overrides.originY ?? 0,
    width,
    height,
    pixels: overrides.pixels ?? Uint8Array.from({ length: width * height * 4 }, (_, i) => i % 256),
  }
}

describe('encodeLayerTiles / decodeLayerTiles', () => {
  it('round-trips a single tile', () => {
    const tile = makeTile({ originX: -1024, originY: 2048, width: 3, height: 2 })
    const buf = encodeLayerTiles([tile])
    const { tiles, nextOffset } = decodeLayerTiles(buf, 0)

    expect(nextOffset).toBe(buf.byteLength)
    expect(tiles).toHaveLength(1)
    expect(tiles[0].originX).toBe(-1024)
    expect(tiles[0].originY).toBe(2048)
    expect(tiles[0].width).toBe(3)
    expect(tiles[0].height).toBe(2)
    expect([...tiles[0].pixels]).toEqual([...tile.pixels])
  })

  it('round-trips several tiles in order', () => {
    const a = makeTile({ originX: 0, originY: 0 })
    const b = makeTile({ originX: 1024, originY: 0 })
    const buf = encodeLayerTiles([a, b])
    const { tiles } = decodeLayerTiles(buf, 0)

    expect(tiles.map(t => t.originX)).toEqual([0, 1024])
  })

  it('round-trips zero tiles', () => {
    const buf = encodeLayerTiles([])
    const { tiles, nextOffset } = decodeLayerTiles(buf, 0)
    expect(tiles).toEqual([])
    expect(nextOffset).toBe(buf.byteLength)
  })
})

// (#371) The room-level bundle is gone: a snapshot is one layer's pixels, and
// the row it lives in already carries the layer id and seq the framing used to.
describe('compressLayerTiles / decompressLayerTiles', () => {
  it('round-trips a layer through gzip', async () => {
    const tile = makeTile({ originX: -512, originY: 256, width: 3, height: 2 })
    const raw = encodeLayerTiles([tile])

    const { tiles } = decodeLayerTiles(await decompressLayerTiles(await compressLayerTiles(raw)), 0)

    expect(tiles).toHaveLength(1)
    expect(tiles[0].originX).toBe(-512)
    expect([...tiles[0].pixels]).toEqual([...tile.pixels])
  })

  it('round-trips several tiles of one layer', async () => {
    const a = makeTile({ originX: 0, pixels: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) })
    const b = makeTile({ originX: 1024, pixels: Uint8Array.from([255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240]) })

    const { tiles } = decodeLayerTiles(await decompressLayerTiles(await compressLayerTiles(encodeLayerTiles([a, b]))), 0)

    expect([...tiles[0].pixels]).toEqual([...a.pixels])
    expect([...tiles[1].pixels]).toEqual([...b.pixels])
  })

  it('round-trips a layer with no tiles', async () => {
    const { tiles } = decodeLayerTiles(await decompressLayerTiles(await compressLayerTiles(encodeLayerTiles([]))), 0)
    expect(tiles).toEqual([])
  })
})
