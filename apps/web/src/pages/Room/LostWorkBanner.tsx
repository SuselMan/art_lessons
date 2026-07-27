import { useT } from '../../i18n'
import { Icon } from '../../components/Icon'
import styles from './LostWorkBanner.module.css'

interface LostWorkBannerProps {
  /** Names of the deleted layers this is about. Empty when nothing was
   *  recoverable, or when the name could not be resolved from anywhere. */
  layerNames: string[]
  /** Whether the content was actually restored onto fresh layers (#312), as
   *  opposed to a rejection with nothing to recover — a merge/transform that
   *  lost its race. Drives which sentence, and whether undo is offered. */
  recovered: boolean
  onUndo: () => void
  onDismiss: () => void
}

/** (#289 §17, #312) Shown once the server rejects an operation as
 *  `target_gone` — in practice: something drawn while offline (or during a
 *  connection drop) onto a layer another participant deleted meanwhile.
 *
 *  Since #311/#312 the usual case is no longer a bare condolence: the
 *  rejected operations come back intact and are replayed onto a replacement
 *  layer before this banner ever appears. So it reports a *completed*
 *  recovery and offers to undo it, rather than asking permission first.
 *
 *  That ordering is the point. A blocking "restore? yes/no" would interrupt
 *  exactly when the user just got their connection back, ask about a layer
 *  they may no longer remember, and make "no" irreversible — while the two
 *  errors are wildly asymmetric: a surplus layer costs two clicks to remove,
 *  an hour of lost drawing costs an hour. When the costs are that lopsided
 *  the default has to be the safe one, and consent moves from before the
 *  action to after it.
 *
 *  Still not an automatic room fork, which was considered and rejected in
 *  #289: forking would turn one flaky-wifi session into a pile of
 *  near-duplicate rooms, a worse problem than the one it solves. */
export function LostWorkBanner({ layerNames, recovered, onUndo, onDismiss }: LostWorkBannerProps): React.JSX.Element {
  const t = useT()

  // Two whole sentences rather than one with an interpolated subject: a
  // single layer reads naturally by name, several only work as a count, and
  // splicing either into a shared frame produces sentences that can't agree
  // grammatically in every locale (Russian being the immediate example).
  const message = !recovered
    ? t('room.lostWork')
    : layerNames.length === 1
      ? t('room.lostWork.recoveredOne', { name: layerNames[0] })
      : t('room.lostWork.recoveredMany', { n: layerNames.length })

  return (
    <div className={styles.banner} role="status">
      <Icon name="cloud_off" />
      <span>{message}</span>
      {recovered && (
        <button type="button" className={styles.undo} onClick={onUndo}>
          {t('room.lostWork.undo')}
        </button>
      )}
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={t('room.dismiss')}>
        <Icon name="close" />
      </button>
    </div>
  )
}
