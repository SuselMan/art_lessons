import { useEffect, useState, type RefObject, type Dispatch, type SetStateAction } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { fetchReviewImage } from '../../lib/api/reviewImage'
import type { Viewport } from './viewport/useViewport'
import { useRoomStore } from '../../stores/roomStore'

/** The early review is a DOM image in world coordinates. It never imports
 *  pixels into the restoring engine and therefore cannot poison its layers,
 *  checkpoint uploader, undo history or thumbnail publishing. */
export function useReviewImage(engineRef: RefObject<PencilEngineAPI | null>, roomContentReady: boolean, connected: boolean, vpEl: HTMLDivElement | null, setVp: Dispatch<SetStateAction<Viewport>>) {
  const boardId = useRoomStore(s => s.boardId)
  const reviewBoardId = useRoomStore(s => s.reviewBoardId)
  const annotationMode = useRoomStore(s => s.annotationMode)
  const [image, setImage] = useState<(Awaited<ReturnType<typeof fetchReviewImage>> & { boardId: string }) | null>(null)
  useEffect(() => {
    if (!boardId || boardId !== reviewBoardId || !connected || roomContentReady || !vpEl) return
    setImage(null)
    const abort = new AbortController()
    let ownedUrl: string | null = null
    void fetchReviewImage(boardId, abort.signal).then(result => {
      if (abort.signal.aborted) { URL.revokeObjectURL(result.url); return }
      ownedUrl = result.url
      if (useRoomStore.getState().room?.infinite) {
        const { x, y, width, height } = result.bounds
        const zoom = Math.min(vpEl.clientWidth / width, vpEl.clientHeight / height) * 0.9
        setVp({ cx: vpEl.clientWidth / 2 - (x + width / 2) * zoom, cy: vpEl.clientHeight / 2 - (y + height / 2) * zoom, zoom, angle: 0 })
      }
      setImage({ ...result, boardId })
    }).catch(() => {
      // Legacy preview links, a deleted export, and a failed image request
      // all fall back to the normal room load rather than a blank review.
    })
    return () => { abort.abort(); if (ownedUrl) URL.revokeObjectURL(ownedUrl) }
  }, [boardId, reviewBoardId, connected, roomContentReady, vpEl, setVp])

  useEffect(() => {
    if (!roomContentReady || useRoomStore.getState().reviewAnnotationHistory === null) return
    useRoomStore.getState().finishReviewHistory(engineRef.current?.getOperations() ?? [])
  }, [engineRef, roomContentReady])

  const visible = !roomContentReady && annotationMode && connected && image?.boardId === boardId && boardId === reviewBoardId
  return visible ? image : null
}
