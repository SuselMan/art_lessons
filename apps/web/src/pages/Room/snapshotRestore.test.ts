import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerState } from '@art-lessons/shared'

import { encodeLayerTiles, encodeRoomSnapshot } from '../../engine/src/snapshotCodec'
import { fetchHistoryPage, fetchLatestSnapshot } from './snapshotRestore'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

describe('fetchLatestSnapshot', () => {
  it('returns null on a 204 (room has no snapshot yet)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 204, ok: false })
    expect(await fetchLatestSnapshot('room-1')).toBeNull()
  })

  it('returns null when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 500, ok: false })
    expect(await fetchLatestSnapshot('room-1')).toBeNull()
  })

  it('decodes a real snapshot response into layerState + per-layer tiles', async () => {
    const layerState: LayerState = {
      items: { background: { kind: 'layer', id: 'background', name: 'Background', opacity: 1, visible: true } },
      rootOrder: ['background'], activeId: 'background', selectedIds: [],
    }
    const tile = { originX: 0, originY: 0, width: 2, height: 2, pixels: Uint8Array.from({ length: 16 }, (_, i) => i) }
    const data = await encodeRoomSnapshot(new Map([['background', encodeLayerTiles([tile])]]))
    global.fetch = vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ seq: 300, layerState, data: bytesToBase64(data) }),
    })

    const result = await fetchLatestSnapshot('room-1')
    expect(result?.seq).toBe(300)
    expect(result?.layerState).toEqual(layerState)
    expect(result?.tiles.get('background')?.[0].width).toBe(2)
    expect([...result!.tiles.get('background')![0].pixels]).toEqual([...tile.pixels])
  })

  it('requests the correctly-shaped URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 204, ok: false })
    global.fetch = mockFetch
    await fetchLatestSnapshot('my-room')
    expect(mockFetch).toHaveBeenCalledWith('/api/rooms/my-room/snapshots/latest', { credentials: 'include' })
  })
})

describe('fetchHistoryPage', () => {
  beforeEach(() => { global.fetch = vi.fn() })

  it('requests the correctly-shaped URL with beforeSeq and limit', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] })
    await fetchHistoryPage('room-1', 300, 250)
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/rooms/room-1/operations?beforeSeq=300&limit=250', { credentials: 'include' },
    )
  })

  it('returns the parsed operations array on success', async () => {
    const ops = [{ id: 'a' }, { id: 'b' }]
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ops })
    expect(await fetchHistoryPage('room-1', 300)).toEqual(ops)
  })

  it('returns an empty array on a failed response, without throwing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false })
    expect(await fetchHistoryPage('room-1', 300)).toEqual([])
  })

  it('returns an empty array when the request itself throws', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'))
    await expect(fetchHistoryPage('room-1', 300)).resolves.toEqual([])
  })
})
