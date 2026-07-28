import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { prisma } from './prisma.js'

/** A health check that only proves "the Node process accepted a TCP
 *  connection" is worse than none — it goes green while Postgres is gone and
 *  every real request 500s, which is exactly the outage worth paging about.
 *  So this touches the database too, and reports 503 when it can't.
 *
 *  Bounded on purpose: an unreachable Postgres makes Prisma sit on the pool
 *  timeout (10s by default) rather than failing fast, and a monitor that
 *  hangs for ten seconds every minute is its own small outage. Whatever the
 *  race loses is still resolved/rejected in the background — hence the
 *  no-op catch, without which a late rejection becomes an unhandled one. */
const DB_PROBE_TIMEOUT_MS = 3_000

type HealthBody = {
  ok: boolean
  db: 'up' | 'down'
  dbLatencyMs?: number
  uptimeSeconds: number
}

async function probeDatabase(): Promise<number | null> {
  const startedAt = Date.now()
  const query = prisma.$queryRaw`SELECT 1`
  query.catch(() => {})
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('db probe timed out')), DB_PROBE_TIMEOUT_MS)
  })
  try {
    await Promise.race([query, timeout])
    return Date.now() - startedAt
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** `skipIdentity` is load-bearing rather than tidiness: `identityHook` mints a
 *  guest `User` row for every request arriving without an identity cookie
 *  (identity.ts), and a monitor is cookie-less by definition. At one probe
 *  every ten minutes that is ~4.3k junk rows a month, growing forever, from
 *  the very thing meant to report that the system is healthy.
 *
 *  Two paths for one handler because they answer to different callers:
 *  `/api/health` is the public one (nginx proxies the whole `/api/` prefix,
 *  while every other path falls through to the SPA's index.html — so a probe
 *  of bare `/health` from outside would answer 200 with an HTML page even
 *  with this process stopped, see deploy/nginx.conf). `/health` stays for
 *  in-container callers such as a Docker healthcheck, which never go through
 *  nginx. */
export function registerHealthRoutes(app: FastifyInstance): void {
  const handler = async (_request: FastifyRequest, reply: FastifyReply): Promise<HealthBody> => {
    const dbLatencyMs = await probeDatabase()
    const uptimeSeconds = Math.round(process.uptime())
    if (dbLatencyMs === null) {
      reply.code(503)
      return { ok: false, db: 'down', uptimeSeconds }
    }
    return { ok: true, db: 'up', dbLatencyMs, uptimeSeconds }
  }

  app.get('/health', { config: { skipIdentity: true } }, handler)
  app.get('/api/health', { config: { skipIdentity: true } }, handler)
}
