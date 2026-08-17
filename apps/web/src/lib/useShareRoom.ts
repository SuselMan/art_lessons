import { useCallback } from 'react'
import type { RoomAccessMode } from '@grafetto/shared'

import { useT } from '../i18n'
import { pushNotice } from '../stores/noticeStore'
import { useSettingsStore } from '../stores/settingsStore'

import { roomShareUrl, shareNoticeFor, shareOrCopy } from './shareRoom'

/** What sharing needs to know about a project. Both call sites — the lesson
 *  list's ⋮ and the editor's own menu — have all three to hand. */
export interface ShareableRoom {
  id: string
  name: string
  accessMode: RoomAccessMode
}

/** How long the invite-only advisory stays up. Longer than a success (it is a
 *  sentence to read, not a confirmation to glance at), but not sticky the way
 *  a warning is by default: the action it comments on succeeded, so leaving a
 *  strip to be dismissed by hand would tax the normal path. */
const INVITE_ONLY_NOTICE_MS = 8000

/** The "Share" menu item's whole behaviour, in one call.
 *
 *  Fire-and-forget on purpose: the caller is a menu item, and the outcome is
 *  reported as a notice rather than returned. Nothing is awaited before the
 *  share sheet opens either — `navigator.share` has to be reached from the
 *  click's own transient activation, so a network round trip in front of it
 *  would get the call rejected on iOS. */
export function useShareRoom(): (room: ShareableRoom) => void {
  const t = useT()
  const deviceType = useSettingsStore(s => s.deviceType)

  return useCallback((room: ShareableRoom) => {
    const url = roomShareUrl(room.id, window.location.origin)
    void shareOrCopy({ url, title: room.name, deviceType }).then(outcome => {
      const notice = shareNoticeFor(outcome, room.accessMode)
      if (!notice) return
      pushNotice({
        variant: notice.variant,
        message: t(notice.message),
        // One key for all of them: sharing twice in a row is one piece of
        // news, and the second answer replaces the first instead of stacking.
        key: 'share-room',
        durationMs: notice.variant === 'warning' ? INVITE_ONLY_NOTICE_MS : undefined,
      })
    })
  }, [deviceType, t])
}
