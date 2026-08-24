import { tilesOverlappingRect } from './tileMath'
import type { SnapshotTile } from './snapshotCodec'

/** (#425) The sheet a bounded room's tiles are clipped to. Absent for an
 *  infinite room, which has no sheet and whose tiles are never clipped. */
export interface PageSize { w: number; h: number }

// (#469) Re-slices a snapshot's tiles onto the grid the buffer receiving them
// actually uses.
//
// This exists because a bounded room's tile size changed. It used to be the
// whole page — one texture of canvas.width x canvas.height per layer — and is
// now capped at TILE_SIZE, which is what stopped an A2 page (133 MiB a layer)
// from killing a tablet's tab. Every snapshot baked before that change still
// carries the old shape: one tile, page-sized, at the page origin.
//
// Handing such a tile to a 1024-grid buffer is not a near miss, it is silent
// corruption. restoreLayerFromSnapshot resolves the tile's world rect to
// whichever tiles it covers and uploads the pixel array into each of them; a
// 2480x3508 array uploaded into a 1024x1024 texture is read as the first
// 1024*1024 pixels of a 2480-wide image, so every row lands shifted by a
// different amount and each of the twelve tiles gets the same wrong picture.
// Old rooms would have opened as garbage.
//
// Deliberately pure and free of GL. The alternative — upload the old page into
// a scratch texture and blit sub-rects out of it — would be shorter and would
// allocate exactly the page-sized buffer this whole change exists to stop
// allocating, on precisely the rooms that cannot afford it.

/** Whether `tile` already sits inside a single cell of the `tileW` x `tileH`
 *  grid, so it can be passed straight through without copying a single byte.
 *  This is the case for every snapshot baked after the change and for every
 *  infinite room ever — i.e. the overwhelmingly common one, which is why it is
 *  checked first.
 *
 *  (#425) A cell, or the part of one that is still on the sheet. A bounded
 *  room's grid overhangs its page, and a bake now clips that overhang away, so
 *  an edge tile is grid-aligned and shorter or narrower than a cell. Re-slicing
 *  is only ever needed when a source tile spans more than one destination cell
 *  — the case this file was written for (a page-sized tile from before #469).
 *  Sending a clipped edge tile down the slicing path instead would be correct
 *  but would cost what this fast path exists to save: a full cell-sized
 *  allocation and an alpha scan per tile, at join time, on the devices least
 *  able to afford either.
 *
 *  The rule is deliberately "ends where the sheet ends" rather than the simpler
 *  "no bigger than a cell". The loose version lets a half-width tile at x=0
 *  through, and that is precisely the merge case below: two source tiles
 *  landing in one destination have to combine, not both survive. Without
 *  `page` — an infinite room, which has no sheet to end at — this stays the
 *  original exact match. */
function matchesGrid(tile: SnapshotTile, tileW: number, tileH: number, page?: PageSize): boolean {
  if (tile.originX % tileW !== 0 || tile.originY % tileH !== 0) return false
  if (tile.width > tileW || tile.height > tileH) return false
  const fitsX = tile.width === tileW || (page !== undefined && tile.originX + tile.width === page.w)
  const fitsY = tile.height === tileH || (page !== undefined && tile.originY + tile.height === page.h)
  return fitsX && fitsY
}

/** True when nothing in `pixels` is even partly opaque. Used by the caller to
 *  drop tiles that would cost 4 MiB of texture to say nothing — the difference
 *  between an old page-sized snapshot of a barely-touched layer costing twelve
 *  tiles and costing none. */
export function isFullyTransparent(pixels: Uint8Array): boolean {
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) return false
  }
  return true
}

/** Re-slices `tiles` onto the `tileW` x `tileH` grid rooted at world origin.
 *
 *  The row arithmetic is the part worth reading twice. A tile's pixel array is
 *  GL bottom-up — row 0 is the *bottom* row of the tile — while the world rect
 *  it carries is top-down like every other WorldRect in the engine (the same
 *  gap scanLocalContentRect bridges, and for the same reason). So world row `y`
 *  lives at array row `(originY + height - 1 - y)`, on both sides of the copy,
 *  and the two do not agree unless each is computed against its own tile's
 *  origin and height. Getting this wrong flips content vertically per tile,
 *  which looks close enough to right on a symmetric test fixture to survive a
 *  careless test — hence the deliberately asymmetric ones. */
export function retileSnapshotTiles(
  tiles: SnapshotTile[], tileW: number, tileH: number, page?: PageSize,
): SnapshotTile[] {
  // Returned by identity when there is nothing to do, and callers lean on
  // that: it is how the restore path knows it may skip the per-tile alpha
  // scan below on the case that is always taken in practice.
  if (tiles.every(t => matchesGrid(t, tileW, tileH, page))) return tiles

  const out: SnapshotTile[] = []
  // Keyed by grid origin: two source tiles can overlap one destination tile
  // (they cannot today, but a future bake that splits differently would), and
  // the second must merge into the first rather than replace it.
  const built = new Map<string, SnapshotTile>()

  for (const src of tiles) {
    if (matchesGrid(src, tileW, tileH, page)) {
      out.push(src)
      continue
    }
    const srcRect = {
      minX: src.originX, minY: src.originY,
      maxX: src.originX + src.width, maxY: src.originY + src.height,
    }
    for (const { tileX, tileY } of tilesOverlappingRect(srcRect, tileW, tileH)) {
      const originX = tileX * tileW
      const originY = tileY * tileH
      const x0 = Math.max(srcRect.minX, originX)
      const x1 = Math.min(srcRect.maxX, originX + tileW)
      const y0 = Math.max(srcRect.minY, originY)
      const y1 = Math.min(srcRect.maxY, originY + tileH)
      if (x1 <= x0 || y1 <= y0) continue

      const key = `${originX},${originY}`
      let dest = built.get(key)
      if (!dest) {
        dest = { originX, originY, width: tileW, height: tileH, pixels: new Uint8Array(tileW * tileH * 4) }
        built.set(key, dest)
        out.push(dest)
      }

      const rowBytes = (x1 - x0) * 4
      for (let y = y0; y < y1; y++) {
        const srcRow = src.originY + src.height - 1 - y
        const dstRow = originY + tileH - 1 - y
        const srcOff = (srcRow * src.width + (x0 - src.originX)) * 4
        const dstOff = (dstRow * tileW + (x0 - originX)) * 4
        dest.pixels.set(src.pixels.subarray(srcOff, srcOff + rowBytes), dstOff)
      }
    }
  }
  return out
}

/** (#425) The part of a resident tile that is still on the sheet, as a snapshot
 *  tile — or the tile unchanged when none of it hangs off.
 *
 *  A bounded room's tile grid does not divide its canvas: 1754x2480 on
 *  1024-pixel tiles runs to 2048 across and 3072 down. Nothing can ever display
 *  those pixels, and yet they were baked, gzipped, stored, shipped and inflated
 *  by every client on every first join. Measured on room U68gWoq- (5 layers,
 *  20 tiles): 6.70 MB on the wire, 4.81 MB clipped — 28%, for pixels that are
 *  not there. The codec cannot compete with that: #427 measured every
 *  alternative encoding and found 13% at best, because graphite is honest
 *  high-entropy noise.
 *
 *  The row arithmetic is where this goes wrong quietly, so: `pixels` is GL
 *  order, bottom-up — array row 0 is the tile's *bottom*, world row
 *  `originY + height - 1`. The rows that survive are world rows
 *  `originY .. originY + keepH - 1`, the *top* of the tile, which in this array
 *  are the *last* keepH rows. Keeping the first keepH instead preserves exactly
 *  the off-sheet half and discards the drawing — and on any symmetric fixture
 *  it looks very nearly right. Columns need no such care: rows run left to
 *  right in both conventions, so the surviving columns are simply the first
 *  keepW.
 *
 *  Returns the original `pixels` by reference when nothing is clipped: that is
 *  the common case (every interior tile, every infinite room), and it must not
 *  cost a copy of four megabytes to discover. */
export function clipTileToPage(
  originX: number, originY: number, width: number, height: number,
  pixels: Uint8Array, page: PageSize,
): SnapshotTile {
  const keepW = Math.max(0, Math.min(width, page.w - originX))
  const keepH = Math.max(0, Math.min(height, page.h - originY))
  if (keepW === width && keepH === height) return { originX, originY, width, height, pixels }

  const clipped = new Uint8Array(keepW * keepH * 4)
  const firstRow = height - keepH
  for (let y = 0; y < keepH; y++) {
    const from = ((firstRow + y) * width) * 4
    clipped.set(pixels.subarray(from, from + keepW * 4), y * keepW * 4)
  }
  return { originX, originY, width: keepW, height: keepH, pixels: clipped }
}
