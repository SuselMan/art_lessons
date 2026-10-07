import { useEffect, useRef, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { useRoomStore } from '../../stores/roomStore'
import { createPreviewSchedule } from './net/previewSchedule'
import { uploadThumbnail } from './net/snapshotSync'

export interface LivePreviewBakeDeps {
  engineRef: RefObject<PencilEngineAPI | null>
  boardId: string | null
  /** Whether this client is the board's baker — see bakesLivePreview. */
  active: boolean
  canBake: () => boolean
}

/** Keeps every open board's stored preview current, including its first
 *  picture after restore. One elected client publishes while the pen rests;
 *  failed uploads are retried at the normal interval. The caller guards
 *  completed restore and pending peer strokes through canBake.
 *  The ref also receives confirmed operations from the socket stream. */
export function useLivePreviewBake({ engineRef, boardId, active, canBake }: LivePreviewBakeDeps) {
  const canBakeRef = useRef(canBake)
  canBakeRef.current = canBake
  const previewScheduleRef = useRef<ReturnType<typeof createPreviewSchedule> | null>(null)
  useEffect(() => {
    if (!active || !boardId) return
    const schedule = createPreviewSchedule()
    previewScheduleRef.current = schedule
    // Opening an old room without a thumbnail must also create its first
    // picture. Leave the schedule dirty until restore actually completes.
    schedule.noteOperation(Date.now())
    if (useRoomStore.getState().strokeActive) schedule.notePenDown(Date.now())
    let inFlight = false
    const unsubscribe = useRoomStore.subscribe((next, prev) => {
      if (next.strokeActive === prev.strokeActive) return
      if (next.strokeActive) schedule.notePenDown(Date.now())
      else schedule.notePenUp(Date.now())
    })
    const timer = window.setInterval(() => {
      const now = Date.now()
      const engine = engineRef.current
      if (!engine || inFlight || !canBakeRef.current() || !schedule.shouldBake(now)) return
      inFlight = true
      schedule.noteBaked(now)
      void uploadThumbnail(boardId, engine).then(ok => {
        if (ok) useRoomStore.getState().applyBoardsAction({ type: 'thumbnail_baked', boardId, at: new Date().toISOString() })
        else schedule.noteOperation(Date.now()) // Retry a failed first upload.
      }).finally(() => { inFlight = false })
    }, 500)
    return () => {
      window.clearInterval(timer)
      unsubscribe()
      if (previewScheduleRef.current === schedule) previewScheduleRef.current = null
    }
  // `engineRef` is a ref object, stable for the component's life.
  }, [active, boardId, engineRef])
  return previewScheduleRef
}
