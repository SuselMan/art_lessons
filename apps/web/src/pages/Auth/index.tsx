import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { ApiError, login, register } from '../../lib/api'
import { useAuth } from '../../lib/authState'
import styles from './Auth.module.css'

type Mode = 'login' | 'register'

function describeError(err: unknown, mode: Mode): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'invalid_email': return 'Enter a valid email address'
      case 'weak_password': return 'Password must be at least 8 characters'
      case 'email_taken': return 'An account with this email already exists'
      case 'invalid_credentials': return 'Incorrect email or password'
    }
  }
  return mode === 'register' ? 'Registration failed — try again' : 'Log in failed — try again'
}

export function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refetch } = useAuth()

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
    if (!trimmedEmail) { setError('Email is required'); return }
    if (mode === 'register' && password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (mode === 'login' && !password) { setError('Password is required'); return }

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
      setError(describeError(err, mode))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.logo}>Art Lessons</div>

      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <div className={styles.tabs}>
          <button
            type="button"
            className={clsx(styles.tab, mode === 'login' && styles.tabActive)}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={clsx(styles.tab, mode === 'register' && styles.tabActive)}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.label}>Email</div>
          <input
            className={styles.input}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        {mode === 'register' && (
          <div className={styles.section}>
            <div className={styles.label}>Name (optional)</div>
            <input
              className={styles.input}
              type="text"
              placeholder="Your name"
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.label}>Password</div>
          <input
            className={styles.input}
            type="password"
            placeholder={mode === 'register' ? 'At least 8 characters' : 'Password'}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submit} disabled={submitting}>
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
