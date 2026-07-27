import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import styles from './OfflineRoomOverlay.module.css'

interface OfflineRoomOverlayProps {
  /** Operations queued on this device and not yet confirmed. */
  pending: number
}

/** (#313) Replaces the loading preloader once it's clear the room isn't
 *  loading because there's no connection, rather than because it's slow.
 *
 *  A room can't currently be opened offline at all: everything is gated on
 *  the create_room/join_room ack and the first room_state, so with no socket
 *  the preloader spins forever with no explanation, no timeout, and no way
 *  out. That turns a safe situation into a real loss — unconfirmed work is
 *  sitting in IndexedDB and will be sent on the next connection, but a user
 *  who can't tell that reasonably concludes it's gone, and someone who
 *  concludes that may clear the site data holding their only copy.
 *
 *  So the one job here is to be honest about all three things: the room
 *  needs a connection, the work is safe, and it will be sent automatically.
 *  Actually *drawing* offline in an existing room needs a local document
 *  (the confirmed log plus a snapshot on the device) and is a separate,
 *  deliberately deferred piece of work. */
export function OfflineRoomOverlay({ pending }: OfflineRoomOverlayProps): React.JSX.Element {
  const t = useT()
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <Icon name="cloud_off" />
      <div className={styles.title}>{t('room.offline.title')}</div>
      <div className={styles.body}>{t('room.offline.body')}</div>
      {pending > 0 && (
        <div className={styles.reassurance}>{t('room.offline.pending', { n: pending })}</div>
      )}
      <div className={styles.retry}>{t('room.offline.retrying')}</div>
    </div>
  )
}
