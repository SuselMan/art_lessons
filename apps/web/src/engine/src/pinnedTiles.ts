// (#467) How a checkpoint's pixels are held in memory between the moment they
// are taken and the rare moment a rebuild reads them back.
//
// **This format never leaves this process.** It is not written to disk, not
// sent to the server, and not part of any snapshot — `snapshotCodec.ts` owns
// the wire format and is the one that has to stay compatible. Nothing here has
// to survive a reload, which is the whole reason it can be this simple.
//
// Why it exists. Restoring a room pins one checkpoint per layer holding that
// layer's snapshot pixels, because the operations that painted them are below
// the log window and will never arrive — see _pinSnapshotCheckpoint. Those
// pinned checkpoints are exempt from the checkpoint byte budget, so they are
// held in full, forever, *on top of* the GL textures holding the same pixels.
// Measured on production room cdf314dd-153: 235 MB of pinned pixels beside
// 235 MB of textures, and 235 MB of a 256 MB budget spent, which crowds out
// the ordinary undo checkpoints the budget is for.
//
// Why run-length and not gzip. `_replayInto` is synchronous and sits under
// undo, redo, layer merge, duplicate and transform; `gzip.ts` is necessarily
// async (DecompressionStream is). Making the rebuild path async to save memory
// would be a large change to the most load-bearing code in the engine. A
// synchronous encoder that exploits what the data actually is — a drawing on a
// transparent sheet — needs neither.
//
// Measured on the same room's 69 non-empty tiles: **235 MB → 20 MB, ×11.8.**
// Cropping each tile to its content bounding box instead was measured too, at
// ×3.7, and is not worth its extra geometry.
//
// Lossless, deliberately. A run is a run of *entirely zero* pixels, not merely
// transparent ones: RGB under zero alpha is invisible but not necessarily
// meaningless (smudge samples colour off the layer), and a checkpoint is what a
// rebuild republishes. On real data the two definitions cost exactly the same —
// measured, both 20 MB — so there is nothing to trade.

/** Stored verbatim: the encoder gave up because the runs were not worth their
 *  own headers. Costs one byte over the raw pixels and bounds the worst case,
 *  which is otherwise 3x expansion on a tile with no two adjacent alike. */
const FORMAT_RAW = 0
/** Alternating (blankPixels:u32, literalPixels:u32, literal bytes) records. */
const FORMAT_RUNS = 1

function isZeroPixel(pixels: Uint8Array, index: number): boolean {
  const at = index << 2
  return pixels[at] === 0 && pixels[at + 1] === 0 && pixels[at + 2] === 0 && pixels[at + 3] === 0
}

/** Packs one tile's RGBA8 pixels for storage in a Checkpoint.
 *
 *  Measured on this room's real tiles: **6.7 ms per 1024x1024 tile**, so pinning
 *  a whole restored room costs ~0.4 s of main thread once, against a restore
 *  that already spends longer than that inflating the same pixels. Comparing
 *  four bytes rather than one 32-bit word is the slower of the two and the one
 *  kept: the word version measured 11% better and needs an alignment branch,
 *  since a decoded snapshot's tiles are subarrays that need not start on a word
 *  boundary. Eleven percent of an idle-time pass is not worth a second path. */
export function packTilePixels(pixels: Uint8Array): Uint8Array {
  const total = pixels.byteLength >> 2
  // Sized to the raw payload plus its tag: the moment the encoding would need
  // more than that, raw is the better answer and the loop below says so.
  const out = new Uint8Array(pixels.byteLength + 1)
  const view = new DataView(out.buffer)
  out[0] = FORMAT_RUNS
  let write = 1
  let read = 0
  while (read < total) {
    let blank = 0
    while (read + blank < total && isZeroPixel(pixels, read + blank)) blank++
    read += blank
    let literal = 0
    while (read + literal < total && !isZeroPixel(pixels, read + literal)) literal++
    if (write + 8 + (literal << 2) > out.byteLength) return packRaw(pixels)
    view.setUint32(write, blank, true); write += 4
    view.setUint32(write, literal, true); write += 4
    out.set(pixels.subarray(read << 2, (read + literal) << 2), write)
    write += literal << 2
    read += literal
  }
  return out.slice(0, write)
}

function packRaw(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.byteLength + 1)
  out[0] = FORMAT_RAW
  out.set(pixels, 1)
  return out
}

/** Inverse of `packTilePixels`. `byteLength` is the tile's own size, which the
 *  Checkpoint already carries as width x height x 4 — the packed form does not
 *  repeat it, and a caller that passes the wrong one gets a wrong-sized tile
 *  rather than a corrupt one. */
export function unpackTilePixels(packed: Uint8Array, byteLength: number): Uint8Array {
  // A view rather than a copy: every caller reads these pixels and drops them.
  if (packed[0] === FORMAT_RAW) return packed.subarray(1)
  const out = new Uint8Array(byteLength)
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  let read = 1
  let write = 0
  while (read < packed.byteLength) {
    const blank = view.getUint32(read, true); read += 4
    const literal = view.getUint32(read, true); read += 4
    write += blank << 2
    out.set(packed.subarray(read, read + (literal << 2)), write)
    write += literal << 2
    read += literal << 2
  }
  return out
}
