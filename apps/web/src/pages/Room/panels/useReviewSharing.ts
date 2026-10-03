import { useCallback, useRef, useState, useEffect, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../../engine'
import { useConfirmDialog } from '../../../components/ConfirmDialog/useConfirmDialog'
import { useShareRoom } from '../../../components/RoomAccessControl/useShareRoom'
import { uploadReviewImage } from '../../../lib/api/reviewImage'
import { canShareNatively } from '../../../lib/api/shareRoom'
import { useT } from '../../../i18n'
import { notifyError, pushNotice, dismissNotice } from '../../../stores/noticeStore'
import { useRoomStore } from '../../../stores/roomStore'
import { useSettingsStore } from '../../../stores/settingsStore'

/** Prepare the export before handing out the link. A native share must be
 *  called from a fresh click after the upload, not from its async continuation. */
export function useReviewSharing(engineRef: RefObject<PencilEngineAPI | null>) {
  const t = useT()
  const shareRoom = useShareRoom()
  const deviceType = useSettingsStore(s => s.deviceType)
  const { confirm } = useConfirmDialog()
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
    try {
      const image = await engine.exportReviewImage()
      if (!image) throw new Error('Review export unavailable')
      await uploadReviewImage(boardId, image)
      if (!mounted.current) return
      if (canShareNatively(deviceType, navigator) && !await confirm({
        title: t('share.reviewReady'), message: t('share.reviewReadyMessage'), confirmLabel: t('share.action'),
      })) return
      if (mounted.current) shareRoom({ ...room, id: boardId }, true)
    } catch {
      if (mounted.current) notifyError(t('share.reviewFailed'), { key: 'prepare-review-error' })
    } finally {
      dismissNotice(noticeId)
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }, [confirm, deviceType, engineRef, shareRoom, t])
  return { shareForReview, busy }
}
