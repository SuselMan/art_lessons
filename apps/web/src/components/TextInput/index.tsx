import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import clsx from 'clsx'
import { Icon } from '../Icon'
import type { IconName } from '../../icons/iconNames'
import styles from './TextInput.module.css'

type TextInputProps = ComponentPropsWithRef<'input'> & {
  label?: ReactNode
  description?: ReactNode
  error?: ReactNode
  icon?: IconName
  endAdornment?: ReactNode
  /** Visual size; native `size` keeps its HTML meaning (number of characters). */
  controlSize?: 'sm' | 'md' | 'lg'
  /** Layout of the whole field, including label and supporting text. */
  wrapperClassName?: string
}

/** Native input props and ref reach the input; the shell owns all visual states. */
export function TextInput({
  label, description, error, icon, endAdornment, controlSize = 'md', wrapperClassName,
  id, className, disabled, readOnly, required,
  'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...inputProps
}: TextInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const invalid = Boolean(error) || (ariaInvalid !== undefined && ariaInvalid !== false && ariaInvalid !== 'false')
  const descriptionId = description ? `${inputId}-description` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const descriptions = [describedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={clsx(styles.field, wrapperClassName)}>
      {label && <label className={styles.label} htmlFor={inputId}>
        {label}{required && <span className={styles.required} aria-hidden="true">*</span>}
      </label>}
      <div className={clsx(styles.wrapper, styles[controlSize])}
        data-invalid={invalid || undefined} data-disabled={disabled || undefined} data-readonly={readOnly || undefined}>
        {icon && <Icon name={icon} />}
        <input {...inputProps} id={inputId} className={clsx(styles.input, className)}
          disabled={disabled} readOnly={readOnly} required={required}
          aria-invalid={error ? true : ariaInvalid} aria-describedby={descriptions} />
        {endAdornment && <span className={styles.adornment}>{endAdornment}</span>}
      </div>
      {description && <div id={descriptionId} className={styles.description}>{description}</div>}
      {error && <div id={errorId} className={styles.error} role="alert">{error}</div>}
    </div>
  )
}
