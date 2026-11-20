import { createHash } from 'node:crypto'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { BrushLibrary } from '@grafetto/shared'

const request = vi.hoisted(() => vi.fn())
vi.mock('./api', () => ({ apiResponse: async () => Response.json(await request()), apiPath: (_key: string, options: { params: { hash: string } }) => `/assets/${options.params.hash}` }))

function fixture(): { manifest: BrushLibrary; pixels: Uint8Array; token: string } {
  const pixels = new Uint8Array([0, 50, 150, 255])
  const hash = createHash('sha256').update(pixels).digest('hex')
  const id = 'imported-' + 'a'.repeat(16)
  return { pixels, token: `brush:${id}@1`, manifest: {
    schemaVersion: 1, assets: [{ id: `asset:${hash}`, size: 2, file: `${hash}.bin` }], skipped: [],
    brushes: [{ name: 'Watercolour', source: 'abr', warnings: [], descriptor: {
      id, version: 1, model: 'stamp', category: 'wet',
      tip: { kind: 'bitmap', mask: `asset:${hash}`, hardness: 1, aspect: 1, angle: 0, rotation: 'path' },
      paperInteraction: 0.5, spacing: 0.1, flow: 0.6, flowPer: 'pass', opacity: 1, pressureSmoothingPx: 0,
      sizeByPressure: [[0, 0], [1, 1]], flowByPressure: [[0, 0], [1, 1]], opacityByPressure: [[0, 0], [1, 1]],
    } }],
  } }
}

beforeEach(() => { vi.resetModules(); request.mockReset() })
afterEach(() => { vi.unstubAllGlobals() })

describe('lazy brush API resources', () => {
  it('loads empty metadata without making resource requests', async () => {
    request.mockResolvedValue({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    expect(api.prepareBrushPresets(['pencil', undefined])).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('downloads nothing before selection and deduplicates concurrent brush requests', async () => {
    const f = fixture()
    request.mockResolvedValue(f.manifest)
    const fetch = vi.fn(async () => new Response(new Uint8Array(f.pixels)))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    expect(fetch).not.toHaveBeenCalled()
    await Promise.all([api.prepareBrushPresets([f.token]), api.prepareBrushPresets([f.token, f.token])])
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(`/assets/${f.manifest.assets[0].id.slice(6)}`, expect.objectContaining({ credentials: 'include' }))
    expect(api.prepareBrushPresets([f.token])).toBeNull()
  })
  it('refuses corrupted bytes and retries the resource on the next attempt', async () => {
    const f = fixture()
    request.mockResolvedValue(f.manifest)
    const fetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(4))).mockResolvedValueOnce(new Response(new Uint8Array(f.pixels)))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    await expect(api.prepareBrushPresets([f.token])).rejects.toThrow('checksum mismatch')
    const resources = await import('../../engine/brushLibrary')
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(false)
    await api.prepareBrushPresets([f.token])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(true)
  })
  it('refuses truncated responses and inaccessible resource URLs', async () => {
    const f = fixture()
    request.mockResolvedValue(f.manifest)
    const fetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(3))).mockResolvedValueOnce(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    await expect(api.prepareBrushPresets([f.token])).rejects.toThrow('size mismatch')
    await expect(api.prepareBrushPresets([f.token])).rejects.toThrow('download failed')
  })
  it('fails explicitly for history referring to a missing imported version', async () => {
    request.mockResolvedValue({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
    vi.stubGlobal('fetch', vi.fn())
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    await expect(api.prepareBrushPresets(['brush:imported-' + 'a'.repeat(16) + '@1'])).rejects.toThrow('Imported brush unavailable')
  })
  it('refreshes room metadata for a cold peer receiving a newly shared version', async () => {
    const f = fixture()
    request.mockResolvedValueOnce({ schemaVersion: 1, brushes: [], assets: [], skipped: [] }).mockResolvedValue(f.manifest)
    const fetch = vi.fn(async () => new Response(new Uint8Array(f.pixels)))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    api.setBrushRoomScope('room-with-new-brush')
    await api.prepareBrushPresets([f.token])
    expect(request).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledOnce()
    expect(api.prepareBrushPresets([f.token])).toBeNull()
  })
  it('reports failed metadata without a cache while keeping built-in tools synchronous', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'))
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await expect(api.loadBrushLibrary()).rejects.toThrow('Failed to fetch')
    expect(api.prepareBrushPresets(['hard-round'])).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps a retiring engine readable, then releases its pixels and metadata after destroy', async () => {
    const f = fixture()
    request.mockResolvedValue(f.manifest)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    const resources = await import('../../engine/brushLibrary')
    api.setBrushRoomScope('old-board')
    await api.loadBrushLibrary()
    const release = api.retainBrushRoomResources('old-board')
    await api.prepareBrushPresets([f.token])
    api.setBrushRoomScope('next-board')
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(true)
    expect(resources.importedBrushes()).toHaveLength(1)
    release()
    release() // StrictMode/repeated cleanup cannot release another engine.
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(false)
    expect(resources.importedBrushes()).toHaveLength(0)
  })

  it('does not reinstall pixels from a download finishing after the room was abandoned', async () => {
    const f = fixture()
    request.mockResolvedValue(f.manifest)
    let finish!: (value: Response) => void
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    const resources = await import('../../engine/brushLibrary')
    api.setBrushRoomScope('old-board')
    await api.loadBrushLibrary()
    const pending = api.prepareBrushPresets([f.token])
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    api.setBrushRoomScope('next-board')
    finish(new Response(new Uint8Array(f.pixels)))
    await pending
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(false)
  })

  it('shares direct room-state loads and unknown-preset refreshes until one metadata response resolves', async () => {
    const f = fixture()
    let finish!: (value: BrushLibrary) => void
    request.mockReturnValue(new Promise<BrushLibrary>(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    const { createOrderedBrushGate } = await import('../../pages/Room/net/orderedBrushGate')
    api.setBrushRoomScope('same-room')
    const direct = api.loadBrushLibrary()
    expect(api.loadBrushLibrary()).toBe(direct)
    const apply = vi.fn(), fail = vi.fn()
    const gate = createOrderedBrushGate(api.prepareBrushPresets, fail)
    gate.dispatch([f.token], apply)
    expect(request).toHaveBeenCalledTimes(1)
    expect(apply).not.toHaveBeenCalled()
    finish(f.manifest)
    await direct
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce())
    expect(fail).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    gate.cancel()
  })

  it('does not turn a shared metadata timeout into an empty successful room manifest and can retry', async () => {
    const f = fixture()
    let reject!: (error: Error) => void
    request.mockReturnValueOnce(new Promise((_, fail) => { reject = fail })).mockResolvedValue(f.manifest)
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    api.setBrushRoomScope('cold-room')
    const first = api.loadBrushLibrary(), preparation = api.prepareBrushPresets([f.token])!
    const errors = Promise.allSettled([first, preparation])
    reject(new DOMException('metadata deadline', 'TimeoutError'))
    const results = await errors
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(setItem).not.toHaveBeenCalled()
    await api.prepareBrushPresets([f.token])
    expect(request).toHaveBeenCalledTimes(2)
    expect(api.prepareBrushPresets([f.token])).toBeNull()
  })

  it('retains successful room versions when a later request times out with stale empty offline metadata', async () => {
    const f = fixture(), empty = { schemaVersion: 1, brushes: [], assets: [], skipped: [] }
    request.mockResolvedValueOnce(f.manifest).mockRejectedValueOnce(new DOMException('late deadline', 'TimeoutError'))
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(empty), setItem: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    const resources = await import('../../engine/brushLibrary')
    api.setBrushRoomScope('existing-room')
    await api.loadBrushLibrary()
    await api.prepareBrushPresets([f.token])
    await api.loadBrushLibrary()
    expect(resources.importedBrushes()).toHaveLength(1)
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(true)
    expect(api.prepareBrushPresets([f.token])).toBeNull()
  })

  it('installs a valid scoped offline cache on the first unavailable request', async () => {
    const f = fixture()
    request.mockRejectedValue(new TypeError('offline'))
    const getItem = vi.fn(() => JSON.stringify(f.manifest))
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    api.setBrushRoomScope('cached-room')
    await api.loadBrushLibrary()
    await api.prepareBrushPresets([f.token])
    expect(getItem).toHaveBeenCalledWith('grafetto:brush-library:v1:cached-room')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('coalesces per scope and ignores a previous room response finishing after the next room', async () => {
    const a = fixture().manifest, b = structuredClone(a)
    b.brushes[0].descriptor.id = 'imported-' + 'b'.repeat(16)
    let finishA!: (value: BrushLibrary) => void, finishB!: (value: BrushLibrary) => void
    request.mockReturnValueOnce(new Promise(resolve => { finishA = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { finishB = resolve }))
    const api = await import('./brushLibrary')
    const resources = await import('../../engine/brushLibrary')
    api.setBrushRoomScope('A')
    const first = api.loadBrushLibrary()
    api.setBrushRoomScope('B')
    const second = api.loadBrushLibrary()
    expect(second).not.toBe(first)
    expect(api.loadBrushLibrary()).toBe(second)
    finishB(b); await second
    finishA(a); await first
    expect(resources.importedBrushes().map(brush => brush.descriptor.id)).toEqual([b.brushes[0].descriptor.id])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('refreshes once after an older in-flight manifest misses a newly pinned peer version', async () => {
    const f = fixture(), empty: BrushLibrary = { schemaVersion: 1, brushes: [], assets: [], skipped: [] }
    let finishOld!: (value: BrushLibrary) => void, finishFresh!: (value: BrushLibrary) => void
    request.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve }))
      .mockReturnValueOnce(new Promise(resolve => { finishFresh = resolve }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
    const api = await import('./brushLibrary')
    const { createOrderedBrushGate } = await import('../../pages/Room/net/orderedBrushGate')
    api.setBrushRoomScope('new-peer-version')
    const old = api.loadBrushLibrary(), apply = vi.fn(), fail = vi.fn()
    const gate = createOrderedBrushGate(api.prepareBrushPresets, fail)
    gate.dispatch([f.token], apply)
    expect(request).toHaveBeenCalledTimes(1)
    finishOld(empty); await old
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(apply).not.toHaveBeenCalled()
    finishFresh(f.manifest)
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce())
    expect(fail).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(2)
    gate.cancel()
  })

  it('does not repeatedly refresh an actually missing version or refresh the next room', async () => {
    const f = fixture(), empty: BrushLibrary = { schemaVersion: 1, brushes: [], assets: [], skipped: [] }
    request.mockResolvedValue(empty)
    const api = await import('./brushLibrary')
    api.setBrushRoomScope('missing-version')
    await expect(api.prepareBrushPresets([f.token])).rejects.toThrow('Imported brush unavailable')
    expect(request).toHaveBeenCalledTimes(1) // this preparation started its own fresh request
    let finish!: (value: BrushLibrary) => void
    request.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const old = api.loadBrushLibrary(), preparation = api.prepareBrushPresets([f.token])!
    const result = Promise.allSettled([preparation])
    api.setBrushRoomScope('another-room')
    finish(empty); await old
    expect(await result).toEqual([expect.objectContaining({ status: 'rejected', reason: expect.objectContaining({ name: 'AbortError' }) })])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('stops after one fresh retry when both an older in-flight response and the fresh response lack the version', async () => {
    const f = fixture()
    request.mockResolvedValue({ schemaVersion: 1, brushes: [], assets: [], skipped: [] })
    const api = await import('./brushLibrary')
    api.setBrushRoomScope('genuinely-missing')
    const older = api.loadBrushLibrary(), preparation = api.prepareBrushPresets([f.token])!
    await older
    await expect(preparation).rejects.toThrow('Imported brush unavailable')
    expect(request).toHaveBeenCalledTimes(2)
  })

})

function multipleResources(count: number) {
  const original = fixture(), manifest = structuredClone(original.manifest)
  manifest.brushes = []; manifest.assets = []
  const bytes = new Map<string, Uint8Array>(), tokens: string[] = []
  for (let i = 0; i < count; i++) {
    const pixels = new Uint8Array([i + 1, 50, 150, 255])
    const hash = createHash('sha256').update(pixels).digest('hex')
    const brush = structuredClone(original.manifest.brushes[0])
    brush.descriptor.id = 'imported-' + i.toString(16).padStart(16, '0')
    if (brush.descriptor.tip.kind !== 'bitmap') throw Error('Bitmap fixture required')
    brush.descriptor.tip.mask = `asset:${hash}`
    manifest.brushes.push(brush); manifest.assets.push({ id: `asset:${hash}`, size: 2, file: `${hash}.bin` })
    bytes.set(`/assets/${hash}`, pixels); tokens.push(`brush:${brush.descriptor.id}@1`)
  }
  return { manifest, bytes, tokens }
}

it('loads a cold history with four bounded downloads and holds admission until every hash is verified', async () => {
  const f = multipleResources(9); request.mockResolvedValue(f.manifest)
  const replies: (() => void)[] = []; let active = 0, peak = 0, completed = false
  const download = vi.fn((url: string) => new Promise<Response>(resolve => {
    active++; peak = Math.max(peak, active)
    replies.push(() => { active--; resolve(new Response(new Uint8Array(f.bytes.get(url)!))) })
  }))
  vi.stubGlobal('fetch', download)
  const api = await import('./brushLibrary'); await api.loadBrushLibrary()
  const work = api.prepareBrushPresets(f.tokens)!.then(() => { completed = true })
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(4))
  expect(completed).toBe(false)
  replies.splice(0).forEach(reply => reply())
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(8))
  expect(completed).toBe(false)
  replies.splice(0).forEach(reply => reply())
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(9))
  replies.splice(0).forEach(reply => reply()); await work
  expect(peak).toBe(4); expect(api.prepareBrushPresets(f.tokens)).toBeNull()
})

it('stops queuing masks after a failed download and settles active downloads before rejecting admission', async () => {
  const f = multipleResources(8); request.mockResolvedValue(f.manifest)
  const replies: (() => void)[] = []; let settled = false
  const download = vi.fn((url: string) => new Promise<Response>(resolve => {
    const failure = replies.length === 0
    replies.push(() => resolve(failure ? new Response('', { status: 404 }) : new Response(new Uint8Array(f.bytes.get(url)!))))
  }))
  vi.stubGlobal('fetch', download)
  const api = await import('./brushLibrary'); await api.loadBrushLibrary()
  const work = api.prepareBrushPresets(f.tokens)!.then(() => null, e => e as Error).finally(() => { settled = true })
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(4))
  replies[0](); await new Promise(resolve => setTimeout(resolve, 0))
  expect(settled).toBe(false); expect(download).toHaveBeenCalledTimes(4)
  replies.slice(1).forEach(reply => reply())
  expect((await work)?.message).toContain('download failed'); expect(download).toHaveBeenCalledTimes(4)
  download.mockImplementation(async url => new Response(new Uint8Array(f.bytes.get(url)!)))
  await api.prepareBrushPresets(f.tokens); expect(api.prepareBrushPresets(f.tokens)).toBeNull()
})

it('does not start queued old-room downloads after the room scope retires', async () => {
  const f = multipleResources(8); request.mockResolvedValue(f.manifest)
  const replies: (() => void)[] = []
  const download = vi.fn((url: string) => new Promise<Response>(resolve => replies.push(() => resolve(new Response(new Uint8Array(f.bytes.get(url)!))))))
  vi.stubGlobal('fetch', download)
  const api = await import('./brushLibrary'); api.setBrushRoomScope('old'); await api.loadBrushLibrary()
  const work = api.prepareBrushPresets(f.tokens)
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(4))
  api.setBrushRoomScope('new'); replies.forEach(reply => reply()); await work
  expect(download).toHaveBeenCalledTimes(4)
  const resources = await import('../../engine/brushLibrary')
  for (const asset of f.manifest.assets) expect(resources.isBrushAssetReady(asset.id)).toBe(false)
})
it('refreshes a committed selection after an older metadata response already in flight', async () => {
  let release!: (value: BrushLibrary) => void
  request.mockImplementationOnce(() => new Promise<BrushLibrary>(resolve => { release = resolve }))
    .mockResolvedValueOnce({ schemaVersion: 1, brushes: [], assets: [], skipped: [], selection: ['native:marker'] })
  const api = await import('./brushLibrary')
  api.setBrushRoomScope('selection-race')
  const older = api.loadBrushLibrary(), refresh = api.refreshBrushLibrary()
  release({ schemaVersion: 1, brushes: [], assets: [], skipped: [], selection: ['native:pencil'] })
  await Promise.all([older, refresh])
  expect(request).toHaveBeenCalledTimes(2)
  expect(api.currentBrushSelection()).toEqual(['native:marker'])
})

it('waits for the destination manifest even when a retiring board still owns the same brush (#849)', async () => {
  const f = fixture()
  request.mockResolvedValueOnce(f.manifest)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(f.pixels))))
  const api = await import('./brushLibrary')
  const resources = await import('../../engine/brushLibrary')
  api.setBrushRoomScope('retiring')
  await api.loadBrushLibrary()
  const release = api.retainBrushRoomResources('retiring')
  await api.prepareBrushPresets([f.token])
  let finish!: (manifest: BrushLibrary) => void
  request.mockImplementationOnce(() => new Promise<BrushLibrary>(resolve => { finish = resolve }))
  api.setBrushRoomScope('destination')
  const metadata = api.loadBrushLibrary()
  const ready = api.prepareBrushPresets([f.token])
  expect(ready).not.toBeNull()
  finish(f.manifest)
  await metadata
  await ready
  release()
  expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(true)
  expect(api.prepareBrushPresets([f.token])).toBeNull()
})
