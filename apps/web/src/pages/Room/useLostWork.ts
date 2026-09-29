import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { nanoid } from 'nanoid'

import type { LayerState } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../engine'
import { useT } from '../../i18n'
import { useRoomStore } from '../../stores/roomStore'
import { createLostWorkBatcher, recoveryOperations, type LostContentOp } from './net/lostWork'

// (#312) How long lost-work recovery waits for the outbox to stop producing
// `target_gone` rejections before it mints replacement layers, and the hard
// cap on that wait. Quiet period: rejections come back at the rate the
// outbox drains, so a gap this long means the backlog is done. Cap: a large
// enough backlog would otherwise keep re-arming the timer forever.
const LOST_WORK_QUIET_MS = 800
const LOST_WORK_MAX_WAIT_MS = 5000

/** What the banner reports. `restoredLayerIds` non-empty means the content was
 *  actually recovered onto fresh layers and the banner offers to undo that;
 *  empty means there was nothing recoverable — a rejected merge/transform —
 *  and it stays the plain notice it has always been. */
export interface LostWork {
  layerNames: string[]
  restoredLayerIds: string[]
}

export interface LostWorkDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  /** useLogDerivedState's snapshot base — where a deleted layer's name may
   *  still be remembered. */
  restoredLayerStateRef: RefObject<LayerState | null>
  syncFromLog: () => void
}

/** (#289 §17, #312) Work the server refused as `target_gone` — drawn while
 *  offline or dropped onto a layer since deleted, the only rejection that can
 *  read as "my work vanished" — batched, brought back on fresh layers, and
 *  reported. Deliberately not an automatic room fork (see Outbox's onSettled).
 *  (#493) Out of Room: the outbox feeds `scheduleLostWorkRecovery` and
 *  `setLostWork`, a page turn calls `resetLostWork`. */
export function useLostWork({ engineRef, restoredLayerStateRef, syncFromLog }: LostWorkDeps) {
  const t = useT()
  const [lostWork, setLostWork] = useState<LostWork | null>(null)
  // Assigned by the effect below. The batcher is built once, at mount, and
  // `recoverLostWork` changes identity with the language — so the flush reads
  // whichever is current when it fires.
  const recoverLostWorkRef = useRef<((ops: LostContentOp[]) => void) | null>(null)
  // (#312) Rejected content operations waiting to be recovered as a batch —
  // see createLostWorkBatcher for the debounce and its cap.
  const lostWorkBatchRef = useRef(createLostWorkBatcher({
    onFlush: ops => recoverLostWorkRef.current?.(ops),
    quietMs: LOST_WORK_QUIET_MS, maxWaitMs: LOST_WORK_MAX_WAIT_MS,
    timers: { set: (fn, ms) => window.setTimeout(fn, ms), clear: id => window.clearTimeout(id) },
    now: () => Date.now(),
  }))

  // (#312) Queues one rejected content operation for recovery — see
  // createLostWorkBatcher.
  const scheduleLostWorkRecovery = useCallback((op: LostContentOp) => {
    lostWorkBatchRef.current.add(op)
  }, [])

  // (#312) Mints one replacement layer per dead target and replays the
  // rejected operations onto it, in their original draw order.
  //
  // A *new* layer rather than resurrecting the deleted one, deliberately:
  // `aliveIds` on the server is a monotonic fold over the log, so un-deleting
  // an id would break that invariant and leave every client to answer "what
  // about the operations between the delete and the resurrection" on its
  // own — the exact class of divergence #289 exists to remove. A fresh layer
  // is an ordinary `layer_add` plus ordinary strokes: no new server
  // semantics, and replay converges everywhere by construction.
  //
  // The content comes from this client's own rejected operations, never from
  // a pixel bake of the dead layer. Those operations go through the same
  // validation as any other, so the server is asked to trust nothing new —
  // whereas uploading client-baked pixels as truth is exactly #287, which
  // poisoned a room and is why snapshot pruning is still switched off. Worth
  // noting this is also the only source that survives at all once pruning
  // returns (#207): a snapshot taken after the deletion no longer contains
  // the layer, and the strokes below it get pruned, so the author's own
  // device is the last place this work exists.
  const recoverLostWork = useCallback((lost: LostContentOp[]) => {
    const engine = engineRef.current
    if (!lost.length || !engine) return
    const { layerState: live, userId } = useRoomStore.getState()
    // (#493) Which operations bring it back — see recoveryOperations. Same
    // optimistic path dispatchOp takes for local-island work: a brand-new
    // layer and strokes onto it can't conflict with anything, since nobody
    // else has heard of the id yet.
    const { operations, layerNames, restoredLayerIds } = recoveryOperations({
      lost, live, log: engine.getOperations(), restored: restoredLayerStateRef.current, userId,
      unnamedLayer: t('room.lostWork.unnamedLayer'),
      restoredName: name => t('room.lostWork.restoredLayerName', { name }),
      newId: () => nanoid(10), now: () => Date.now(),
    })
    for (const op of operations) engine.appendOperation(op)
    syncFromLog()
    setLostWork({ layerNames, restoredLayerIds })
  }, [engineRef, syncFromLog, t, restoredLayerStateRef])

  useEffect(() => {
    recoverLostWorkRef.current = recoverLostWork
  }, [recoverLostWork])

  // Any pending batch dies with the room — a timer firing after unmount would
  // append to an engine that no longer exists.
  useEffect(() => () => { lostWorkBatchRef.current.reset() }, [])

  /** A page turn: the previous board's pending batch and banner go with it. */
  const resetLostWork = useCallback(() => {
    lostWorkBatchRef.current.reset()
    setLostWork(null)
  }, [])

  return { lostWork, setLostWork, scheduleLostWorkRecovery, resetLostWork }
}
