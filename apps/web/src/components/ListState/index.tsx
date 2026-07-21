import { Icon } from '../Icon'
import styles from './ListState.module.css'

interface EmptyStateProps {
  icon: string
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
  return (
    <div className={styles.error}>
      <Icon name="error" />
      <span className={styles.errorMessage}>{message}</span>
      {onRetry && (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
