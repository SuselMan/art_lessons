import { useCallback, useEffect, useRef, useState } from 'react'

import { currentlyDrawing, sameIds } from './drawingIndicator'

/** How long after someone's last stroke event they stop counting as drawing. */
const DRAWING_TIMEOUT_MS = 1500

export interface DrawingActivity {
  /** Ids currently shown as drawing, for the participants list. */
  drawingIds: string[]
  /** Someone just drew — from a stroke operation, or this client's own pen. */
  markActive: (userId: string) => void
  /** Someone left the room; drop them rather than waiting out the timeout. */
  forget: (userId: string) => void
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
  const [drawingIds, setDrawingIds] = useState<string[]>([])

  const markActive = useCallback((userId: string) => {
    lastActiveAtRef.current[userId] = Date.now()
  }, [])

  const forget = useCallback((userId: string) => {
    delete lastActiveAtRef.current[userId]
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = currentlyDrawing(lastActiveAtRef.current, Date.now(), DRAWING_TIMEOUT_MS)
      // Same array unless the set really changed: this ticks three times a
      // second for the whole life of the room, and a fresh array each time
      // would re-render the participants list just as often.
      setDrawingIds(prev => (sameIds(prev, next) ? prev : next))
    }, 300)
    return () => window.clearInterval(timer)
  }, [])

  return { drawingIds, markActive, forget }
}
