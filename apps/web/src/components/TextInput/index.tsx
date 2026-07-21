import type { InputHTMLAttributes } from 'react'
import { Icon } from '../Icon'
import styles from './TextInput.module.css'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: string
}

/** Generic styled text input — a leading icon (optional) + a borderless
 *  input inside a bordered pill, sharing one focus/hover treatment. Pulled
 *  out of MyLessons' search box (#211 epic feedback) so it's reusable
 *  wherever else the project needs a styled text field, not copy-pasted
 *  per feature. */
export function TextInput({ icon, ...inputProps }: TextInputProps) {
  return (
    <div className={styles.wrapper}>
      {icon && <Icon name={icon} />}
      <input className={styles.input} {...inputProps} />
    </div>
  )
}
