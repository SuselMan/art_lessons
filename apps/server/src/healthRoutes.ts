import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { type DiskPressure, type DiskSnapshot, diskPressureOf, readDisk } from './disk.js'
import {
  type EventLoopPressure, type EventLoopSnapshot, eventLoopPressureOf, readEventLoop,
} from './eventLoop.js'
import { type MemoryPressure, type MemorySnapshot, pressureOf, readMemory } from './memory.js'
import { prisma } from './prisma.js'
import { getResidentRoomStats } from './rooms.js'

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

/** (#415, трек #314 §1) Память и резидентность едут здесь, а не на отдельном
 *  `/metrics`, по той же причине, по которой #178 не завёл внешний сервис:
 *  канал уже есть и уже опрашивается раз в десять минут. Отдельный эндпоинт
 *  добавил бы вторую вещь, которую надо не забыть опрашивать.
 *
 *  Числа отдаются наружу без аутентификации — как и `uptimeSeconds` до них.
 *  Это осознанно: доля кучи и число резидентных комнат не говорят ни о том,
 *  кто в этих комнатах, ни что в них нарисовано, а закрытая проба состояния
 *  требует секрета в GitHub Actions ради данных, которые и так следуют из
 *  времени ответа. */
type HealthBody = {
  ok: boolean
  db: 'up' | 'down'
  dbLatencyMs?: number
  uptimeSeconds: number
  memory: MemorySnapshot & { pressure: MemoryPressure }
  rooms: { resident: number; idle: number; operations: number }
  // `disk` может приехать без цифр, с одним `pressure: 'unknown'` — см.
  // readDisk. Выдумать в этом случае «свободно много» было бы худшим из
  // возможных ответов от мониторинга.
  disk: Partial<DiskSnapshot> & { pressure: DiskPressure }
  // (#324) Третья стена. Как и `disk`, может приехать с одним `pressure:
  // 'unknown'` — первое окно ещё не закрылось.
  eventLoop: Partial<EventLoopSnapshot> & { pressure: EventLoopPressure }
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
    // Снимается до ветвления, чтобы отчёт о памяти приезжал и с мёртвой базой:
    // 503 по Postgres — ровно тот момент, когда полезно видеть, не идёт ли
    // рядом второе, независимое бедствие.
    const snapshot = readMemory()
    const memory = { ...snapshot, pressure: pressureOf(snapshot) }
    const residents = getResidentRoomStats()
    const rooms = { resident: residents.total, idle: residents.idle, operations: residents.operations }
    const diskSnapshot = await readDisk()
    const disk = { ...(diskSnapshot ?? {}), pressure: diskPressureOf(diskSnapshot) }
    const loopSnapshot = readEventLoop()
    const eventLoop = { ...(loopSnapshot ?? {}), pressure: eventLoopPressureOf(loopSnapshot) }
    if (dbLatencyMs === null) {
      reply.code(503)
      return { ok: false, db: 'down', uptimeSeconds, memory, rooms, disk, eventLoop }
    }
    return { ok: true, db: 'up', dbLatencyMs, uptimeSeconds, memory, rooms, disk, eventLoop }
  }

  app.get('/health', { config: { skipIdentity: true } }, handler)
  app.get('/api/health', { config: { skipIdentity: true } }, handler)
}
