import type { RefObject } from 'react'

import type { Operation, SendResult } from '@grafetto/shared'

import { isRecoverableContentOp, type LostContentOp } from './lostWork'

export interface OutboxVerdictDeps {
  /** Ids this client created and the server has not confirmed yet. */
  pendingIdsRef: RefObject<Set<string>>
  /** The highest seq this client knows of anywhere, sent on every rejoin. */
  latestKnownSeqRef: RefObject<number>
  noteLayerSeq: (layerId: string, seq: number) => void
  checkSnapshotBoundary: () => void
  /** Lets go of a gizmo preview held for an operation that will not land. */
  resolveTransformCommit: (opId: string) => void
  /** Queues an operation the server handed back for recovery onto a new layer. */
  scheduleLostWorkRecovery: (op: LostContentOp) => void
  /** Shows the lost-work banner for work that cannot be recovered. */
  setLostWork: (state: { layerNames: string[]; restoredLayerIds: string[] }) => void
}

/** (#289 §9, #493) What this client does with the outbox's verdicts — the
 *  one place a definitive answer about an outgoing operation lands, for both
 *  dispatch paths (optimistic and confirmation-gated).
 *
 *  Out of the Outbox's construction in Room, where it was a pair of inline
 *  callbacks with every rule below and no test able to reach them. */
export function createOutboxVerdicts({
  pendingIdsRef, latestKnownSeqRef, noteLayerSeq, checkSnapshotBoundary,
  resolveTransformCommit, scheduleLostWorkRecovery, setLostWork,
}: OutboxVerdictDeps): {
  onStalled: (op: Operation) => void
  onSettled: (op: Operation, result: SendResult) => void
} {
  return {
    onStalled: op => {
      console.error('operation stopped retrying after repeated failures', op.type, op.id)
      // (#395) Stop holding a transform preview for an operation that has
      // stopped trying to arrive. Showing the layer where it actually is
      // beats showing where it was meant to go with nothing indicating that
      // it never got there — the entry stays queued either way, so a later
      // resendAll can still land it.
      resolveTransformCommit(op.id)
    },
    onSettled: (op, result) => {
      if (!result.ok) {
        console.error('operation rejected by server', op.type, op.id, result.reason)
        // (#395) It will never be applied, so nothing is coming to replace
        // the held gizmo preview — drop it and put the bounds back on what
        // the layer really contains.
        resolveTransformCommit(op.id)
        // Never became real — drop it back out of the local island so a
        // later delete/merge targeting it isn't wrongly treated as safe.
        if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.delete(op.layerId)
        // (#289 §17, #312) `target_gone` on a content-bearing op is the one
        // rejection a user can actually perceive as lost work — typically
        // drawn offline (or during a drop) onto a layer someone deleted in
        // the meantime. Since #311 the server hands those operations back
        // intact instead of swallowing them, so they can be recovered onto
        // a fresh layer rather than merely reported.
        //
        // Deliberately still not an automatic room fork: forking on every
        // conflict was considered and rejected as worse than the problem (a
        // pile of near-duplicate rooms after any flaky wifi). A replacement
        // layer is the far smaller intervention — and it doesn't undo the
        // deletion either, since whoever deleted the layer deleted what they
        // could see; this only brings back what they couldn't.
        if (result.reason === 'target_gone') {
          if (isRecoverableContentOp(op)) scheduleLostWorkRecovery(op)
          else setLostWork({ layerNames: [], restoredLayerIds: [] })
        }
        return
      }
      latestKnownSeqRef.current = Math.max(latestKnownSeqRef.current, result.seq)
      if (op.type === 'stroke') noteLayerSeq(op.layerId, result.seq)
      // Confirmed — a peer could plausibly reference this id from now on, so
      // it no longer qualifies as this client's own private local island
      // (see isLocalIslandSafe/dispatchOp).
      if (op.type === 'layer_add' || op.type === 'folder_add') pendingIdsRef.current.delete(op.layerId)
      checkSnapshotBoundary()
    },
  }
}
