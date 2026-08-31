import { useEffect, type RefObject } from 'react'

import { computeCompositeOrder, isEffectivelyVisible, isLayerLocked } from '../../lib/layers'
import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { isDrawingTool } from '../../stores/slices/toolSlice'

/** (#493) What the engine is told about layers, and who is allowed to paint.
 *
 *  Reads the layer state and the selected tool from the store, because that is
 *  where they live; `isOwner` comes in as an argument, because Room derives it
 *  from the participant list rather than holding it. That is the line this
 *  decomposition draws generally — the store's facts are asked for directly,
 *  Room's own derivations are handed over.
 *
 *  The interesting half is `setLocked`, which is one gate standing for four
 *  unrelated reasons a stroke must not start, deliberately kept as one:
 *
 *  - the layer is locked, or its owner has reserved it (#488), or it inherits
 *    a lock from a folder above it (#518) — until that was checked here, a
 *    non-owner could draw on a reserved layer, watch the ink appear, and have
 *    the server reject every stroke of it;
 *  - the layer is hidden (#359) — it is not in the composite, so the stroke
 *    would be invisible to everyone including its author while still reaching
 *    every participant and the log;
 *  - a non-painting tool is selected (#155, #405) — the gizmo and the ruler are
 *    overlays rather than something that swallows the canvas's own pointer
 *    events, so without this a gizmo drag also drew a stroke underneath it.
 *
 *  `setLocked` only gates `PencilEngine._onStart`; it never touches layerState,
 *  so none of this shows the layer as locked in the panel. It is purely "do not
 *  start a stroke right now". */
export function useLayerStateSync(engineRef: RefObject<PencilEngineAPI | null>, isOwner: boolean): void {
  const layerState = useRoomStore(s => s.layerState)
  const tool = useRoomStore(s => s.tool)

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setActiveLayer(layerState.activeId)
    engine.setLocked(
      isLayerLocked(layerState, layerState.activeId, isOwner)
      || !isEffectivelyVisible(layerState, layerState.activeId)
      || !isDrawingTool(tool),
    )
    engine.setCompositeOrder(computeCompositeOrder(layerState))
    // `engineRef` is listed and `engineRef.current` deliberately is not. The
    // ref object never changes identity, so naming it costs nothing and keeps
    // the lint rule — which stopped recognising it as a ref once it became a
    // parameter — from reporting a real-looking miss. The *instance* is a
    // different matter: the engine is created by a later effect than this one
    // first runs, so depending on it would re-run this on the engine's
    // arrival, and it is read at call time precisely so that never matters.
  }, [engineRef, layerState, tool, isOwner])
}
