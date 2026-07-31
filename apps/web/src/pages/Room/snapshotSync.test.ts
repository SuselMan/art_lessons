import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerState } from '@grafetto/shared'
import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../engine'

// downscaleForThumbnail (lib/thumbnail.ts) is Canvas/OffscreenCanvas-backed
// — real rasterization vitest's `node` environment (see vitest.config.ts)
// can't do, same reason MockGL-based engine tests never assert on real
// pixel output. Mocked here so these tests can cover uploadThumbnail's own
// call shape (fires on the same boundary, best-effort, doesn't block the
// layer-snapshot upload) without needing a real canvas.
const { downscaleForThumbnail } = vi.hoisted(() => ({ downscaleForThumbnail: vi.fn() }))
vi.mock('../../lib/thumbnail', () => ({ downscaleForThumbnail }))

import { createSnapshotUploader } from './snapshotSync'

function layerState(overrides: Partial<LayerState> = {}): LayerState {
  return {
    items: {
      background: { kind: 'layer', id: 'background', name: 'Background', opacity: 1, visible: true },
      'layer-1': { kind: 'layer', id: 'layer-1', name: 'Layer 1', opacity: 1, visible: true },
      'folder-1': { kind: 'folder', id: 'folder-1', name: 'Folder', opacity: 1, visible: true, collapsed: false, children: [] },
    },
    rootOrder: ['folder-1', 'layer-1', 'background'],
    activeId: 'background',
    selectedIds: [],
    ...overrides,
  }
}

/** (#373) `dirty` defaults to "every layer named in bakeResults" — the layers
 *  this fake has content for are exactly the ones a real engine would have
 *  painted. Pass it explicitly to exercise the dirty gate itself. */
function fakeEngine(
  bakeResults: Record<string, Uint8Array | null>,
  exportPNGResult: Blob | null = null,
  dirty: string[] = Object.keys(bakeResults),
): { engine: PencilEngineAPI; bakeCalls: string[] } {
  const bakeCalls: string[] = []
  const engine = {
    isLayerDirty: (layerId: string) => dirty.includes(layerId),
    bakeNetworkSnapshot: (layerId: string) => {
      bakeCalls.push(layerId)
      return bakeResults[layerId] ?? null
    },
    exportPNG: async () => exportPNGResult,
  } as unknown as PencilEngineAPI
  return { engine, bakeCalls }
}

type FetchCall = [string, RequestInit & { body: string }]

function fetchCallsTo(path: string): FetchCall[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === path) as FetchCall[]
}

const originalFetch = global.fetch

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
  downscaleForThumbnail.mockReset().mockResolvedValue(null)
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('createSnapshotUploader', () => {
  it('does nothing when previousSeq/newSeq stay within the same boundary', () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1, 2, 3]) })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 50, SNAPSHOT_SEQ_INTERVAL - 10, engine, layerState())

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('bakes every raster layer (not folders) and uploads on crossing a boundary', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({
      background: new Uint8Array([9, 9]),
      'layer-1': new Uint8Array([1, 2, 3]),
    })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    expect(bakeCalls.sort()).toEqual(['background', 'layer-1'])
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/rooms/room-1/snapshots')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.seq).toBe(SNAPSHOT_SEQ_INTERVAL)
    expect(body.layerState).toEqual(layerState())
    // (#371) One entry per layer rather than a single room bundle: the server
    // stores each as its own row at its own coverage, which is what lets a
    // layer be left out without that reading as "this layer is empty".
    expect(Object.keys(body.layers).sort()).toEqual(['background', 'layer-1'])
    expect(typeof body.layers['layer-1']).toBe('string')
  })

  it('never uploads the same boundary twice', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    // Same boundary observed again (e.g. a peer's own upload attempt logic
    // re-checking) — must not re-upload.
    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL, SNAPSHOT_SEQ_INTERVAL + 5, engine, layerState())
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  // (#373) A boundary with no changed layer still carries the structure — a
  // rename or a reorder is a real change with no pixels behind it — but it
  // reads nothing back off the GPU to do so.
  it('uploads structure alone when no layer changed, without baking any', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({ background: new Uint8Array([1]) }, null, [])

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))

    expect(bakeCalls).toEqual([])
    const body = JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body)
    expect(body.layers).toEqual({})
    expect(body.layerState).toEqual(layerState())
  })

  it('bakes only the layers whose pixels changed', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine(
      { background: new Uint8Array([9]), 'layer-1': new Uint8Array([1, 2]) },
      null,
      ['layer-1'],
    )

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))

    // The untouched layer is never read back — that readback is the whole cost
    // this exists to avoid.
    expect(bakeCalls).toEqual(['layer-1'])
    const body = JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body)
    expect(Object.keys(body.layers)).toEqual(['layer-1'])
  })

  it('swallows a failed upload rather than throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'))
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    expect(() => {
      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    }).not.toThrow()
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
  })

  it('only attempts the latest boundary when several are skipped over in one jump', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    // Jumps straight from before the first boundary to past the third —
    // baking every intermediate one would mislabel *current* buffer state
    // (which only really reflects the endpoint) under an earlier seq.
    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL * 3 + 5, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.seq).toBe(SNAPSHOT_SEQ_INTERVAL * 3)
  })

  describe('thumbnail (#210)', () => {
    it('also uploads a downscaled thumbnail on the same boundary crossing', async () => {
      const fullExport = new Blob(['full-composite'])
      const thumbnail = new Blob(['downscaled'])
      downscaleForThumbnail.mockResolvedValue(thumbnail)
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, fullExport)

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))

      expect(downscaleForThumbnail).toHaveBeenCalledWith(fullExport)
      const [, init] = fetchCallsTo('/api/rooms/room-1/thumbnail')[0]
      expect(init.method).toBe('POST')
      expect(init.credentials).toBe('include')
      const body = JSON.parse(init.body)
      expect(typeof body.data).toBe('string')
      // Doesn't reuse or require a seq/layerState — the thumbnail endpoint's
      // contract is just "the latest composite," unlike /snapshots.
      expect(body.seq).toBeUndefined()

      // Still exactly one layer-snapshot upload too — the thumbnail path is
      // additive, not a replacement.
      expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1)
    })

    it('fires the thumbnail attempt even when there is nothing to bake for a layer snapshot', async () => {
      downscaleForThumbnail.mockResolvedValue(new Blob(['thumb']))
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({}, new Blob(['full'])) // every bakeNetworkSnapshot call returns null

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))

      // (#373) The snapshot upload still goes out, carrying structure and no
      // layers — the two are independent, which is the point of this test.
      const body = JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body)
      expect(body.layers).toEqual({})
    })

    it('skips the thumbnail upload (without throwing) when exportPNG resolves null', async () => {
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, null)

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))

      expect(downscaleForThumbnail).not.toHaveBeenCalled()
      expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(0)
    })

    it('skips the thumbnail upload when downscaleForThumbnail resolves null', async () => {
      downscaleForThumbnail.mockResolvedValue(null)
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, new Blob(['full']))

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(0)
    })

    it('swallows a failed thumbnail upload rather than throwing, independently of the snapshot upload', async () => {
      downscaleForThumbnail.mockResolvedValue(new Blob(['thumb']))
      global.fetch = vi.fn().mockImplementation((url: string) =>
        url === '/api/rooms/room-1/thumbnail'
          ? Promise.reject(new Error('network down'))
          : Promise.resolve({ ok: true }),
      )
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, new Blob(['full']))

      expect(() => {
        uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      }).not.toThrow()
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))
    })
  })
})
