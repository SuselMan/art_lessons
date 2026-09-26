import { useCallback, useRef, type RefObject } from 'react'

import type { LayerState } from '@grafetto/shared'

import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { makeInitialLayerState } from '../../stores/slices/layerSlice'

export interface LogDerivedStateDeps {
  engineRef: RefObject<PencilEngineAPI | null>
}

/** (#493) The store's layer state and annotations are derived from the
 *  engine's operation log, never written independently: this is the
 *  derivation, the base it sits on after a snapshot restore (#169), the
 *  per-burst coalescing that keeps it cheap (#148), and the synchronous form
 *  for callers that read the store straight after (#386). Out of Room. */
export function useLogDerivedState({ engineRef }: LogDerivedStateDeps) {
  // LayerState is derived: base room state + replay of done operations, with
  // per-user view fields (selection, collapse, local lock) carried over.
  // Defined here (rather than further down, closer to dispatchOp/handleUndo)
  // because the mount-engine effect below needs it for pending-snapshot replay.
  //
  // (#148) replayLayerState walks the *entire* done-operations array from
  // scratch on every call — cost scaling with total session length, not the
  // current canvas — and syncFromLog is called once per incoming
  // operation_confirmed, undo/redo, and finished stroke-reveal (onPreviewApplied).
  // Several peers drawing at once easily produces a burst of these calls
  // within the same tick/microtask turn (a socket 'message' handler firing
  // several times before the event loop yields), each currently paying its
  // own full O(log length) scan back to back for what ends up being the same
  // final state. Coalesced here via a microtask (same "collapse a same-tick
  // burst" idea as useViewport's own rAF-throttled updateVp, just finer-
  // grained — a microtask runs before the next paint regardless, so this
  // adds no perceptible delay): repeated calls before the microtask fires are
  // free, and the one real scan that does happen reads getOperations() fresh
  // at that point, reflecting every op appended by then either way, so this
  // is purely a *when* change — never a stale or partial replay.
  const syncFromLogScheduledRef = useRef(false)
  // (#169) Once a network-snapshot restore has happened, LayerState must be
  // derived on top of the snapshot's own `layerState` — not
  // makeInitialLayerState() — since the client's OperationLog only has the
  // live tail at that point (full pre-snapshot history arrives later, via
  // background backfill, purely for undo/redo; see
  // engine.getOperationsSinceRestore's own doc comment for why replaying it
  // again here would double-apply structure the restored base already
  // reflects). Sticky for the rest of the session once set — never reset
  // back to null, even after backfill completes.
  const restoredLayerStateRef = useRef<LayerState | null>(null)
  const deriveLayerStateFromLog = useCallback(() => {
    const base = restoredLayerStateRef.current
    const engine = engineRef.current
    const ops = base
      ? (engine?.getOperationsSinceRestore() ?? [])
      : (engine?.getOperations() ?? [])
    useRoomStore.getState().syncLayerStateFromLog(base ?? makeInitialLayerState(), ops)
    // (#508) Annotations fold from the *whole* done log, not from the
    // since-restore tail LayerState uses, and with no base to sit on. The
    // asymmetry is the point: a snapshot restores pixels and the stored
    // layerState restores structure, so replaying either again would
    // double-apply it — but nothing anywhere stores annotations, which is
    // exactly why the server never withholds one (see isCoveredBySnapshot).
    // Every annotation operation the room ever had is therefore present here,
    // and folding all of them from empty is both correct and, because the fold
    // is keyed by annotation id, immune to being run twice.
    useRoomStore.getState().syncAnnotationsFromLog(engine?.getOperations() ?? [])
  }, [engineRef])
  const syncFromLog = useCallback(() => {
    if (syncFromLogScheduledRef.current) return
    syncFromLogScheduledRef.current = true
    queueMicrotask(() => {
      syncFromLogScheduledRef.current = false
      deriveLayerStateFromLog()
    })
  }, [deriveLayerStateFromLog])
  /** (#386) The same derivation, run now instead of on the next microtask.
   *
   *  Deferring is right for the ordinary case: operations arrive in bursts and
   *  one derivation per burst beats one per operation. It is wrong for any
   *  caller that goes on to *read* the store in the same task, because the
   *  microtask has not run yet and the store still holds whatever was there
   *  before — for a fresh join, `makeInitialLayerState()`.
   *
   *  That is not hypothetical. The snapshot bootstrap below used to call
   *  `syncFromLog()` and then read `useRoomStore.getState().layerState`
   *  synchronously a few lines later, so it uploaded the *empty room's*
   *  structure as the room's authoritative one. On a real 2001-operation
   *  lesson that stored `{layer-1, background}` at seq 2000 over a room with
   *  six layers and a folder, and the next join restored from it: two empty
   *  layers, with the server then withholding the operations it believed that
   *  snapshot covered. The pixels were never in danger — every operation was
   *  still in Postgres — but the room read as wiped.
   *
   *  Leaves any already-queued microtask alone rather than trying to cancel
   *  it: this derivation is a pure function of the log, so running it twice
   *  costs a little work and changes nothing. */
  const syncFromLogNow = useCallback(() => {
    deriveLayerStateFromLog()
  }, [deriveLayerStateFromLog])

  return { restoredLayerStateRef, syncFromLog, syncFromLogNow }
}
