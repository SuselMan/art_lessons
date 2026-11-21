import { Link } from 'react-router-dom'

import { Button } from './Button'
import { buttonClassName, type ButtonVariant } from './Button/buttonStyles'
import { Logo } from './Logo'
import styles from './StatusCard.module.css'

// (#570, #572) The one-card page for "there is nothing else to show you":
// the error boundary's fallback, the 404. Same card as Room's JoinGate and
// NoWebGL — a reader who lands here has this page and nothing else, so it
// should look like the app they were in, not like a browser error page.
// Kept out of Room's stylesheet so it stays out of the Room chunk (#130).

/** Either somewhere to go or something to do; `onClick` on a link is for
 *  cleanup on the way out (the boundary resets itself so the target page can
 *  render). */
export type StatusAction =
  | { label: string; to: string; onClick?: () => void }
  | { label: string; onClick: () => void }

interface StatusCardProps {
  heading: string
  body: string
  /** The one thing to do, styled as primary. */
  action: StatusAction
  /** An alternative, quieter. */
  secondary?: StatusAction
  /** Small print under everything — diagnostics, never the explanation. */
  details?: string | null
}

function Action({ action, variant }: { action: StatusAction; variant: ButtonVariant }) {
  if ('to' in action) {
    return <Link className={buttonClassName({ variant, className: styles.action })} to={action.to} onClick={action.onClick}>{action.label}</Link>
  }
  return <Button variant={variant} className={styles.action} onClick={action.onClick}>{action.label}</Button>
}

export function StatusCard({ heading, body, action, secondary, details }: StatusCardProps) {
  return (
    <div className={styles.page}>
      <Link className={styles.logo} to="/" aria-label="Grafetto"><Logo /></Link>
      <div className={styles.card} role="alert">
        <h1 className={styles.heading}>{heading}</h1>
        <p className={styles.body}>{body}</p>
        <Action action={action} variant="primary" />
        {secondary && <Action action={secondary} variant="secondary" />}
        {details && <p className={styles.details}>{details}</p>}
      </div>
    </div>
  )
}
