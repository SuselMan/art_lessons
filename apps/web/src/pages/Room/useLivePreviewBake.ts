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
}

/** (#595, ADR 015 §5) The class grid's live picture of a student's board:
 *  re-baked a few seconds after the pen comes to rest, never during a stroke,
 *  only when something changed, and no more often than every five seconds —
 *  see previewSchedule.ts. One baker per board: its student, or, while the
 *  student is not on it, the teacher (whose corrections must reach the grid
 *  too). Annotations never reach a preview, so a teacher who only remarks
 *  changes nothing to bake.
 *
 *  (#493) Out of Room. The schedule comes back as a ref because the confirmed
 *  stream tells it about other people's changes to this board, and that
 *  handler is wired once per socket, not once per board. */
export function useLivePreviewBake({ engineRef, boardId, active }: LivePreviewBakeDeps) {
  const previewScheduleRef = useRef<ReturnType<typeof createPreviewSchedule> | null>(null)
  useEffect(() => {
    if (!active || !boardId) return
    const schedule = createPreviewSchedule()
    previewScheduleRef.current = schedule
    const unsubscribe = useRoomStore.subscribe((next, prev) => {
      if (next.strokeActive === prev.strokeActive) return
      if (next.strokeActive) schedule.notePenDown(Date.now())
      else schedule.notePenUp(Date.now())
    })
    const timer = window.setInterval(() => {
      const now = Date.now()
      const engine = engineRef.current
      if (!engine || !schedule.shouldBake(now)) return
      schedule.noteBaked(now)
      void uploadThumbnail(boardId, engine).then(ok => {
        if (ok) useRoomStore.getState().applyBoardsAction({ type: 'thumbnail_baked', boardId, at: new Date().toISOString() })
      })
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
