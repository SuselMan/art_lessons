// (#500) The bottom band of every bounded room, lost on every snapshot
// restore.
//
// #425 made a bake drop the part of an edge tile that hangs off the sheet.
// clipTileToPage keeps the rows that are still *on* the sheet — the tile's
// world-top rows, which in a GL bottom-up array are its last ones. The restore
// then uploaded that shorter payload at yoffset 0, which is the tile's
// *bottom*: on a 2480x3508 page the bottom row of tiles put its 436 surviving
// rows at world y 3660..4095 instead of 3072..3507, i.e. under the paper,
// where nothing renders it. Worse than invisible — the next bake reads that
// tile, clips it to the sheet again, finds the top 436 rows now empty, and
// writes the loss back to the server.
//
// So the assertion below is about placement, not pixels: where in the texture
// a payload smaller than the texture lands. MockGL models that faithfully
// (its `data` is indexed exactly as texImage2D wrote it and readPixels reads
// it back, the same index-identity real GL has), which is enough — and it is
// all a mock can honestly say here.
import { describe, expect, it } from 'vitest'

import { MockGL } from '../testing/mockGL'
import { AccumulationBuffer } from './AccumulationBuffer'
import { clipTileToPage } from './retileSnapshot'

const TILE = 8

/** A full tile whose every row carries its own world row number in alpha, so
 *  a readback says where each row *ended up*, not merely that something did.
 *  Bottom-up: array row r is world row `originY + height - 1 - r`. */
function tileTaggedByWorldRow(originY: number): Uint8Array {
  const pixels = new Uint8Array(TILE * TILE * 4)
  for (let r = 0; r < TILE; r++) {
    const worldY = originY + TILE - 1 - r
    for (let c = 0; c < TILE; c++) pixels[(r * TILE + c) * 4 + 3] = worldY + 1
  }
  return pixels
}

/** World row -> the value a readback of `pixels` reports for it, or 0 where
 *  the row came back empty. */
function worldRowValue(pixels: Uint8Array, originY: number, worldY: number): number {
  const r = originY + TILE - 1 - worldY
  return pixels[r * TILE * 4 + 3]
}

describe('AccumulationBuffer clipped restore (#500)', () => {
  it('puts a page-clipped payload back on the rows it was cut from', () => {
    const gl = new MockGL() as unknown as WebGLRenderingContext
    // A sheet that ends 3 rows into this tile — the shape every bounded room
    // has at its bottom edge, just small enough to read.
    const originY = TILE
    const page = { w: TILE, h: originY + 3 }

    const clipped = clipTileToPage(0, originY, TILE, TILE, tileTaggedByWorldRow(originY), page)
    expect(clipped.height).toBe(3)

    const buf = new AccumulationBuffer(gl, TILE, TILE)
    buf.restorePixelsRect(clipped.width, clipped.height, clipped.pixels)
    const back = buf.readPixels()

    // The three surviving world rows are the ones the sheet still shows.
    for (let worldY = originY; worldY < page.h; worldY++) {
      expect(worldRowValue(back, originY, worldY)).toBe(worldY + 1)
    }
    // And nothing was smuggled below the sheet, where no one would ever see
    // it and the next bake would drop it for good.
    for (let worldY = page.h; worldY < originY + TILE; worldY++) {
      expect(worldRowValue(back, originY, worldY)).toBe(0)
    }
  })

  it('leaves a full-size payload alone', () => {
    const gl = new MockGL() as unknown as WebGLRenderingContext
    const buf = new AccumulationBuffer(gl, TILE, TILE)
    buf.restorePixelsRect(TILE, TILE, tileTaggedByWorldRow(0))
    const back = buf.readPixels()
    for (let worldY = 0; worldY < TILE; worldY++) {
      expect(worldRowValue(back, 0, worldY)).toBe(worldY + 1)
    }
  })
})
