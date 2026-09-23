import type { ReactNode } from 'react'
import * as Sentry from '@sentry/react'
import { Link } from 'react-router-dom'

import { useT } from '../i18n'
import styles from './AppErrorBoundary.module.css'

// (#570) The last line before a blank page. Until this existed, an exception
// thrown from a render or an effect anywhere under the router made React 19
// unmount the root: the reader saw the page background and nothing else, no
// message, no way out, and — with Sentry not yet asked — no report either.
// The WebGL case that prompted it is now caught earlier (lib/webgl.ts), but
// the class of failure is not specific to it; this is for the next one.
//
// Sentry's own boundary rather than a hand-rolled componentDidCatch so the
// report carries the React component stack, and so it is a no-op report (not
// a crash) in local dev where Sentry is not initialised (see lib/sentry.ts).

function Fallback({ resetError }: { resetError: () => void }) {
  const t = useT()
  return (
    <div className={styles.page} role="alert">
      <div className={styles.card}>
        <h1 className={styles.heading}>{t('error.heading')}</h1>
        <p className={styles.body}>{t('error.body')}</p>
        {/* A full reload, not just resetting the boundary: whatever threw is
            most likely to throw again from the same state, and a reload is
            also what picks up a fresh build after a deploy (#186). */}
        <button type="button" className={styles.primary} onClick={() => window.location.reload()}>
          {t('error.reload')}
        </button>
        {/* Resets the boundary on the way out so the list can render; the
            room that broke stays behind. */}
        <Link className={styles.secondary} to="/my-lessons" onClick={resetError}>
          {t('error.toLessons')}
        </Link>
      </div>
    </div>
  )
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <Fallback resetError={resetError} />}>
      {children}
    </Sentry.ErrorBoundary>
  )
}
