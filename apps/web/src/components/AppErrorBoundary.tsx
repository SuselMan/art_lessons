import type { ReactNode } from 'react'
import * as Sentry from '@sentry/react'

import { useT } from '../i18n'
import { StatusCard } from './StatusCard'

// (#570) The last line before a blank page. Until this existed, an exception
// thrown from a render or an effect anywhere under the router made React 19
// unmount the root: the reader saw the page background and nothing else, no
// message, no way out, and — with Sentry not yet asked — no report either.
// The WebGL case that prompted it is now caught earlier (lib/browser/webgl.ts), but
// the class of failure is not specific to it; this is for the next one.
//
// Sentry's own boundary rather than a hand-rolled componentDidCatch so the
// report carries the React component stack, and so it is a no-op report (not
// a crash) in local dev where Sentry is not initialised (see lib/observability/sentry.ts).

function Fallback({ resetError }: { resetError: () => void }) {
  const t = useT()
  return (
    <StatusCard
      heading={t('error.heading')}
      body={t('error.body')}
      // A full reload, not just resetting the boundary: whatever threw is
      // most likely to throw again from the same state, and a reload is also
      // what picks up a fresh build after a deploy (#186).
      action={{ label: t('error.reload'), onClick: () => window.location.reload() }}
      // Resets the boundary on the way out so the list can render; the room
      // that broke stays behind.
      secondary={{ label: t('error.toLessons'), to: '/my-lessons', onClick: resetError }}
    />
  )
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => <Fallback resetError={resetError} />}
      // (#536) Where no Sentry is configured - a dev build on a test device -
      // this screen used to be the only trace of what threw. The console is
      // what the dev bridge collects; the global is for a look afterwards.
      onError={(error, componentStack) => {
        console.error('[app-error]', error, componentStack)
        Object.assign(window, { __lastAppError: { error: String(error), stack: error instanceof Error ? error.stack : undefined, componentStack } })
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
