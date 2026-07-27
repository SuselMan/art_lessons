import type { LayerState, Operation } from '@grafetto/shared'
import { decodeRoomSnapshot, type SnapshotTile } from '../../engine/src/snapshotCodec'

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface RestoredSnapshot {
  seq: number
  layerState: LayerState
  tiles: Map<string, SnapshotTile[]>
}

/** Fetches and decodes the room's latest stored snapshot (#168/#169) — null
 *  if the room has never crossed a checkpoint yet (204, same case
 *  `latestSnapshotSeq === null` covers in room_state) or the request fails
 *  outright (network error, room deleted mid-fetch — caller falls back to
 *  full replay via tailOperations either way, same as before this epic). */
export async function fetchLatestSnapshot(roomId: string): Promise<RestoredSnapshot | null> {
  const res = await fetch(`/api/rooms/${roomId}/snapshots/latest`, { credentials: 'include' })
  if (res.status === 204 || !res.ok) return null
  const body = await res.json() as { seq: number; layerState: LayerState; data: string }
  const tiles = await decodeRoomSnapshot(base64ToBytes(body.data))
  return { seq: body.seq, layerState: body.layerState, tiles }
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
