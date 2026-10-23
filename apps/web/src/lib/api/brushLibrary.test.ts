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
  it('keeps built-in tools available when offline without a cached catalog', async () => {
    request.mockRejectedValue(new TypeError('Failed to fetch'))
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const api = await import('./brushLibrary')
    await api.loadBrushLibrary()
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

})
