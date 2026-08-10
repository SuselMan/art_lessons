import clsx from 'clsx'

import styles from './Switch.module.css'

export type SwitchOrientation = 'horizontal' | 'vertical'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Both the accessible name and the visible text — a toggle whose track says
   *  nothing about what it toggles is an unlabelled pill, so the label is part
   *  of the control rather than something the call site places beside it. */
  label: string
  /** `horizontal`: a full-width row, label left / track right — the shape the
   *  "Tool settings" panel's other rows use.
   *  `vertical`: a stacked block, track above / label under, sized for the
   *  56px quick-settings column beside the toolbar. Default `horizontal`. */
  orientation?: SwitchOrientation
  disabled?: boolean
  className?: string
}

/** The app's on/off control (#326). Replaces the native `<input type=checkbox>`
 *  and the check_box-icon button that stood in for one in the quick column:
 *  a checkbox is a 13px OS-drawn square that ignores the theme, misses the
 *  40–48px touch floor, and reads as "select this" rather than "this is on".
 *
 *  A `<button role="switch">` rather than a styled checkbox because the whole
 *  block — label included — is the tap target, which a `<label>`-wrapped input
 *  can only approximate; and because "on/off right now" is what role=switch
 *  announces, while checkbox announces "included in a set". */
export function Switch({
  checked,
  onChange,
  label,
  orientation = 'horizontal',
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={label}
      className={clsx(styles.switch, styles[orientation], checked && styles.on, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.label}>{label}</span>
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
    </button>
  )
}
