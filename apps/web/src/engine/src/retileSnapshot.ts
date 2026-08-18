import { tilesOverlappingRect } from './tileMath'
import type { SnapshotTile } from './snapshotCodec'

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

/** Whether `tile` already sits exactly on the `tileW` x `tileH` grid, so it can
 *  be passed straight through without copying a single byte. This is the case
 *  for every snapshot baked after the change and for every infinite room ever
 *  — i.e. the overwhelmingly common one, which is why it is checked first. */
function matchesGrid(tile: SnapshotTile, tileW: number, tileH: number): boolean {
  return tile.width === tileW && tile.height === tileH
    && tile.originX % tileW === 0 && tile.originY % tileH === 0
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
  tiles: SnapshotTile[], tileW: number, tileH: number,
): SnapshotTile[] {
  // Returned by identity when there is nothing to do, and callers lean on
  // that: it is how the restore path knows it may skip the per-tile alpha
  // scan below on the case that is always taken in practice.
  if (tiles.every(t => matchesGrid(t, tileW, tileH))) return tiles

  const out: SnapshotTile[] = []
  // Keyed by grid origin: two source tiles can overlap one destination tile
  // (they cannot today, but a future bake that splits differently would), and
  // the second must merge into the first rather than replace it.
  const built = new Map<string, SnapshotTile>()

  for (const src of tiles) {
    if (matchesGrid(src, tileW, tileH)) {
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
