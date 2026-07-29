import { useT } from '../../i18n'
import { Icon } from '../Icon'
import styles from './ListState.module.css'
import type { IconName } from '../../icons/iconNames'

interface EmptyStateProps {
  icon: IconName
  message: string
}

export function EmptyState({ icon, message }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Icon name={icon} />
      <span>{message}</span>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const t = useT()
  return (
    <div className={styles.error}>
      <Icon name="error" />
      <span className={styles.errorMessage}>{message}</span>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
