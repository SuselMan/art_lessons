import type { RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { diagLog } from '../../lib/observability/diagLog'
import type { PencilSound } from '../../lib/sound/PencilSound'
import { computeCompositeOrder } from '../../lib/layers/layers'
import { useRoomStore } from '../../stores/roomStore'
import type { OpenTimer } from './diagnostics/openTiming'
import { uploadThumbnail } from './net/snapshotSync'
import type { RoomStatePayload } from './restoreRoomState'

/** (#493) The pieces of the engine's mount effect that are about one thing
 *  each. What stays in the effect is the engine's construction and its
 *  network callbacks, which are the effect's reason to exist; these three are
 *  what it does around that.
 *
 *  (#493, later) Four now: what the new engine does with the `room_state`
 *  parked for it went out too, as openParkedRoomState.
 *
 *  Plain functions rather than hooks, on purpose. Each runs exactly once per
 *  engine, from inside the one effect that owns that engine, so none of them
 *  has a lifetime of its own to manage — and a hook here would be an
 *  invitation to give it one. */

export interface LocalStrokeWiring {
  /** Whether a stroke is under this person's pen right now. Read by the
   *  cursor broadcast, which stays silent while it is. */
  strokeActiveRef: RefObject<boolean>
  markActive: (userId: string) => void
  pencilSoundRef: RefObject<PencilSound | null>
}

/** What happens around this person's own strokes, outside the canvas.
 *
 *  Local "drawing" activity (#38): strokeStart/strokeEnd bound the local
 *  stroke exactly; 'pointer' (fired on every move while the stroke's pointer
 *  button is held — see PointerInput's `_active` gating) refreshes it so a long
 *  stroke doesn't let the indicator time out mid-draw. Cursor broadcast (#37)
 *  is handled separately via a raw DOM listener, since it must also fire on
 *  plain hover (engine 'pointer' does not).
 *
 *  The same handlers drive the pencil sound. Its AudioContext is built lazily
 *  on the engine's own 'strokeStart' — a real pointerdown gesture, which is
 *  what satisfies the browser's autoplay unlock. The instance itself is not
 *  built here (#321): it is a setting that can be switched on and off
 *  mid-lesson, so it lives in usePencilSound and is reached through the ref at
 *  event time — which is also why neither has to be set up before the other. */
export function wireLocalStrokeEvents(
  engine: PencilEngineAPI,
  { strokeActiveRef, markActive, pencilSoundRef }: LocalStrokeWiring,
): void {
  engine
    .on('strokeStart', e => {
      strokeActiveRef.current = true
      useRoomStore.getState().setStrokeActive(true)
      diagLog('stroke: start')
      markActive(useRoomStore.getState().userId)
      pencilSoundRef.current?.start(e.pressure, e.speed, e.tiltX, e.tiltY)
    })
    .on('strokeEnd', () => {
      strokeActiveRef.current = false
      useRoomStore.getState().setStrokeActive(false)
      diagLog('stroke: end')
      pencilSoundRef.current?.stop()
    })
    .on('pointer', e => {
      if (strokeActiveRef.current) {
        markActive(useRoomStore.getState().userId)
        pencilSoundRef.current?.update(e.pressure, e.speed, e.tiltX, e.tiltY)
      }
    })
}

/** Gives a new engine the layer structure the store already holds. For a
 *  fresh room that is the initial layer set; anything a `room_state` brings is
 *  applied later, by restoreRoomState. */
export function initLayersFromStore(engine: PencilEngineAPI): void {
  const ls = useRoomStore.getState().layerState
  for (const id of ls.rootOrder) {
    if (ls.items[id]?.kind === 'layer') engine.initLayer(id)
  }
  engine.setActiveLayer(ls.activeId)
  engine.setCompositeOrder(computeCompositeOrder(ls))
}

/** (#536, §17.73) A room left by a full page load - another room's link, a
 *  reload - may go into Safari's page cache whole, WebGL memory included,
 *  while the next room fills the iPad's: it died within a minute and a half
 *  of such a move in two runs of four. The context goes at `pagehide`, and a
 *  page brought back from the cache (its context gone) reloads. Returns the
 *  cleanup. */
export function releaseOnPageHide(engine: PencilEngineAPI): () => void {
  const onHide = (): void => engine.releaseForPageHide()
  const onShow = (e: PageTransitionEvent): void => { if (e.persisted) location.reload() }
  window.addEventListener('pagehide', onHide)
  window.addEventListener('pageshow', onShow)
  return () => {
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('pageshow', onShow)
  }
}

/** Lets the engine go when the room does.
 *
 *  (#211 epic follow-up) Best-effort final thumbnail bake on room exit — see
 *  uploadThumbnail's doc comment in snapshotSync.ts for why this needs to exist
 *  alongside the seq-boundary trigger. `engine` stays alive until the export
 *  settles; destroy() only runs after, so exportPNG never reads from a
 *  torn-down GL context.
 *
 *  (#385) Not from a canvas we know is incomplete — republishing a blank
 *  preview over a real lesson's is the same mistake as baking a snapshot from
 *  it, just cheaper to undo. Takes the ref rather than its value, and reads it
 *  here: the question is whether the replay ended incomplete *by the time the
 *  room is left*, so only the latest value is correct. */
export function retireEngine(
  engine: PencilEngineAPI, boardId: string, replayIncompleteRef: RefObject<boolean>,
): void {
  if (!replayIncompleteRef.current) {
    void uploadThumbnail(boardId, engine)
      .then(uploaded => {
        // (#567) The board strip shows each board's own thumbnail, and this
        // is how it learns there is a newer one.
        if (uploaded) {
          useRoomStore.getState().applyBoardsAction({
            type: 'thumbnail_baked', boardId, at: new Date().toISOString(),
          })
        }
      })
      .finally(() => engine.destroy())
  } else {
    engine.destroy()
  }
}

export interface ParkedRoomState<Engine> {
  /** The `room_state` that arrived before this engine did, if any. Consumed. */
  pendingSnapshotRef: RefObject<RoomStatePayload | null>
  isCreator: boolean
  openTimerRef: RefObject<OpenTimer | null>
  latestKnownSeqRef: RefObject<number>
  /** (#346) False when the paper texture did not arrive — see usePaperReadiness. */
  awaitPaper: (engine: Engine) => Promise<boolean>
  /** restoreRoomState in `join` mode, for this engine's board. */
  restore: (pending: RoomStatePayload) => Promise<void>
  setRoomContentReady: (ready: boolean) => void
  finishOpenTimer: (engine: Engine) => void
}

/** What a freshly built engine does about the room's content.
 *
 *  Joiner path: the room_state that told us `config` (see the socket-wiring
 *  effect) arrived before the engine existed to apply its operations to —
 *  replay it now that it does. No-op for the creator, and for a joiner's
 *  reconnect (appliedOpIdsRef already dedupes across a fresh room_state
 *  reaching an already-mounted engine, but this path is specifically the
 *  one-time first mount).
 *
 *  Returns at once; the paper wait and the restore run behind it, because the
 *  mount effect still needs to register its cleanup synchronously. The promise
 *  is only for tests to await. */
export function openParkedRoomState<Engine>(engine: Engine, {
  pendingSnapshotRef, isCreator, openTimerRef, latestKnownSeqRef, awaitPaper, restore, setRoomContentReady,
  finishOpenTimer,
}: ParkedRoomState<Engine>): Promise<void> {
  const pending = pendingSnapshotRef.current
  if (pending) {
    pendingSnapshotRef.current = null
    // Awaits engine.paperReady() first (see its own doc comment): a
    // stroke replayed before the real paper texture has loaded would
    // permanently bake in the placeholder's flat response, with nothing
    // later to re-paint it once the real texture arrives.
    return (async () => {
      // (#487) Фазы входа. Отмечаются по факту перехода, вплотную к тому
      // await'у, который их и стоит — иначе они меряют не то, что называют.
      openTimerRef.current?.stage('paper')
      openTimerRef.current?.note({
        tailOperations: pending.tailOperations.length,
        latestSeq: latestKnownSeqRef.current,
        snapshotSeq: pending.latestSnapshotSeq,
      })
      // (#346) A failure here abandons the replay rather than running it
      // against the placeholder: awaitPaper puts up the retry screen, and
      // roomContentReady stays false so the room is not claimed to be open.
      if (!(await awaitPaper(engine))) return
      // (#493) The restore itself is shared with handleRoomState — see
      // restoreRoomState for the whole of it and why there is one.
      await restore(pending)
    })()
  }
  if (isCreator) return Promise.resolve()
  // Nothing to restore on this particular mount (e.g. a remount after
  // the first join already completed) — don't leave a stale `false`
  // from a prior mount stuck forever with nothing left to flip it.
  // Creator excluded: `pending` is always null for a creator's very
  // first mount too (its config is known synchronously, so
  // handleRoomState never has a reason to populate pendingSnapshotRef
  // the way a joiner's does — see its own doc comment), but at this
  // point nothing has confirmed yet whether this is a genuinely new
  // room or the creator's own reload of one with real content to
  // restore. Marking ready here regardless used to race ahead of that
  // answer; handleRoomState's first room_state is what actually knows,
  // and sets this itself either way (see its own two branches).
  //
  // Still gated on paperReady() even though there is nothing to replay:
  // "ready" is what takes the preloader down and lets the pencil through,
  // and the engine refuses to start a stroke until the real texture has
  // loaded (see PaperState.loaded). Marking ready before then hands over a
  // room that looks open and silently ignores every stroke.
  return (async () => {
    openTimerRef.current?.stage('paper')
    if (await awaitPaper(engine)) { setRoomContentReady(true); finishOpenTimer(engine) }
  })()
}
