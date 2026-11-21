import type { ComponentProps } from 'react'
import clsx from 'clsx'
import styles from './Badge.module.css'

/** Passive counter; callers own its meaning, placement and announcements. */
export function Badge({ tone = 'neutral', size = 'md', className, ...props }: ComponentProps<'span'> & { tone?: 'neutral' | 'warning'; size?: 'sm' | 'md' }) {
  return <span {...props} className={clsx(styles.badge, styles[tone], styles[size], className)} />
}
