import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import styles from './PaperFailedOverlay.module.css'

interface PaperFailedOverlayProps {
  /** A retry is in flight — the button stays put and goes un-clickable rather
   *  than the overlay flipping back to the spinner and returning here. */
  retrying: boolean
  onRetry: () => void
}

/** (#346) Shown instead of the loading preloader once the paper texture has
 *  failed to load.
 *
 *  Without that texture the engine cannot draw at all: `_paperTexLoaded` stays
 *  false and every pointer-down is dropped on the floor (see engine's
 *  `_onStart`). Until now the room opened anyway and simply did not respond to
 *  the pencil, with the actual error — which names the file, the status and
 *  the fix — going nowhere but an unhandled rejection in the console. An open
 *  room that ignores the stylus is the worst of the available lies: it looks
 *  like the app working and behaves like the app broken.
 *
 *  So the room deliberately stays *unopened* here rather than opening with a
 *  toast over it. That is not only honesty about drawing — the replay that
 *  restores this room's content is downstream of the same await, so a room
 *  opened in this state would also be showing an empty canvas for a room that
 *  is not empty.
 *
 *  The button is this overlay's own rather than a `Notice` action: those are
 *  documented as quiet escape hatches from something that already happened,
 *  and this is the single thing there is to do here.
 *
 *  Same geometry and the same `pointer-events: none` as RoomLoadingOverlay and
 *  OfflineRoomOverlay — see the former's own comment for why the container
 *  must not swallow input. The button opts back in for itself. */
export function PaperFailedOverlay({ retrying, onRetry }: PaperFailedOverlayProps): React.JSX.Element {
  const t = useT()
  return (
    <div className={styles.overlay} role="alert">
      <Icon name="image_not_supported" />
      <div className={styles.title}>{t('room.paperFailed.title')}</div>
      <div className={styles.body}>{t('room.paperFailed.body')}</div>
      <button type="button" className={styles.retry} onClick={onRetry} disabled={retrying}>
        {t(retrying ? 'room.paperFailed.retrying' : 'room.paperFailed.retry')}
      </button>
    </div>
  )
}
