import { gzipBytes } from '/src/engine/src/oplog/gzip.ts'
self.onmessage = async ({ data }) => {
  try {
    const source = new Uint8Array(data.buffer, data.offset, data.length)
    const started = performance.now()
    const compressed = await gzipBytes(source)
    const elapsed = performance.now() - started
    self.postMessage({ id: data.id, buffer: compressed.buffer, offset: compressed.byteOffset, length: compressed.byteLength, elapsed }, [compressed.buffer])
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) })
  }
}
