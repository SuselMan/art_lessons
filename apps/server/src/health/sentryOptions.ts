import type { NodeOptions } from '@sentry/node'

// (#177) What the server sends to Sentry, kept apart from the code that
// actually calls init (instrument.ts) for one reason: the decisions below are
// privacy decisions, and privacy decisions deserve a test rather than a
// comment claiming they were made.

/** Returns `null` when there is no DSN — the normal state for local
 *  development and for the test suite. Nothing is initialised in that case;
 *  Sentry is a production concern here, not something to switch off with a
 *  flag every time someone runs the server on their own machine. */
export function buildSentryOptions(env: NodeJS.ProcessEnv): NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim()
  if (!dsn) return null
  return {
    dsn,
    // Set from the deployed commit sha (deploy.yml) so an issue says which
    // deploy introduced it without anyone cross-referencing timestamps.
    release: env.SENTRY_RELEASE,
    environment: env.SENTRY_ENVIRONMENT ?? (env.NODE_ENV === 'production' ? 'production' : 'development'),
    // Errors only. Tracing would double what this process costs in RAM and
    // in quota, and RAM is not something we have spare: the box is 1 GB with
    // no swap and #292 measured 532 MB of it already used by room history.
    tracesSampleRate: 0,
    // Every one of these is off for a concrete reason, not out of caution:
    //
    // - `cookies`: the identity cookie (#41) is a signed JWT that *is* the
    //   session. Attached to an error report it would be a working login
    //   sitting in a third-party service — and it would ride along on the
    //   very requests most likely to fail.
    // - `httpBodies`: /api/auth/register and /api/auth/login carry an email
    //   and a plaintext password in the request body. A 500 on either is
    //   exactly the event we want reported, and exactly the body we must not
    //   send. `[]` is "collect none", not "collect all" — see the SDK's own
    //   DataCollection docs.
    // - `httpHeaders`: `cookie` and `authorization` live here too, and the
    //   SDK's built-in scrubbing keys off well-known names, which our own
    //   cookie name is not.
    // - `userInfo`: identity is attached deliberately in instrument.ts, id
    //   only. Letting instrumentation infer it is how emails end up in
    //   reports by accident.
    //
    // The upshot is that we send what broke and where, and nothing about
    // whom — which is also the shape the privacy policy (#323) has to
    // describe.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: false, response: false },
    },
  }
}
