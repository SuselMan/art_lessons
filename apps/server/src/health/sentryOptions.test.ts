import { describe, expect, it } from 'vitest'

import { buildSentryOptions } from './sentryOptions.js'

describe('buildSentryOptions', () => {
  it('stays off without a DSN, so dev and tests never report', () => {
    expect(buildSentryOptions({})).toBeNull()
    expect(buildSentryOptions({ SENTRY_DSN: '   ' })).toBeNull()
  })

  it('carries release and environment through when given', () => {
    const options = buildSentryOptions({
      SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2',
      SENTRY_RELEASE: 'abc123',
      SENTRY_ENVIRONMENT: 'staging',
    })

    expect(options).toMatchObject({ dsn: 'https://key@o1.ingest.de.sentry.io/2', release: 'abc123', environment: 'staging' })
  })

  it('falls back to production/development from NODE_ENV', () => {
    const dsn = 'https://key@o1.ingest.de.sentry.io/2'

    expect(buildSentryOptions({ SENTRY_DSN: dsn, NODE_ENV: 'production' })?.environment).toBe('production')
    expect(buildSentryOptions({ SENTRY_DSN: dsn })?.environment).toBe('development')
  })

  // The reason this file exists. Each of these defaults to *collecting* in the
  // SDK, and each one collects something this server must not hand to a third
  // party: the identity cookie is a working session (#41), and the auth route
  // bodies are an email plus a plaintext password. A regression here would be
  // silent — reports would keep arriving, just with more in them.
  it('never collects cookies, bodies, headers or inferred identity', () => {
    const options = buildSentryOptions({ SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2' })

    expect(options?.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: false, response: false },
    })
  })

  it('keeps tracing off — the box has no RAM to spare for it (#292)', () => {
    expect(buildSentryOptions({ SENTRY_DSN: 'https://key@o1.ingest.de.sentry.io/2' })?.tracesSampleRate).toBe(0)
  })
})
