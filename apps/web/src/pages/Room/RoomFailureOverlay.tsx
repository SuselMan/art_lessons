import { useT, type TranslationKey } from '../../i18n'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../icons/iconNames'
import styles from './RoomFailureOverlay.module.css'

interface RoomFailureOverlayProps {
  icon: IconName
  titleKey: TranslationKey
  bodyKey: TranslationKey
  retryKey: TranslationKey
  /** A retry is in flight — the button stays put and goes un-clickable rather
   *  than the overlay flipping back to the spinner and returning here. Omit
   *  where the retry hands off immediately and the spinner *is* the feedback. */
  retryingKey?: TranslationKey
  retrying?: boolean
  onRetry: () => void
}

/** The shape both "this room did not open, and here is the one thing to do
 *  about it" screens take: #346's paper failure and #533's snapshot failure.
 *
 *  Shared because the two are the same claim with a different cause, and a
 *  reader who has seen one should recognise the other instantly — not because
 *  the CSS was long. Each caller keeps its own thin wrapper, since *why* a
 *  room stays closed is the part worth writing down next to the case that
 *  taught it.
 *
 *  The button is this overlay's own rather than a `Notice` action: those are
 *  documented as quiet escape hatches from something that already happened,
 *  and this is the single thing there is to do here.
 *
 *  Same geometry and the same `pointer-events: none` as RoomLoadingOverlay and
 *  OfflineRoomOverlay — see the former's own comment for why the container must
 *  not swallow input. The button opts back in for itself. */
export function RoomFailureOverlay({
  icon, titleKey, bodyKey, retryKey, retryingKey, retrying = false, onRetry,
}: RoomFailureOverlayProps): React.JSX.Element {
  const t = useT()
  return (
    <div className={styles.overlay} role="alert">
      <Icon name={icon} />
      <div className={styles.title}>{t(titleKey)}</div>
      <div className={styles.body}>{t(bodyKey)}</div>
      <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
        {t(retrying && retryingKey ? retryingKey : retryKey)}
      </button>
    </div>
  )
}
