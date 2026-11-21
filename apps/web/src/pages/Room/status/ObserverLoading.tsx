import { Spinner } from '../../../components/Spinner'
import { useT } from '../../../i18n'
import styles from '../Room.module.css'

/** The embedded board boots silently, with no nested editor or join form. */
export function ObserverLoading() {
  const t = useT()
  return <div className={styles.observerLoading} role="status" aria-label={t('common.loading')}><Spinner animation="rotate" /></div>
}
