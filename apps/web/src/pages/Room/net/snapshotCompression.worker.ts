import { compressLayerTiles } from '../../../engine/snapshots'

const port = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => void) | null
  postMessage(data: unknown, transfer?: Transferable[]): void
}
port.onmessage = async ({ data }) => {
  try {
    const compressed = await compressLayerTiles(new Uint8Array(data.buffer))
    const buffer = compressed.buffer instanceof ArrayBuffer ? compressed.buffer : compressed.slice().buffer
    const offset = buffer === compressed.buffer ? compressed.byteOffset : 0
    port.postMessage({ id: data.id, buffer, offset, length: compressed.byteLength }, [buffer])
  } catch (error) {
    port.postMessage({ id: data.id, error: String(error) })
  }
}
