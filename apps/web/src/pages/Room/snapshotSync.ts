import type { LayerState } from '@art-lessons/shared'
import { SNAPSHOT_SEQ_INTERVAL } from '@art-lessons/shared'
import type { PencilEngineAPI } from '../../engine'
import { encodeRoomSnapshot } from '../../engine/src/snapshotCodec'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function uploadSnapshot(
  roomId: string, seq: number, layerState: LayerState, layers: Map<string, Uint8Array>,
): Promise<void> {
  const data = await encodeRoomSnapshot(layers)
  try {
    await fetch(`/api/rooms/${roomId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ seq, layerState, data: bytesToBase64(data) }),
    })
  } catch {
    // Best-effort (#149 epic): another client independently crossing the
    // same seq boundary will very likely succeed even if this upload was
    // dropped (offline tab, a server hiccup) — nothing here retries. If
    // truly nobody ever uploads a given boundary, the room just keeps
    // behaving as if no snapshot exists yet, same as before this epic.
  }
}

/** Tracks which SNAPSHOT_SEQ_INTERVAL boundaries this client has already
 *  attempted to bake+upload this session, and bakes+uploads exactly once per
 *  boundary. Call `onSeqObserved` every time the caller's own tracked
 *  "highest seq I've seen" (Room/index.tsx's latestKnownSeqRef) advances —
 *  both for its own acked local operations and for peer_operation — it
 *  detects on its own whether that crossed a new boundary. */
export function createSnapshotUploader(roomId: string) {
  const attempted = new Set<number>()

  return {
    onSeqObserved(previousSeq: number, newSeq: number, engine: PencilEngineAPI, layerState: LayerState): void {
      const fromBoundary = Math.floor(previousSeq / SNAPSHOT_SEQ_INTERVAL)
      const toBoundary = Math.floor(newSeq / SNAPSHOT_SEQ_INTERVAL)
      if (toBoundary <= fromBoundary) return
      const boundarySeq = toBoundary * SNAPSHOT_SEQ_INTERVAL
      if (boundarySeq === 0 || attempted.has(boundarySeq)) return
      attempted.add(boundarySeq)

      // Baked synchronously, right here — deliberately NOT deferred to idle
      // time the way the engine's own local undo checkpointing is (see
      // _maybeCheckpoint's doc comment in engine/index.ts). A network
      // snapshot's whole value — server-side dedup and the debug
      // determinism comparison (#168) — depends on it representing the
      // room's state at *exactly* this seq. Deferring the tile gather would
      // risk another operation (a peer's, or the user's own next stroke)
      // landing first, silently baking the wrong content under this seq's
      // label — and a later client restoring it would then double-paint
      // whatever tailOperations re-applies on top. Only the CPU-only
      // compression + upload past this point is safe to let run async.
      const layers = new Map<string, Uint8Array>()
      for (const item of Object.values(layerState.items)) {
        if (item.kind !== 'layer') continue
        const baked = engine.bakeNetworkSnapshot(item.id)
        if (baked) layers.set(item.id, baked)
      }
      if (layers.size === 0) return

      void uploadSnapshot(roomId, boundarySeq, layerState, layers)
    },
  }
}
