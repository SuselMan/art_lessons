import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import styles from './Button.module.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  type?: 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}
/** Grafetto's shared button: appearance only, actions belong to the caller. */
export function Button({ type = 'primary', size = 'md', className, ...props }: Props) {
  return <button {...props} type="button" className={clsx(styles.button, styles[type], styles[size], className)} />
}

/** Shared appearance for every settings tab; reset behaviour belongs to each tab. */
export function ResetDefaultsButton(props: Omit<Props, 'type' | 'size' | 'className'>) {
  return <Button {...props} type="subtle" />
}

export function ResetDefaultsFooter(props: Omit<Props, 'type' | 'size' | 'className'>) {
  return <div className={styles.resetFooter}><ResetDefaultsButton {...props} /></div>
}
