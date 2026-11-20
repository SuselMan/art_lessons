import { useCallback, useRef, useState, useEffect, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../../engine'
import { useShareRoom } from '../../../components/RoomAccessControl/useShareRoom'
import { uploadReviewImage } from '../../../lib/api/reviewImage'
import { useT } from '../../../i18n'
import { notifyError, pushNotice, dismissNotice } from '../../../stores/noticeStore'
import { useRoomStore } from '../../../stores/roomStore'

/** Share immediately; prepare a generation-matched early preview in the background. */
export function useReviewSharing(engineRef: RefObject<PencilEngineAPI | null>) {
  const t = useT()
  const shareRoom = useShareRoom()
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const shareForReview = useCallback(async () => {
    const { room, boardId } = useRoomStore.getState()
    const engine = engineRef.current
    if (!room || !boardId || !engine || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const noticeId = pushNotice({ variant: 'neutral', message: t('share.preparingReview'), key: 'prepare-review', durationMs: null })
    const generation = crypto.randomUUID()
    shareRoom({ ...room, id: boardId }, true, generation)
    // Let the link/share UI paint before the synchronous GPU readback begins.
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
    try {
      if (!mounted.current) return
      const image = await engine.exportReviewImage()
      if (!image) throw new Error('Review export unavailable')
      await uploadReviewImage(boardId, image, generation)
    } catch {
      if (mounted.current) notifyError(t('share.reviewBackgroundFailed'), { key: 'prepare-review-error' })
    } finally {
      dismissNotice(noticeId)
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }, [engineRef, shareRoom, t])
  return { shareForReview, busy }
}
