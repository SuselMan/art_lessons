import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { ApiError, login, register } from '../../lib/api'
import { useAuth } from '../../lib/authState'
import { useT, type TFunction } from '../../i18n'
import { Logo } from '../../components/Logo'
import styles from './Auth.module.css'

type Mode = 'login' | 'register'

/** The server answers with a code, never with prose (#208 leaves server
 *  responses untranslated on purpose) — this is where a code becomes a
 *  sentence in the reader's own language. */
function describeError(err: unknown, mode: Mode, t: TFunction): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_email': return t('auth.error.invalidEmail')
      case 'weak_password': return t('auth.error.weakPassword')
      case 'email_taken': return t('auth.error.emailTaken')
      case 'invalid_credentials': return t('auth.error.invalidCredentials')
      case 'rate_limited': return t('auth.error.rateLimited')
    }
  }
  return t(mode === 'register' ? 'auth.error.registerFailed' : 'auth.error.loginFailed')
}

export function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refetch } = useAuth()
  const t = useT()

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) { setError(t('auth.error.emailRequired')); return }
    if (mode === 'register' && password.length < 8) { setError(t('auth.error.weakPassword')); return }
    if (mode === 'login' && !password) { setError(t('auth.error.passwordRequired')); return }

    setSubmitting(true)
    try {
      if (mode === 'register') {
        await register(trimmedEmail, password, name.trim() || undefined)
      } else {
        await login(trimmedEmail, password)
      }
      await refetch()
      navigate('/my-lessons')
    } catch (err) {
      setError(describeError(err, mode, t))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      {/* No AppHeader here — this page's whole job is the form, and the
          wordmark above it is already the brand mark, not a second copy of the
          app's chrome. It leads home like every other one, though. */}
      <Link className={styles.logo} to="/" aria-label="Grafetto"><Logo /></Link>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <div className={styles.tabs}>
          <button
            type="button"
            className={clsx(styles.tab, mode === 'login' && styles.tabActive)}
            onClick={() => setMode('login')}
          >
            {t('auth.logIn')}
          </button>
          <button
            type="button"
            className={clsx(styles.tab, mode === 'register' && styles.tabActive)}
            onClick={() => setMode('register')}
          >
            {t('auth.register')}
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.label}>{t('auth.email')}</div>
          <input
            className={styles.input}
            type="email"
            placeholder={t('auth.emailPlaceholder')}
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        {mode === 'register' && (
          <div className={styles.section}>
            <div className={styles.label}>{t('auth.name')}</div>
            <input
              className={styles.input}
              type="text"
              placeholder={t('auth.namePlaceholder')}
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.label}>{t('auth.password')}</div>
          <input
            className={styles.input}
            type="password"
            placeholder={t(mode === 'register' ? 'auth.passwordPlaceholderNew' : 'auth.passwordPlaceholder')}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {t(mode === 'login' ? 'auth.logIn' : 'auth.createAccount')}
        </button>
      </form>
    </div>
  )
}
