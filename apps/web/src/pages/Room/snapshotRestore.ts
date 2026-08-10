import type { LayerState, Operation } from '@grafetto/shared'
import { decodeLayerTiles, decompressLayerTiles, type SnapshotTile } from '../../engine/src/snapshotCodec'

/** One layer's restored pixels, and the room seq they reach (#374). The seq
 *  is per layer because coverage is: layers are baked independently, so two
 *  of them are routinely caught up to different points. */
export interface RestoredLayer {
  tiles: SnapshotTile[]
  coveredSeq: number
}

export interface RestoredSnapshot {
  seq: number
  layerState: LayerState
  layers: Map<string, RestoredLayer>
}

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
 *  returning the layers that did arrive. That looks over-strict next to the
 *  "a missing layer is ordinary" rule above, and it is deliberate: that rule
 *  holds only because the *server* knows a layer is uncovered and sends its
 *  operations to compensate. A layer the server counted as covered, whose
 *  blob this client then failed to fetch, has no such compensation — its
 *  history was never sent. Keeping it out of the map would silently drop
 *  drawing, the exact shape of #369. Failing whole is what the single-request
 *  version did on any error, so this is the same contract, not a new one. */
export async function fetchLatestSnapshot(roomId: string): Promise<RestoredSnapshot | null> {
  try {
    const res = await fetch(`/api/rooms/${roomId}/snapshots/index`, { credentials: 'include' })
    if (res.status === 204 || !res.ok) return null
    const body = await res.json() as SnapshotIndex

    const restored = await Promise.all(body.layers.map(async layer => {
      // Deliberately not `cache: 'reload'` or a cache-busting query: the
      // browser cache hitting here is the entire point of the change.
      const blob = await fetch(`/api/rooms/${roomId}/snapshots/${layer.layerId}/${layer.seq}`, {
        credentials: 'include',
      })
      if (!blob.ok) throw new Error(`snapshot blob ${layer.layerId}@${layer.seq}: ${blob.status}`)
      // Still gzip on arrival — the server sends the stored bytes without
      // Content-Encoding precisely so they stay compressed until here.
      const raw = await decompressLayerTiles(new Uint8Array(await blob.arrayBuffer()))
      return [layer.layerId, { tiles: decodeLayerTiles(raw, 0).tiles, coveredSeq: layer.seq }] as const
    }))

    return { seq: body.seq, layerState: body.layerState, layers: new Map(restored) }
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
