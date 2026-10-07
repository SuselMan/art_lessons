import { compressLayerTiles } from '../../../engine/snapshots'

// Full A2 RGBA tiles occupy33.19MiB; cap bounds the extra transfer clone.
const MAX_WORKER_INPUT = 40 * 1024 * 1024
const MAX_WORKER_OUTPUT = 48 * 1024 * 1024

async function workerCompression(bytes: Uint8Array): Promise<Uint8Array> {
  const worker = new Worker(new URL('./snapshotCompression.worker.ts', import.meta.url), { type: 'module' })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Transfer only this exact-view clone: engine/caller snapshot stays owned.
    const clone = bytes.slice()
    return await new Promise<Uint8Array>((resolve, reject) => {
      timer = setTimeout(() => reject(Error('snapshot compression timeout')), 30_000)
      worker.onerror = () => reject(Error('snapshot compression worker failed'))
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1 || data.error || !(data.buffer instanceof ArrayBuffer)
          || data.buffer.byteLength > MAX_WORKER_OUTPUT || !Number.isSafeInteger(data.offset)
          || !Number.isSafeInteger(data.length) || data.offset < 0 || data.length <= 0
          || data.offset + data.length > data.buffer.byteLength) {
          reject(Error('invalid snapshot compression reply'))
          return
        }
        resolve(new Uint8Array(data.buffer, data.offset, data.length))
      }
      worker.postMessage({ id: 1, buffer: clone.buffer }, [clone.buffer])
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    worker.terminate()
  }
}

/** Transport-only experiment. Bake and its watermark remain synchronous. */
export async function compressSnapshot(bytes: Uint8Array, useWorker = false): Promise<Uint8Array> {
  if (!useWorker || typeof Worker === 'undefined' || bytes.byteLength > MAX_WORKER_INPUT) return compressLayerTiles(bytes)
  try {
    return await workerCompression(bytes)
  } catch {
    return compressLayerTiles(bytes)
  }
}
