import { afterEach, expect, it, vi } from 'vitest'
import { snapshotBase64 } from './snapshotBase64'
import { compressLayerTiles, decompressLayerTiles } from '../../../engine/snapshots'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('preserves all byte values and base64 padding across chunk boundaries', async () => {
  for (const length of [0, 1, 2, 3, 255, 256, 32767, 32768, 32769, 65536, 1048576]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 73 + (i >>> 5)) & 255)
    expect(await snapshotBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  }
})

it('calls a native encoder with the original typed-array view', async () => {
  const bytes = new Uint8Array([1, 2, 3]).subarray(1)
  const native = vi.fn(function (this: Uint8Array) { return Buffer.from(this).toString('base64') })
  Object.defineProperty(bytes, 'toBase64', { value: native })
  expect(await snapshotBase64(bytes)).toBe('AgM=')
  expect(native.mock.contexts).toEqual([bytes])
})

it('preserves the actual gzip snapshot payload through the HTTP base64 representation', async () => {
  const raw = Uint8Array.from({ length: 65537 }, (_, i) => (i * 73 + (i >>> 7)) & 255)
  const compressed = await compressLayerTiles(raw)
  const encoded = await snapshotBase64(compressed)
  const decoded = new Uint8Array(Buffer.from(encoded, 'base64'))
  expect(decoded).toEqual(compressed)
  expect(await decompressLayerTiles(decoded)).toEqual(raw)
})

it('yields a fallback encoding without changing the captured payload', async () => {
  vi.useFakeTimers()
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now += 5)
  const bytes = Uint8Array.from({ length: 98305 }, (_, i) => i & 255)
  let completed = false
  const result = snapshotBase64(bytes).then(value => { completed = true; return value })
  expect(completed).toBe(false)
  expect(vi.getTimerCount()).toBe(1)
  await vi.runAllTimersAsync()
  expect(await result).toBe(Buffer.from(bytes).toString('base64'))
})
