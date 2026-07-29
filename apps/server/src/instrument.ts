import type { FastifyInstance } from 'fastify'

import { buildSentryOptions } from './sentryOptions.js'

// (#177) Loaded through node's `--import` before anything else in the process
// (see package.json's start script and the Dockerfile), which is what the
// Node SDK needs in order to instrument the modules the app then imports.
//
// The import is dynamic, and that is not style: `@sentry/node` pulls in
// OpenTelemetry, and merely loading it costs ~34 MB of RSS before it has
// reported anything (measured on node 20: 42.5 MB bare, 77 MB imported,
// 89.8 MB initialised). This box is 1 GB with no swap and #292 measured
// 532 MB of it already spent on room history, so a process with no DSN —
// every dev machine, every test run — pays nothing instead of paying that.
const options = buildSentryOptions(process.env)
const sentry = options ? await import('@sentry/node') : null
if (sentry && options) sentry.init(options)

/** Reports 5xx responses to Sentry. Lives here rather than in index.ts so
 *  that `@sentry/node` stays behind the same conditional import — a no-op
 *  when there is no DSN.
 *
 *  This covers HTTP. Errors thrown inside Socket.io handlers are not
 *  Fastify's to see: they surface as uncaught exceptions or unhandled
 *  rejections, which the SDK's process-level integrations report on their
 *  own — and which take the container down either way, so what this adds
 *  there is the stack trace we currently don't get. */
export function setupSentryErrorHandler(app: FastifyInstance): void {
  sentry?.setupFastifyErrorHandler(app)
}
