import type { LayerState, Operation } from '@art-lessons/shared'
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

/** One page of pre-snapshot history, immediately preceding `beforeSeq` (see
 *  rooms.ts's getOperationsBefore for why this walks backward rather than
 *  forward). Empty array means either backfill has reached the room's
 *  start, or the request failed — the caller can't distinguish the two and
 *  doesn't need to: giving up early just means this client's own
 *  undo/redo coverage for very old operations stays incomplete, a
 *  best-effort gap, not a correctness bug (see Room's own deferred-queue
 *  handling for operations that target something backfill hasn't reached). */
export async function fetchHistoryPage(roomId: string, beforeSeq: number, limit = 500): Promise<Operation[]> {
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
