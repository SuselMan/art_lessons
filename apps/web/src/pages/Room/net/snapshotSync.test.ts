import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerState } from '@grafetto/shared'
import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../../engine'
import { createTestEngine, fillStroke, makeLayerAdd } from '../../../engine/testing/engineTestUtils'
import type { ILayerBuffer } from '../../../engine/src/buffers/ILayerBuffer'
import type { SnapshotLedger } from '../../../engine/src/oplog/snapshotLedger'

import { createSnapshotUploader, uploadThumbnail } from './snapshotSync'

const reportInvariant = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/observability/reportInvariant', () => ({ reportInvariant }))

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
  // (#595) What engine.bakePreview() resolves with — the finished, already
  // small thumbnail; the engine's own tests cover how it gets that way.
  previewResult: Blob | null = null,
  dirty: string[] = Object.keys(bakeResults),
  // (#386) What the engine holds buffers for. Defaults to the layers this
  // fake has content for, which is what a real engine's buffer map looks like
  // for the same room — pass it explicitly to exercise the consistency check.
  liveLayerIds: string[] = Object.keys(bakeResults),
): { engine: PencilEngineAPI; bakeCalls: string[] } {
  const bakeCalls: string[] = []
  const engine = {
    liveLayerIds: () => liveLayerIds,
    isLayerDirty: (layerId: string) => dirty.includes(layerId),
    bakeNetworkSnapshot: (layerId: string) => {
      bakeCalls.push(layerId)
      return bakeResults[layerId] ?? null
    },
    bakePreview: async () => previewResult,
  } as unknown as PencilEngineAPI
  return { engine, bakeCalls }
}

type FetchCall = [string, RequestInit & { body: string }]

function fetchCallsTo(path: string): FetchCall[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === path) as FetchCall[]
}

const originalFetch = global.fetch

beforeEach(() => {
  // Shaped like the server's real answer: both uploads reply `{ ok: true, … }`.
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
})

afterEach(() => {
  global.fetch = originalFetch
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('uploads opt-in worker bytes at the synchronously captured first watermark', async () => {
  const { compressLayerTiles, decompressLayerTiles } = await import('../../../engine/snapshots')
  const terminate = vi.fn()
  let finish: (() => Promise<void>) | undefined
  class SnapshotWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null
    onerror: (() => void) | null = null
    terminate = terminate
    postMessage(message: { id: number; buffer: ArrayBuffer }, transfer: Transferable[]) {
      const owned = structuredClone(message, { transfer })
      finish = async () => {
        const compressed = await compressLayerTiles(new Uint8Array(owned.buffer))
        this.onmessage?.({ data: { id: owned.id, buffer: compressed.buffer, offset: compressed.byteOffset, length: compressed.byteLength } })
      }
    }
  }
  vi.stubGlobal('Worker', SnapshotWorker)
  const raw = new Uint8Array([1, 2, 255]), uploader = createSnapshotUploader('room-1', { workerCompression: true })
  const { engine, bakeCalls } = fakeEngine({ 'layer-1': raw })
  uploader.requestFirstSnapshot()
  uploader.tryFirstSnapshot(47, engine, layerState())
  expect(bakeCalls).toEqual(['layer-1'])
  expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(0)
  uploader.tryFirstSnapshot(48, engine, layerState())
  await finish!()
  await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
  const body = JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body)
  expect(body.seq).toBe(47)
  expect(await decompressLayerTiles(new Uint8Array(Buffer.from(body.layers['layer-1'], 'base64')))).toEqual(raw)
  expect(raw).toEqual(new Uint8Array([1, 2, 255]))
  expect(terminate).toHaveBeenCalledOnce()
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

  // (#536, §17.66) The buffers hold the state at newSeq. Stored under an
  // earlier boundary, every restore painted the ops in between twice - the
  // join bootstrap did exactly that, 0 → 113 stored as seq 100.
  it('bakes no snapshot when the watermark jumps past a boundary instead of landing on it', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL * 3 + 5, engine, layerState())
    await new Promise(r => setTimeout(r, 20))
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.filter(c => !String(c[0]).includes('thumbnail'))).toEqual([])
    expect(bakeCalls).toEqual([])
  })

  describe('thumbnail (#210)', () => {
    it('also uploads the baked preview on the same boundary crossing', async () => {
      const preview = new Blob(['preview'], { type: 'image/webp' })
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, preview)

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))

      const [, init] = fetchCallsTo('/api/rooms/room-1/thumbnail')[0]
      expect(init.method).toBe('POST')
      expect(init.credentials).toBe('include')
      const body = JSON.parse(init.body)
      // The preview's own bytes, untouched — no re-encode on the way out.
      expect(atob(body.data)).toBe('preview')
      // Doesn't reuse or require a seq/layerState — the thumbnail endpoint's
      // contract is just "the latest composite," unlike /snapshots.
      expect(body.seq).toBeUndefined()

      // Still exactly one layer-snapshot upload too — the thumbnail path is
      // additive, not a replacement.
      expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1)
    })

    it('fires the thumbnail attempt even when there is nothing to bake for a layer snapshot', async () => {
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({}, new Blob(['thumb'])) // every bakeNetworkSnapshot call returns null

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))

      // (#373) The snapshot upload still goes out, carrying structure and no
      // layers — the two are independent, which is the point of this test.
      const body = JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body)
      expect(body.layers).toEqual({})
    })

    it('skips the thumbnail upload (without throwing) when bakePreview resolves null', async () => {
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, null)

      uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(0)
    })

    it('swallows a failed thumbnail upload rather than throwing, independently of the snapshot upload', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) =>
        url === '/api/rooms/room-1/thumbnail'
          ? Promise.reject(new Error('network down'))
          : Promise.resolve({ ok: true }),
      )
      const uploader = createSnapshotUploader('room-1')
      const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) }, new Blob(['thumb']))

      expect(() => {
        uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
      }).not.toThrow()
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
      await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(1))
    })
  })
})

describe('uploadThumbnail (#595)', () => {
  it('resolves true when the server stored the preview', async () => {
    const { engine } = fakeEngine({}, new Blob(['p']))
    await expect(uploadThumbnail('room-1', engine)).resolves.toBe(true)
  })

  it('treats a rate-limit 429 as a quiet "not this time"', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    const { engine } = fakeEngine({}, new Blob(['p']))
    await expect(uploadThumbnail('room-1', engine)).resolves.toBe(false)
  })

  it('resolves false without a request when the engine could not bake', async () => {
    const { engine } = fakeEngine({}, null)
    await expect(uploadThumbnail('room-1', engine)).resolves.toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('resolves false rather than throwing when baking itself throws', async () => {
    const engine = { bakePreview: async () => { throw new Error('context lost') } } as unknown as PencilEngineAPI
    await expect(uploadThumbnail('room-1', engine)).resolves.toBe(false)
  })
})

describe('#386 a snapshot is never stored against a layer state that contradicts it', () => {
  // What this guards is not a hypothetical. Room derived LayerState on a
  // microtask and read the store back in the same task, so the bootstrap
  // uploaded the *empty room's* structure — {layer-1, background} — as the
  // authoritative one for a six-layer lesson at seq 2000. The next join
  // restored from it and showed two empty layers, with the server withholding
  // the operations it believed that snapshot covered. Every operation was
  // still in Postgres; the room simply read as wiped.

  it('refuses to upload when the engine holds a layer the state does not mention', async () => {
    const uploader = createSnapshotUploader('room-1')
    // The exact shape of the real failure: the state is a fresh room's, the
    // engine has already replayed six layers into existence.
    const { engine } = fakeEngine(
      { 'merged-a': new Uint8Array([1]), 'merged-b': new Uint8Array([2]) },
      null, ['merged-a', 'merged-b'], ['merged-a', 'merged-b', 'background'],
    )

    uploader.onSeqObserved(0, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(0)
    // The thumbnail rides the same call and must not go either: a preview
    // baked against a structure this wrong is the same lie, cheaper to undo.
    expect(fetchCallsTo('/api/rooms/room-1/thumbnail')).toHaveLength(0)
  })

  it('lets a later, correct attempt at the same boundary through', async () => {
    // The rejection must not burn the boundary. Marking it attempted before
    // the check would leave the room snapshot-less for good — the one outcome
    // worse than a slow join, since nothing else ever bakes this seq.
    const uploader = createSnapshotUploader('room-1')
    const stale = fakeEngine({ 'layer-1': new Uint8Array([1]) }, null, ['layer-1'], ['layer-1', 'ghost'])
    uploader.onSeqObserved(0, SNAPSHOT_SEQ_INTERVAL, stale.engine, layerState())
    expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(0)

    const good = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    uploader.onSeqObserved(0, SNAPSHOT_SEQ_INTERVAL, good.engine, layerState())

    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
  })

  it('still accepts a state that names more layers than the engine holds', async () => {
    // Only one direction is a contradiction. A layer named in the structure
    // with no buffer yet is ordinary — a freshly added layer nobody has
    // painted — and must not block the room from ever baking.
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    uploader.onSeqObserved(0, SNAPSHOT_SEQ_INTERVAL, engine, layerState())

    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
  })
})

// (#627) The server refusing a snapshot because its structure omits live layers
// (#462) is the one signal that a client tried to erase them — and the upload
// swallowed every failure alike, so nobody ever saw it.
describe('a snapshot the server refuses as stale', () => {
  it('is reported, with the layers it would have erased', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ ok: false, error: 'stale_layer_state', missing: ['layer-3'] }),
    })
    reportInvariant.mockReset()
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())

    await vi.waitFor(() => expect(reportInvariant).toHaveBeenCalledWith(
      'snapshot refused by the server — stale layer state',
      expect.objectContaining({ roomId: 'room-1', seq: SNAPSHOT_SEQ_INTERVAL, missingCount: 1, missing: 'layer-3' }),
    ))
  })

  it('stays quiet about an ordinary failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }) })
    reportInvariant.mockReset()
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })

    uploader.onSeqObserved(SNAPSHOT_SEQ_INTERVAL - 1, SNAPSHOT_SEQ_INTERVAL, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(reportInvariant).not.toHaveBeenCalledWith('snapshot refused by the server — stale layer state', expect.anything())
  })
})


describe('first catch-up snapshot (#728)', () => {
  it('does not reread confirmed empty pixels, but uploads later real paint at its new watermark', async () => {
    const { engine } = createTestEngine({ userId: 'a' }, { width: 8, height: 8 })
    engine.appendOperation(makeLayerAdd('a', 'layer-1'), 'remote')
    engine.appendOperation(fillStroke('a', 'layer-1', 4, 4, 6), 'remote')
    const internal = engine as unknown as {
      gl: WebGLRenderingContext
      _layers: Map<string, ILayerBuffer>
      _snapshots: SnapshotLedger
    }
    for (const tile of internal._layers.get('layer-1')!.allResident()) tile.buffer.clear()
    internal._snapshots.markDirty('layer-1')
    const read = vi.spyOn(internal.gl, 'readPixels')
    const state = layerState({
      items: { 'layer-1': layerState().items['layer-1'] }, rootOrder: ['layer-1'], activeId: 'layer-1',
    })
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, state)
    expect(read.mock.calls.length).toBeGreaterThan(0)
    read.mockClear()
    for (let attempt = 0; attempt < 20; attempt++) uploader.tryFirstSnapshot(47, engine, state)
    expect(read).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(engine.isLayerDirty('layer-1')).toBe(true)
    engine.appendOperation(fillStroke('a', 'layer-1', 4, 4, 6), 'remote')
    uploader.tryFirstSnapshot(48, engine, state)
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
    expect(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body).seq).toBe(48)
    expect(read.mock.calls.length).toBeGreaterThan(0)
  })

  it('does not publish until catch-up explicitly requests a first snapshot', () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    uploader.tryFirstSnapshot(47, engine, layerState())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('publishes exact47, rather than waiting for100 or rounding113 down', async () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1, 2]) })
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
    expect(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body).seq).toBe(47)
  })

  it('retries refused wet content with a newly read watermark after it settles', async () => {
    const contents = { 'layer-1': null as Uint8Array | null }
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine(contents)
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    expect(global.fetch).not.toHaveBeenCalled()
    contents['layer-1'] = new Uint8Array([3])
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
    expect(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[0][1].body).seq).toBe(48)
  })

  it('partial coverage does not make a refused second layer permanently covered', async () => {
    const contents = { background: null as Uint8Array | null, 'layer-1': new Uint8Array([1]) }
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine(contents)
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1))
    await new Promise(resolve => setTimeout(resolve, 0))
    contents.background = new Uint8Array([2])
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(Object.keys(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[1][1].body).layers)).toEqual(['background'])
  })

  it('retries an upload failure even when baking already cleared layer dirty', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const uploader = createSnapshotUploader('room-1')
    const { engine } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2)) // failed POST plus index reconciliation
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
    engine.isLayerDirty = () => false
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[1][1].body).seq).toBe(48)
  })

  it('does not repeatedly read untouched paper or upload empty structures', () => {
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({ background: null }, null, [])
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    uploader.tryFirstSnapshot(48, engine, layerState())
    expect(bakeCalls).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })
})


describe('first snapshot race with another participant (#728)', () => {
  it('stops rebaking only layers whose existing coverage the server index proves', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'not_a_checkpoint_seq' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ seq: 47, layerState: {}, layers: [{ layerId: 'layer-1', seq: 47, hash: 'other-client' }] }) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    uploader.tryFirstSnapshot(49, engine, layerState())
    expect(bakeCalls).toEqual(['layer-1'])
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
  it('keeps a refused first layer retryable when the index still has no coverage', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'not_a_checkpoint_seq' }) })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const uploader = createSnapshotUploader('room-1')
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000)
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
    expect(bakeCalls).toEqual(['layer-1', 'layer-1'])
  })
})


describe('bounded bootstrap transport retries', () => {
  const success = () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })
  const offlineThenOnline = (covered: string[] = []) => {
    global.fetch = vi.fn().mockRejectedValueOnce(Error('ingress unavailable'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ layers: covered.map(layerId => ({ layerId, seq: 47, hash: 'verified' })) }) })
      .mockResolvedValue(success())
  }
  const finishFailure = async () => {
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  it('retries identical captured bytes/seq/structure without another bake, after backoff and index lookup', async () => {
    offlineThenOnline()
    const compression = await import('./snapshotCompression')
    const encode = vi.spyOn(compression, 'compressSnapshot')
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1, 2, 3]) })
    const uploader = createSnapshotUploader('room-1'), state = layerState()
    uploader.requestFirstSnapshot()
    uploader.tryFirstSnapshot(47, engine, state)
    state.items['layer-1'].name = 'Changed after capture'
    await finishFailure()
    engine.isLayerDirty = () => false
    for (let i = 0; i < 20; i++) uploader.tryFirstSnapshot(47, engine, state)
    expect(bakeCalls).toEqual(['layer-1'])
    expect(global.fetch).toHaveBeenCalledTimes(2)
    now.mockReturnValue(11_001)
    uploader.tryFirstSnapshot(47, engine, state)
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    const posts = fetchCallsTo('/api/rooms/room-1/snapshots')
    expect(posts[1][1].body).toEqual(posts[0][1].body)
    expect(JSON.parse(posts[1][1].body).layerState.items['layer-1'].name).toBe('Layer 1')
    expect(bakeCalls).toEqual(['layer-1'])
    expect(encode).toHaveBeenCalledOnce()
  })

  it('captures new pixels at a new seq instead of relabelling the retained old payload', async () => {
    offlineThenOnline()
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const contents = { 'layer-1': new Uint8Array([1]) }
    const { engine, bakeCalls } = fakeEngine(contents)
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, engine, layerState())
    await finishFailure()
    contents['layer-1'] = new Uint8Array([9])
    uploader.tryFirstSnapshot(48, engine, layerState())
    expect(bakeCalls).toEqual(['layer-1']) // admission backoff precedes even a new bake
    now.mockReturnValue(11_001)
    uploader.tryFirstSnapshot(48, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    const posts = fetchCallsTo('/api/rooms/room-1/snapshots').map(([, init]) => JSON.parse(init.body))
    expect(posts.map(body => body.seq)).toEqual([47, 48])
    expect(posts[1].layers['layer-1']).not.toEqual(posts[0].layers['layer-1'])
    expect(bakeCalls).toEqual(['layer-1', 'layer-1'])
  })

  it('stops only server-proven covered layers and reuses an uncovered sibling without readback', async () => {
    offlineThenOnline(['layer-1'])
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]), background: new Uint8Array([2]) })
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, engine, layerState())
    await finishFailure(); now.mockReturnValue(11_001)
    uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(Object.keys(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[1][1].body).layers)).toEqual(['background'])
    expect(bakeCalls.sort()).toEqual(['background', 'layer-1'])
  })

  it('does not reuse pixels from a different engine generation at the same seq', async () => {
    offlineThenOnline()
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const first = fakeEngine({ 'layer-1': new Uint8Array([1]) }), next = fakeEngine({ 'layer-1': new Uint8Array([2]) })
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, first.engine, layerState())
    await finishFailure(); now.mockReturnValue(11_001)
    uploader.tryFirstSnapshot(47, next.engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(first.bakeCalls).toEqual(['layer-1']); expect(next.bakeCalls).toEqual(['layer-1'])
    const posts = fetchCallsTo('/api/rooms/room-1/snapshots').map(([, init]) => JSON.parse(init.body))
    expect(posts[1].layers['layer-1']).not.toEqual(posts[0].layers['layer-1'])
  })

  it('backs off repeated transport failures exponentially without recapturing unchanged pixels', async () => {
    let posts = 0
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++
        if (posts <= 2) throw Error('offline')
        return Response.json({ ok: true })
      }
      return Response.json({ layers: [] })
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, engine, layerState())
    await finishFailure()
    now.mockReturnValue(10_999); uploader.tryFirstSnapshot(47, engine, layerState())
    expect(posts).toBe(1)
    now.mockReturnValue(11_001); uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4))
    await new Promise(resolve => setTimeout(resolve, 0))
    now.mockReturnValue(13_000); uploader.tryFirstSnapshot(47, engine, layerState())
    expect(posts).toBe(2)
    now.mockReturnValue(13_002); uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(posts).toBe(3))
    expect(bakeCalls).toEqual(['layer-1'])
  })

  it('still uploads oversized encoded snapshots but does not retain more than40MiB for retry', async () => {
    const encoding = await import('./snapshotBase64')
    vi.spyOn(encoding, 'snapshotBase64').mockResolvedValue('A'.repeat(12 * 1024 * 1024)) // authored encoded-size boundary, no huge GPU/raw fixture
    offlineThenOnline()
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const { engine, bakeCalls } = fakeEngine({
      'layer-1': new Uint8Array([1]), background: new Uint8Array([2]),
    })
    const uploader = createSnapshotUploader('room-1')
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, engine, layerState())
    await finishFailure()
    expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(1)
    now.mockReturnValue(11_001); uploader.tryFirstSnapshot(47, engine, layerState())
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(bakeCalls).toEqual(['background', 'layer-1', 'background', 'layer-1'])
  })


  it('recaptures corrected structure after a semantic refusal instead of retrying the stale candidate', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400,
      json: async () => ({ error: 'stale_layer_state', missing: ['layer-1'] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ layers: [] }) })
      .mockResolvedValue(success())
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000)
    const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
    const uploader = createSnapshotUploader('room-1'), state = layerState()
    uploader.requestFirstSnapshot(); uploader.tryFirstSnapshot(47, engine, state)
    await finishFailure()
    state.items['layer-1'].name = 'Corrected structure'
    now.mockReturnValue(11_001); uploader.tryFirstSnapshot(47, engine, state)
    await vi.waitFor(() => expect(fetchCallsTo('/api/rooms/room-1/snapshots')).toHaveLength(2))
    expect(JSON.parse(fetchCallsTo('/api/rooms/room-1/snapshots')[1][1].body).layerState.items['layer-1'].name).toBe('Corrected structure')
    expect(bakeCalls).toEqual(['layer-1', 'layer-1'])
  })

})


describe('bootstrap index reconciliation deadlines', () => {
  it.each(['headers', 'body'] as const)('releases a stalled index %s read and ignores its late coverage', async stalled => {
    vi.useFakeTimers()
    try {
      let resolveOld!: (value: unknown) => void
      const old = new Promise<unknown>(resolve => { resolveOld = resolve })
      let posts = 0, indexes = 0
      let signal: AbortSignal | undefined
      vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posts++
          if (posts <= 2) throw Error('ambiguous upload failure')
          return Response.json({ ok: true })
        }
        indexes++
        if (indexes === 1) {
          signal = init?.signal ?? undefined
          if (stalled === 'headers') return old // deliberately ignores abort
          return { ok: true, status: 200, json: () => old }
        }
        return Response.json({ layers: [] })
      }))
      const { engine, bakeCalls } = fakeEngine({ 'layer-1': new Uint8Array([1]) })
      const uploader = createSnapshotUploader('room-1')
      uploader.requestFirstSnapshot()
      uploader.tryFirstSnapshot(47, engine, layerState())
      await vi.waitFor(() => expect(indexes).toBe(1))
      await vi.advanceTimersByTimeAsync(5001)
      expect(signal?.aborted).toBe(true)
      engine.isLayerDirty = () => false
      uploader.tryFirstSnapshot(47, engine, layerState())
      expect(posts).toBe(1) // Failed reconciliation still honours upload backoff.
      await vi.advanceTimersByTimeAsync(1001)
      uploader.tryFirstSnapshot(47, engine, layerState())
      await vi.waitFor(() => expect(indexes).toBe(2))
      await vi.advanceTimersByTimeAsync(0)
      const late = { layers: [{ layerId: 'layer-1', seq: 47, hash: 'old-response' }] }
      resolveOld(stalled === 'headers' ? Response.json(late) : late)
      await vi.advanceTimersByTimeAsync(2001)
      uploader.tryFirstSnapshot(47, engine, layerState())
      await vi.waitFor(() => expect(posts).toBe(3))
      expect(bakeCalls).toEqual(['layer-1'])
      const bodies = fetchCallsTo('/api/rooms/room-1/snapshots').map(([, init]) => init.body)
      expect(bodies[1]).toEqual(bodies[0])
      expect(bodies[2]).toEqual(bodies[0])
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
