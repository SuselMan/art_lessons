import clsx from 'clsx'

import { useT } from '../../i18n'
import { useSyncStatus, type SyncStatusInput } from './syncStatus'
import styles from './Room.module.css'

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
 *  colour alone fails anyone who can't distinguish these two. */
export function SyncIndicator(props: SyncStatusInput): React.JSX.Element {
  const t = useT()
  const status = useSyncStatus(props)

  return (
    <span
      className={clsx(styles.syncStatus, status === 'syncing' && styles.syncStatusBusy)}
      role="status"
    >
      <span className={styles.syncDot} aria-hidden="true" />
      {t(status === 'syncing' ? 'room.sync.syncing' : 'room.sync.saved')}
    </span>
  )
}
