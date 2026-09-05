import type { LayerState, Operation } from '@grafetto/shared'
import { decodeLayerTiles, decompressLayerTiles, type SnapshotTile } from '../../engine/src/snapshotCodec'

/** What a restore reports back once every layer has been handed over: the room
 *  seq it reached and the layer tree it was baked against. The pixels are not
 *  in here on purpose — see restoreLatestSnapshot. */
export interface RestoredSnapshotHead {
  seq: number
  layerState: LayerState
}

/** Where a restore puts what it decodes.
 *
 *  A sink rather than a return value because the whole point is that no two
 *  layers' pixels exist at once (#467). Both methods are synchronous, and that
 *  is load-bearing: an async sink could let a caller keep a layer alive past
 *  the iteration that decoded it, which is the leak this shape exists to make
 *  unexpressible. */
export interface SnapshotRestoreSink {
  /** Called once, after every blob has arrived and before any pixels are
   *  applied, so the layers exist to receive them. */
  beginLayers: (layerState: LayerState) => void
  /** Called once per covered layer, in index order. The tiles are views into a
   *  buffer released as soon as this returns — a caller that needs them later
   *  has to copy. */
  applyLayer: (layerId: string, tiles: SnapshotTile[], coveredSeq: number) => void
}

/** Stand-in for a blob already consumed, so the slot holds no bytes. */
const EMPTY = new Uint8Array(0)

/** What `/snapshots/index` answers: the plan for a restore, no pixels. */
interface SnapshotIndex {
  seq: number
  layerState: LayerState
  layers: Array<{ layerId: string; seq: number; hash: string }>
}

/** (#474) One entry of what a restore set out to do, kept so the result can be
 *  checked against the intent rather than against itself. `bytes` is the
 *  compressed blob as it came off the wire — the inflated figure is an order of
 *  magnitude larger and is the number that actually strains a device, but it
 *  only exists inside the loop below, one layer at a time, on purpose. */
export interface RestorePlanEntry {
  layerId: string
  seq: number
  bytes: number
}

/** (#474) How a restore ended, with enough to build a report.
 *
 *  This used to be `RestoredSnapshotHead | null`, and the null is what made
 *  production incident 2xKybCLI invisible: it collapsed "this room has never
 *  been baked", "the network failed before anything was touched" and "half the
 *  layers are already in the engine and then something threw" into one value.
 *  Only the third is a lost lesson, and it was the one nobody could see.
 *
 *  `appliedLayerIds` is the specific thing worth naming: the doc comment on
 *  restoreLatestSnapshot has always admitted that a blob failing to *inflate*
 *  does so after earlier layers have landed. Admitting it in a comment and
 *  reporting it are different things. */
export type SnapshotRestoreOutcome =
  | { status: 'restored'; head: RestoredSnapshotHead; plan: RestorePlanEntry[] }
  | { status: 'none' }
  | {
      status: 'failed'
      /** Where it stopped. `apply` is the one that can leave pixels behind. */
      stage: 'index' | 'blobs' | 'apply'
      plan: RestorePlanEntry[]
      appliedLayerIds: string[]
      error: unknown
    }

/** Fetches and decodes the room's stored snapshots (#168/#169, per layer
 *  since #374) — null if nobody has ever baked this room (204, same case
 *  `latestSnapshotSeq === null` covers in room_state) or the request fails
 *  outright (network error, room deleted mid-fetch — caller falls back to
 *  full replay via tailOperations either way, same as before this epic).
 *
 *  A layer named in `layerState` with no entry in `layers` is ordinary, not an
 *  error: nothing was ever stored for it, so it arrives entirely as operations.
 *  Reading that absence as "the layer is empty" is exactly what lost drawing in
 *  #369, and it is why the server sends the operations to go with it.
 *
 *  (#427) Two round trips rather than one, and the pixels arrive per layer:
 *  the index is small and always fresh, each blob is immutable and cached by
 *  URL, so re-entering a room whose seq hasn't moved costs kilobytes instead
 *  of ~10MB. The blobs are also fetched concurrently, which is why the first
 *  layer can land while the rest are still in flight.
 *
 *  Any blob failing takes the whole restore down to null, rather than
 *  applying the layers that did arrive. That looks over-strict next to the
 *  "a missing layer is ordinary" rule above, and it is deliberate: that rule
 *  holds only because the *server* knows a layer is uncovered and sends its
 *  operations to compensate. A layer the server counted as covered, whose
 *  blob this client then failed to fetch, has no such compensation — its
 *  history was never sent. Leaving it out would silently drop drawing, the
 *  exact shape of #369. Failing whole is what the single-request version did
 *  on any error, so this is the same contract, not a new one.
 *
 *  (#467) The pixels are handed to `sink` one layer at a time rather than
 *  returned as a Map of all of them, and that split is the entire point of
 *  this function's shape.
 *
 *  Measured on production room F4uw21Ob: ten layers, 9.3 MB gzipped on the
 *  wire — and **452 391 928 bytes inflated**. A bounded room stores one tile
 *  per sheet, so every layer costs 2480x3508x4 = 33.2 MiB whether or not
 *  anything is drawn on it (nine of those ten were all but empty, and each
 *  still cost the full 33 MiB). Building the whole Map first meant holding all
 *  431 MiB at once, on top of the GL textures already being filled from it.
 *  iPadOS killed the tab and reloaded it, over and over, with nothing in
 *  Sentry — a jetsam kill runs no JS, so there was no event to send.
 *
 *  Hence two phases. Every blob is fetched first and kept compressed (9.3 MB,
 *  nothing to worry about), which is what preserves both the latency win and
 *  the all-or-nothing contract above, since a fetch is the realistic way this
 *  fails. Only then is each one inflated, decoded, handed over and dropped —
 *  so the inflated peak is one layer, not the sum.
 *
 *  (#533) Fetched a few at a time and retried, no longer all at once and once
 *  only. On 2026-09-04 a teacher opened room cdf314dd-153 from a laptop whose
 *  uplink was busy with the video call the lesson was being taught over: 28
 *  blobs went out together, 8.6 MB, and **two of them arrived** — 162 KB in a
 *  hundred seconds — before the rest were reset and the whole restore failed.
 *  He was shown an empty room for the next twenty minutes. Twenty-eight
 *  parallel streams do not share a choked link, they starve each other; a few
 *  at a time each get a real share and finish. And on a link like that a
 *  transfer dying halfway is the ordinary condition rather than the exception,
 *  so one failed read may no longer take the whole lesson down with it.
 *
 *  The narrowed window this leaves is worth stating plainly: a blob that
 *  arrives intact and then fails to *inflate* now does so after earlier
 *  layers have already been applied, where before nothing was. That is a
 *  corrupt payload of already-transferred bytes rather than a network fault,
 *  and buying strictness back would mean inflating everything twice — the one
 *  cost this whole change exists to avoid. */
/** (#533) How many blobs are in flight at once.
 *
 *  Not a throughput knob — a fairness one. The failure this replaces put all
 *  28 of a room's blobs on the wire together, which on a healthy link is free
 *  and on a saturated one is the whole problem: every stream gets a sliver of
 *  the bandwidth, none of them finishes, and the browser eventually resets the
 *  lot. Four is enough to keep the link busy across the per-request latency and
 *  few enough that each request actually completes. */
export const SNAPSHOT_BLOB_CONCURRENCY = 4

/** Attempts per request, counting the first. Three retries covers the shape
 *  the incident had — a link that drops transfers but is not down — without
 *  turning a room the server genuinely cannot answer for into a minute of
 *  spinner. */
export const SNAPSHOT_FETCH_ATTEMPTS = 4

/** Pause before retry number `attempt` (numbered from zero). Same doubling
 *  shape as socketRevival's, for the same reason: whatever is wrong with the
 *  link is unlikely to be over within a hundred milliseconds, and hammering a
 *  congested path is how a slow restore becomes a failed one. */
export function retryDelayMs(attempt: number): number {
  return Math.min(400 * 2 ** attempt, 3000)
}

/** Statuses worth asking about again. Everything else is an answer rather than
 *  a blip: a 403 or a 404 says the same thing four times over, and spending
 *  three more round trips to hear it only delays the honest failure. */
function isRetriableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/** One try at producing a value. `retriable` is the attempt's own judgement —
 *  it is the only thing here that knows whether it was the network or the
 *  server that said no. */
type Attempt<T> = { ok: true; value: T } | { ok: false; retriable: boolean; error: unknown }

export interface RestoreOptions {
  /** Test seam. Sleeping for real would make the retry tests as slow as the
   *  backoff they assert. */
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function withRetry<T>(
  attempt: () => Promise<Attempt<T>>, sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < SNAPSHOT_FETCH_ATTEMPTS; i++) {
    if (i > 0) await sleep(retryDelayMs(i - 1))
    const result = await attempt()
    if (result.ok) return result.value
    lastError = result.error
    if (!result.retriable) break
  }
  throw lastError
}

/** Reading the body counts as part of the request, deliberately: the transfers
 *  that died on 2026-09-04 died *there*, with the response line long since
 *  delivered and `arrayBuffer()` never resolving. A retry that only covered the
 *  status would not cover the incident it exists for. */
async function fetchBlobOnce(url: string, describe: string): Promise<Attempt<Uint8Array>> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) {
      return { ok: false, retriable: isRetriableStatus(res.status), error: new Error(`${describe}: ${res.status}`) }
    }
    return { ok: true, value: new Uint8Array(await res.arrayBuffer()) }
  } catch (error) {
    return { ok: false, retriable: true, error }
  }
}

/** Fetches every blob, `SNAPSHOT_BLOB_CONCURRENCY` at a time, into a result
 *  array that keeps the plan's own index order.
 *
 *  The first failure stops the workers that have not started their next request
 *  yet, rather than letting them run to completion against a link already shown
 *  not to work. The contract above is unchanged: one blob nobody could fetch,
 *  after every retry, still fails the whole restore. */
async function fetchBlobs(
  roomId: string,
  layers: SnapshotIndex['layers'],
  sleep: (ms: number) => Promise<void>,
): Promise<Uint8Array[]> {
  const blobs = new Array<Uint8Array>(layers.length)
  let next = 0
  let firstError: unknown = null
  let failed = false

  const worker = async (): Promise<void> => {
    while (!failed) {
      const i = next++
      if (i >= layers.length) return
      const layer = layers[i]
      try {
        blobs[i] = await withRetry(
          () => fetchBlobOnce(
            `/api/rooms/${roomId}/snapshots/${layer.layerId}/${layer.seq}`,
            `snapshot blob ${layer.layerId}@${layer.seq}`,
          ),
          sleep,
        )
      } catch (error) {
        if (!failed) { failed = true; firstError = error }
        return
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SNAPSHOT_BLOB_CONCURRENCY, layers.length) }, worker),
  )
  if (failed) throw firstError
  return blobs
}

export async function restoreLatestSnapshot(
  roomId: string, sink: SnapshotRestoreSink, options: RestoreOptions = {},
): Promise<SnapshotRestoreOutcome> {
  // (#474) Both are built up as the phases pass so the catch below can say
  // where it stopped and what it had already handed to the engine. A `failed`
  // outcome naming zero applied layers and one naming four are the difference
  // between a join that fell back cleanly and a lesson showing half its pixels.
  let stage: 'index' | 'blobs' | 'apply' = 'index'
  let plan: RestorePlanEntry[] = []
  const appliedLayerIds: string[] = []
  const sleep = options.sleep ?? realSleep
  try {
    // 204 is the room's own answer that nothing was ever baked. A non-ok status
    // is a fault, and collapsing the two — as this did until #474 — spends the
    // one signal that says so. `null` is how the 204 leaves the retry loop:
    // "never baked" is a settled answer and must not be asked again.
    const body = await withRetry<SnapshotIndex | null>(async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/snapshots/index`, { credentials: 'include' })
        if (res.status === 204) return { ok: true, value: null }
        if (!res.ok) {
          return { ok: false, retriable: isRetriableStatus(res.status), error: new Error(`snapshot index: ${res.status}`) }
        }
        return { ok: true, value: await res.json() as SnapshotIndex }
      } catch (error) {
        return { ok: false, retriable: true, error }
      }
    }, sleep)
    if (body === null) return { status: 'none' }
    plan = body.layers.map(layer => ({ layerId: layer.layerId, seq: layer.seq, bytes: 0 }))

    stage = 'blobs'
    // Deliberately not `cache: 'reload'` or a cache-busting query: the browser
    // cache hitting here is the entire point of #427. The bytes are still gzip
    // on arrival — the server sends the stored bytes without Content-Encoding
    // precisely so they stay compressed until the loop below.
    const blobs = await fetchBlobs(roomId, body.layers, sleep)

    for (let i = 0; i < blobs.length; i++) plan[i].bytes = blobs[i].byteLength

    // Nothing has touched the engine yet, and everything that can fail on the
    // network already has — so this is the last moment where "restore nothing"
    // is still available, and where the layers must be created before pixels
    // can be put into them.
    stage = 'apply'
    sink.beginLayers(body.layerState)

    for (let i = 0; i < body.layers.length; i++) {
      const layer = body.layers[i]
      // Read out and released in the same step: `blobs` must not go on holding
      // the compressed copy while the inflated one exists beside it.
      const compressed = blobs[i]
      blobs[i] = EMPTY
      const raw = await decompressLayerTiles(compressed)
      // `decodeLayerTiles` hands back subarray *views* into `raw`, so `raw`
      // stays alive exactly as long as the tiles do. restoreLayerFromSnapshot
      // copies what it needs into GL, which is what makes dropping the whole
      // thing at the end of this iteration a real release rather than a
      // hopeful one.
      sink.applyLayer(layer.layerId, decodeLayerTiles(raw, 0).tiles, layer.seq)
      appliedLayerIds.push(layer.layerId)
    }

    return { status: 'restored', head: { seq: body.seq, layerState: body.layerState }, plan }
  } catch (error) {
    return { status: 'failed', stage, plan, appliedLayerIds, error }
  }
}

/** Largest page `fetchHistoryPage` will ever ask for. Only an upper bound —
 *  walkHistoryBackward caps each request to whatever the remaining window
 *  still needs, which is normally well under this. */
export const HISTORY_PAGE_LIMIT = 500

/** One page of pre-snapshot history, immediately preceding `beforeSeq` (see
 *  rooms.ts's getOperationsBefore for why this walks backward rather than
 *  forward). Empty array means either backfill has reached the room's
 *  start, or the request failed — the caller can't distinguish the two and
 *  doesn't need to: giving up early just means this client's own
 *  undo/redo coverage for very old operations stays incomplete, a
 *  best-effort gap, not a correctness bug (see Room's own deferred-queue
 *  handling for operations that target something backfill hasn't reached). */
export async function fetchHistoryPage(
  roomId: string, beforeSeq: number, limit = HISTORY_PAGE_LIMIT,
): Promise<Operation[]> {
  try {
    const res = await fetch(`/api/rooms/${roomId}/operations?beforeSeq=${beforeSeq}&limit=${limit}`, {
      credentials: 'include',
    })
    if (!res.ok) return []
    return await res.json() as Operation[]
  } catch {
    return []
  }
}

/** Walks the room's operation log backward from `fromSeq`, handing each page
 *  to `onPage`, and stops `depth` operations short of it rather than running
 *  all the way to the start of the room (#291 — see Room's backfillHistory
 *  for the production incident that bound this, and spec v0.2 §7 for why
 *  that bound costs nothing a user can reach).
 *
 *  Each request asks only for what the window still needs: getOperationsBefore
 *  answers with the *newest* `limit` operations below the cursor, so capping
 *  the limit is what keeps the walk inside `(fromSeq - depth, fromSeq]`
 *  instead of over-fetching a full page and discarding most of it.
 *
 *  Injectable `fetchPage` is a test seam only — production callers use the
 *  default. Never throws: fetchHistoryPage already swallows its own errors
 *  into an empty page, which ends the walk. */
export async function walkHistoryBackward(
  roomId: string,
  fromSeq: number,
  depth: number,
  onPage: (page: Operation[]) => void,
  fetchPage: typeof fetchHistoryPage = fetchHistoryPage,
): Promise<void> {
  const floor = Math.max(0, fromSeq - depth)
  let cursor = fromSeq
  while (cursor > floor) {
    const page = await fetchPage(roomId, cursor, Math.min(HISTORY_PAGE_LIMIT, cursor - floor))
    if (page.length === 0) return
    onPage(page)
    const oldest = page[0].seq ?? 0
    // A page whose oldest entry isn't actually below the cursor would loop
    // forever (a server that ignored beforeSeq, or seq-less rows). Stopping
    // is the same best-effort give-up an empty page already means.
    if (oldest >= cursor) return
    cursor = oldest
  }
}
