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

type Options = {
  rooms: number
  students: number
  seconds: number
  origin: string
  samplesPath: string
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
  }
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
  let rejected = 0
  let sent = 0
  const sockets: Socket[] = []
  // Время отправки по id операции — по нему считается и подтверждение, и
  // приход к ученику. Чистится по мере получения, иначе за минуту прогона
  // карта сама станет утечкой, которую мы же и меряем.
  const sentAt = new Map<string, number>()

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
  const health = await (await fetch(`${options.origin}/api/health`)).json() as Record<string, unknown>

  console.log(JSON.stringify({
    rooms: options.rooms,
    students: options.students,
    seconds: options.seconds,
    sent,
    rejected,
    ack,
    relay,
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
