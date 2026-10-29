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

import { isRasterPixelEncoding, type RasterPixelEncoding } from '@grafetto/shared'
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
 *  the one caller. Straight RGBA8 prepends an eight-byte envelope:
 *  0xffffffff:u32, version=1:u8, encoding=1:u8, reserved=0:u16.
 *  Legacy bytes remain unchanged. Decoding requires the expected encoding
 *  pinned by the authoritative room; the envelope never selects a room mode.
 *  Compression wraps the complete per-layer payload. */
const ENCODING_HEADER = 0xffffffff

export function encodeLayerTiles(tiles: SnapshotTile[], pixelEncoding: RasterPixelEncoding = 'premultiplied-rgba8'): Uint8Array {
  if (!isRasterPixelEncoding(pixelEncoding)) throw new TypeError('Unsupported snapshot pixel encoding')
  const tagged = pixelEncoding === 'straight-rgba8'
  let size = tagged ? 12 : 4
  for (const t of tiles) {
    if (![t.originX, t.originY].every(n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)
      || ![t.width, t.height].every(n => Number.isInteger(n) && n > 0 && n <= 0xffffffff)
      || !Number.isSafeInteger(t.width * t.height * 4) || t.pixels.byteLength !== t.width * t.height * 4)
      throw new RangeError('Invalid snapshot tile')
    size += 16 + t.pixels.byteLength
  }
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  let offset = 0
  if (tagged) {
    view.setUint32(0, ENCODING_HEADER, true)
    view.setUint8(4, 1) // envelope version
    view.setUint8(5, 1) // straight RGBA8; all reserved bytes remain zero
    offset = 8
  }
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
 *  layer from. Tile `pixels` are subarray views into `buf`, not copies.
 *  Encoding mismatch/unknown envelope/truncated tiles reject before return. */
export function decodeLayerTiles(buf: Uint8Array, offset: number, expectedEncoding: RasterPixelEncoding = 'premultiplied-rgba8'): { tiles: SnapshotTile[]; nextOffset: number; pixelEncoding: RasterPixelEncoding } {
  if (!isRasterPixelEncoding(expectedEncoding)) throw new TypeError('Unsupported snapshot pixel encoding')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const need = (bytes: number) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(bytes) || bytes < 0 || offset + bytes > buf.byteLength)
      throw new RangeError('Truncated snapshot tile payload')
  }
  need(4)
  let pixelEncoding: RasterPixelEncoding = 'premultiplied-rgba8'
  if (view.getUint32(offset, true) === ENCODING_HEADER) {
    need(12)
    if (view.getUint8(offset + 4) !== 1 || view.getUint8(offset + 5) !== 1 || view.getUint16(offset + 6, true) !== 0)
      throw new TypeError('Unsupported snapshot encoding envelope')
    pixelEncoding = 'straight-rgba8'
    offset += 8
  }
  if (pixelEncoding !== expectedEncoding) throw new TypeError('Snapshot pixel encoding does not match the room')
  const tileCount = view.getUint32(offset, true); offset += 4
  if (tileCount > Math.floor((buf.byteLength - offset) / 16)) throw new RangeError('Invalid snapshot tile count')
  const tiles: SnapshotTile[] = []
  for (let i = 0; i < tileCount; i++) {
    need(16)
    const originX = view.getInt32(offset, true); offset += 4
    const originY = view.getInt32(offset, true); offset += 4
    const width = view.getUint32(offset, true); offset += 4
    const height = view.getUint32(offset, true); offset += 4
    const byteLength = width * height * 4
    if (!width || !height) throw new RangeError('Invalid snapshot tile dimensions')
    need(byteLength)
    const pixels = buf.subarray(offset, offset + byteLength)
    offset += byteLength
    tiles.push({ originX, originY, width, height, pixels })
  }
  return { tiles, nextOffset: offset, pixelEncoding }
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
