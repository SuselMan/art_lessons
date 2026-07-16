import { describe, expect, it } from 'vitest'

import { decodeLayerTiles, decodeRoomSnapshot, encodeLayerTiles, encodeRoomSnapshot, type SnapshotTile } from './snapshotCodec'

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

describe('encodeRoomSnapshot / decodeRoomSnapshot', () => {
  it('round-trips a single layer', async () => {
    const layers = new Map([['layer-1', encodeLayerTiles([makeTile()])]])
    const compressed = await encodeRoomSnapshot(layers)
    const decoded = await decodeRoomSnapshot(compressed)

    expect([...decoded.keys()]).toEqual(['layer-1'])
    expect(decoded.get('layer-1')).toHaveLength(1)
  })

  it('round-trips several layers, preserving per-layer tile content', async () => {
    const tileA = makeTile({ originX: 0, pixels: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) })
    const tileB = makeTile({ originX: 1024, pixels: Uint8Array.from([255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240]) })
    const layers = new Map([
      ['background', encodeLayerTiles([tileA])],
      ['layer-abc', encodeLayerTiles([tileB])],
    ])

    const decoded = await decodeRoomSnapshot(await encodeRoomSnapshot(layers))

    expect([...decoded.get('background')![0].pixels]).toEqual([...tileA.pixels])
    expect([...decoded.get('layer-abc')![0].pixels]).toEqual([...tileB.pixels])
  })

  it('round-trips a layer id with non-ASCII characters', async () => {
    const layers = new Map([['слой-1', encodeLayerTiles([makeTile()])]])
    const decoded = await decodeRoomSnapshot(await encodeRoomSnapshot(layers))
    expect([...decoded.keys()]).toEqual(['слой-1'])
  })

  it('rejects an unrecognized version byte', async () => {
    const compressed = await encodeRoomSnapshot(new Map([['layer-1', encodeLayerTiles([makeTile()])]]))
    // Flip the version byte (first byte of the *decompressed* payload) by
    // round-tripping through decode's own decompression, corrupting it, and
    // re-compressing — simpler than hand-building a gzip stream.
    const raw = new Uint8Array(await new Response(
      new Response(new Blob([new Uint8Array(compressed)])).body!.pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer())
    raw[0] = 99
    const recompressed = new Uint8Array(await new Response(
      new Response(new Blob([raw])).body!.pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer())

    await expect(decodeRoomSnapshot(recompressed)).rejects.toThrow(/unsupported version/)
  })
})
