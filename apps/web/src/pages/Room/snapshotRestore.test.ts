import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerState, Operation } from '@grafetto/shared'

import { compressLayerTiles, encodeLayerTiles } from '../../engine/src/snapshotCodec'
import { fetchHistoryPage, fetchLatestSnapshot, HISTORY_PAGE_LIMIT, walkHistoryBackward } from './snapshotRestore'

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
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    global.fetch = vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({
        seq: 300, layerState,
        layers: [{ layerId: 'background', seq: 300, data: bytesToBase64(data) }],
      }),
    })

    const result = await fetchLatestSnapshot('room-1')
    expect(result?.seq).toBe(300)
    expect(result?.layerState).toEqual(layerState)
    expect(result?.layers.get('background')?.tiles[0].width).toBe(2)
    expect([...result!.layers.get('background')!.tiles[0].pixels]).toEqual([...tile.pixels])
  })

  // (#374) Coverage is per layer, so each entry carries its own seq — two
  // layers are routinely caught up to different points, and the engine needs
  // each one's to know which arriving operations are already in its pixels.
  it('keeps each layer own coverage seq rather than the room one', async () => {
    const layerState: LayerState = {
      items: {
        'layer-1': { kind: 'layer', id: 'layer-1', name: 'One', opacity: 1, visible: true },
        'layer-2': { kind: 'layer', id: 'layer-2', name: 'Two', opacity: 1, visible: true },
      },
      rootOrder: ['layer-1', 'layer-2'], activeId: 'layer-1', selectedIds: [],
    }
    const tile = { originX: 0, originY: 0, width: 1, height: 1, pixels: Uint8Array.from({ length: 4 }, (_, i) => i) }
    const data = bytesToBase64(await compressLayerTiles(encodeLayerTiles([tile])))
    global.fetch = vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({
        seq: 300, layerState,
        layers: [
          { layerId: 'layer-1', seq: 300, data },
          { layerId: 'layer-2', seq: 100, data },
        ],
      }),
    })

    const result = await fetchLatestSnapshot('room-1')
    expect(result?.layers.get('layer-1')?.coveredSeq).toBe(300)
    expect(result?.layers.get('layer-2')?.coveredSeq).toBe(100)
  })

  // A layer the room has but nobody ever baked is ordinary: it arrives as
  // operations instead. Reading the absence as an empty layer is #369.
  it('reports a layer with no stored pixels as simply absent', async () => {
    const layerState: LayerState = {
      items: { 'layer-1': { kind: 'layer', id: 'layer-1', name: 'One', opacity: 1, visible: true } },
      rootOrder: ['layer-1'], activeId: 'layer-1', selectedIds: [],
    }
    global.fetch = vi.fn().mockResolvedValue({
      status: 200, ok: true,
      json: async () => ({ seq: 300, layerState, layers: [] }),
    })

    const result = await fetchLatestSnapshot('room-1')
    expect(result?.layers.size).toBe(0)
    expect(result?.layerState.items['layer-1']).toBeDefined()
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

// (#291) The walk used to run to seq 0 unconditionally. That only stayed
// affordable while the server pruned pre-snapshot operations on idle; once
// #289 disabled pruning, opening a long room pulled its entire history —
// 66 MB in one response for production room nHImlawW, enough to freeze a
// desktop renderer and OOM a tablet. These pin the bound.
describe('walkHistoryBackward', () => {
  // Server contract (getOperationsBefore): the newest `limit` operations
  // strictly below `beforeSeq`, oldest first.
  function fakeServer(totalOps: number) {
    const calls: Array<{ beforeSeq: number; limit: number }> = []
    const fetchPage = async (_roomId: string, beforeSeq: number, limit = HISTORY_PAGE_LIMIT) => {
      calls.push({ beforeSeq, limit })
      const all = Array.from({ length: totalOps }, (_, i) => ({ id: `op-${i + 1}`, seq: i + 1 }))
      const below = all.filter(op => op.seq < beforeSeq)
      return below.slice(Math.max(0, below.length - limit)) as unknown as Operation[]
    }
    return { calls, fetchPage }
  }

  it('stops `depth` operations short of fromSeq instead of walking to the room start', async () => {
    const { fetchPage } = fakeServer(500)
    const seen: number[] = []
    await walkHistoryBackward('room-1', 500, 100, page => seen.push(...page.map(op => op.seq!)), fetchPage)

    // Exactly `depth` operations, ending just below fromSeq — 400..499, not
    // 1..499.
    expect(Math.min(...seen)).toBe(400)
    expect(Math.max(...seen)).toBe(499)
    expect(seen).toHaveLength(100)
  })

  it('never asks for more than the window still needs', async () => {
    const { calls, fetchPage } = fakeServer(500)
    await walkHistoryBackward('room-1', 500, 100, () => {}, fetchPage)

    expect(calls[0]).toEqual({ beforeSeq: 500, limit: 100 })
    for (const call of calls) expect(call.limit).toBeLessThanOrEqual(100)
  })

  it('walks the whole history when the room is younger than the window', async () => {
    const { fetchPage } = fakeServer(30)
    const seen: number[] = []
    await walkHistoryBackward('room-1', 30, 100, page => seen.push(...page.map(op => op.seq!)), fetchPage)

    expect(Math.min(...seen)).toBe(1)
    expect(seen).toHaveLength(29)
  })

  it('does nothing at all for depth 0', async () => {
    const { calls, fetchPage } = fakeServer(500)
    await walkHistoryBackward('room-1', 500, 0, () => { throw new Error('should not be called') }, fetchPage)
    expect(calls).toHaveLength(0)
  })

  it('gives up on an empty page rather than spinning', async () => {
    const fetchPage = vi.fn().mockResolvedValue([])
    await walkHistoryBackward('room-1', 500, 100, () => { throw new Error('should not be called') }, fetchPage)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  // A server that ignored beforeSeq (or rows with no seq) would otherwise
  // hand back the same page forever.
  it('gives up when a page does not actually advance the cursor', async () => {
    const fetchPage = vi.fn().mockResolvedValue([{ id: 'x', seq: 500 }, { id: 'y', seq: 501 }])
    let pages = 0
    await walkHistoryBackward('room-1', 500, 100, () => { pages++ }, fetchPage)

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(pages).toBe(1)
  })
})
