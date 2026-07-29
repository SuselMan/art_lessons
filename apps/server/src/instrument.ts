import type { FastifyInstance } from 'fastify'

import { buildSentryOptions } from './sentryOptions.js'

// (#177) Loaded through node's `--import` before anything else in the process
// (see package.json's start script and the Dockerfile), which is what the
// Node SDK needs in order to instrument the modules the app then imports.
//
// The import is dynamic, and that is not style: `@sentry/node` pulls in
// OpenTelemetry, and merely loading it costs ~34 MB of RSS before it has
// reported anything (measured on node 20: 42.5 MB bare, 77 MB imported,
// 89.8 MB initialised; on prod the container went 38 MB → 97 MB across this
// deploy). That is affordable on the VPS as it stands today — 2 vCPU, 3.9 GB
// and 2 GB of swap, not the 1 GB box the older comments around the deploy
// scripts still describe — but there is no reason for a process that isn't
// reporting to pay it, and every dev machine and CI run is such a process.
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
