import { expect, it, vi } from 'vitest'
import { readBrushAsset } from './brushAssetReads'

it('overlaps small reads but shares a four-read bound across callers', async () => {
  const releases: (() => void)[] = [], started: number[] = []
  const reads = Array.from({ length: 6 }, (_, i) => readBrushAsset(64, () => {
    started.push(i)
    return new Promise<void>(resolve => releases[i] = resolve)
  }))
  await vi.waitFor(() => expect(started).toHaveLength(4))
  releases[1]()
  await vi.waitFor(() => expect(started).toHaveLength(5))
  releases[4]()
  await vi.waitFor(() => expect(started).toHaveLength(6))
  for (const release of releases) release()
  await Promise.all(reads)
})

it('keeps one full-size body exclusive and releases the allowance on failure', async () => {
  let reject!: (error: Error) => void
  const error = new Error('Network read failed'), started = vi.fn()
  const large = readBrushAsset(2048 * 2048, () => new Promise<void>((_, fail) => reject = fail))
  const rejected = expect(large).rejects.toBe(error)
  const small = readBrushAsset(4, async () => { started(); return 'verified' })
  await vi.waitFor(() => expect(reject).toBeTypeOf('function'))
  expect(started).not.toHaveBeenCalled()
  reject(error)
  await rejected
  expect(await small).toBe('verified')
  expect(started).toHaveBeenCalledOnce()
})

it('rejects impossible body allowances before starting IO', () => {
  const read = vi.fn()
  for (const bytes of [0, 3, NaN, Infinity, 2048 * 2048 + 1]) expect(() => readBrushAsset(bytes, read)).toThrow('body size')
  expect(read).not.toHaveBeenCalled()
})
