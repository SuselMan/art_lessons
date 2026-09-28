import { useCallback, useRef, type RefObject } from 'react'

import type { Operation } from '@grafetto/shared'

import { pixelWriteLayerIds, type PencilEngineAPI } from '../../engine'
import { reportInvariant } from '../../lib/observability/reportInvariant'

export interface TrueOrderDeps {
  engineRef: RefObject<Pick<PencilEngineAPI, 'confirmOperation' | 'discardOperation'> | null>
}

/** (#537) Room's side of "every participant ends with the picture the
 *  server's seq order describes": where this client's own operations get
 *  their place in that order (confirmation) or leave it (refusal), and the
 *  #480 counter that reports any operation still taking its place out of it.
 *
 *  The order itself is kept by the engine — its log is the confirmed region
 *  in seq order plus a pending tail of this client's own operations, and it
 *  re-settles a layer whose pixels went down in another order. See
 *  OperationLog's class doc comment. */
export function useTrueOrder({ engineRef }: TrueOrderDeps) {
  // (#289 epic — reliable history spec v0.2 §2/§4, Phase 2 diagnostic) Highest
  // confirmed `seq` taken into each layer so far, keyed by layerId. It used to
  // count this client's own strokes painting before their seq was known —
  // the hazard #537 closed. Kept as the proof that it stays closed: it is fed
  // where an operation takes its place in the room's order on this client
  // (applyRemoteOp, and this client's own at its ordered confirmation), which
  // since #537 is always seq order, so it should stay at zero.
  const layerAppliedSeqRef = useRef<Map<string, number>>(new Map())
  /** Every layer an operation's pixels go onto, not only a stroke's: an erase,
   *  a clear, a fill or a filter out of order is as wrong as a stroke. */
  const noteOperationSeq = useCallback((op: Operation, seq: number) => {
    for (const layerId of pixelWriteLayerIds(op)) {
      const highest = layerAppliedSeqRef.current.get(layerId) ?? 0
      if (seq < highest) {
        // (#480) Counted where it is visible without an open devtools.
        reportInvariant('layer op applied out of true order', { layerId, seq, alreadyOnScreen: highest })
        continue
      }
      layerAppliedSeqRef.current.set(layerId, seq)
    }
  }, [])

  /** A new board is a new order: its seqs start over. */
  const resetLayerSeqs = useCallback(() => { layerAppliedSeqRef.current = new Map() }, [])

  // The layer panel's state is derived from the log's order, which a
  // confirmation or a discard can change. Through a ref: Room defines
  // syncFromLog below the Outbox that needs these callbacks.
  const syncFromLogRef = useRef<() => void>(() => {})

  /** This client's own operation has its seq — from the ordered stream
   *  (`ordered`), from room_state's tail after a reconnect (also ordered), or
   *  from the ack, which reaches here after an IndexedDB await and so may land
   *  behind later arrivals. The engine places it by seq either way; only an
   *  ordered confirmation is fed to the #480 counter. */
  const confirmOwnOperation = useCallback((op: Operation, seq: number, ordered: boolean) => {
    if (!engineRef.current?.confirmOperation(op.id, seq)) return
    if (ordered) noteOperationSeq(op, seq)
    if (op.type !== 'stroke') syncFromLogRef.current()
  }, [engineRef, noteOperationSeq])

  /** The server refused this client's operation for good. */
  const discardOwnOperation = useCallback((op: Operation) => {
    if (engineRef.current?.discardOperation(op.id)) syncFromLogRef.current()
  }, [engineRef])

  return { noteOperationSeq, resetLayerSeqs, confirmOwnOperation, discardOwnOperation, syncFromLogRef }
}
