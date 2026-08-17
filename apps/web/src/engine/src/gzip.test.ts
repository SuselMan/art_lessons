import { afterEach, describe, expect, it } from 'vitest'

import { gunzipBytes, gunzipStream, gzipBytes } from './gzip'

// (#464) The point of this file is the *fallback*, not the happy path: Node
// has Compression Streams, so every other test in the suite — and every
// developer's browser — only ever exercises the native branch. The branch that
// actually broke an iPad is the one nothing would otherwise run.
//
// "Pretend this is Safari 16.3" is done by deleting the globals, which is why
// gzip.ts detects them per call rather than caching the answer at import time.

const nativeCompression = globalThis.CompressionStream
const nativeDecompression = globalThis.DecompressionStream

/** Removes the Compression Streams API for the duration of `run`, restoring it
 *  afterwards even if the body throws — a leaked deletion would silently push
 *  every later test in this worker onto the fallback. */
async function withoutCompressionStreams<T>(run: () => Promise<T>): Promise<T> {
  Reflect.deleteProperty(globalThis, 'CompressionStream')
  Reflect.deleteProperty(globalThis, 'DecompressionStream')
  try {
    return await run()
  } finally {
    globalThis.CompressionStream = nativeCompression
    globalThis.DecompressionStream = nativeDecompression
  }
}

afterEach(() => {
  globalThis.CompressionStream = nativeCompression
  globalThis.DecompressionStream = nativeDecompression
})

/** Deliberately not random bytes: a payload with runs in it proves the inflate
 *  reassembled the stream rather than merely returning something of the right
 *  length, and it is closer to what both real callers carry (a height plane
 *  and RGBA tiles) than white noise would be. */
function fixture(length = 64 * 1024): Uint8Array<ArrayBuffer> {
  return Uint8Array.from({ length }, (_, i) => (i % 97) * ((i >> 8) % 3))
}

describe('gzip without the Compression Streams API', () => {
  it('gunzips bytes a native CompressionStream produced', async () => {
    const raw = fixture()
    const compressed = await gzipBytes(raw)

    const out = await withoutCompressionStreams(() => gunzipBytes(compressed))

    expect(out).toEqual(raw)
  })

  it('gunzips a stream, so the paper loader works on Safari 16.3', async () => {
    const raw = fixture()
    // Copied into a plain-ArrayBuffer-backed view: gzipBytes returns the wider
    // `Uint8Array<ArrayBufferLike>`, and the stream below is typed as the
    // narrower element type `Response.body` carries — see gunzipStream.
    const compressed = new Uint8Array(await gzipBytes(raw))

    const out = await withoutCompressionStreams(() => (
      // Chunked into several reads on purpose: the fallback has to concatenate
      // the stream itself, and a single-chunk body would pass even if it
      // dropped everything after the first read.
      gunzipStream(new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          const step = Math.ceil(compressed.byteLength / 5)
          for (let at = 0; at < compressed.byteLength; at += step) {
            controller.enqueue(compressed.subarray(at, at + step))
          }
          controller.close()
        },
      }))
    ))

    expect(out).toEqual(raw)
  })

  it('gzips into something the native decompressor accepts', async () => {
    const raw = fixture()

    // The two halves are checked across the seam rather than against each
    // other: a fallback that only round-trips with itself would still break a
    // room, because the bytes it uploads are read back by everybody else's
    // browser — and by this same client after an update.
    const compressed = await withoutCompressionStreams(() => gzipBytes(raw))

    expect(await gunzipBytes(compressed)).toEqual(raw)
  })

  it('round-trips entirely within the fallback', async () => {
    const raw = fixture()

    const out = await withoutCompressionStreams(async () => (
      gunzipBytes(await gzipBytes(raw))
    ))

    expect(out).toEqual(raw)
  })
})

describe('gzip with the native API', () => {
  it('round-trips bytes', async () => {
    const raw = fixture()
    expect(await gunzipBytes(await gzipBytes(raw))).toEqual(raw)
  })

  it('round-trips a stream', async () => {
    const raw = fixture()
    // Copied into a plain-ArrayBuffer-backed view: gzipBytes returns the wider
    // `Uint8Array<ArrayBufferLike>`, which Response's constructor rejects.
    const compressed = new Uint8Array(await gzipBytes(raw))
    expect(await gunzipStream(new Response(compressed).body!)).toEqual(raw)
  })
})
