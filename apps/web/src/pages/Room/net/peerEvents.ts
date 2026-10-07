import type { RefObject } from 'react'

import { unpackDabs, type Operation, type ServerToClientEvents } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../../engine'
import { noteLivePacketPainted } from '../../../lib/observability/liveLatency'
import { reportInvariant } from '../../../lib/observability/reportInvariant'
import { useRoomStore } from '../../../stores/roomStore'
import { commitRevealsBelow, type PendingPreviews } from './pendingPreviews'

// (#429) How many recently-streamed gesture ids to remember — see
// streamedStrokeIdsRef. Generous on purpose: the cost of one forgotten id is a
// stroke briefly drawn twice on screen, the cost of a large set is a few
// hundred bytes, and only one of those is visible to a teacher.
export const STREAMED_STROKE_MEMORY = 256

export type PeerEventHandlers = Pick<ServerToClientEvents,
  'peer_joined' | 'peer_stroke_live' | 'peer_stroke_live_end' | 'peer_left'>

/** The part of the engine these handlers drive. */
export type PeerEngine = Pick<PencilEngineAPI, 'appendPeerLiveDabs' | 'endPeerLiveStroke' | 'flushPeerPreview' | 'dropPendingPreview'>

export interface PeerEventDeps {
  engineRef: RefObject<PeerEngine | null>
  /** False until the initial restore has finished — see roomContentReady. */
  roomContentReadyRef: RefObject<boolean>
  /** Gestures already painted live, so their operation is not animated again. */
  streamedStrokeIdsRef: RefObject<Set<string>>
  pendingPreviewsRef: RefObject<PendingPreviews>
  markActive: (userId: string) => void
  markLayerActive: (userId: string, layerId: string) => void
  forgetDrawingActivity: (userId: string) => void
  applyRemoteOp: (op: Operation) => void
  syncFromLog: () => void
  checkSnapshotBoundary: () => void
  /** Re-joins from scratch-as-of-what-we-have, as a reconnect does. */
  requestFullResync: () => void
}

/** (#493) Other participants on the socket: arriving, drawing live (#429),
 *  lifting the pen, and leaving — possibly mid-gesture, which is the one case
 *  that needs repair.
 *
 *  Out of Room's socket effect; handlers come back rather than a
 *  registration, for the same reason as createBoardEventHandlers. */
export function createPeerEventHandlers({
  engineRef, roomContentReadyRef, streamedStrokeIdsRef, pendingPreviewsRef,
  markActive, markLayerActive, forgetDrawingActivity,
  applyRemoteOp, syncFromLog, checkSnapshotBoundary, requestFullResync,
}: PeerEventDeps): PeerEventHandlers {
  return {
    peer_joined: participant => {
      useRoomStore.getState().applyParticipantAction({ type: 'peer_joined', participant })
    },

    // (#429) A peer's stroke, arriving while their pen is still down. Handed
    // straight to the engine, which paints it into the real layer — see
    // appendPeerLiveDabs for why that rather than a preview buffer.
    //
    // The strokeId is remembered so handleOperationConfirmed knows not to
    // hand this gesture's operation to previewOperation when it lands: that
    // path animates a stroke into a buffer composited on top, and the ink is
    // already on the layer, so it would show the mark twice — once solid,
    // once being redrawn over it.
    peer_stroke_live: data => {
      // (#432) Before the paint below, so the meter's local part includes it.
      const arrivedAt = performance.now()
      // Same gate the canvas itself is under until the initial restore
      // finishes (see roomContentReady's own doc comment): painting into a
      // layer whose buffer restoreLayerFromSnapshot is about to overwrite
      // wholesale loses the ink and, worse here, leaves a claim behind saying
      // it was painted — so the operation would skip repainting it too.
      if (!roomContentReadyRef.current) return
      engineRef.current?.appendPeerLiveDabs(data.userId, {
        strokeId: data.strokeId, layerId: data.layerId, tool: data.tool,
        preset: data.preset, color: data.color, packetSeq: data.packetSeq,
        dabs: unpackDabs(data.dabsPacked),
        washId: data.washId,
        wet: data.wet,
      })
      // (#432) Timed on the frame that composites it — see liveLatency.
      noteLivePacketPainted(data.userId, data, { arrivedAt })
      const seen = streamedStrokeIdsRef.current
      seen.add(data.strokeId)
      while (seen.size > STREAMED_STROKE_MEMORY) seen.delete(seen.values().next().value as string)
      markActive(data.userId)
      markLayerActive(data.userId, data.layerId)
    },

    peer_stroke_live_end: ({ userId: authorId, strokeId, cancelled }) => {
      // Only marks the gesture ended. Dabs still unaccounted for at this point
      // are the normal case, not a fault: the operation recording the end of
      // the gesture is dispatched at pen-up and arrives a moment after this
      // does. Treating that as orphaned ink (which an earlier version of this
      // handler did) forced a resync that wiped the live bookkeeping, so the
      // operation then repainted the streamed tail on top of itself — a
      // visibly darker last stretch of every long stroke.
      if (cancelled === true) engineRef.current?.endPeerLiveStroke(authorId, strokeId, true)
      else engineRef.current?.endPeerLiveStroke(authorId, strokeId)
    },

    peer_left: leftUserId => {
      useRoomStore.getState().applyParticipantAction({ type: 'peer_left', userId: leftUserId })
      // (#429) A peer leaving mid-gesture is the one case where unaccounted
      // live ink really can be orphaned: if they dropped before their
      // operation reached the server, nothing in the log describes a mark that
      // is nonetheless on this canvas. Unlike pen-up, no operation is owed
      // here, so a non-zero remainder means repair rather than "wait a moment".
      const orphaned = engineRef.current?.endPeerLiveStroke(leftUserId) ?? 0
      if (orphaned) {
        reportInvariant('peer left with unrecorded live dabs — resyncing', { orphaned })
        requestFullResync()
      }
      // (#152) Cursor-position cleanup for this peer now lives inside
      // PeerCursors' own 'peer_left' subscription — nothing to do here.
      forgetDrawingActivity(leftUserId)
      // They left mid-reveal — commit whatever of their last stroke(s) had
      // already arrived rather than losing it, just without the animation.
      const stranded = engineRef.current?.flushPeerPreview(leftUserId) ?? []
      let committed = stranded.length > 0
      for (const op of stranded) {
        const seq = pendingPreviewsRef.current.remove(op.id)
        // (#537) Another peer's stroke the room ordered first may still be
        // revealing: it goes into the log first, as it does everywhere else.
        if (seq !== undefined && commitRevealsBelow(seq, pendingPreviewsRef.current, engineRef.current, applyRemoteOp)) {
          committed = true
        }
        applyRemoteOp(op)
      }
      if (committed) {
        syncFromLog()
        checkSnapshotBoundary()
      }
    },
  }
}
