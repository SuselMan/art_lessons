// Binary framing for #149 epic room snapshots — client-baked, sent to the
// server as an opaque blob (server never renders, see CLAUDE.md). Deliberate
// raw-bytes + native gzip, no image codec anywhere in the path — same
// reasoning as paperLoader.ts: a browser-owned decode pipeline (<img>,
// createImageBitmap) can apply color-space conversion inconsistently across
// devices, which is exactly the class of cross-device drift this project
// spent a week chasing down in the paper-grain work. Pure byte munging, no
// DOM/GL dependency beyond gzip, so it's usable from both engine/index.ts
// (per-layer encode) and the Room page (room-level bundling/upload/restore).
//
// (#464) "Native gzip" is now "gzip via gzip.ts", which falls back to a JS
// inflater where the Compression Streams API is missing — Safari below 16.4.
// Not a detail this file can skip: a client that cannot gunzip here cannot
// restore a room from a snapshot at all, and one that cannot gzip stops
// contributing the snapshots everyone else's fast rejoin depends on.

import { gunzipBytes, gzipBytes } from './gzip'

export interface SnapshotTile {
  originX: number
  originY: number
  width: number
  height: number
  pixels: Uint8Array // RGBA8, exactly width*height*4 bytes
}

/** Raw (uncompressed) per-layer tile payload: tileCount:u32, then per tile
 *  originX:i32, originY:i32, width:u32, height:u32, pixels (raw RGBA8, no
 *  compression at this layer) — see engine/index.ts's bakeNetworkSnapshot,
 *  the one caller. Compression happens once, on the room-level bundle this
 *  gets embedded into (encodeRoomSnapshot below), not per layer. */
export function encodeLayerTiles(tiles: SnapshotTile[]): Uint8Array {
  let size = 4
  for (const t of tiles) size += 16 + t.pixels.byteLength
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  let offset = 0
  view.setUint32(offset, tiles.length, true); offset += 4
  for (const t of tiles) {
    view.setInt32(offset, t.originX, true); offset += 4
    view.setInt32(offset, t.originY, true); offset += 4
    view.setUint32(offset, t.width, true); offset += 4
    view.setUint32(offset, t.height, true); offset += 4
    buf.set(t.pixels, offset); offset += t.pixels.byteLength
  }
  return buf
}

/** Inverse of encodeLayerTiles, reading from `offset` into `buf` (part of a
 *  larger room-level buffer — see decodeRoomSnapshot). Returns the tiles and
 *  the offset just past them, for the caller to continue reading the next
 *  layer from. Tile `pixels` are subarray views into `buf`, not copies. */
export function decodeLayerTiles(buf: Uint8Array, offset: number): { tiles: SnapshotTile[]; nextOffset: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tileCount = view.getUint32(offset, true)
  offset += 4
  const tiles: SnapshotTile[] = []
  for (let i = 0; i < tileCount; i++) {
    const originX = view.getInt32(offset, true); offset += 4
    const originY = view.getInt32(offset, true); offset += 4
    const width = view.getUint32(offset, true); offset += 4
    const height = view.getUint32(offset, true); offset += 4
    const byteLength = width * height * 4
    const pixels = buf.subarray(offset, offset + byteLength)
    offset += byteLength
    tiles.push({ originX, originY, width, height, pixels })
  }
  return { tiles, nextOffset: offset }
}

/** Gzips one layer's `encodeLayerTiles` output — the exact byte sequence that
 *  goes over HTTP as a layer's `data` in POST /api/rooms/:id/snapshots (#371).
 *
 *  There is no room-level bundle any more. There used to be, because a
 *  snapshot was atomic across every layer at one seq; per-layer coverage
 *  removed the shared moment that made bundling mean anything, and with it the
 *  version byte and the layerId framing — a row already knows which layer and
 *  which seq it is. */
export async function compressLayerTiles(raw: Uint8Array): Promise<Uint8Array> {
  return gzipBytes(raw)
}

/** Inverse of compressLayerTiles: gunzips to the raw `encodeLayerTiles` bytes,
 *  which `decodeLayerTiles(buf, 0)` then reads. */
export async function decompressLayerTiles(compressed: Uint8Array): Promise<Uint8Array> {
  return gunzipBytes(compressed)
}
