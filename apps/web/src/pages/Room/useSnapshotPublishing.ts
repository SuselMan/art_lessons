import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { reportInvariant } from '../../lib/observability/reportInvariant'
import { useRoomStore } from '../../stores/roomStore'
import type { createPendingPreviews } from './net/pendingPreviews'
import { createSnapshotGate } from './net/snapshotGate'
import { createSnapshotUploader } from './net/snapshotSync'

export interface SnapshotPublishingDeps {
  /** Pending new layers/folders; engine bake guards pending paint and Dry. */
  pendingIdsRef: RefObject<Set<string>>
  boardId: string | null
  engineRef: RefObject<PencilEngineAPI | null>
  /** Highest seq this client has seen arrive. */
  latestKnownSeqRef: RefObject<number>
  /** Stroke seqs that have arrived but not yet painted. */
  pendingPreviewsRef: RefObject<ReturnType<typeof createPendingPreviews>>
}

/** (#493) Whether, and when, this client writes its canvas back as the room's
 *  own snapshot: the per-board uploader, the gate that decides whether this
 *  client may speak for the room at all, and the flag that takes that right
 *  away for the rest of the mount. Out of Room. */
export function useSnapshotPublishing({ boardId, engineRef, latestKnownSeqRef, pendingPreviewsRef, pendingIdsRef }: SnapshotPublishingDeps) {
  // Bakes+uploads a full-room snapshot every time latestKnownSeqRef crosses
  // a SNAPSHOT_SEQ_INTERVAL boundary (#149/#167) — see snapshotSync.ts. One
  // instance per board (#176): a snapshot is content, and a fresh `attempted`
  // set per page is what lets the same boundary be baked on each.
  //
  // Read through a ref by everything the socket effect registers: that effect
  // is keyed on the lesson and must not be torn down by a page turn, so
  // nothing per-board may sit in its dependency list.
  const snapshotUploader = useMemo(() => (boardId ? createSnapshotUploader(boardId, { workerCompression: true }) : null), [boardId])
  const snapshotUploaderRef = useRef(snapshotUploader)
  snapshotUploaderRef.current = snapshotUploader
  // Highest seq the engine buffer has actually *committed* (painted) up to —
  // deliberately decoupled from latestKnownSeqRef's "arrived" tracking.
  // A peer stroke doesn't commit on arrival: it reveals progressively
  // (previewOperation/onPreviewApplied, paced by the stroke's own recorded
  // dab timing — see PencilEngineOptions.onPreviewApplied), and two peers'
  // reveals can finish out of order (a short stroke's reveal completing
  // before a longer, earlier-seq one that's still animating). Baking a
  // network snapshot the moment a seq merely *arrives* could therefore miss
  // an earlier op that hasn't actually painted yet. pendingPreviewsRef
  // holds every stroke seq that has arrived but not yet committed; the
  // watermark can only advance past the smallest still-pending one — see
  // snapshotGate.ts, which owns that rule along with the rest of the
  // may-this-client-bake decision.
  // (#462) Holds the watermark and the "has this client's catch-up finished"
  // gate — see snapshotGate.ts for what it refuses and why. Per mount, like
  // replayIncompleteRef below: a fresh mount is a fresh, empty engine, and so
  // a client that has to earn the right to speak for the room again.
  const snapshotGateRef = useRef(createSnapshotGate(reportInvariant))
  /** (#385) Set when the join-time replay did not finish — an operation threw
   *  and the canvas therefore shows less than the log says the room contains.
   *
   *  The editor deliberately stays usable in that case (see the `finally`
   *  around the replay for why unblocking is the lesser harm), but what must
   *  *not* happen is this client writing its incomplete canvas back as the
   *  room's own state. A snapshot is authoritative — the next joiner restores
   *  from it and the server then withholds the operations it covers — so
   *  baking one here would turn "this session rendered the room wrong" into
   *  "the room is now actually missing that content", permanently, for
   *  everyone. The thumbnail is the same mistake in miniature: a blank preview
   *  on the lesson list, republished from a client that never managed to draw
   *  the lesson.
   *
   *  Never cleared for the life of this mount: nothing that happens after a
   *  half-applied replay can make the buffer whole again short of a reload,
   *  which is a fresh mount and a fresh attempt anyway. */
  const replayIncompleteRef = useRef(false)
  const checkSnapshotBoundary = useCallback(() => {
    const engine = engineRef.current
    const uploader = snapshotUploaderRef.current
    if (!engine || !uploader) return
    const plan = snapshotGateRef.current.observe({
      latestKnownSeq: latestKnownSeqRef.current,
      pendingCommitSeqs: pendingPreviewsRef.current.commitSeqs(),
      replayIncomplete: replayIncompleteRef.current,
    })
    if (!plan) return
    uploader.onSeqObserved(plan.previous, plan.watermark, engine, useRoomStore.getState().layerState)
  // Ref objects only, all stable for the component's life: this stays as
  // stable as it was when it listed none.
  }, [engineRef, latestKnownSeqRef, pendingPreviewsRef])
  // A short room may never cross100; a first bake may also be refused while
  // its water/settle is live. Re-read all guards and the actual watermark on
  // each attempt, never capture a seq to label future pixels with.
  useEffect(() => {
    if (!snapshotUploader) return
    const timer = setInterval(() => {
      const engine = engineRef.current
      if (!engine || pendingIdsRef.current.size) return
      const seq = snapshotGateRef.current.firstSnapshotWatermark({
        latestKnownSeq: latestKnownSeqRef.current,
        pendingCommitSeqs: pendingPreviewsRef.current.commitSeqs(),
        replayIncomplete: replayIncompleteRef.current,
      })
      if (seq !== null) snapshotUploader.tryFirstSnapshot(seq, engine, useRoomStore.getState().layerState)
    }, 1000)
    return () => clearInterval(timer)
  }, [snapshotUploader, engineRef, latestKnownSeqRef, pendingPreviewsRef, pendingIdsRef])

  /** (#462) Opens the snapshot path for this client, once its canvas actually
   *  holds the room — called from every catch-up that ran to completion: the
   *  mount effect's replay, `handleRoomState`'s restore, and the brand-new-room
   *  branch that has nothing to restore and is therefore caught up by
   *  definition. See snapshotGate.ts for what this is guarding. */
  const markJoinRestoreDone = useCallback(() => {
    snapshotGateRef.current.restoreCompleted(latestKnownSeqRef.current)
    // The creator's genuinely empty room skips restoreRoomState entirely.
    // Arm its first copy too; the timer still waits for confirmed paint.
    if (latestKnownSeqRef.current === 0) snapshotUploaderRef.current?.requestFirstSnapshot()
  }, [latestKnownSeqRef])

  return {
    snapshotUploader, snapshotUploaderRef, snapshotGateRef, replayIncompleteRef, checkSnapshotBoundary,
    markJoinRestoreDone,
  }
}
