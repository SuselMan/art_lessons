import { useT } from '../../i18n'
import { Icon } from '../Icon'
import type { IconName } from '../../icons/iconNames'
import type { NoticeAction, NoticeVariant } from '../../stores/noticeStore'
import styles from './Notice.module.css'

// (#650) The notice's data types live with the store that holds notices; the strip only
// draws them. Re-exported so `components/Notice` stays the one place callers import from.
export type { NoticeAction, NoticePosition, NoticeVariant } from '../../stores/noticeStore'

/** The default icon per variant, so the common case is one prop shorter.
 *  Overridable because the meaning is sometimes more specific than the
 *  variant: an offline queue is a warning, but `cloud_off` says more about it
 *  than `warning` does. */
const VARIANT_ICONS: Record<NoticeVariant, IconName> = {
  error: 'error',
  warning: 'warning',
  success: 'check_circle',
  neutral: 'info',
}

interface NoticeProps {
  variant: NoticeVariant
  message: React.ReactNode
  icon?: IconName
  action?: NoticeAction
  onDismiss?: () => void
  /** `status` is announced politely and is right for a state being reported;
   *  `alert` interrupts and is for a failure the user has to know about now.
   *  Left off entirely when the strip is decorative duplication of something
   *  already announced elsewhere. */
  role?: 'status' | 'alert'
  /** Positioning is deliberately the caller's job — this component owns what
   *  the strip *is*, never where it sits. The room anchors its own banners
   *  inside the canvas area (below the editor header, clear of the toolbar),
   *  while pushed notices are fixed to the viewport; one component trying to
   *  own both would need to know which context it is in. */
  className?: string
}

/** The single notification strip in the app (#343).
 *
 *  Replaces four hand-copied versions of this same flex row (the room's
 *  frozen/closed/lost-work/connection banners), which had drifted apart in
 *  colour, padding, icon size and pointer-event handling — each divergence
 *  arrived as a local fix to a local bug, and none of them was wrong on its
 *  own. Consolidating them is the point of the component, not a side effect.
 *
 *  Says nothing about how long it lives. That is the deliberate split behind
 *  the whole system: a strip whose visibility already follows from a flag in
 *  the store is rendered conditionally and cannot desync, while one reporting
 *  an event that left no trace in state is pushed into `noticeStore` and
 *  carries an id and a timer. Both render through here. */
export function Notice({
  variant,
  message,
  icon,
  action,
  onDismiss,
  role,
  className,
}: NoticeProps): React.JSX.Element {
  const t = useT()
  // Whether the strip takes pointer events at all. Every one of the four
  // originals encoded this rule by hand, and for good reason: these float
  // over the canvas, so a purely informational strip that swallowed input
  // would break pan/zoom through the area it covers. Derived rather than
  // configured — "has a button" and "needs clicks" are the same fact.
  const interactive = action !== undefined || onDismiss !== undefined

  return (
    <div
      className={[styles.notice, styles[variant], interactive ? styles.interactive : '', className]
        .filter(Boolean)
        .join(' ')}
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
    >
      <Icon name={icon ?? VARIANT_ICONS[variant]} />
      <span className={styles.message}>{message}</span>
      {action && (
        <button
          type="button"
          className={styles.action}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
        >
          <Icon name="close" />
        </button>
      )}
    </div>
  )
}
