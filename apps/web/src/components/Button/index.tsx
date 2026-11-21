import type { ComponentPropsWithRef } from 'react'
import { Icon } from '../Icon'
import styles from './Button.module.css'
import { buttonClassName, type ButtonVariant, type ButtonSize } from './buttonStyles'

type Props = ComponentPropsWithRef<'button'> & {
  /** Visual treatment; HTML button behaviour is controlled by `type`. */
  variant?: ButtonVariant
  /** Square touch target for an accessible icon-only action. */
  iconOnly?: boolean
  size?: ButtonSize
}
/** Defaults to a non-submitting button; forms opt in with type="submit". */
export function Button({ variant = 'primary', type = 'button', size = 'md', iconOnly = false, className, ...props }: Props) {
  return <button {...props} type={type} className={buttonClassName({ variant, size, iconOnly, className })} />
}

/** Shared appearance for every settings tab; reset behaviour belongs to each tab. */
export function ResetDefaultsButton(props: Omit<Props, 'variant' | 'size' | 'className'>) {
  return <Button {...props} variant="subtle" />
}

export function ResetDefaultsFooter(props: Omit<Props, 'variant' | 'size' | 'className'>) {
  return <div className={styles.resetFooter}><ResetDefaultsButton {...props} /></div>
}

/** Icon-only action; a label is mandatory even when there is a tooltip. */
export function IconButton({ icon, ...props }: Omit<Props, 'children' | 'iconOnly'> & { icon: import('../../icons/iconNames').IconName; 'aria-label': string }) {
  return <Button {...props} iconOnly><Icon name={icon} /></Button>
}
