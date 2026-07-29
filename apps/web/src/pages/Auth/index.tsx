import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ApiError, requestLoginCode, verifyLoginCode } from '../../lib/api'
import { useAuth } from '../../lib/authState'
import { useLocale, useT, type TFunction } from '../../i18n'
import { Logo } from '../../components/Logo'
import styles from './Auth.module.css'

/** Signing in (#316). One address, one code, no password — and therefore no
 *  "log in vs register" choice to make: whether this address has an account is
 *  the server's business, and the screen is the same either way.
 *
 *  Two steps rather than one screen with both fields, because the second one
 *  can only be filled in after leaving for the mail app: an empty code box
 *  next to the address field mostly invites typing a password into it. */

const RESEND_COOLDOWN_SECONDS = 60
const CODE_LENGTH = 6

type Step = 'email' | 'code'

/** The server answers with a code, never with prose (#208 leaves server
 *  responses untranslated on purpose) — this is where a code becomes a
 *  sentence in the reader's own language. */
function describeError(err: unknown, step: Step, t: TFunction): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_email': return t('auth.error.invalidEmail')
      case 'invalid_code': return t('auth.error.invalidCode')
      case 'code_expired': return t('auth.error.codeExpired')
      case 'attempts_exhausted': return t('auth.error.attemptsExhausted')
      case 'wrong_browser': return t('auth.error.wrongBrowser')
      case 'rate_limited': return t('auth.error.rateLimited')
      case 'email_failed': return t('auth.error.emailFailed')
      case 'code_cooldown':
        return t('auth.error.codeCooldown', { seconds: err.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS })
    }
  }
  return t(step === 'email' ? 'auth.error.requestFailed' : 'auth.error.verifyFailed')
}

export function Auth() {
  const navigate = useNavigate()
  const { refetch } = useAuth()
  const t = useT()
  const locale = useLocale()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)

  // Ticks the resend countdown. The server enforces the same wait — it is the
  // one protecting somebody's mailbox — so this only keeps the button honest
  // about it instead of offering an action that will be refused.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(seconds => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus()
  }, [step])

  async function sendCode(target: string): Promise<void> {
    const sent = await requestLoginCode(target, locale)
    setConfirmation(sent.confirmation)
    // (#353) Local development with no mail provider: the server hands the
    // code back because there is no inbox it could have gone to. Filled in
    // rather than merely displayed — signing in is a step on the way to
    // whatever is actually being worked on, not the thing being tested.
    setDevCode(sent.devCode ?? null)
    setCode(sent.devCode ?? '')
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setStep('code')
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = email.trim()
    if (!trimmed) { setError(t('auth.error.emailRequired')); return }

    setSubmitting(true)
    try {
      await sendCode(trimmed)
    } catch (err) {
      setError(describeError(err, 'email', t))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = code.trim()
    if (!trimmed) { setError(t('auth.error.codeRequired')); return }

    setSubmitting(true)
    try {
      await verifyLoginCode(email.trim(), trimmed)
      await refetch()
      navigate('/my-lessons')
    } catch (err) {
      setError(describeError(err, 'code', t))
      // A refused code is re-typed, not edited: leaving it in place means the
      // next attempt starts by clearing it.
      setCode('')
      codeInputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || submitting) return
    setError(null)
    setCode('')
    setSubmitting(true)
    try {
      await sendCode(email.trim())
    } catch (err) {
      setError(describeError(err, 'email', t))
    } finally {
      setSubmitting(false)
    }
  }

  function handleChangeEmail() {
    setStep('email')
    setCode('')
    setConfirmation('')
    setError(null)
  }

  return (
    <div className={styles.page}>
      {/* No AppHeader here — this page's whole job is the form, and the
          wordmark above it is already the brand mark, not a second copy of the
          app's chrome. It leads home like every other one, though. */}
      <Link className={styles.logo} to="/" aria-label="Grafetto"><Logo /></Link>

      {step === 'email' ? (
        <form className={styles.card} onSubmit={handleEmailSubmit} noValidate>
          <div className={styles.title}>{t('auth.title')}</div>
          <div className={styles.subtitle}>{t('auth.subtitle')}</div>

          <div className={styles.section}>
            <div className={styles.label}>{t('auth.email')}</div>
            <input
              className={styles.input}
              type="email"
              inputMode="email"
              placeholder={t('auth.emailPlaceholder')}
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {t('auth.sendCode')}
          </button>
        </form>
      ) : (
        <form className={styles.card} onSubmit={handleCodeSubmit} noValidate>
          <div className={styles.title}>{t('auth.title')}</div>
          <div className={styles.subtitle}>{t('auth.codeSent', { email: email.trim() })}</div>

          <div className={styles.section}>
            <div className={styles.label}>{t('auth.code')}</div>
            <input
              ref={codeInputRef}
              className={clsx(styles.input, styles.codeInput)}
              type="text"
              // `one-time-code` is what makes iOS and Android offer the code
              // straight from the notification instead of making someone
              // switch apps to copy it; `inputMode` gets a numeric keypad.
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={CODE_LENGTH}
              value={code}
              // Digits only, so pasting "code: 123456" out of the mail still
              // lands correctly instead of failing as an invisible typo.
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            />
          </div>

          {/* English on purpose: dev-only surfaces stay untranslated
              (CLAUDE.md), and this one is a note to whoever is running the
              stack, not to a person signing in. */}
          {devCode && (
            <div className={styles.devNote}>
              Dev mode — no mail provider configured, so nothing was sent and the code is filled in.
            </div>
          )}

          {confirmation && (
            <div className={styles.confirmation}>
              <div className={styles.confirmationPhrase}>{t('auth.confirmation', { phrase: confirmation })}</div>
              <div className={styles.confirmationHint}>{t('auth.confirmationHint')}</div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit} disabled={submitting}>
            {t('auth.signIn')}
          </button>

          <div className={styles.secondaryRow}>
            <button type="button" className={styles.linkButton} onClick={handleChangeEmail}>
              {t('auth.changeEmail')}
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={handleResend}
              disabled={cooldown > 0 || submitting}
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
