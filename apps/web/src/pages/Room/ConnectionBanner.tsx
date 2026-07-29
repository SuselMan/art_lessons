import { useT } from '../../i18n'
import { Notice } from '../../components/Notice'

interface ConnectionBannerProps {
  connected: boolean
  /** Operations queued but not yet confirmed by the server. */
  pending: number
  /** How many of those have stopped retrying on their own (#298's
   *  MAX_ATTEMPTS). They are still queued and persisted — the next reconnect
   *  re-arms them — but saying so matters, because "retrying" and "given up
   *  for now" feel very different to someone watching a counter. */
  stalled: number
}

/** (#201) Connection state, and — the part that actually matters — how much
 *  drawing is not yet saved.
 *
 *  Before this the only signal was a dot in the participants bar, which said
 *  nothing about the work itself. The queue is durable (IndexedDB, #289 §9)
 *  and survives reloads, so in almost every case nothing is lost; but a user
 *  who can't see that will reasonably conclude the opposite, and a user who
 *  concludes the opposite may well clear the site data that was holding
 *  their only copy. Making the number visible is what turns a safe situation
 *  into one that also feels safe.
 *
 *  Deliberately does not appear for a clean connected-and-empty state, and
 *  stays up through the post-reconnect drain rather than vanishing the
 *  instant the socket comes back — the work isn't safe until the server has
 *  actually acknowledged it.
 *
 *  (#343) The clearest case for keeping this derived rather than pushed: its
 *  text interpolates `pending`, which ticks on every operation queued and
 *  every ack. As a render that is free — the count recomputes. As a pushed
 *  notice it would need an `updateNotice` on every one of those transitions,
 *  which is this render written by hand, plus a way for the number to go
 *  stale. */
export function ConnectionBanner({ connected, pending, stalled }: ConnectionBannerProps): React.JSX.Element | null {
  const t = useT()
  if (connected && pending === 0) return null

  const message = !connected
    ? (pending > 0 ? t('room.connection.offlineWithPending', { n: pending }) : t('room.connection.offline'))
    : stalled > 0
      ? t('room.connection.stalled', { n: stalled })
      : t('room.connection.syncing', { n: pending })

  return (
    <Notice
      variant="warning"
      icon={connected ? 'cloud_sync' : 'cloud_off'}
      role="status"
      message={message}
    />
  )
}
