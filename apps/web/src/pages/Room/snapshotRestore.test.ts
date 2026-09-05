import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LayerState, Operation } from '@grafetto/shared'

import { compressLayerTiles, encodeLayerTiles, type SnapshotTile } from '../../engine/src/snapshotCodec'
import {
  fetchHistoryPage, HISTORY_PAGE_LIMIT, restoreLatestSnapshot,
  SNAPSHOT_BLOB_CONCURRENCY, SNAPSHOT_FETCH_ATTEMPTS, walkHistoryBackward,
} from './snapshotRestore'

// (#467) Counts inflations so a test can prove they are interleaved with the
// engine handover rather than all done up front. That ordering *is* the fix —
// room F4uw21Ob inflates to 431 MiB across ten layers, and holding them at
// once is what killed the tab on iPadOS — so it needs an assertion that fails
// when someone innocently restores the `Promise.all`.
const { decompressions } = vi.hoisted(() => ({ decompressions: { count: 0 } }))
vi.mock('../../engine/src/snapshotCodec', async importActual => {
  const actual = await importActual<typeof import('../../engine/src/snapshotCodec')>()
  return {
    ...actual,
    decompressLayerTiles: async (bytes: Uint8Array) => {
      decompressions.count++
      return actual.decompressLayerTiles(bytes)
    },
  }
})

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

/** (#427) A restore is now an index request plus one blob request per layer,
 *  so the mock has to route by URL rather than answer everything the same. */
function mockRestoreFetch(
  index: unknown,
  blobs: Record<string, Uint8Array> = {},
): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn(async (url: string) => {
    if (url.endsWith('/snapshots/index')) return { status: 200, ok: true, json: async () => index }
    const key = url.slice(url.indexOf('/snapshots/') + '/snapshots/'.length)
    const bytes = blobs[key]
    if (!bytes) return { status: 404, ok: false }
    // A real Response hands back a fresh ArrayBuffer; matching that keeps the
    // test honest about the Uint8Array wrapping in the code under test.
    return { status: 200, ok: true, arrayBuffer: async () => bytes.slice().buffer }
  })
  global.fetch = mockFetch as unknown as typeof fetch
  return mockFetch
}

/** (#533) The retry seam. Waiting out a real backoff would make these tests as
 *  slow as the incident they describe. */
const noSleep = async (): Promise<void> => {}

const ONE_LAYER_STATE: LayerState = {
  items: { background: { kind: 'layer', id: 'background', name: 'Background', opacity: 1, visible: true } },
  rootOrder: ['background'], activeId: 'background', selectedIds: [],
}

/** Records everything a restore hands over, plus how many inflations had
 *  happened by the time each layer arrived — which is what the memory
 *  invariant is stated in terms of. */
function recordingSink() {
  const applied: Array<{ layerId: string; tiles: SnapshotTile[]; coveredSeq: number; decompressionsSoFar: number }> = []
  const begun: LayerState[] = []
  return {
    applied,
    begun,
    sink: {
      beginLayers: (layerState: LayerState) => { begun.push(layerState) },
      applyLayer: (layerId: string, tiles: SnapshotTile[], coveredSeq: number) => {
        applied.push({ layerId, tiles, coveredSeq, decompressionsSoFar: decompressions.count })
      },
    },
  }
}

describe('restoreLatestSnapshot', () => {
  beforeEach(() => { decompressions.count = 0 })

  it("reports 'none' on a 204 (room has no snapshot yet)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 204, ok: false })
    const { sink, begun } = recordingSink()
    expect(await restoreLatestSnapshot('room-1', sink)).toEqual({ status: 'none' })
    expect(begun).toEqual([])
  })

  // (#474) A 500 and a 204 used to be the same `null`. They are opposites: one
  // is the room saying it has nothing baked, the other is a fault that leaves
  // the client replaying a history the server may have withheld.
  it("reports a failure, not 'none', when the index request fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ status: 500, ok: false })
    const outcome = await restoreLatestSnapshot('room-1', recordingSink().sink, { sleep: noSleep })
    expect(outcome).toMatchObject({ status: 'failed', stage: 'index', appliedLayerIds: [] })
  })

  it('reports a failure rather than throwing when the network is down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const outcome = await restoreLatestSnapshot('room-1', recordingSink().sink, { sleep: noSleep })
    expect(outcome).toMatchObject({ status: 'failed', stage: 'index' })
  })

  it('decodes a real snapshot response into layerState + per-layer tiles', async () => {
    const tile = { originX: 0, originY: 0, width: 2, height: 2, pixels: Uint8Array.from({ length: 16 }, (_, i) => i) }
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    mockRestoreFetch(
      { seq: 300, layerState: ONE_LAYER_STATE, layers: [{ layerId: 'background', seq: 300, hash: 'h' }] },
      { 'background/300': data },
    )
    const { sink, applied, begun } = recordingSink()

    const outcome = await restoreLatestSnapshot('room-1', sink)

    expect(outcome.status).toBe('restored')
    if (outcome.status !== 'restored') throw new Error('unreachable')
    expect(outcome.head.seq).toBe(300)
    expect(outcome.head.layerState).toEqual(ONE_LAYER_STATE)
    // (#474) The plan is what a report is checked against, so it has to carry
    // the wire weight of what was actually downloaded.
    expect(outcome.plan).toEqual([{ layerId: 'background', seq: 300, bytes: data.byteLength }])
    expect(begun).toEqual([ONE_LAYER_STATE])
    expect(applied[0].layerId).toBe('background')
    expect(applied[0].tiles[0].width).toBe(2)
    expect([...applied[0].tiles[0].pixels]).toEqual([...tile.pixels])
  })

  // (#467) The whole reason this function hands layers over one at a time.
  // Each layer must be inflated only when its turn comes, so no two inflated
  // buffers are alive together — with a bounded room that is 33 MiB per layer
  // whether or not anything is drawn on it.
  it('inflates each layer only when its turn to be applied comes', async () => {
    const layerState: LayerState = {
      items: {
        'layer-1': { kind: 'layer', id: 'layer-1', name: 'One', opacity: 1, visible: true },
        'layer-2': { kind: 'layer', id: 'layer-2', name: 'Two', opacity: 1, visible: true },
        'layer-3': { kind: 'layer', id: 'layer-3', name: 'Three', opacity: 1, visible: true },
      },
      rootOrder: ['layer-1', 'layer-2', 'layer-3'], activeId: 'layer-1', selectedIds: [],
    }
    const tile = { originX: 0, originY: 0, width: 1, height: 1, pixels: new Uint8Array(4) }
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    mockRestoreFetch(
      {
        seq: 300, layerState,
        layers: [
          { layerId: 'layer-1', seq: 300, hash: 'a' },
          { layerId: 'layer-2', seq: 300, hash: 'b' },
          { layerId: 'layer-3', seq: 300, hash: 'c' },
        ],
      },
      { 'layer-1/300': data, 'layer-2/300': data, 'layer-3/300': data },
    )
    const { sink, applied } = recordingSink()

    await restoreLatestSnapshot('room-1', sink)

    // Exactly one inflation per handover, and never one in advance: layer i is
    // applied with i+1 inflations done. A `Promise.all` that inflated up front
    // would show 3 at the very first call.
    expect(applied.map(a => a.decompressionsSoFar)).toEqual([1, 2, 3])
    expect(applied.map(a => a.layerId)).toEqual(['layer-1', 'layer-2', 'layer-3'])
  })

  // The layers have to exist before pixels can go into them, and nothing may
  // be created until every blob is safely in hand — otherwise a restore that
  // fails half way leaves the engine holding part of a room.
  it('creates the layers once, after every blob has arrived', async () => {
    const tile = { originX: 0, originY: 0, width: 1, height: 1, pixels: new Uint8Array(4) }
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    mockRestoreFetch(
      { seq: 300, layerState: ONE_LAYER_STATE, layers: [{ layerId: 'background', seq: 300, hash: 'h' }] },
      { 'background/300': data },
    )
    const { sink, begun } = recordingSink()

    await restoreLatestSnapshot('room-1', sink)

    expect(begun.length).toBe(1)
    expect(decompressions.count).toBe(1)
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
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    mockRestoreFetch(
      {
        seq: 300, layerState,
        layers: [{ layerId: 'layer-1', seq: 300, hash: 'a' }, { layerId: 'layer-2', seq: 100, hash: 'b' }],
      },
      { 'layer-1/300': data, 'layer-2/100': data },
    )

    const { sink, applied } = recordingSink()
    await restoreLatestSnapshot('room-1', sink)

    expect(applied.map(a => [a.layerId, a.coveredSeq])).toEqual([['layer-1', 300], ['layer-2', 100]])
  })

  // A layer the room has but nobody ever baked is ordinary: it arrives as
  // operations instead. Reading the absence as an empty layer is #369.
  it('reports a layer with no stored pixels as simply absent', async () => {
    const layerState: LayerState = {
      items: { 'layer-1': { kind: 'layer', id: 'layer-1', name: 'One', opacity: 1, visible: true } },
      rootOrder: ['layer-1'], activeId: 'layer-1', selectedIds: [],
    }
    mockRestoreFetch({ seq: 300, layerState, layers: [] })

    const { sink, applied } = recordingSink()
    const outcome = await restoreLatestSnapshot('room-1', sink)

    expect(applied).toEqual([])
    if (outcome.status !== 'restored') throw new Error('unreachable')
    expect(outcome.head.layerState.items['layer-1']).toBeDefined()
  })

  // (#427) A layer the *index* named is one the server counted as covered, so
  // it withheld that layer's operations. Handing back the rest of the room
  // with that layer quietly missing would lose drawing exactly the way #369
  // did; failing the whole restore falls back to a replay that still has it.
  it('returns null when a layer the index named cannot be fetched', async () => {
    const tile = { originX: 0, originY: 0, width: 1, height: 1, pixels: new Uint8Array(4) }
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    mockRestoreFetch(
      {
        seq: 300, layerState: ONE_LAYER_STATE,
        layers: [{ layerId: 'background', seq: 300, hash: 'a' }, { layerId: 'gone', seq: 300, hash: 'b' }],
      },
      { 'background/300': data },
    )

    const { sink, applied, begun } = recordingSink()

    expect(await restoreLatestSnapshot('room-1', sink)).toMatchObject({
      status: 'failed', stage: 'blobs', appliedLayerIds: [],
    })
    // (#467) Stronger than it was before the streaming rewrite, and it has to
    // be: with pixels applied as they decode, "returns null" alone would no
    // longer mean the engine was left untouched. Nothing may reach it at all.
    expect(begun).toEqual([])
    expect(applied).toEqual([])
  })

  it('requests the index, then one immutable blob URL per layer', async () => {
    const tile = { originX: 0, originY: 0, width: 1, height: 1, pixels: new Uint8Array(4) }
    const data = await compressLayerTiles(encodeLayerTiles([tile]))
    const mockFetch = mockRestoreFetch(
      { seq: 300, layerState: ONE_LAYER_STATE, layers: [{ layerId: 'background', seq: 200, hash: 'h' }] },
      { 'background/200': data },
    )

    await restoreLatestSnapshot('my-room', recordingSink().sink)

    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/rooms/my-room/snapshots/index',
      // Addressed by seq, not by "latest" — that is what makes it cacheable.
      '/api/rooms/my-room/snapshots/background/200',
    ])
    for (const [, init] of mockFetch.mock.calls) expect(init).toEqual({ credentials: 'include' })
  })

  // (#533) Everything below is one production morning: a laptop whose uplink
  // was busy with the video call the lesson was on, 28 blobs on the wire at
  // once, two of them arriving, and a teacher shown an empty room for twenty
  // minutes. Each of these fails against the version that shipped that day.

  /** One layer, one tile — enough to prove a restore completed. */
  async function oneLayerBlob(): Promise<Uint8Array> {
    return compressLayerTiles(encodeLayerTiles([
      { originX: 0, originY: 0, width: 1, height: 1, pixels: new Uint8Array(4) },
    ]))
  }

  const ONE_LAYER_INDEX = {
    seq: 300, layerState: ONE_LAYER_STATE,
    layers: [{ layerId: 'background', seq: 300, hash: 'h' }],
  }

  /** Routes the index and hands every blob request to `onBlob`, so a test only
   *  has to describe how the link misbehaves. */
  function mockFlakyFetch(onBlob: () => Promise<unknown>, index: unknown = ONE_LAYER_INDEX): void {
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/snapshots/index')) return { status: 200, ok: true, json: async () => index }
      return onBlob()
    }) as unknown as typeof fetch
  }

  it('retries a blob whose request fails, and still restores', async () => {
    const data = await oneLayerBlob()
    let attempts = 0
    mockFlakyFetch(async () => {
      attempts++
      if (attempts < 3) throw new TypeError('Failed to fetch')
      return { status: 200, ok: true, arrayBuffer: async () => data.slice().buffer }
    })

    const { sink, applied } = recordingSink()
    const outcome = await restoreLatestSnapshot('room-1', sink, { sleep: noSleep })

    expect(outcome.status).toBe('restored')
    expect(attempts).toBe(3)
    expect(applied.map(a => a.layerId)).toEqual(['background'])
  })

  // The precise shape of the incident: nginx logged all 28 responses as sent,
  // and the browser only ever finished reading two of them. A retry that
  // covered the response line and not the body would have covered nothing.
  it('retries when the body read fails, not just the request', async () => {
    const data = await oneLayerBlob()
    let attempts = 0
    mockFlakyFetch(async () => {
      attempts++
      return attempts < 2
        ? { status: 200, ok: true, arrayBuffer: async () => { throw new TypeError('network error') } }
        : { status: 200, ok: true, arrayBuffer: async () => data.slice().buffer }
    })

    const outcome = await restoreLatestSnapshot('room-1', recordingSink().sink, { sleep: noSleep })

    expect(outcome.status).toBe('restored')
    expect(attempts).toBe(2)
  })

  it('gives up after four attempts and reports the failure at blobs', async () => {
    let attempts = 0
    mockFlakyFetch(async () => { attempts++; throw new TypeError('Failed to fetch') })

    const { sink, begun } = recordingSink()
    const outcome = await restoreLatestSnapshot('room-1', sink, { sleep: noSleep })

    expect(attempts).toBe(SNAPSHOT_FETCH_ATTEMPTS)
    expect(outcome).toMatchObject({ status: 'failed', stage: 'blobs', appliedLayerIds: [] })
    // Still all-or-nothing: nothing was handed to the engine, so the caller is
    // free to keep whatever it had rather than show half a room.
    expect(begun).toEqual([])
  })

  // A 404 is the server answering, not the link stuttering. Asking three more
  // times only delays the honest failure by the length of the backoff.
  it('does not retry a status that is an answer rather than a blip', async () => {
    let attempts = 0
    mockFlakyFetch(async () => { attempts++; return { status: 404, ok: false } })

    const outcome = await restoreLatestSnapshot('room-1', recordingSink().sink, { sleep: noSleep })

    expect(attempts).toBe(1)
    expect(outcome).toMatchObject({ status: 'failed', stage: 'blobs' })
  })

  it('keeps at most SNAPSHOT_BLOB_CONCURRENCY blob requests in flight', async () => {
    const data = await oneLayerBlob()
    const layerIds = Array.from({ length: 12 }, (_, i) => `layer-${i}`)
    let inFlight = 0
    let peak = 0
    mockFlakyFetch(
      async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        // A tick of real waiting, so overlap is observable at all — with an
        // immediately-resolved mock every request would look sequential.
        await new Promise(resolve => setTimeout(resolve, 1))
        inFlight--
        return { status: 200, ok: true, arrayBuffer: async () => data.slice().buffer }
      },
      {
        seq: 300,
        layerState: {
          items: Object.fromEntries(layerIds.map(id => [id, { kind: 'layer', id, name: id, opacity: 1, visible: true }])),
          rootOrder: layerIds, activeId: layerIds[0], selectedIds: [],
        },
        layers: layerIds.map(layerId => ({ layerId, seq: 300, hash: 'h' })),
      },
    )

    const outcome = await restoreLatestSnapshot('room-1', recordingSink().sink, { sleep: noSleep })

    expect(outcome.status).toBe('restored')
    expect(peak).toBe(SNAPSHOT_BLOB_CONCURRENCY)
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
