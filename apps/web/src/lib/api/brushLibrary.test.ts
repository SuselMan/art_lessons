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
  it('bounds concurrent multi-preset downloads globally and keeps duplicate requests shared', async () => {
    const f = fixture(), bodies = Array.from({ length: 6 }, (_, i) => new Uint8Array([i + 1, 50, 150, 255]))
    const assets = bodies.map(pixels => { const hash = createHash('sha256').update(pixels).digest('hex'); return { id: `asset:${hash}`, size: 2, file: `${hash}.bin` } })
    const brushes = assets.map((asset, i) => ({ ...f.manifest.brushes[0], descriptor: { ...f.manifest.brushes[0].descriptor, id: 'imported-' + 'b'.repeat(15) + i, tip: { ...f.manifest.brushes[0].descriptor.tip, mask: asset.id } } }))
    request.mockResolvedValue({ ...f.manifest, assets, brushes })
    const releases: (() => void)[] = []
    const fetch = vi.fn((url: string) => new Promise<Response>(resolve => {
      const i = assets.findIndex(asset => url.endsWith(asset.id.slice(6)))
      releases.push(() => resolve(new Response(new Uint8Array(bodies[i]))))
    }))
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
    const tokens = brushes.map(brush => `brush:${brush.descriptor.id}@1`)
    const work = Promise.all([api.prepareBrushPresets(tokens.slice(0, 3)), api.prepareBrushPresets(tokens.slice(3)), api.prepareBrushPresets(tokens.slice(0, 3))])
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4))
    for (const release of releases) release()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6))
    for (const release of releases) release()
    await work
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(api.prepareBrushPresets(tokens)).toBeNull()
  })
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
    expect(resources.importedBrushAssetMetadata(f.token)).toEqual([{id:f.manifest.assets[0].id,size:2}])
    release()
    release() // StrictMode/repeated cleanup cannot release another engine.
    expect(resources.isBrushAssetReady(f.manifest.assets[0].id)).toBe(false)
    expect(resources.importedBrushes()).toHaveLength(0)
    expect(resources.importedBrushAssetMetadata(f.token)).toBeUndefined()
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
    expect(resources.importedBrushAssetMetadata(f.token)).toBeUndefined()
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
    expect(resources.importedBrushAssetMetadata(a.brushes[0].descriptor.id)).toBeUndefined()
    expect(resources.importedBrushAssetMetadata(b.brushes[0].descriptor.id)).toEqual([{id:b.assets[0].id,size:b.assets[0].size}])
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

it('preserves retained manifest metadata and pixels when another scope declares the same CAS with a conflicting side',async()=>{
 const f=fixture();request.mockResolvedValue(f.manifest);vi.stubGlobal('fetch',vi.fn(async()=>new Response(f.pixels.slice())))
 const api=await import('./brushLibrary'),resources=await import('../../engine/brushLibrary')
 api.setBrushRoomScope('old');await api.loadBrushLibrary();const release=api.retainBrushRoomResources('old');await api.prepareBrushPresets([f.token])
 const metadata=resources.importedBrushAssetMetadata(f.token)![0]
 try{api.setBrushRoomScope('next');request.mockResolvedValue({...f.manifest,assets:[{...f.manifest.assets[0],size:4}]})
  await expect(api.loadBrushLibrary()).rejects.toThrow(/size/)
  expect(resources.importedBrushAssetMetadata(f.token)![0]).toBe(metadata);expect(resources.isBrushAssetReady(metadata.id,2)).toBe(true)
 }finally{release()}
 expect(resources.importedBrushAssetMetadata(f.token)).toBeUndefined();expect(resources.isBrushAssetReady(metadata.id)).toBe(false)
})
