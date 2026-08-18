import { describe, expect, it } from 'vitest'

import { isFullyTransparent, retileSnapshotTiles } from './retileSnapshot'
import type { SnapshotTile } from './snapshotCodec'

// (#469) These tests are about one thing: an old snapshot, baked when a bounded
// room's tile was its whole page, landing correctly on the TILE_SIZE grid that
// replaced it. Every fixture here is deliberately asymmetric in both axes —
// a symmetric one survives a vertical flip, and a vertical flip is exactly the
// mistake available in this arithmetic (the pixel array is GL bottom-up, the
// world rect is top-down).

/** A tile whose every pixel encodes its own world position, so a misplaced
 *  copy is not merely "different bytes" but a readable wrong coordinate. */
function positionEncodedTile(originX: number, originY: number, width: number, height: number): SnapshotTile {
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    // Array row -> world y, the bottom-up/top-down bridge under test.
    const worldY = originY + height - 1 - row
    for (let x = 0; x < width; x++) {
      const i = (row * width + x) * 4
      pixels[i] = (originX + x) & 255
      pixels[i + 1] = worldY & 255
      pixels[i + 2] = 7
      pixels[i + 3] = 255
    }
  }
  return { originX, originY, width, height, pixels }
}

/** What the tile at (originX, originY) says is at world (x, y). */
function readAt(tile: SnapshotTile, x: number, y: number): [number, number, number] {
  const row = tile.originY + tile.height - 1 - y
  const i = (row * tile.width + (x - tile.originX)) * 4
  return [tile.pixels[i], tile.pixels[i + 1], tile.pixels[i + 3]]
}

describe('retileSnapshotTiles', () => {
  it('passes an already-gridded set through by identity, copying nothing', () => {
    const tiles = [
      positionEncodedTile(0, 0, 64, 64),
      positionEncodedTile(64, 128, 64, 64),
    ]
    // Identity, not merely equality: the restore path uses it to decide
    // whether the per-tile alpha scan is worth running at all.
    expect(retileSnapshotTiles(tiles, 64, 64)).toBe(tiles)
  })

  it('splits one page-sized tile onto the grid, pixel for pixel', () => {
    // 3x2 grid of 16px tiles, with the page deliberately not a multiple of the
    // tile on either axis — the ragged right and bottom edges are where an
    // off-by-one hides.
    const page = positionEncodedTile(0, 0, 40, 20)

    const out = retileSnapshotTiles([page], 16, 16)

    expect(out.map(t => `${t.originX},${t.originY}`).sort())
      .toEqual(['0,0', '0,16', '16,0', '16,16', '32,0', '32,16'])
    for (const tile of out) {
      expect(tile.width).toBe(16)
      expect(tile.height).toBe(16)
    }
    // Every pixel the page covered must be readable at its own world
    // coordinate from whichever tile now owns it.
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 40; x++) {
        const owner = out.find(t => x >= t.originX && x < t.originX + 16 && y >= t.originY && y < t.originY + 16)!
        expect(readAt(owner, x, y)).toEqual([x & 255, y & 255, 255])
      }
    }
  })

  it('leaves the part of a tile the page never covered transparent', () => {
    // The page is 40x20 on a 16-grid, so the tile at (32,16) is covered only
    // in its top-left 8x4 corner. The rest must stay untouched rather than
    // wrapping around from the source.
    const out = retileSnapshotTiles([positionEncodedTile(0, 0, 40, 20)], 16, 16)
    const corner = out.find(t => t.originX === 32 && t.originY === 16)!

    expect(readAt(corner, 39, 19)).toEqual([39, 19, 255])
    // One pixel past the page's right edge, and one past its bottom.
    expect(readAt(corner, 40, 19)[2]).toBe(0)
    expect(readAt(corner, 39, 20)[2]).toBe(0)
  })

  it('does not flip content vertically', () => {
    // The single assertion this whole file exists for, stated on its own so a
    // failure names it. Top and bottom rows carry different values, and a
    // flipped copy swaps them while every other check above still passes.
    const page = positionEncodedTile(0, 0, 8, 32)

    const out = retileSnapshotTiles([page], 8, 16)
    const top = out.find(t => t.originY === 0)!
    const bottom = out.find(t => t.originY === 16)!

    expect(readAt(top, 0, 0)[1]).toBe(0)
    expect(readAt(top, 0, 15)[1]).toBe(15)
    expect(readAt(bottom, 0, 16)[1]).toBe(16)
    expect(readAt(bottom, 0, 31)[1]).toBe(31)
  })

  it('handles a page that is not at the world origin', () => {
    const page = positionEncodedTile(16, 32, 32, 32)

    const out = retileSnapshotTiles([page], 16, 16)

    expect(out.map(t => `${t.originX},${t.originY}`).sort())
      .toEqual(['16,32', '16,48', '32,32', '32,48'])
    for (let y = 32; y < 64; y++) {
      for (let x = 16; x < 48; x++) {
        const owner = out.find(t => x >= t.originX && x < t.originX + 16 && y >= t.originY && y < t.originY + 16)!
        expect(readAt(owner, x, y)).toEqual([x & 255, y & 255, 255])
      }
    }
  })

  it('merges two source tiles that land in one destination tile', () => {
    // Not a shape any bake produces today, and that is the point: the merge is
    // there so a future one cannot silently lose half a tile to the second
    // write.
    const left = positionEncodedTile(0, 0, 8, 8)
    const right = positionEncodedTile(8, 0, 8, 8)

    const out = retileSnapshotTiles([left, right], 16, 16)

    expect(out.length).toBe(1)
    expect(readAt(out[0], 0, 0)).toEqual([0, 0, 255])
    expect(readAt(out[0], 15, 7)).toEqual([15, 7, 255])
  })
})

describe('isFullyTransparent', () => {
  it('is true for an untouched buffer', () => {
    expect(isFullyTransparent(new Uint8Array(16 * 16 * 4))).toBe(true)
  })

  it('is false for a single partly-opaque pixel, wherever it sits', () => {
    const pixels = new Uint8Array(16 * 16 * 4)
    // Last pixel's alpha: a scan that stops early, or steps by the wrong
    // stride, reports this buffer as empty and the tile gets dropped.
    pixels[pixels.length - 1] = 1
    expect(isFullyTransparent(pixels)).toBe(false)
  })

  it('ignores colour in a fully transparent buffer', () => {
    const pixels = new Uint8Array(4 * 4 * 4).fill(200)
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 0
    expect(isFullyTransparent(pixels)).toBe(true)
  })
})
