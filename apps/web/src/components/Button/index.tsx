import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import styles from './Button.module.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  type?: 'primary' | 'secondary' | 'ghost' | 'active' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}
/** Grafetto's shared button: appearance only, actions belong to the caller. */
export function Button({ type = 'primary', size = 'md', className, ...props }: Props) {
  return <button {...props} type="button" className={clsx(styles.button, styles[type], styles[size], className)} />
}
