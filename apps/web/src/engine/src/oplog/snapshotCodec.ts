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
  /** Color Smudge's unshaded colour and premultiplied gray height field.
   * Absent means dry paint: colour is pixels and height is transparent.
   * These are state, not optional display previews. Never discard one plane. */
  colorSmudge?: { color: Uint8Array; height: Uint8Array }
}

const MATERIAL_FRAME = 0xffffffff
const MATERIAL_VERSION = 1

function tileBytes(tile: SnapshotTile): number {
  if (![tile.originX,tile.originY].every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647)
    || ![tile.width,tile.height].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff)) throw new Error('Invalid snapshot tile geometry')
  const bytes=tile.width*tile.height*4
  if (!Number.isSafeInteger(bytes)||tile.pixels.byteLength!==bytes
    || tile.colorSmudge && (tile.colorSmudge.color.byteLength!==bytes||tile.colorSmudge.height.byteLength!==bytes)) throw new Error('Incomplete snapshot tile planes')
  return bytes
}

/** Raw (uncompressed) per-layer tile payload: tileCount:u32, then per tile
 *  originX:i32, originY:i32, width:u32, height:u32, pixels (raw RGBA8, no
 *  compression at this layer) — see engine/index.ts's bakeNetworkSnapshot,
 *  the one caller. Compression happens once, on the room-level bundle this
 *  gets embedded into (encodeRoomSnapshot below), not per layer. */
export function encodeLayerTiles(tiles: SnapshotTile[]): Uint8Array {
  // Keep old ordinary RGBA snapshots byte-for-byte. The impossible legacy
  // count is an explicit new frame, so older clients fail instead of silently
  // flattening material and changing subsequent brush strokes.
  const material=tiles.some(t=>t.colorSmudge!==undefined)
  let size = material ? 12 : 4
  if (tiles.length>=MATERIAL_FRAME) throw new Error('Too many snapshot tiles')
  for (const t of tiles) size += 16 + (material ? 4 : 0) + tileBytes(t)*(t.colorSmudge ? 3 : 1)
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  let offset = 0
  if (material) {
    view.setUint32(offset,MATERIAL_FRAME,true);offset+=4
    view.setUint32(offset,MATERIAL_VERSION,true);offset+=4
  }
  view.setUint32(offset, tiles.length, true); offset += 4
  for (const t of tiles) {
    if (material) {view.setUint32(offset,t.colorSmudge ? 1 : 0,true);offset+=4}
    view.setInt32(offset, t.originX, true); offset += 4
    view.setInt32(offset, t.originY, true); offset += 4
    view.setUint32(offset, t.width, true); offset += 4
    view.setUint32(offset, t.height, true); offset += 4
    buf.set(t.pixels, offset); offset += t.pixels.byteLength
    if (t.colorSmudge) {
      buf.set(t.colorSmudge.color,offset);offset+=t.colorSmudge.color.byteLength
      buf.set(t.colorSmudge.height,offset);offset+=t.colorSmudge.height.byteLength
    }
  }
  return buf
}

/** Inverse of encodeLayerTiles, reading from `offset` into `buf` (part of a
 *  larger room-level buffer — see decodeRoomSnapshot). Returns the tiles and
 *  the offset just past them, for the caller to continue reading the next
 *  layer from. Tile `pixels` are subarray views into `buf`, not copies. */
export function decodeLayerTiles(buf: Uint8Array, offset: number): { tiles: SnapshotTile[]; nextOffset: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const requireBytes=(count:number):void=>{
    if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(count)||count<0||count>buf.byteLength-offset) throw new Error('Truncated snapshot tile frame')
  }
  const word=():number=>{requireBytes(4);const n=view.getUint32(offset,true);offset+=4;return n}
  let tileCount=word()
  const material=tileCount===MATERIAL_FRAME
  if (material) {
    if (word()!==MATERIAL_VERSION) throw new Error('Unknown snapshot material version')
    tileCount=word()
  }
  if (tileCount>Math.floor((buf.byteLength-offset)/(material ? 20 : 16))) throw new Error('Truncated snapshot tile headers')
  const tiles: SnapshotTile[] = []
  for (let i = 0; i < tileCount; i++) {
    const flags=material ? word() : 0
    if (flags>1) throw new Error('Unknown snapshot material planes')
    requireBytes(16)
    const originX = view.getInt32(offset, true); offset += 4
    const originY = view.getInt32(offset, true); offset += 4
    const width = view.getUint32(offset, true); offset += 4
    const height = view.getUint32(offset, true); offset += 4
    const byteLength = width * height * 4
    requireBytes(byteLength*(flags===1 ? 3 : 1))
    const pixels = buf.subarray(offset, offset + byteLength)
    offset += byteLength
    const tile:SnapshotTile={ originX, originY, width, height, pixels }
    if(flags===1) {
      const color=buf.subarray(offset,offset+byteLength);offset+=byteLength
      const height=buf.subarray(offset,offset+byteLength);offset+=byteLength
      tile.colorSmudge={color,height}
    }
    tiles.push(tile)
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
