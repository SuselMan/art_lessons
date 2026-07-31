import clsx from 'clsx'
import { Link } from 'react-router-dom'

import { useT } from '../../i18n'
import { Logo } from '../../components/Logo'
import styles from './Room.module.css'

// Shown instead of the canvas when this browser opened a room link directly
// (no creator navigation state — see Room/index.tsx) and hasn't joined yet.
// Visual language mirrors CreateRoom's card/input/error patterns rather than
// inventing new styles.

/** (#231) What this screen is doing right now. Four of the five are not
 *  failures of the form but states of the *person* in front of it, which is
 *  why they replace the form rather than appearing as an error under it —
 *  there is nothing to re-type in any of them.
 *
 *  - `form`     — ask for a name (and a password, if the room has one).
 *  - `login`    — invite-only room, and this browser is an anonymous guest.
 *  - `pending`  — asked, waiting for the owner. Resolves by itself (#227).
 *  - `denied`   — the owner said not now. Asking again is allowed.
 *  - `revoked`  — blocked. Terminal, and offers nothing.
 */
export type JoinGateState = 'form' | 'login' | 'pending' | 'denied' | 'revoked'

interface JoinGateProps {
  roomName: string | null
  state: JoinGateState
  name: string
  onNameChange: (name: string) => void
  password: string
  onPasswordChange: (password: string) => void
  error: string | null
  submitting: boolean
  onSubmit: (e: React.FormEvent) => void
  /** Asks again after a denial, or retries once signed in. */
  onRetry: () => void
  /** Where the sign-in link should come back to — this room. */
  returnTo: string
}

export function JoinGate({
  roomName, state, name, onNameChange, password, onPasswordChange, error, submitting, onSubmit,
  onRetry, returnTo,
}: JoinGateProps) {
  const t = useT()

  const heading = roomName ? t('join.headingNamed', { room: roomName }) : t('join.heading')

  return (
    <div className={styles.gatePage}>
      {/* (#379) Leads home, like the wordmark on every other page. It was the
          one copy that didn't, and this is the screen where it matters most:
          a student arriving on a room link has this page and nothing else,
          so the wordmark is their only visible way into the app. */}
      <Link className={styles.gateLogo} to="/" aria-label="Grafetto"><Logo /></Link>

      {state === 'form' ? (
        <form className={styles.gateCard} onSubmit={onSubmit} noValidate>
          <h1 className={styles.gateHeading}>{heading}</h1>

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
      ) : (
        <div className={styles.gateCard}>
          <h1 className={styles.gateHeading}>{heading}</h1>

          {state === 'login' && (
            <>
              {/* Deliberately does not say which address is expected: the
                  allow-list is the owner's, and naming an entry of it to
                  whoever holds the link would hand out who else is in the
                  class. */}
              <p className={styles.gateNote}>{t('join.error.loginRequired')}</p>
              <Link className={styles.gateSubmit} to={`/login?next=${encodeURIComponent(returnTo)}`}>
                {t('join.signIn')}
              </Link>
              {/* For the person who signed in elsewhere — another tab, or
                  before this screen told them to. */}
              <button type="button" className={styles.gateSecondary} onClick={onRetry} disabled={submitting}>
                {t('join.tryAgain')}
              </button>
            </>
          )}

          {state === 'pending' && (
            <>
              <p className={styles.gateNote}>{t('join.error.pendingApproval')}</p>
              {/* No button at all: the screen resolves itself when the owner
                  answers (`join_request_resolved`, #227), and a "check again"
                  button would suggest this is something the reader has to
                  keep doing. */}
              <p className={styles.gateWaiting} aria-live="polite">{t('join.waiting')}</p>
            </>
          )}

          {state === 'denied' && (
            <>
              <p className={styles.gateNote}>{t('join.denied')}</p>
              <button type="button" className={styles.gateSubmit} onClick={onRetry} disabled={submitting}>
                {t(submitting ? 'join.submitting' : 'join.askAgain')}
              </button>
            </>
          )}

          {/* The one state with nothing to offer. A retry button here would be
              a lie: the block is checked before everything else, and no
              amount of asking changes it. */}
          {state === 'revoked' && <p className={styles.gateNote}>{t('join.error.accessRevoked')}</p>}
        </div>
      )}
    </div>
  )
}
