import v8 from 'node:v8'

/** (#415, трек #314 §1) Память процесса, приведённая к одному виду для всех
 *  трёх потребителей: `/api/health` (её читает уптайм-проба и человек),
 *  админ-гейт на джойне (socketHandlers) и замер потолка.
 *
 *  Меряем кучу V8, а не RSS, и это выбор, а не удобство. Падает процесс от
 *  исчерпания кучи — `heap_size_limit` и есть та стена, в которую он упрётся,
 *  и до 2026-08-10 её никто не задавал: V8 выводил её сам из объёма хоста
 *  (2006 МБ на нынешней коробке в 3.9 ГБ, 493 МБ на прежней в 960 МБ — то
 *  есть цифра менялась под нами при апгрейде железа, молча). RSS шире кучи на
 *  буферы, стек и аллокации нативных модулей, полезен для отчёта, но порогом
 *  быть не может: он включает то, чего вытеснение комнат не освобождает.
 *
 *  `heapUsedPct` считается от лимита, а не от `heapTotal`: доля от текущего
 *  размера кучи — величина, которая падает ровно тогда, когда V8 отдаёт
 *  память, то есть говорит о поведении сборщика, а не о запасе до стены. */
export type MemorySnapshot = {
  rssMb: number
  heapUsedMb: number
  heapLimitMb: number
  heapUsedPct: number
}

const MB = 1024 * 1024

/** Доля кучи, выше которой уптайм-проба шлёт письмо (#178 — канал уже есть).
 *  70% выбрано так, чтобы между письмом и отказами оставался запас, которого
 *  хватает увеличить коробку руками, а не ночью по факту падения. */
export const MEMORY_WARN_PCT = readPct('MEMORY_WARN_PCT', 70)

/** Доля кучи, выше которой холодная загрузка новой комнаты сперва пытается
 *  освободить место, а если освобождать нечего — отказывает (см.
 *  `admitRoomLoad` в socketHandlers). Идущие уроки это не трогает: гейт стоит
 *  только перед `ensureRoomLoaded`, то есть перед аллокацией, а не перед
 *  доступом к уже резидентной комнате. */
export const MEMORY_ADMIT_PCT = readPct('MEMORY_ADMIT_PCT', 85)

function readPct(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  // Молча проглотить мусор здесь — значит выключить защиту и не сказать об
  // этом: `Number('') === 0` превратил бы пустую переменную окружения в порог
  // «отказывать всегда».
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    console.error(`${name}=${raw} is not a percentage in (0, 100] — falling back to ${fallback}`)
    return fallback
  }
  return parsed
}

export function readMemory(): MemorySnapshot {
  const heap = v8.getHeapStatistics()
  const heapUsed = heap.used_heap_size
  const heapLimit = heap.heap_size_limit
  return {
    rssMb: Math.round(process.memoryUsage.rss() / MB),
    heapUsedMb: Math.round(heapUsed / MB),
    heapLimitMb: Math.round(heapLimit / MB),
    heapUsedPct: Math.round((heapUsed / heapLimit) * 1000) / 10,
  }
}

/** `ok` / `warn` / `critical` — одна лестница на всех, чтобы проба и гейт не
 *  разошлись в том, что считать бедой. Проба падает на `warn` и выше, гейт
 *  вступает на `critical`. */
export type MemoryPressure = 'ok' | 'warn' | 'critical'

export function pressureOf(snapshot: MemorySnapshot): MemoryPressure {
  if (snapshot.heapUsedPct >= MEMORY_ADMIT_PCT) return 'critical'
  if (snapshot.heapUsedPct >= MEMORY_WARN_PCT) return 'warn'
  return 'ok'
}
