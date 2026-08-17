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
 *  Hence two phases. Every blob is fetched **concurrently** and kept
 *  compressed (9.3 MB, nothing to worry about), which is what preserves both
 *  the latency win and the all-or-nothing contract above, since a fetch is
 *  the realistic way this fails. Only then is each one inflated, decoded,
 *  handed over and dropped — so the inflated peak is one layer, not the sum.
 *
 *  The narrowed window this leaves is worth stating plainly: a blob that
 *  arrives intact and then fails to *inflate* now does so after earlier
 *  layers have already been applied, where before nothing was. That is a
 *  corrupt payload of already-transferred bytes rather than a network fault,
 *  and buying strictness back would mean inflating everything twice — the one
 *  cost this whole change exists to avoid. */
export async function restoreLatestSnapshot(
  roomId: string, sink: SnapshotRestoreSink,
): Promise<RestoredSnapshotHead | null> {
  try {
    const res = await fetch(`/api/rooms/${roomId}/snapshots/index`, { credentials: 'include' })
    if (res.status === 204 || !res.ok) return null
    const body = await res.json() as SnapshotIndex

    const blobs = await Promise.all(body.layers.map(async layer => {
      // Deliberately not `cache: 'reload'` or a cache-busting query: the
      // browser cache hitting here is the entire point of the change.
      const blob = await fetch(`/api/rooms/${roomId}/snapshots/${layer.layerId}/${layer.seq}`, {
        credentials: 'include',
      })
      if (!blob.ok) throw new Error(`snapshot blob ${layer.layerId}@${layer.seq}: ${blob.status}`)
      // Still gzip on arrival — the server sends the stored bytes without
      // Content-Encoding precisely so they stay compressed until here.
      return new Uint8Array(await blob.arrayBuffer())
    }))

    // Nothing has touched the engine yet, and everything that can fail on the
    // network already has — so this is the last moment where "restore nothing"
    // is still available, and where the layers must be created before pixels
    // can be put into them.
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
    }

    return { seq: body.seq, layerState: body.layerState }
  } catch {
    return null
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
