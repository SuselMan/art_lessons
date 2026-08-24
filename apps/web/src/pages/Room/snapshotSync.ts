import * as Sentry from '@sentry/react'

import type { LayerState } from '@grafetto/shared'
import { SNAPSHOT_SEQ_INTERVAL } from '@grafetto/shared'
import type { PencilEngineAPI } from '../../engine'
import { compressLayerTiles } from '../../engine/src/snapshotCodec'
import { downscaleForThumbnail } from '../../lib/thumbnail'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** (#371/#374) One gzipped `encodeLayerTiles` payload per layer, keyed by
 *  layerId — the server stores each as its own row, at its own coverage. There
 *  is no room-level bundle: sending the layers separately is what lets a layer
 *  be left out without that absence reading as "this layer is empty", which is
 *  the loss #369 was. */
async function uploadSnapshot(
  roomId: string, seq: number, layerState: LayerState, layers: Map<string, Uint8Array>,
): Promise<void> {
  const encoded: Record<string, string> = {}
  for (const [layerId, raw] of layers) {
    encoded[layerId] = bytesToBase64(await compressLayerTiles(raw))
  }
  try {
    await fetch(`/api/rooms/${roomId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ seq, layerState, layers: encoded }),
    })
  } catch {
    // Best-effort (#149 epic): another client independently crossing the
    // same seq boundary will very likely succeed even if this upload was
    // dropped (offline tab, a server hiccup) — nothing here retries. If
    // truly nobody ever uploads a given boundary, the room just keeps
    // behaving as if no snapshot exists yet, same as before this epic.
  }
}

/** #210: room-list preview thumbnail. Exports the full composite (paper/
 *  background baked in, same as the manual "export PNG" button — see
 *  Room/index.tsx's handleExport), downscales it client-side
 *  (downscaleForThumbnail — never send full-resolution pixels to the
 *  thumbnail endpoint), and uploads the result. Best-effort: no retry,
 *  swallow failures.
 *
 *  Two call sites (#211 epic follow-up): `createSnapshotUploader`'s
 *  `onSeqObserved` below piggybacks it on the same SNAPSHOT_SEQ_INTERVAL
 *  boundary as uploadSnapshot, and Room/index.tsx's unmount cleanup also
 *  calls this directly on room exit. The boundary-only trigger (the
 *  original #210 design — a separate unload hook was discussed and
 *  rejected then) turned out to leave any room under SNAPSHOT_SEQ_INTERVAL
 *  operations with no thumbnail at all, since it never crosses a boundary;
 *  the exit hook guarantees every room gets baked at least once, the first
 *  time anyone leaves it — the boundary path still matters on its own for
 *  long-running rooms so the list preview updates without anyone having to
 *  leave first. */
export async function uploadThumbnail(roomId: string, engine: PencilEngineAPI): Promise<void> {
  try {
    const full = await engine.exportPNG()
    if (!full) return
    const thumbnail = await downscaleForThumbnail(full)
    if (!thumbnail) return
    const bytes = new Uint8Array(await thumbnail.arrayBuffer())
    await fetch(`/api/rooms/${roomId}/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data: bytesToBase64(bytes) }),
    })
  } catch {
    // Best-effort — see doc comment above.
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
  // (#486) Divergences already reported by this uploader, keyed by the ids that
  // diverged — see the capture site for why one event per boundary would be
  // the wrong number.
  const reportedDivergences = new Set<string>()

  return {
    onSeqObserved(previousSeq: number, newSeq: number, engine: PencilEngineAPI, layerState: LayerState): void {
      const fromBoundary = Math.floor(previousSeq / SNAPSHOT_SEQ_INTERVAL)
      const toBoundary = Math.floor(newSeq / SNAPSHOT_SEQ_INTERVAL)
      if (toBoundary <= fromBoundary) return
      const boundarySeq = toBoundary * SNAPSHOT_SEQ_INTERVAL
      if (boundarySeq === 0 || attempted.has(boundarySeq)) return

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
      // (#373) Only the layers whose pixels actually changed. This used to
      // read every layer of the room, which is a full GPU readback each —
      // 34.8 MB per layer on an A4 canvas, synchronously, every
      // SNAPSHOT_SEQ_INTERVAL operations. That is work proportional to how
      // much the room *contains* rather than to how much just happened, and it
      // is what made a hundred-layer room impossible rather than merely slow.
      //
      // Leaving a layer out is not a loss of anything: its stored coverage
      // simply does not advance, so the server keeps serving its operations
      // (rooms.ts's isCoveredBySnapshot). That property is what makes this
      // optimisation safe to make at all, and it is the whole point of #370.
      // (#386) The caller hands us two derivations of the same log — the
      // engine's buffers and this LayerState — and they have to agree. When
      // they did not, what got stored was the *empty room's* structure at seq
      // 2000 of a six-layer lesson, because Room read the store back before
      // its own deferred derivation had run. The next join restored from that
      // and showed two empty layers, with the server withholding the
      // operations it believed were covered.
      //
      // Fixed at the source (Room now derives synchronously before reading),
      // but checked here too, because this is the one place that can see both
      // halves — and because what a bad pair costs is a room that reads as
      // wiped, discovered by a teacher rather than by a test.
      const known = new Set(Object.keys(layerState.items))
      const missing = engine.liveLayerIds().filter(id => !known.has(id))
      if (missing.length > 0) {
        // Not an exception: this runs inside a bare event path where throwing
        // would take the join down with it, and the correct behaviour is
        // simply not to persist. The room stays snapshot-less — slow to open,
        // which is what it already was — instead of persisting a lie.
        console.error(
          `[snapshot] refusing to upload: layer state omits live layers ${missing.join(', ')}`,
        )
        // (#486) Reported, not only whispered to a console nobody is holding.
        // This guard's verdict is a pure function of a *divergence*, so it does
        // not fire once — it fires on every boundary of every session until
        // whatever caused the two derivations to disagree is fixed, and the
        // room silently stops being bakeable. That is how U68gWoq- spent three
        // days growing a 43 MB join nobody could complete, with a healthy
        // server, an intact log and an empty Sentry. Deduped by the missing
        // ids: one divergence, one event, however many boundaries it costs.
        const divergence = missing.join(',')
        if (!reportedDivergences.has(divergence)) {
          reportedDivergences.add(divergence)
          Sentry.captureMessage(
            `[snapshot] layer state omits live layers: ${divergence}`,
            {
              level: 'error',
              tags: { roomId, missingLayers: divergence },
              extra: { seq: boundarySeq, knownLayerIds: [...known] },
            },
          )
        }
        return
      }

      // Marked only once the pair has been accepted. Ahead of the check it
      // would burn this boundary on the rejected attempt, so the next caller —
      // possibly the one holding a correct LayerState — would find it already
      // "attempted" and skip, leaving the room snapshot-less for good.
      attempted.add(boundarySeq)

      const layers = new Map<string, Uint8Array>()
      for (const item of Object.values(layerState.items)) {
        if (item.kind !== 'layer' || !engine.isLayerDirty(item.id)) continue
        const baked = engine.bakeNetworkSnapshot(item.id)
        if (baked) layers.set(item.id, baked)
      }
      // The structure is uploaded even when no layer changed — a rename or a
      // reorder is a real change with no pixels behind it.
      void uploadSnapshot(roomId, boundarySeq, layerState, layers)

      // #210: independent of the layer-snapshot path above (fires even if
      // layers.size was 0 — a blank room still gets a thumbnail attempt,
      // harmless either way) and never awaited here, so its own encode/
      // downscale/upload work can't delay uploadSnapshot or the caller.
      void uploadThumbnail(roomId, engine)
    },
  }
}
