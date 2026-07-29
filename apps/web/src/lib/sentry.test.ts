import { describe, expect, it } from 'vitest'

import { buildSentryOptions } from './sentry'

describe('buildSentryOptions', () => {
  it('stays off without a DSN — a local build simply has no Sentry', () => {
    expect(buildSentryOptions({})).toBeNull()
    expect(buildSentryOptions({ VITE_SENTRY_DSN: '  ' })).toBeNull()
  })

  it('carries release and environment through when given', () => {
    const options = buildSentryOptions({
      VITE_SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2',
      VITE_SENTRY_RELEASE: 'abc123',
      VITE_SENTRY_ENVIRONMENT: 'staging',
    })

    expect(options).toMatchObject({ release: 'abc123', environment: 'staging' })
  })

  it('calls a dev build development and everything else production', () => {
    const dsn = 'https://key@o1.ingest.de.sentry.io/2'

    expect(buildSentryOptions({ VITE_SENTRY_DSN: dsn, DEV: true })?.environment).toBe('development')
    expect(buildSentryOptions({ VITE_SENTRY_DSN: dsn })?.environment).toBe('production')
  })

  // Same reasoning as the server's own test: the identity cookie (#41) is a
  // signed JWT, and an error report is not a place to put a session.
  it('never collects cookies or inferred identity', () => {
    const options = buildSentryOptions({ VITE_SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2' })

    expect(options?.dataCollection).toEqual({ userInfo: false, cookies: false })
  })
})
