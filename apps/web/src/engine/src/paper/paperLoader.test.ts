import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildPaperCatchLut } from './paperCatch'
import {
  __resetPaperLoaderForTesting, getPaperBytes, prefetchPaper,
  subscribePaperLoadProgress, type PaperLoadProgress,
} from './paperLoader'

// Exercises the real fetch path (not the loadPaperBytesImpl seam the ~200
// engine tests use) with a stubbed `fetch`, because everything worth checking
// here — the byte counter, the abort, the manifest re-read — lives between
// getPaperBytes and the network and is skipped entirely by that seam.

// (#441) A real table rather than filler: parsePaperManifest rejects anything
// that isn't 256 finite numbers, and buildPaperCatch reads every entry, so a
// stub would fail these tests for reasons that have nothing to do with what
// they check. The gamma/gain are `medium`'s.
const CATCH_LUT = buildPaperCatchLut(0.955, 1.5)

const MANIFEST = {
  version: 2,
  assets: {
    coarse: { texture: 'coarse.aaaaaaaa.paper', textureBytes: 0, preview: 'coarse.bbbbbbbb.preview', previewBytes: 0, catchLut: CATCH_LUT },
    medium: { texture: 'medium.cccccccc.paper', textureBytes: 0, preview: 'medium.dddddddd.preview', previewBytes: 0, catchLut: CATCH_LUT },
    fine:   { texture: 'fine.eeeeeeee.paper',   textureBytes: 0, preview: 'fine.ffffffff.preview',   previewBytes: 0, catchLut: CATCH_LUT },
  },
}

async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** (#441) A texture payload of `res`² height bytes, gzipped, with a manifest
 *  whose recorded byte count matches the compressed stream — the number a
 *  progress bar counts against.
 *
 *  Square because buildPaperCatch derives the grid's resolution from the
 *  payload's length, exactly as uploadPaperTexture does, and rejects anything
 *  that isn't a square. */
const FIXTURE_RES = 32

async function bakeFixture(res = FIXTURE_RES): Promise<{ manifest: typeof MANIFEST; gzipped: Uint8Array<ArrayBuffer> }> {
  const raw = Uint8Array.from({ length: res * res }, (_, i) => i % 251)
  const gzipped: Uint8Array<ArrayBuffer> = await gzip(raw)
  const manifest = structuredClone(MANIFEST)
  manifest.assets.coarse.textureBytes = gzipped.byteLength
  manifest.assets.medium.textureBytes = gzipped.byteLength
  return { manifest, gzipped }
}

function jsonResponse(value: unknown): Partial<Response> {
  return { ok: true, status: 200, json: async () => value, body: new Response('{}').body }
}

function streamResponse(bytes: Uint8Array<ArrayBuffer>): Partial<Response> {
  return { ok: true, status: 200, body: new Response(bytes).body }
}

const originalFetch = global.fetch
afterEach(() => {
  global.fetch = originalFetch
  __resetPaperLoaderForTesting()
})
beforeEach(() => { __resetPaperLoaderForTesting() })

describe('paper texture download progress', () => {
  it('reports loaded/total against the compressed size and ends with done', async () => {
    const { manifest, gzipped } = await bakeFixture()
    global.fetch = vi.fn(async (url: string | URL | Request) => (
      String(url).endsWith('.paper') ? streamResponse(gzipped) : jsonResponse(manifest)
    )) as unknown as typeof fetch

    const seen: PaperLoadProgress[] = []
    const stop = subscribePaperLoadProgress(p => seen.push(p))
    await getPaperBytes('coarse')
    stop()

    expect(seen.length).toBeGreaterThan(1)
    // The total is the manifest's figure, known before the request goes out —
    // never the inflated payload, which is larger and would make the bar lag.
    expect(seen.every(p => p.total === gzipped.byteLength)).toBe(true)
    expect(seen.every(p => p.type === 'coarse')).toBe(true)
    expect(seen[0]).toMatchObject({ loaded: 0, done: false })
    expect(seen.at(-1)).toMatchObject({ loaded: gzipped.byteLength, done: true })
    // Monotonic: a bar that goes backwards reads as a stall.
    for (let i = 1; i < seen.length; i++) expect(seen[i].loaded).toBeGreaterThanOrEqual(seen[i - 1].loaded)
  })

  it('never emits done when the download fails', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => (
      String(url).endsWith('.paper')
        ? { ok: false, status: 500, body: null } as Partial<Response>
        : jsonResponse(MANIFEST)
    )) as unknown as typeof fetch

    const seen: PaperLoadProgress[] = []
    const stop = subscribePaperLoadProgress(p => seen.push(p))
    await expect(getPaperBytes('coarse')).rejects.toThrow()
    stop()

    // A `done` here would let the overlay clear itself on a room with no paper.
    expect(seen.some(p => p.done)).toBe(false)
  })

  it('emits nothing for flat paper, which is synthesised rather than fetched', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch
    const seen: PaperLoadProgress[] = []
    const stop = subscribePaperLoadProgress(p => seen.push(p))
    await getPaperBytes('flat')
    stop()

    expect(seen).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('background prefetch', () => {
  it('a correct guess is reused rather than re-fetched', async () => {
    const { manifest, gzipped } = await bakeFixture()
    const fetchMock = vi.fn(async (url: string | URL | Request) => (
      String(url).endsWith('.paper') ? streamResponse(gzipped) : jsonResponse(manifest)
    ))
    global.fetch = fetchMock as unknown as typeof fetch

    prefetchPaper('coarse')
    const bytes = await getPaperBytes('coarse')

    // Twice the downloaded plane: the catch channel is rebuilt, not fetched.
    expect(bytes.byteLength).toBe(FIXTURE_RES * FIXTURE_RES * 2)
    // One manifest + exactly one texture: the room awaited the promise the
    // prefetch had already started instead of opening a second connection.
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith('.paper'))).toHaveLength(1)
  })

  it('a wrong guess is aborted when a different paper is asked for', async () => {
    const { manifest, gzipped } = await bakeFixture()
    const signals = new Map<string, AbortSignal | undefined>()
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url)
      if (!href.endsWith('.paper')) return jsonResponse(manifest)
      signals.set(href, init?.signal ?? undefined)
      // Never settles unless aborted — stands in for a 4 MB download still
      // in flight when the room disagrees about which paper it wanted.
      if (href.includes('coarse')) {
        return new Promise<Partial<Response>>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
      return streamResponse(gzipped)
    }) as unknown as typeof fetch

    prefetchPaper('coarse')
    await getPaperBytes('medium')

    const coarseSignal = [...signals.entries()].find(([href]) => href.includes('coarse'))?.[1]
    expect(coarseSignal?.aborted).toBe(true)
  })

  it('a claimed prefetch is not aborted by a later request for a third paper', async () => {
    const { manifest, gzipped } = await bakeFixture()
    const signals: AbortSignal[] = []
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).endsWith('.paper')) return jsonResponse(manifest)
      if (init?.signal) signals.push(init.signal)
      return streamResponse(gzipped)
    }) as unknown as typeof fetch

    prefetchPaper('coarse')
    await getPaperBytes('coarse')   // claims it — no longer speculative
    await getPaperBytes('fine')     // must not reach back and abort the above

    expect(signals.every(s => !s.aborted)).toBe(true)
  })
})

describe('failure recovery', () => {
  it('a rejected fetch is evicted, so a later attempt can succeed', async () => {
    const { manifest, gzipped } = await bakeFixture()
    let failNext = true
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      if (!String(url).endsWith('.paper')) return jsonResponse(manifest)
      if (failNext) { failNext = false; throw new Error('network blip') }
      return streamResponse(gzipped)
    }) as unknown as typeof fetch

    await expect(getPaperBytes('coarse')).rejects.toThrow('network blip')
    // Without eviction this would reject forever and the room would silently
    // refuse to draw for the lifetime of the tab.
    await expect(getPaperBytes('coarse')).resolves.toBeInstanceOf(Uint8Array)
  })

  it('re-reads the manifest once when the name it gave has gone (a deploy landed)', async () => {
    const { manifest, gzipped } = await bakeFixture()
    const stale = structuredClone(manifest)
    stale.assets.coarse.texture = 'coarse.00000000.paper'

    let manifestReads = 0
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (!href.endsWith('.paper')) {
        manifestReads++
        return jsonResponse(manifestReads === 1 ? stale : manifest)
      }
      // The stale name 404s, exactly as it would after rsync --delete.
      if (href.includes('00000000')) return { ok: false, status: 404, body: null } as Partial<Response>
      return streamResponse(gzipped)
    }) as unknown as typeof fetch

    await expect(getPaperBytes('coarse')).resolves.toBeInstanceOf(Uint8Array)
    expect(manifestReads).toBe(2)
  })
})
