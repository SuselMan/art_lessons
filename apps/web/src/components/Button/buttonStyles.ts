import clsx from 'clsx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'
/** The same appearance for native buttons and semantic navigation links. */
export function buttonClassName({ variant = 'primary', size = 'md', iconOnly = false, className }: {
  variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean; className?: string
} = {}) {
  return clsx(styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, className)
}
