/** (#324, трек #314 §9) Нагрузочный прогон: сколько одновременно **рисующих**
 *  уроков держит коробка.
 *
 *  Отличие от замера памяти (#415) — в том, что меряется. Память отвечает на
 *  вопрос «сколько уроков может быть открыто»: комната, в которой сидят и
 *  слушают, стоит килобайты и ничего не считает. Нагрузку создаёт рисование —
 *  каждый штрих надо принять, разослать всем участникам, сжать по дороге и
 *  записать в базу, и всё это делает один поток. Поэтому здесь единица
 *  измерения не «комната», а «комната, в которой сейчас рисуют».
 *
 *  ## Что считается ответом
 *
 *  Не «сервер не упал» — упасть он может и не собирался. Ответ — та точка, где
 *  перестаёт выполняться хотя бы одно из трёх:
 *
 *  1. **Задержка подтверждения** (`operation` → `ack`) p95 < 100 мс. Это
 *     время, через которое рисующий узнаёт, что его штрих принят.
 *  2. **Задержка ретрансляции** (штрих учителя → его приход ученику) p95 <
 *     150 мс. Ровно то, что ученик называет «отстаёт».
 *  3. **Лаг событийного цикла** p99 < 200 мс — потолок залипания главного
 *     потока, объявленный приёмочным в #324.
 *
 *  Первые два меряются здесь, третий сервер сообщает сам (`/api/health`,
 *  eventLoop.ts).
 *
 *  ## Как имитируется человек
 *
 *  Штрихи берутся настоящие, снятые с прода (`--samples`) — синтетика формы
 *  «десять дабов» дала бы ответ, ошибочный в разы: реальный штрих несёт
 *  `dabsPacked` (#366) с медианой 4.8 КБ и p90 28 КБ, и стоимость сети с
 *  сжатием определяется хвостом, а не медианой.
 *
 *  Темп — один штрих в секунду на рисующего, с разбросом ±40%. Это темп
 *  штриховки, снятый с живых дней прода: 2875–4470 операций за сеанс. Ровный
 *  метроном был бы хуже случайного: он сам по себе создаёт биения, которых у
 *  живых людей нет, и превращает замер в исследование резонансов.
 *
 *  В каждой комнате один рисующий и `--students` слушающих: ретрансляция
 *  умножается на число участников, и комната на двоих — не половина комнаты на
 *  четверых.
 *
 *  ## Запуск
 *
 *    node --import tsx src/scripts/loadTest.ts --rooms 20 --students 1 \
 *      --seconds 60 --origin http://localhost:4102 --samples strokes.json
 */

import { readFileSync } from 'node:fs'

import { io, type Socket } from 'socket.io-client'
import { packDabs, strokeDabs, type StrokeOperation } from '@grafetto/shared'

// (#429) Same pacing constant the engine emits on — see
// LIVE_STROKE_EMIT_INTERVAL_MS in apps/web/src/engine/index.ts. Duplicated
// rather than imported because it is an engine tuning value, not a contract;
// if the two drift, this run measures a channel nobody ships.
const LIVE_EMIT_INTERVAL_MS = 60

type Options = {
  rooms: number
  students: number
  seconds: number
  origin: string
  samplesPath: string
  live: boolean
}

function parseArgs(argv: string[]): Options {
  const num = (name: string, fallback: number): number => {
    const at = argv.indexOf(`--${name}`)
    if (at === -1) return fallback
    const parsed = Number(argv[at + 1])
    if (!Number.isFinite(parsed)) throw new Error(`--${name} expects a number, got ${argv[at + 1]}`)
    return parsed
  }
  const str = (name: string, fallback: string): string => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? fallback : (argv[at + 1] ?? fallback)
  }
  return {
    rooms: num('rooms', 10),
    students: num('students', 1),
    seconds: num('seconds', 60),
    origin: str('origin', 'http://localhost:4102'),
    samplesPath: str('samples', ''),
    live: str('live', '1') !== '0',
  }
}

/** (#429) Splits one stroke's dabs into the packets its author would have
 *  streamed while drawing it, using the dabs' own recorded `t` — so the packet
 *  count and sizes come from how the stroke was actually drawn rather than from
 *  a guess. Mirrors the engine's LIVE_STROKE_EMIT_INTERVAL_MS pacing.
 *
 *  Precomputed once per sample at startup, never per stroke: this is the load
 *  generator's own work, and doing it inside the drawing loop would put the
 *  generator's CPU into the measurement it is trying to take. */
function liveWirePackets(op: Record<string, unknown>, intervalMs: number): Array<{ atMs: number; payload: Record<string, unknown> }> {
  const dabs = strokeDabs(op as unknown as StrokeOperation)
  if (!dabs.length) return []
  const out: Array<{ atMs: number; payload: Record<string, unknown> }> = []
  let bucketStart = dabs[0]!.t
  let bucket: typeof dabs = []
  const flush = (): void => {
    if (!bucket.length) return
    out.push({
      atMs: bucketStart,
      payload: {
        strokeId: op.strokeId, layerId: op.layerId, tool: op.tool, preset: op.preset,
        color: op.color, packetSeq: out.length, dabsPacked: packDabs(bucket),
      },
    })
    bucket = []
  }
  for (const d of dabs) {
    if (d.t - bucketStart >= intervalMs) { flush(); bucketStart = d.t }
    bucket.push(d)
  }
  flush()
  return out
}

/** Детерминированный генератор: прогон должен воспроизводиться, иначе
 *  сравнивать две ступени между собой нельзя — разница окажется разницей
 *  случайных чисел. `Math.random()` здесь был бы именно этим. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))
  return Math.round(sorted[index]! * 10) / 10
}

type Stats = { count: number; p50: number; p95: number; p99: number; max: number }

function summarize(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length === 0 ? 0 : Math.round(sorted[sorted.length - 1]! * 10) / 10,
  }
}

function connect(origin: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(origin, { transports: ['websocket'], reconnection: false, timeout: 20_000 })
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options.samplesPath) throw new Error('--samples <file.json> is required')
  const samples = JSON.parse(readFileSync(options.samplesPath, 'utf8')) as Record<string, unknown>[]
  if (!Array.isArray(samples) || samples.length === 0) throw new Error('sample file holds no operations')

  const ackLatencies: number[] = []
  const relayLatencies: number[] = []
  // (#429) Live packets are unacked by design, so the only latency they have is
  // relay: drawer emit -> student receives. That is the number the whole
  // feature exists to make small, and it is measured separately from the
  // operation relay because the two travel different paths through the server.
  const liveRelayLatencies: number[] = []
  const liveSentAt = new Map<string, number>()
  let liveSent = 0
  let rejected = 0
  let sent = 0
  const sockets: Socket[] = []
  // Время отправки по id операции — по нему считается и подтверждение, и
  // приход к ученику. Чистится по мере получения, иначе за минуту прогона
  // карта сама станет утечкой, которую мы же и меряем.
  const sentAt = new Map<string, number>()

  // Packet plans, computed once per distinct sample rather than per stroke.
  const livePlanCache = new Map<Record<string, unknown>, ReturnType<typeof liveWirePackets>>()
  const livePacketsFor = (sample: Record<string, unknown>): ReturnType<typeof liveWirePackets> => {
    let plan = livePlanCache.get(sample)
    if (!plan) { plan = liveWirePackets(sample, LIVE_EMIT_INTERVAL_MS); livePlanCache.set(sample, plan) }
    return plan
  }

  console.log(`connecting ${options.rooms} rooms × (1 drawer + ${options.students} students) to ${options.origin}`)

  for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
    const roomId = `load-${String(roomIndex).padStart(4, '0')}`
    const drawer = await connect(options.origin)
    sockets.push(drawer)
    await new Promise<void>((resolve, reject) => {
      drawer.emit('create_room', {
        room: {
          id: roomId, name: `Load ${roomIndex}`, paper: 'coarse', infinite: false,
          canvasWidth: 1240, canvasHeight: 1754,
        },
        name: 'Drawer',
      }, (result: { ok: boolean; error?: string }) => {
        if (!result.ok) reject(new Error(`create_room failed: ${result.error}`))
        else resolve()
      })
    })

    for (let studentIndex = 0; studentIndex < options.students; studentIndex += 1) {
      const student = await connect(options.origin)
      sockets.push(student)
      // Ретрансляция замеряется на ученике: `operation_confirmed` — то
      // событие, по которому у него появляется чужой штрих (#289 §7).
      //
      // Форма — `{ seq, operation }`, а не сама операция: первый вариант этого
      // скрипта читал `id` с верхнего уровня, получал undefined и рапортовал
      // ноль ретрансляций при живом трафике. Замер, который молча меряет
      // половину пути, хуже отсутствующего — он выглядит результатом.
      student.on('peer_stroke_live', (msg: { strokeId?: string; packetSeq?: number }) => {
        const key = `${msg?.strokeId}:${msg?.packetSeq}`
        const at = liveSentAt.get(key)
        if (at === undefined) return
        liveRelayLatencies.push(performance.now() - at)
        liveSentAt.delete(key)
      })
      student.on('operation_confirmed', (msg: { operation?: { id?: string } }) => {
        const id = msg?.operation?.id
        if (id === undefined) return
        const at = sentAt.get(id)
        if (at === undefined) return
        relayLatencies.push(performance.now() - at)
        sentAt.delete(id)
      })
      await new Promise<void>((resolve, reject) => {
        student.emit('join_room', { roomId, name: `Student ${studentIndex}` },
          (result: { ok: boolean; error?: string }) => {
            if (!result.ok) reject(new Error(`join_room failed: ${result.error}`))
            else resolve()
          })
      })
    }
  }

  console.log(`connected ${sockets.length} sockets; drawing for ${options.seconds}s`)
  const startedAt = performance.now()
  const random = makeRandom(0xC0FFEE)
  const timers: NodeJS.Timeout[] = []

  for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
    const drawer = sockets[roomIndex * (options.students + 1)]!
    let seq = 0
    const drawOnce = (): void => {
      const sample = samples[(roomIndex + seq) % samples.length]!
      seq += 1
      const id = `load-${roomIndex}-${seq}`
      const op = { ...sample, id, layerId: 'layer-load', strokeId: id }
      delete (op as { seq?: number }).seq
      const at = performance.now()
      sentAt.set(id, at)
      sent += 1
      // (#429) The live channel, if this run is measuring it. Packets go out on
      // the stroke's own recorded pacing and the operation follows at pen-up,
      // which is the order the real client produces and therefore the only one
      // whose cost is worth knowing.
      if (options.live) {
        const packets = livePacketsFor(sample)
        for (const { atMs, payload } of packets) {
          timers.push(setTimeout(() => {
            liveSent += 1
            liveSentAt.set(`${id}:${payload.packetSeq as number}`, performance.now())
            drawer.emit('stroke_live', { ...payload, strokeId: id })
          }, atMs))
        }
        const endAt = packets.length ? packets[packets.length - 1]!.atMs : 0
        timers.push(setTimeout(() => drawer.emit('stroke_live_end', { strokeId: id }), endAt))
      }
      drawer.emit('operation', op, (result: { ok: boolean }) => {
        ackLatencies.push(performance.now() - at)
        if (!result?.ok) rejected += 1
      })
      // Разброс ±40% вокруг секунды — темп штриховки живого человека. Ровный
      // метроном создал бы биения, которых у людей нет.
      const next = 1000 * (0.6 + random() * 0.8)
      if (performance.now() - startedAt < options.seconds * 1000) {
        timers.push(setTimeout(drawOnce, next))
      }
    }
    // Старт размазан по секунде, иначе все комнаты синхронно бьют в один тик
    // и первый же замер меряет не нагрузку, а совпадение фаз.
    timers.push(setTimeout(drawOnce, random() * 1000))
  }

  await new Promise(resolve => setTimeout(resolve, options.seconds * 1000))
  // Хвост: подтверждения и ретрансляции последних штрихов ещё в пути, и
  // оборвать их значило бы систематически занизить именно те задержки,
  // которые под нагрузкой самые длинные.
  await new Promise(resolve => setTimeout(resolve, 3000))
  timers.forEach(clearTimeout)

  const ack = summarize(ackLatencies)
  const relay = summarize(relayLatencies)
  const liveRelay = summarize(liveRelayLatencies)
  const health = await (await fetch(`${options.origin}/api/health`)).json() as Record<string, unknown>

  console.log(JSON.stringify({
    rooms: options.rooms,
    students: options.students,
    seconds: options.seconds,
    live: options.live,
    sent,
    liveSent,
    rejected,
    ack,
    relay,
    liveRelay,
    liveRelayDelivered: liveSent === 0 ? 0 : Math.round((liveRelay.count / (liveSent * options.students)) * 1000) / 10,
    // Доля дошедших ретрансляций: если она меньше единицы, сервер не «медленно
    // отвечает», а теряет — и это другой класс отказа, который средние
    // задержки скрыли бы.
    relayDelivered: sent === 0 ? 0 : Math.round((relay.count / (sent * options.students)) * 1000) / 10,
    health,
  }, null, 2))

  sockets.forEach(socket => socket.close())
  process.exit(0)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
