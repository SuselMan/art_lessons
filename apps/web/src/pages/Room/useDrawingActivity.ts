import { useCallback, useEffect, useRef, useState } from 'react'

import { useRoomStore } from '../../stores/roomStore'
import {
  currentlyDrawing, currentlyDrawingLayers, layerActivityKey, sameIds, sameLayerDrawers,
  type LayerActivity,
} from './gestures/drawingIndicator'

/** How long after someone's last stroke event they stop counting as drawing. */
const DRAWING_TIMEOUT_MS = 1500

export interface DrawingActivity {
  /** Ids currently shown as drawing, for the participants list. */
  drawingIds: string[]
  /** Someone just drew — from a stroke operation, or this client's own pen. */
  markActive: (userId: string) => void
  /** A peer's stroke landed on a layer — the layer panel outlines that row
   *  in their colour. Peers only: the viewer's own stroke is on the row they
   *  just picked, and outlining it under their pen says nothing new. */
  markLayerActive: (userId: string, layerId: string) => void
  /** Someone left the room; drop them rather than waiting out the timeout. */
  forget: (userId: string) => void
  /** (#176) A page turn: nobody is drawing on a board this client has only
   *  just arrived on, whatever was true of the last one. */
  reset: () => void
}

/** (#493, #38) Who is drawing right now.
 *
 *  All of it in one place: the timestamps, the two ways they are written, and
 *  the interval that prunes them into a rendered list. Room used to hold the
 *  ref, the state and the interval separately, with the writes scattered
 *  across the engine's pointer callbacks, the operation bridge and two socket
 *  handlers — which made "why is this person shown as drawing" a question
 *  answered in four places.
 *
 *  Inferred rather than reported: there is no drawing_start/stop event in the
 *  shared contract, so this reads activity off stroke operations and engine
 *  events. A dedicated event would be a nicer answer and is not worth a wire
 *  change on its own.
 *
 *  The timestamps live in a ref because they are written far more often than
 *  they are read — every dab of every participant — and nothing should
 *  re-render for them. The interval is what turns that into state, at a rate a
 *  person can actually see. */
export function useDrawingActivity(): DrawingActivity {
  const lastActiveAtRef = useRef<Record<string, number>>({})
  const layerActivityRef = useRef<Record<string, LayerActivity>>({})
  const [drawingIds, setDrawingIds] = useState<string[]>([])

  const markActive = useCallback((userId: string) => {
    lastActiveAtRef.current[userId] = Date.now()
  }, [])

  const markLayerActive = useCallback((userId: string, layerId: string) => {
    if (userId === useRoomStore.getState().userId) return
    layerActivityRef.current[layerActivityKey(userId, layerId)] = { userId, layerId, at: Date.now() }
  }, [])

  const forget = useCallback((userId: string) => {
    delete lastActiveAtRef.current[userId]
    for (const [k, a] of Object.entries(layerActivityRef.current)) {
      if (a.userId === userId) delete layerActivityRef.current[k]
    }
  }, [])

  const reset = useCallback(() => {
    lastActiveAtRef.current = {}
    layerActivityRef.current = {}
    setDrawingIds([])
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentlyDrawing(lastActiveAtRef.current, Date.now(), DRAWING_TIMEOUT_MS)
      // Same array unless the set really changed: this ticks three times a
      // second for the whole life of the room, and a fresh array each time
      // would re-render the participants list just as often.
      setDrawingIds(prev => (sameIds(prev, next) ? prev : next))
      // The layer panel's half, in the store because the panel reads it and
      // the panel is not a child this hook hands props to.
      const { layerDrawers, setLayerDrawers } = useRoomStore.getState()
      const nextLayers = currentlyDrawingLayers(layerActivityRef.current, Date.now(), DRAWING_TIMEOUT_MS)
      if (!sameLayerDrawers(layerDrawers, nextLayers)) setLayerDrawers(nextLayers)
    }, 300)
    return () => window.clearInterval(timer)
  }, [])

  return { drawingIds, markActive, markLayerActive, forget, reset }
}
