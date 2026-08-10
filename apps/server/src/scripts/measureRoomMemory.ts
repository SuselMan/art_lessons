/** (#415, трек #314 §1) Замер потолка: сколько одновременных комнат держит
 *  коробка, и почём каждая.
 *
 *  Почему это скрипт, а не тест: тест отвечает на вопрос «сломалось ли», а
 *  здесь вопрос «сколько», и ответ у него зависит от железа, от формы данных и
 *  от версии Node — то есть меняется без единого изменения в коде. Такой ответ
 *  нельзя закоммитить один раз; можно закоммитить способ его получить.
 *
 *  Лежит в `src/`, а не в `scripts/` рядом с `apps/web/scripts`, ровно по
 *  причине #348: `tsconfig.json` сервера включает только `src`, и файл вне его
 *  не увидят ни `tsc --noEmit`, ни линтер — инструмент, которым меряют, молча
 *  разошёлся бы с кодом, который он мерит. Платой идёт несколько килобайт
 *  мёртвого кода в `dist`, который ничто не импортирует.
 *
 *  Меряется настоящий путь — `ensureRoomLoaded`, тот самый, что зовёт
 *  `join_room`. Не копия его логики: копия разошлась бы с оригиналом ровно
 *  там, где это дороже всего (см. историю #292/#372, где окно резидентности
 *  трижды меняло правило).
 *
 *  Запуск (обязательно с `--expose-gc`, иначе числа будут шумом от
 *  неубранного мусора):
 *
 *    DATABASE_URL=... node --expose-gc --import tsx src/scripts/measureRoomMemory.ts seed --rooms 40 --ops 300
 *    DATABASE_URL=... node --expose-gc --import tsx src/scripts/measureRoomMemory.ts measure
 *
 *  `seed --covered` засевает те же комнаты со снапшотным покрытием — вторая
 *  ветка замера, ради которой всё и затевалось: резидентный вес комнаты
 *  определяется не её историей, а тем, донесли ли клиенты снапшот. */

import { readFileSync } from 'node:fs'
import v8 from 'node:v8'

import { prisma } from '../prisma.js'
import { ensureRoomLoaded, getResidentRoomStats } from '../rooms.js'

const MB = 1024 * 1024
const OWNER_ID = 'measure-owner'
const LAYER_ID = 'measure-layer'

type SeedOptions = { rooms: number; ops: number; covered: boolean; samplesPath: string }

function parseArgs(argv: string[]): { command: string; options: SeedOptions } {
  const command = argv[0] ?? 'measure'
  const value = (name: string, fallback: number): number => {
    const at = argv.indexOf(`--${name}`)
    if (at === -1) return fallback
    const parsed = Number(argv[at + 1])
    if (!Number.isFinite(parsed)) throw new Error(`--${name} expects a number, got ${argv[at + 1]}`)
    return parsed
  }
  const samplesAt = argv.indexOf('--samples')
  return {
    command,
    options: {
      rooms: value('rooms', 40),
      ops: value('ops', 300),
      covered: argv.includes('--covered'),
      samplesPath: samplesAt === -1 ? '' : argv[samplesAt + 1]!,
    },
  }
}

/** Настоящие payload'ы штрихов, снятые с прода. Синтетика здесь исказила бы
 *  ответ в разы: реальный штрих несёт `dabsPacked` (#366) с распределением
 *  «медиана 4.8 КБ, p90 28 КБ, максимум 208 КБ», и стоимость комнаты
 *  определяется именно хвостом, а не медианой. */
function loadSamples(path: string): unknown[] {
  if (!path) throw new Error('--samples <file.json> is required for seeding')
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${path} holds no sample operations`)
  return parsed
}

async function seed(options: SeedOptions): Promise<void> {
  const samples = loadSamples(options.samplesPath)
  await prisma.user.upsert({ where: { id: OWNER_ID }, create: { id: OWNER_ID, name: 'Measure' }, update: {} })

  for (let roomIndex = 0; roomIndex < options.rooms; roomIndex += 1) {
    const roomId = `measure-${String(roomIndex).padStart(4, '0')}`
    await prisma.room.upsert({
      where: { id: roomId },
      create: {
        id: roomId, name: `Measure ${roomIndex}`, paper: 'coarse', infinite: false,
        canvasWidth: 1240, canvasHeight: 1754, ownerId: OWNER_ID,
      },
      update: {},
    })

    // Пишется пачками, а не по одной: при 300 операциях на комнату и 40
    // комнатах разница между batch и по-строчно — минуты против часа, и это
    // единственная причина такой формы. На измеряемую величину не влияет:
    // мерится чтение, не запись.
    const BATCH = 200
    for (let from = 0; from < options.ops; from += BATCH) {
      const rows = []
      for (let i = from; i < Math.min(from + BATCH, options.ops); i += 1) {
        const sample = samples[i % samples.length] as Record<string, unknown>
        const seq = i + 1
        rows.push({
          id: `${roomId}-op-${seq}`,
          seq,
          type: 'stroke',
          roomId,
          userId: OWNER_ID,
          layerId: LAYER_ID,
          tool: 'pencil',
          data: { ...sample, id: `${roomId}-op-${seq}`, seq, layerId: LAYER_ID, userId: OWNER_ID },
        })
      }
      await prisma.operation.createMany({ data: rows, skipDuplicates: true })
    }

    if (options.covered) {
      // Покрытие ставится на всю историю кроме последней сотни операций —
      // `SNAPSHOT_SEQ_INTERVAL` (100) — то есть ровно тот хвост, который живой
      // клиент ещё не успел бы запечь. Байты снапшота здесь неважны: сервер
      // их не кэширует (см. `getLatestSnapshot`), в RAM попадает только факт
      // покрытия.
      const coveredSeq = Math.max(0, options.ops - 100)
      await prisma.roomLayerSnapshot.create({
        data: { roomId, layerId: LAYER_ID, seq: coveredSeq, data: Buffer.from([0]), hash: `measure-${roomIndex}` },
      })
      await prisma.roomLayerState.upsert({
        where: { roomId },
        create: { roomId, seq: coveredSeq, state: { items: { [LAYER_ID]: { id: LAYER_ID } } } },
        update: { seq: coveredSeq },
      })
    }
    process.stdout.write(`\rseeded ${roomIndex + 1}/${options.rooms} rooms`)
  }
  process.stdout.write('\n')
}

function heapUsedMb(): number {
  // Полная сборка перед каждым отсчётом — без неё измеряется мусор, ещё не
  // убранный после предыдущей комнаты, и кривая получается ступенчатой на
  // ровном месте. Дважды, потому что первый проход освобождает то, что второй
  // может дособрать.
  global.gc?.()
  global.gc?.()
  return v8.getHeapStatistics().used_heap_size / MB
}

async function measure(): Promise<void> {
  const roomIds = (await prisma.room.findMany({
    where: { ownerId: OWNER_ID }, orderBy: { id: 'asc' }, select: { id: true },
  })).map(row => row.id)
  if (roomIds.length === 0) throw new Error('nothing seeded — run `seed` first')

  const heapLimitMb = v8.getHeapStatistics().heap_size_limit / MB
  const baseline = heapUsedMb()
  console.log(`node ${process.version} · heap limit ${heapLimitMb.toFixed(0)} MB · baseline ${baseline.toFixed(1)} MB`)
  console.log('rooms\tops\theapMb\tdeltaMb\tperRoomMb')

  let loaded = 0
  for (const roomId of roomIds) {
    await ensureRoomLoaded(roomId)
    loaded += 1
    // Отчёт по ступеням, а не по каждой комнате: одна полная сборка мусора
    // стоит десятки миллисекунд, и на каждой из сотен комнат замер начал бы
    // мерить сам себя.
    const step = loaded <= 10 || loaded % 10 === 0
    if (!step) continue
    const heap = heapUsedMb()
    const stats = getResidentRoomStats()
    const delta = heap - baseline
    console.log([
      stats.total, stats.operations, heap.toFixed(1), delta.toFixed(1), (delta / loaded).toFixed(2),
    ].join('\t'))
  }

  const heap = heapUsedMb()
  const perRoom = (heap - baseline) / loaded
  const headroom = heapLimitMb * 0.85 - baseline
  console.log(`\nper-room ${perRoom.toFixed(2)} MB · rooms until 85% of the heap limit: ${Math.floor(headroom / perRoom)}`)
}

async function main(): Promise<void> {
  if (!global.gc) throw new Error('run with --expose-gc, otherwise every reading is uncollected garbage')
  const { command, options } = parseArgs(process.argv.slice(2))
  if (command === 'seed') await seed(options)
  else if (command === 'measure') await measure()
  else throw new Error(`unknown command ${command} — expected seed | measure`)
  await prisma.$disconnect()
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
