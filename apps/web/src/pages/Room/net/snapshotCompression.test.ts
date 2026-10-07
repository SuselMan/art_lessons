import { afterEach, expect, it, vi } from 'vitest'
import { compressSnapshot } from './snapshotCompression'
import { compressLayerTiles, decompressLayerTiles } from '../../../engine/snapshots'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function fixture(mode: 'good' | 'error' | 'invalid' | 'timeout' | 'throw' = 'good') {
  const instances: FakeWorker[] = []
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null
    onerror: (() => void) | null = null
    terminate = vi.fn()
    sent: Uint8Array | null = null
    constructor() { instances.push(this) }
    postMessage(message: { id: number; buffer: ArrayBuffer }, transfer: Transferable[]) {
      if (mode === 'throw') throw Error('transfer failed')
      const owned = structuredClone(message, { transfer })
      this.sent = new Uint8Array(owned.buffer)
      if (mode === 'timeout') return
      if (mode === 'error') { queueMicrotask(() => this.onerror?.()); return }
      if (mode === 'invalid') { queueMicrotask(() => this.onmessage?.({ data: { id: 2 } })); return }
      void compressLayerTiles(this.sent).then(compressed => this.onmessage?.({
        data: { id: 1, buffer: compressed.buffer, offset: compressed.byteOffset, length: compressed.byteLength },
      }))
    }
  }
  vi.stubGlobal('Worker', FakeWorker)
  return instances
}

it('keeps workers off by default', async () => {
  const instances = fixture()
  const raw = new Uint8Array([1, 2, 255])
  expect(await decompressLayerTiles(await compressSnapshot(raw))).toEqual(raw)
  expect(instances).toHaveLength(0)
})

it('transfers an exact-view clone, preserving caller bytes and closing the worker once', async () => {
  const instances = fixture()
  const backing = Uint8Array.from({ length: 65540 }, (_, i) => i & 255)
  const raw = backing.subarray(2, 65539), before = raw.slice()
  const result = await compressSnapshot(raw, true)
  expect(await decompressLayerTiles(result)).toEqual(before)
  expect(raw).toEqual(before)
  expect(backing).toHaveLength(65540)
  expect(instances[0].sent).toEqual(before)
  expect(instances[0].terminate).toHaveBeenCalledOnce()
})

for (const mode of ['error', 'invalid', 'throw'] as const) {
  it(`falls back to exact compression and closes after ${mode}`, async () => {
    const instances = fixture(mode), raw = new Uint8Array([3, 4, 255])
    expect(await decompressLayerTiles(await compressSnapshot(raw, true))).toEqual(raw)
    expect(instances[0].terminate).toHaveBeenCalledOnce()
  })
}

it('terminates a hung worker before falling back', async () => {
  vi.useFakeTimers()
  const instances = fixture('timeout'), raw = new Uint8Array([1, 2, 3])
  const pending = compressSnapshot(raw, true)
  await vi.advanceTimersByTimeAsync(30_000)
  expect(await decompressLayerTiles(await pending)).toEqual(raw)
  expect(instances[0].terminate).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('retains the old encoder when workers are unavailable', async () => {
  vi.stubGlobal('Worker', undefined)
  const raw = new Uint8Array([9, 10, 11])
  expect(await decompressLayerTiles(await compressSnapshot(raw, true))).toEqual(raw)
})

it('preserves uploads if CSP or an older browser rejects module-worker construction', async () => {
  vi.stubGlobal('Worker', class { constructor() { throw Error('module workers unsupported') } })
  const raw = new Uint8Array([1, 2, 3, 255])
  expect(await decompressLayerTiles(await compressSnapshot(raw, true))).toEqual(raw)
})
