// Binary framing for #149 epic room snapshots — client-baked, sent to the
// server as an opaque blob (server never renders, see CLAUDE.md). Deliberate
// raw-bytes + native gzip, no image codec anywhere in the path — same
// reasoning as paperLoader.ts: a browser-owned decode pipeline (<img>,
// createImageBitmap) can apply color-space conversion inconsistently across
// devices, which is exactly the class of cross-device drift this project
// spent a week chasing down in the paper-grain work. Pure byte munging, no
// DOM/GL dependency beyond the standard Compression/DecompressionStream Web
// APIs, so it's usable from both engine/index.ts (per-layer encode) and the
// Room page (room-level bundling/upload/restore).

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

const ROOM_SNAPSHOT_VERSION = 1

/** Whole-room bundle (#149 epic design: a snapshot is atomic across every
 *  layer + LayerState as of one seq, not independent per-layer blobs — see
 *  the epic's own design notes on why LayerState has to travel with it).
 *  Layout: version:u8, layerCount:u32, then per layer layerIdLen:u16,
 *  layerId (utf8), <encodeLayerTiles output>. Compressed once, as a whole,
 *  via the native CompressionStream — this is the exact byte sequence that
 *  goes over HTTP as `data` in POST /api/rooms/:id/snapshots. */
export async function encodeRoomSnapshot(layers: Map<string, Uint8Array>): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const entries = [...layers.entries()].map(([layerId, tiles]) => ({ idBytes: encoder.encode(layerId), tiles }))

  let size = 1 + 4
  for (const e of entries) size += 2 + e.idBytes.byteLength + e.tiles.byteLength
  const buf = new Uint8Array(size)
  const view = new DataView(buf.buffer)
  let offset = 0
  buf[offset] = ROOM_SNAPSHOT_VERSION; offset += 1
  view.setUint32(offset, entries.length, true); offset += 4
  for (const e of entries) {
    view.setUint16(offset, e.idBytes.byteLength, true); offset += 2
    buf.set(e.idBytes, offset); offset += e.idBytes.byteLength
    buf.set(e.tiles, offset); offset += e.tiles.byteLength
  }

  const compressed = new Response(new Blob([buf])).body!.pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

/** Inverse of encodeRoomSnapshot. Throws on an unrecognized version rather
 *  than guessing at a layout it doesn't know — a future format bump should
 *  fail loudly here, not silently misparse. */
export async function decodeRoomSnapshot(compressed: Uint8Array): Promise<Map<string, SnapshotTile[]>> {
  // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — `compressed`
  // as received from a caller (e.g. base64-decoded fetch response) can be
  // typed over the wider ArrayBufferLike, which Blob's constructor rejects.
  const decompressed = new Response(new Blob([new Uint8Array(compressed)]))
    .body!.pipeThrough(new DecompressionStream('gzip'))
  const buf = new Uint8Array(await new Response(decompressed).arrayBuffer())

  let offset = 0
  const version = buf[offset]; offset += 1
  if (version !== ROOM_SNAPSHOT_VERSION) throw new Error(`decodeRoomSnapshot: unsupported version ${version}`)

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const layerCount = view.getUint32(offset, true); offset += 4
  const decoder = new TextDecoder()
  const result = new Map<string, SnapshotTile[]>()
  for (let i = 0; i < layerCount; i++) {
    const idLen = view.getUint16(offset, true); offset += 2
    const layerId = decoder.decode(buf.subarray(offset, offset + idLen)); offset += idLen
    const { tiles, nextOffset } = decodeLayerTiles(buf, offset)
    offset = nextOffset
    result.set(layerId, tiles)
  }
  return result
}
