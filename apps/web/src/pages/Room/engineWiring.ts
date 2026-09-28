import type { RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { diagLog } from '../../lib/observability/diagLog'
import type { PencilSound } from '../../lib/sound/PencilSound'
import { computeCompositeOrder } from '../../lib/layers/layers'
import { useRoomStore } from '../../stores/roomStore'
import { uploadThumbnail } from './snapshotSync'

/** (#493) The pieces of the engine's mount effect that are about one thing
 *  each. What stays in the effect is the engine's construction and its
 *  network callbacks, which are the effect's reason to exist; these three are
 *  what it does around that.
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
