// (#177) Deliberately the first import in the file, and deliberately also
// loaded through node's `--import` in production (see package.json's start
// script and the Dockerfile). The flag is what gets the SDK up before
// *anything* else in the process, which is what it needs to instrument the
// modules below; this line is what makes `npm run dev` — plain tsx, no flag
// — behave the same for anyone who sets a DSN locally. Both resolve to the
// same module URL, so init still happens exactly once.
import { setupSentryErrorHandler } from './instrument.js'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import { Server, type DefaultEventsMap } from 'socket.io'

import type { ClientToServerEvents, ServerToClientEvents } from '@grafetto/shared'
import { registerRoomHandlers, removeUserFromRoom, userChannel, type SocketData } from './socketHandlers.js'
import { flushAllRoomWrites, pendingWriteCount } from './rooms.js'
import { disconnectAllClients } from './shutdown.js'
import { prisma } from './prisma.js'
import { identityHook } from './identity.js'
import { startEventLoopMonitor } from './eventLoop.js'
import { registerHealthRoutes } from './healthRoutes.js'
import { registerRateLimit } from './rateLimit.js'
import { registerAuthRoutes } from './authRoutes.js'
import { isEmailConfigured } from './email.js'
import { registerRoomRoutes } from './roomRoutes.js'
import { registerRoomAccessRoutes } from './roomAccessRoutes.js'
import { registerRoomFolderRoutes } from './roomFolderRoutes.js'
import { registerForkRoutes } from './forkRoutes.js'
import { registerSnapshotRoutes } from './snapshotRoutes.js'
import { registerThumbnailRoutes } from './thumbnailRoutes.js'

// `trustProxy: 1` — trust exactly one hop, the host's nginx, which is the
// sole public entry point (docker-compose.prod.yml binds this process to
// 127.0.0.1). Without it `request.ip` is the docker bridge gateway for every
// visitor alike, which would quietly turn the per-IP auth limits (#237) into
// one shared global counter — the failure mode being that the first person to
// mistype a password locks out everyone else. One hop rather than `true`
// because nginx *appends* to X-Forwarded-For: a client that sends its own
// forged header gets it pushed leftwards, and only the rightmost entry — the
// address nginx actually saw — is trustworthy.
const app = Fastify({ logger: true, trustProxy: 1 })

// (#177) The SDK itself is already up by the time this file is evaluated —
// instrument.ts is loaded through node's `--import` (and, for `npm run dev`,
// as the first import above). This is the part that has to know about `app`,
// and it goes here rather than after the routes below so a route registered
// later can't quietly end up outside it. A no-op without a DSN.
setupSentryErrorHandler(app)

// `origin: true` (reflect the request's own Origin) + `credentials: true` is
// required for the identity cookie (#41) to ride along cross-origin — LAN dev
// setup has the Vite dev server and this API on different ports of the same
// host, which is cross-origin (though same-site, since Same-Site is
// domain-based, not port-based — that's what lets `sameSite: 'lax'` still
// work here). `origin: '*'` is incompatible with credentialed requests per
// the CORS spec, so this replaces the old permissive wildcard.
// `methods` must be listed explicitly — @fastify/cors's own default preflight
// response only allows GET,HEAD,POST, which silently blocks every DELETE
// (room deletion, #116) client-side before it ever reaches this process: the
// browser honors the preflight's Access-Control-Allow-Methods and never even
// sends the real request, so it never shows up in this server's own request
// log either — the one clue that it's a CORS rejection, not a server error.
await app.register(cors, {
  origin: true, credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
})
await app.register(cookie)
// Registers the limiter itself; which routes it covers is declared per route
// (rateLimit.ts). Must come before registerAuthRoutes — that's where the
// failed-login counter is built off `app.createRateLimit`.
await registerRateLimit(app)

// Resolves req.userId (identity.ts) for every HTTP route — /api/auth/*,
// /api/rooms/*, /api/me etc. all get it for free. Registration order is not
// what scopes this: a route declared before this line still gets the hook.
// The only way out is `config: { skipIdentity: true }` on the route itself,
// which is how the health checks avoid minting a guest User per probe (#178).
app.addHook('preHandler', identityHook)

// Engine.IO's own default maxHttpBufferSize is 1e6 (~1MB) and applies to a
// single packet in *either* direction — not just what the server accepts
// from a client, but what it can successfully emit to one too. A room with
// enough history (or one long stroke — see engine/index.ts's
// STROKE_DAB_CHUNK_LIMIT) can need to send room_state's tailOperations well
// past that in one shot; without this, the packet is silently dropped and
// the join just hangs (found via a live "room never finishes loading"
// report — nginx's client_max_body_size, raised separately in
// deploy/nginx.conf, is the same class of ceiling on the incoming side).
const MAX_HTTP_BUFFER_SIZE_BYTES = 20 * 1024 * 1024

// (#366) WebSocket payload compression. socket.io v4 ships this *off* by
// default (v2 had it on; it was dropped for being a poor trade on the small,
// chatty messages most apps send), and this app is the opposite case: a single
// stroke on an infinite canvas at low zoom is megabytes of JSON floats,
// because dab count scales with the stroke's world length and the brush is
// sized in world units. Floats-as-text is exactly what deflate is good at.
//
// `threshold` keeps it off the traffic the default actually suits — cursor
// positions, presence, join/leave — where framing and CPU would cost more
// than they save. 1 KB is comfortably above those and far below a stroke
// chunk (STROKE_DAB_CHUNK_LIMIT is ~200 KB of dabs).
//
// Explicitly *not* relied on as the fix: it shrinks the wire and nothing
// else. The same operations still sit uncompressed in room history in RAM
// (#207) and in Postgres, which is what the binary dab packing in this same
// issue addresses.
const io = new Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>(app.server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE_BYTES,
  perMessageDeflate: { threshold: 1024 },
})

// Room state (#32), operation relay + log (#34/#35), room_state snapshot
// (#36), teacher/student roles (#39), and operation_revoke authorization
// (#73) all live in socketHandlers.ts / rooms.ts — see those for details.
registerRoomHandlers(io, app.log)

// The HTTP routes come after `io` exists, not because Fastify needs it to,
// but because one of them does: closing a room for editing (#222) is a REST
// call whose effect has to reach the people already inside that room.
// (#324) Прибор для третьей стены. Заводится здесь, а не лениво при первом
// запросе к /api/health: окно должно начать считаться с началом нагрузки, а не
// с момента, когда кто-то впервые пришёл спросить.
startEventLoopMonitor()
registerHealthRoutes(app)
registerAuthRoutes(app)
registerRoomRoutes(app, (roomId, closedAt) => io.to(roomId).emit('room_closed_changed', { closedAt }))
// (#227) The access endpoints move durable state; these two callbacks are how
// the people affected find out without reloading. Fire-and-forget on purpose
// — see RoomAccessNotifier's doc comment for why a missed notification is
// never a missed decision.
registerRoomAccessRoutes(app, {
  // (#387) Both sides of the decision, one emit: chaining `.to()` unions the
  // two channels and socket.io delivers once per socket, so an owner who
  // somehow shares a channel with the asker still gets a single event.
  joinRequestResolved: ({ roomId, requestId, askerId, ownerId, approved }) =>
    io.to(userChannel(askerId)).to(userChannel(ownerId))
      .emit('join_request_resolved', { roomId, requestId, approved }),
  kicked: (roomId, userId) => {
    void removeUserFromRoom(io, roomId, userId).catch(err =>
      app.log.error({ err, roomId, userId }, 'failed to remove kicked user from room'))
  },
})
registerRoomFolderRoutes(app)
registerForkRoutes(app)
registerSnapshotRoutes(app)
registerThumbnailRoutes(app)

// (#497) Сколько у выключения есть времени. Меньше десяти секунд не по вкусу:
// `docker stop` шлёт SIGTERM и добивает SIGKILL'ом через свой grace period, а
// он в docker-compose.prod.yml не задан, то есть равен десяти секундам по
// умолчанию. Уложиться надо внутри них — иначе выключение, написанное ради
// сохранности, само окажется тем, кого убили на середине записи.
const SHUTDOWN_DEADLINE_MS = 8000

let shuttingDown = false

/** (#497) Уйти так, чтобы не унести с собой подтверждённую работу.
 *
 *  До этого обработчика не было вовсе, и это хуже, чем звучит: в контейнере
 *  node — это PID 1, а для PID 1 ядро не ставит обработчик сигнала по
 *  умолчанию. То есть SIGTERM процессом просто игнорировался, docker ждал
 *  десять секунд и присылал SIGKILL — каждый деплой, а деплой здесь на каждый
 *  пуш в `main`.
 *
 *  Порядок здесь — это и есть содержание:
 *
 *  1. **Сначала отсоединить клиентов.** Пока сокеты живы, операции продолжают
 *     приходить, и очередь записи, которую мы собираемся дождаться, растёт
 *     ровно столько, сколько мы её ждём. Отсоединение обрывает приток; всё,
 *     что было принято до него, уже лежит в очереди (`recordOperation`
 *     синхронный, ставит запись и возвращается).
 *  2. **Потом дождаться записей.** Единственный шаг, ради которого всё
 *     остальное написано.
 *  3. **Потом закрыть сервер и Prisma.** В этом порядке: `app.close()`
 *     закрывает и HTTP-слушатель, и движок socket.io, который к нему прицеплен.
 *
 *  Клиентам ничего не сообщается отдельным событием, и это решение, а не
 *  упущение: обрыв сокета они и так читают правильно — socket.io
 *  переподключается сам, комната показывает баннер и восстанавливается, когда
 *  поднимется новый контейнер. Отдельное «сервер уходит» добавило бы поверхность
 *  в контракт ради сообщения, на которое нечего ответить.
 *
 *  (#504) Слово «обрыв» в предыдущем абзаце — не оговорка, а условие, при
 *  котором он верен. Шагом 1 здесь стоял `io.disconnectSockets(true)`, то есть
 *  не обрыв, а прощание: socket.io-client читает его как решение сервера и не
 *  переподключается вообще. Каждый деплой оставлял всех рисующих в комнате,
 *  которая до перезагрузки страницы уже не оживёт. Почему `disconnectAllClients`
 *  делает это иначе — в его собственном комментарии. */
const shutdown = async (signal: string): Promise<void> => {
  // Второй сигнал во время выключения — обычное дело (нетерпеливый оператор,
  // docker вслед за compose). Он не должен запускать вторую гонку за те же
  // ресурсы.
  if (shuttingDown) return
  shuttingDown = true

  const deadline = new Promise<'timeout'>(resolve => {
    // `unref`, иначе сам таймер продержит процесс живым все восемь секунд
    // даже после того, как всё уже закрыто и уходить можно сразу.
    setTimeout(() => resolve('timeout'), SHUTDOWN_DEADLINE_MS).unref()
  })

  const work = (async () => {
    disconnectAllClients(io)
    await flushAllRoomWrites()
    await app.close()
    await prisma.$disconnect()
    return 'done' as const
  })()

  const outcome = await Promise.race([work, deadline]).catch(err => {
    app.log.error({ err, signal }, 'shutdown failed')
    return 'failed' as const
  })

  // Незаписанное на выходе — не мелочь и не строчка для порядка: это ровно тот
  // объём подтверждённой работы, который деплой потерял. Пусть он будет сказан
  // числом, а не выведен потом из жалобы преподавателя.
  const unwritten = pendingWriteCount()
  if (outcome === 'done' && unwritten === 0) app.log.info({ signal }, 'shutdown complete')
  else app.log.error({ signal, outcome, unwritten }, 'shutdown incomplete — unwritten room state was dropped')

  process.exit(outcome === 'done' ? 0 : 1)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })

const start = async () => {
  try {
    // (#316) Signing in is a code mailed to the address, so a production box
    // with no mail provider is a box nobody can log into. Said once, at boot,
    // rather than discovered from the first teacher who can't get in — the
    // request path can only report the failure after someone has already hit
    // it. Not fatal on purpose: rooms already open keep working, and refusing
    // to start would turn a sign-in outage into a total one.
    if (process.env.NODE_ENV === 'production' && !isEmailConfigured()) {
      app.log.error('RESEND_API_KEY is not set — nobody can sign in (see deploy/README.md)')
    }
    // 4000 unless told otherwise (compose publishes that, and the Vite proxy
    // expects it). The override exists so a second checkout can be run and
    // tested next to a live dev server instead of fighting it for the port —
    // this repo routinely has several worktrees open at once.
    await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
