// (#464) The one place that knows how to gzip in a browser, because not every
// browser we have to run in knows how.
//
// The Compression Streams API (`CompressionStream`/`DecompressionStream`) is
// the natural way to do this and is what every path here uses when it can:
// it's built in, it streams, and it costs no bytes. It also shipped in Safari
// **16.4**, which is later than it sounds — an iPad on iPadOS 16.3 hit
// `ReferenceError: Can't find variable: DecompressionStream` the instant the
// 4 MB paper texture finished downloading, and the room refused to open with
// "the paper didn't load". The asset was fine; the browser could not unzip it.
//
// That device class is not an edge case for this product. The audience is
// teachers and students on whatever tablet is already in the house, and a
// hand-me-down iPad is the median one, not the worst one. So the missing API
// is filled in rather than declared unsupported.
//
// The fallback is a dynamic `import('fflate')` — ~11 KB gzipped, in its own
// chunk, fetched **only** by browsers that lack the native API. A modern
// browser never sees the request: the import sits behind a runtime check that
// it never passes. That's the whole reason the check is a function call rather
// than a module-level constant — bundlers happily keep both, but the network
// cost must land on nobody who doesn't need it.
//
// Detected per call, not once at load, for the same reason `paperLoader`'s
// caches evict rejections: this file is the seam a test replaces the global
// through, and a constant frozen at import time would make "pretend this is
// Safari 16.3" untestable.

/** Whether the platform can gzip on its own. Both directions are checked
 *  together on purpose: no shipping browser has one without the other, and a
 *  caller that got `true` for compress and `false` for decompress would be a
 *  worse thing to debug than a browser that simply has neither. */
function hasCompressionStreams(): boolean {
  return typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined'
}

/** fflate's synchronous entry points. Sync rather than its worker-backed async
 *  API: the worker variant builds its own Blob URL, which is one more thing to
 *  get past a CSP, and the cost it saves is not the cost that matters here.
 *  Inflating the 4 MB paper plane is tens of milliseconds even on a slow
 *  tablet, and it is immediately followed by `buildPaperCatch`'s 4.2M-iteration
 *  pass on the same thread — so moving only the smaller half off it would buy
 *  nothing a user could feel. */
async function loadFallback(): Promise<typeof import('fflate')> {
  return import('fflate')
}

/** Concatenates a byte stream. Used only on the fallback path, which is also
 *  why the native path is left piping into `new Response(...)` rather than
 *  routed through here: a browser too old for DecompressionStream is exactly
 *  the browser to stop handing extra stream plumbing to. */
async function readAllBytes(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/** Gunzips a stream — the paper loader's shape, where the bytes arrive from
 *  `fetch` and are counted for a progress bar *before* reaching here (see
 *  paperLoader's own note on why the counter sits on the compressed side).
 *
 *  Takes the stream rather than bytes so the native path stays streaming:
 *  nothing ever holds both the compressed and the inflated 4 MB at once on a
 *  browser that can avoid it.
 *
 *  Pinned to `Uint8Array<ArrayBuffer>` rather than the bare `Uint8Array` a
 *  reader would infer: that is the element type `Response.body` actually
 *  carries, and it is the only one DecompressionStream's writable side lines
 *  up with — widening it to `ArrayBufferLike` makes the pipeThrough below stop
 *  typechecking. */
export async function gunzipStream(stream: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<Uint8Array> {
  if (hasCompressionStreams()) {
    const decompressed = stream.pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(decompressed).arrayBuffer())
  }
  const { gunzipSync } = await loadFallback()
  return gunzipSync(await readAllBytes(stream))
}

/** Gunzips a buffer already in hand — the snapshot codec's shape, where the
 *  bytes came out of a JSON payload rather than off the wire. */
export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (hasCompressionStreams()) {
    // Copied into a fresh, plain-ArrayBuffer-backed Uint8Array — a caller's
    // Uint8Array can be typed over the wider ArrayBufferLike, which Blob's
    // constructor rejects.
    const decompressed = new Response(new Blob([new Uint8Array(bytes)]))
      .body!.pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(decompressed).arrayBuffer())
  }
  const { gunzipSync } = await loadFallback()
  return gunzipSync(bytes)
}

/** Gzips a buffer. The only compressing caller is the snapshot bake, and it
 *  matters that the fallback exists on this side too: a client that could read
 *  a room but never bake one would quietly stop contributing the snapshots
 *  that make a long room open fast for everyone else in it. */
export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (hasCompressionStreams()) {
    const compressed = new Response(new Blob([new Uint8Array(bytes)]))
      .body!.pipeThrough(new CompressionStream('gzip'))
    return new Uint8Array(await new Response(compressed).arrayBuffer())
  }
  const { gzipSync } = await loadFallback()
  // `mem: 9` rather than fflate's default 8: the payload is raw RGBA tiles
  // with long flat runs, the extra window pays for itself on exactly that
  // shape, and this path only ever runs on a device that is already the slow
  // one — spending a few more milliseconds to upload less is the right trade
  // on the connections this app is used over.
  return gzipSync(bytes, { mem: 9 })
}
