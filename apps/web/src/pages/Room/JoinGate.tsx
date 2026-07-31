import clsx from 'clsx'
import { Link } from 'react-router-dom'

import { useT } from '../../i18n'
import { Logo } from '../../components/Logo'
import styles from './Room.module.css'

// Shown instead of the canvas when this browser opened a room link directly
// (no creator navigation state — see Room/index.tsx) and hasn't joined yet.
// Visual language mirrors CreateRoom's card/input/error patterns rather than
// inventing new styles.

interface JoinGateProps {
  roomName: string | null
  name: string
  onNameChange: (name: string) => void
  password: string
  onPasswordChange: (password: string) => void
  error: string | null
  submitting: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function JoinGate({
  roomName, name, onNameChange, password, onPasswordChange, error, submitting, onSubmit,
}: JoinGateProps) {
  const t = useT()
  return (
    <div className={styles.gatePage}>
      {/* (#379) Leads home, like the wordmark on every other page. It was the
          one copy that didn't, and this is the screen where it matters most:
          a student arriving on a room link has this page and nothing else,
          so the wordmark is their only visible way into the app. */}
      <Link className={styles.gateLogo} to="/" aria-label="Grafetto"><Logo /></Link>

      <form className={styles.gateCard} onSubmit={onSubmit} noValidate>
        <h1 className={styles.gateHeading}>
          {roomName ? t('join.headingNamed', { room: roomName }) : t('join.heading')}
        </h1>

        <div className={styles.gateSection}>
          <div className={styles.gateLabel}>{t('join.yourName')}</div>
          <input
            className={clsx(styles.gateInput, error && !name.trim() && styles.gateInputError)}
            type="text"
            placeholder={t('join.namePlaceholder')}
            maxLength={40}
            autoFocus
            value={name}
            onChange={e => onNameChange(e.target.value)}
          />
        </div>

        <div className={styles.gateSection}>
          <div className={styles.gateLabel}>{t('join.password')}</div>
          <input
            className={styles.gateInput}
            type="password"
            placeholder={t('join.passwordPlaceholder')}
            value={password}
            onChange={e => onPasswordChange(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <div className={styles.gateError}>{error}</div>}

        <button type="submit" className={styles.gateSubmit} disabled={submitting}>
          {t(submitting ? 'join.submitting' : 'join.submit')}
        </button>
      </form>
    </div>
  )
}
