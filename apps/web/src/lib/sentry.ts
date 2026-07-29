import * as Sentry from '@sentry/react'

// (#177) Error reporting for the browser half. Until this existed, the only
// way we learned about a broken production build was a teacher telling us
// mid-lesson — and the interesting failures here are the ones we can't
// reproduce on the dev machine anyway: a specific tablet's WebGL driver, a
// stale chunk after a deploy (#186), an iOS Safari quirk. Those only ever
// show up on someone else's device.
//
// Deliberately errors only — no tracing, no session replay, no profiling.
// Replay in particular would be a bad fit twice over: it records the DOM,
// which for this app is a nearly-empty page wrapped around a <canvas> it
// cannot see, and it would eat the free tier's quota to say nothing.

/** The build-time inputs this module reads. Declared as a plain shape rather
 *  than taking `import.meta.env` directly so the option building — the part
 *  with actual decisions in it — is testable without a Vite build. */
export interface SentryBuildEnv {
  VITE_SENTRY_DSN?: string
  VITE_SENTRY_RELEASE?: string
  VITE_SENTRY_ENVIRONMENT?: string
  DEV?: boolean
}

/** Returns `null` when there is no DSN, which is the normal state for local
 *  development: the DSN is injected by CI at build time (see deploy.yml), so
 *  a `npm run dev` build simply has no Sentry rather than needing a flag to
 *  turn it off. Nothing is sent, and nothing is initialised. */
export function buildSentryOptions(env: SentryBuildEnv): Sentry.BrowserOptions | null {
  const dsn = env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return null
  return {
    dsn,
    // Set from the commit sha in CI. Source maps are matched by debug ID
    // rather than by this (see vite.config.ts), so it is metadata — what it
    // buys is "which deploy started this" on the issue itself.
    release: env.VITE_SENTRY_RELEASE,
    environment: env.VITE_SENTRY_ENVIRONMENT ?? (env.DEV ? 'development' : 'production'),
    // We attach the user id ourselves (setSentryUser below) — `userInfo`
    // would additionally let instrumentation guess at identity fields, and
    // guessed identity is exactly the kind of data we don't want leaving the
    // app. Cookies are off for the same reason as on the server: the
    // identity cookie (#41) is a signed JWT, and an error report is not a
    // place to put one.
    dataCollection: { userInfo: false, cookies: false },
    // Fired by any layout that measures itself inside a ResizeObserver
    // callback; every browser reports it, no user ever sees anything, and
    // left in it would be the single loudest "issue" in the project.
    ignoreErrors: [/ResizeObserver loop/],
  }
}

export function initSentry(): void {
  const options = buildSentryOptions(import.meta.env)
  if (!options) return
  Sentry.init(options)
}

/** The id only — never the email or name. Enough to answer "is this one
 *  person's broken device or everyone's broken deploy", which is the only
 *  question we ask of it, and it keeps the privacy policy (#323) short. */
export function setSentryUser(userId: string | null): void {
  Sentry.setUser(userId ? { id: userId } : null)
}

/** Tablet vs desktop is the first thing we ask about almost every bug here
 *  (ADR 007) — worth a tag rather than a guess from the user agent. */
export function setSentryDeviceType(deviceType: string): void {
  Sentry.setTag('device_type', deviceType)
}
