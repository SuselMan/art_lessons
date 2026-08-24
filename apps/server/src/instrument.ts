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

/** (#480, трек #314 §1) Отчёт о том, что *не* бросило исключение.
 *
 *  Всё, что Sentry знает про этот сервер сегодня, — это 5xx и падения
 *  процесса. Урок 21.08 сломался, не произведя ни того ни другого: сервер был
 *  жив все два часа, выпечка снапшотов молча встала, и узнали мы об этом от
 *  преподавателя. Критерий релиза в #314 требует обратного порядка, а для
 *  этого нужен канал для утверждений вида «идёт урок, и вот это в нём
 *  неправильно» — у них нет и не может быть стека.
 *
 *  `warning`, а не `error`: это не отказ, это состояние, которое станет
 *  отказом, если его не заметить. Разница видна в почте по алертам, и
 *  смешивать их — быстрый способ приучить себя не читать ни то ни другое. */
export function reportIssue(message: string, context: Record<string, unknown>): void {
  sentry?.captureMessage(message, {
    level: 'warning',
    // Тегом, а не полем контекста: по нему группируют и фильтруют, а
    // `extra` в списке событий не видно.
    tags: { issue: message },
    extra: context,
  })
}
