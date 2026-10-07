import type { RefObject } from 'react'

import { packDabs, type ClientToServerEvents, type Operation } from '@grafetto/shared'

import type { PencilEngineAPI, PencilEngineOptions } from '../../engine'
import { liveTiming } from '../../lib/observability/liveLatency'
import { useRoomStore } from '../../stores/roomStore'
import type { Outbox } from './net/outbox'
import { commitRevealsBelow, type PendingPreviews } from './net/pendingPreviews'

export type EngineNetworkCallbacks = Required<Pick<PencilEngineOptions,
  'onLocalOperation' | 'onPreviewApplied' | 'onQueuedOperationApplied' | 'onLiveStrokeDabs' | 'onLiveStrokeEnd'>>

export interface EngineNetworkDeps {
  /** For committing reveals out from under the one that just finished (#537). */
  engineRef: RefObject<Pick<PencilEngineAPI, 'dropPendingPreview'> | null>
  /** Ids already in this engine's log — this client's own included. */
  appliedOpIdsRef: RefObject<Set<string>>
  /** Ids this client created and the server has not confirmed yet. */
  pendingIdsRef: RefObject<Set<string>>
  outbox: Pick<Outbox, 'enqueue'>
  markActive: (userId: string) => void
  pendingPreviewsRef: RefObject<PendingPreviews>
  applyRemoteOp: (op: Operation) => void
  syncFromLog: () => void
  checkSnapshotBoundary: () => void
  /** Frozen, closed, or someone else's board — nothing live goes out then. */
  editingBlockedRef: RefObject<boolean>
  /** The live channel's two emits (#429), handed in rather than a socket. */
  sendLive: ClientToServerEvents['stroke_live']
  sendLiveEnd: ClientToServerEvents['stroke_live_end']
}

/** (#493) The engine's side of the network: what happens when it records an
 *  operation of this person's, when a peer's stroke has finished revealing,
 *  and when a gesture streams live. Out of Room's mount-engine effect, where
 *  these were inline options of `new PencilEngine`. */
export function createEngineNetworkCallbacks({
  engineRef, appliedOpIdsRef, pendingIdsRef, outbox, markActive, pendingPreviewsRef,
  applyRemoteOp, syncFromLog, checkSnapshotBoundary, editingBlockedRef, sendLive, sendLiveEnd,
}: EngineNetworkDeps): EngineNetworkCallbacks {
  return {
    // Broadcast-loop fix (#84): only genuinely local appends (layer-panel
    // ops via dispatchOp, and the stroke this engine records internally on
    // pointer up) reach this callback — see PencilEngineOptions.onLocalOperation.
    // Remote ops are applied via appendOperation(op, 'remote') below, which
    // skips it, so they're never echoed back to the server.
    //
    // (#289 §7/§11) `operation_confirmed` now reaches the author too (see
    // handleOperationConfirmed below) — mark this id as already-applied
    // *before* it's even sent, so that later arrival doesn't repaint it a
    // second time.
    //
    // (#289 §9) Sending goes through the Outbox rather than a bare emit:
    // persisted first, retried with backoff, replayed on reconnect. Its
    // `onSettled` (see the Outbox construction above) owns everything the
    // old inline ack callback did — watermark, pendingIds, the seq confirmation (#537).
    onLocalOperation: op => {
      appliedOpIdsRef.current.add(op.id)
      // (#289 §2/§4) A fresh layer/folder is a "local island" member from
      // the instant it's created — nobody else could possibly reference
      // it yet — until its own SendResult settles one way or the other.
      if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.add(op.layerId)
      void outbox.enqueue(op)
      if (op.type === 'stroke') markActive(useRoomStore.getState().userId)
    },
    onQueuedOperationApplied: () => {
      // The earlier network callback ran before the deferred log append.
      // Fold the current truth, never patch layer state from one operation.
      syncFromLog()
      checkSnapshotBoundary()
    },
    // A peer's stroke reveal (#37 follow-up v2) has finished playing back —
    // commit it for real now, matching what's already visible on screen.
    onPreviewApplied: op => {
      const seq = pendingPreviewsRef.current.remove(op.id)
      // (#537) A shorter stroke of another peer can finish revealing before a
      // longer one that the room ordered first — commit that one first.
      if (seq !== undefined) commitRevealsBelow(seq, pendingPreviewsRef.current, engineRef.current, applyRemoteOp)
      applyRemoteOp(op)
      syncFromLog()
      checkSnapshotBoundary()
    },
    // (#429) Sending half of the live stroke channel. A bare emit, not the
    // Outbox: these are not operations and there is nothing to persist,
    // retry or reconcile — the gesture's real record goes through
    // onLocalOperation above, and a packet that misses its moment is worth
    // nothing later. `editingBlocked` is checked for the same reason
    // dispatchOp checks it: with the room frozen or closed the operation
    // will be refused, and streaming ink that is going to be refused is
    // exactly the "drawing into the void" this codebase already decided
    // against — the server rejects these too, but not sending beats
    // sending and being dropped.
    onLiveStrokeDabs: packet => {
      if (editingBlockedRef.current) return
      sendLive({
        strokeId: packet.strokeId, layerId: packet.layerId, tool: packet.tool,
        preset: packet.preset, color: packet.color, packetSeq: packet.packetSeq,
        dabsPacked: packDabs(packet.dabs),
        // (#468) Watercolor only. Without it a peer groups this gesture by
        // its stroke id alone and paints a wash the author never made — see
        // StrokeLiveData.washId.
        ...(packet.washId ? { washId: packet.washId } : {}),
        // (#536) Same reason, one level down: a peer's own wetness field is
        // its own, so what the author's brush landed in has to travel with
        // the dabs it belongs to.
        ...(packet.wet ? { wet: packet.wet } : {}),
        // (#432) When it left, on the server's clock, and how long its oldest
        // dab had waited — what a peer needs to time pen to ink.
        ...liveTiming(packet.dabs),
      })
    },
    onLiveStrokeEnd: (strokeId, cancelled) => {
      if (editingBlockedRef.current) return
      sendLiveEnd({ strokeId, ...(cancelled === true ? { cancelled: true } : {}) })
    },
  }
}
