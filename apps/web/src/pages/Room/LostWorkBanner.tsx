import { Icon } from '../../components/Icon'
import styles from './LostWorkBanner.module.css'

interface LostWorkBannerProps {
  onDismiss: () => void
}

/** (#289 §17) Shown once the server rejects an operation as `target_gone` —
 *  in practice: something drawn while offline (or during a connection drop)
 *  onto a layer another participant deleted in the meantime.
 *
 *  This is the deliberate alternative to automatically forking the room on
 *  every such conflict, which was considered and rejected: forking would
 *  turn one flaky-wifi session into a pile of near-duplicate rooms, a worse
 *  problem than the one it solves. Tell the user plainly what happened
 *  instead, and let them decide whether anything needs redoing. */
export function LostWorkBanner({ onDismiss }: LostWorkBannerProps): React.JSX.Element {
  return (
    <div className={styles.banner} role="status">
      <Icon name="cloud_off" />
      <span>Часть нарисованного не сохранилась — слой был удалён другим участником.</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Скрыть">
        <Icon name="close" />
      </button>
    </div>
  )
}
