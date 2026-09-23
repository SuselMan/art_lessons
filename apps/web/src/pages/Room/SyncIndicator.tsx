import clsx from 'clsx'

import { useT, type TranslationKey } from '../../i18n'
import { useSyncStatus, type SyncStatus, type SyncStatusInput } from './syncStatus'
import styles from './Room.module.css'

/** One row per state, so adding a fourth is one entry rather than three
 *  conditionals that can disagree about which state they are in. */
const PRESENTATION: Record<SyncStatus, { label: TranslationKey; className?: string }> = {
  saved: { label: 'room.sync.saved' },
  syncing: { label: 'room.sync.syncing', className: styles.syncStatusBusy },
  offline: { label: 'room.sync.offline', className: styles.syncStatusOffline },
}

/** (#376) "Is what I drew on the server?", answered permanently next to the
 *  project's name instead of by a toast that appeared and left again on every
 *  stroke.
 *
 *  A steady label is the right shape for this because the state it reports is
 *  steady: the queue is either empty or it isn't, and that fact is true
 *  continuously rather than being an event. The toast it replaced had the
 *  opposite shape — it interrupted to announce something that resolved itself
 *  a moment later, dozens of times per lesson, which taught people to ignore
 *  exactly the indicator that matters when the connection really does go bad.
 *
 *  The dot carries the state and the word says it; neither is alone, because
 *  green/amber/red alone fails anyone who can't tell those three apart.
 *
 *  (#575) `dotOnly` is the narrow header's version, and the one exception to
 *  that: the word moves into the tooltip and stays readable to a screen
 *  reader, but the eye gets the dot alone. Kept rather than hidden outright,
 *  because a dot turning red is still the fastest way to learn the strokes
 *  aren't reaching anyone — the one state this indicator exists for. */
export function SyncIndicator({ dotOnly = false, ...input }: SyncStatusInput & { dotOnly?: boolean }): React.JSX.Element {
  const t = useT()
  const status = useSyncStatus(input)
  const { label, className } = PRESENTATION[status]

  return (
    <span
      className={clsx(styles.syncStatus, dotOnly && styles.syncStatusDotOnly, className)}
      role="status"
      title={dotOnly ? t(label) : undefined}
    >
      <span className={styles.syncDot} aria-hidden="true" />
      <span className={clsx(dotOnly && styles.visuallyHidden)}>{t(label)}</span>
    </span>
  )
}
