import { statfs } from 'node:fs/promises'

/** (#415, трек #314 §1) Место на диске.
 *
 *  Заведено потому, что диск — самая близкая к нам стена, и единственная, о
 *  которую мы бы ударились молча. Память измерена и до её потолка годы; диск
 *  же растёт от самого рисования: замер по живым дням прода даёт ~6 МБ в сутки
 *  на активно рисующего человека **после** сжатия в Postgres. Сто активных
 *  учителей — это ~600 МБ в день, то есть свободные сейчас 39 ГБ кончаются
 *  примерно за два месяца. И, в отличие от памяти, это место не возвращается:
 *  закрытый урок освобождает RAM, но не диск.
 *
 *  Меряется изнутри контейнера, а не по SSH снаружи, и это выбор в пользу
 *  канала, который уже есть: `/api/health` уже опрашивается пробой раз в
 *  десять минут (#178). Альтернатива — выдать мониторингу ключ от VPS, то есть
 *  разменять радиус поражения самого недоверенного из наших процессов на
 *  удобство. Оверлей контейнера лежит на корневой файловой системе хоста, так
 *  что `statfs('/')` отсюда отвечает про тот же диск, на котором живут и
 *  образы, и том Postgres.
 *
 *  Гейта, в отличие от памяти, здесь нет и быть не может: отказ в новой
 *  комнате освобождает память, но не освобождает ни байта диска — он только
 *  замедлил бы наполнение, отняв у людей работу. Кончающийся диск лечится
 *  уборкой или деньгами, и оба действия — снаружи процесса. */
export type DiskSnapshot = {
  totalGb: number
  freeGb: number
  usedPct: number
}

const GB = 1024 * 1024 * 1024

/** Порог письма. 75% на диске в 50 ГБ — это 12 ГБ запаса, то есть при сотне
 *  активных учителей около трёх недель на то, чтобы прибраться или увеличить
 *  диск. Порог намеренно ниже, чем у памяти: память освобождается сама, когда
 *  урок кончился, а диск требует человека, и человеку нужно время. */
export const DISK_WARN_PCT = readPct('DISK_WARN_PCT', 75)

/** Порог тревоги. На 90% остаётся 5 ГБ, а Postgres, которому некуда писать, —
 *  это не деградация, а остановка: операции перестают сохраняться, и урок,
 *  который человек считает нарисованным, исчезнет при перезаходе. */
export const DISK_CRITICAL_PCT = readPct('DISK_CRITICAL_PCT', 90)

function readPct(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    console.error(`${name}=${raw} is not a percentage in (0, 100] — falling back to ${fallback}`)
    return fallback
  }
  return parsed
}

/** `null`, когда файловую систему не удалось опросить.
 *
 *  Именно `null`, а не «ноль» или выдуманный запас: единственная неприемлемая
 *  здесь ошибка — сообщить, что места полно, когда мы этого не знаем. Читатель
 *  (проба) обязан отличить «диск в порядке» от «мы не смогли посмотреть», и
 *  второе для мониторинга — сама по себе новость. */
export async function readDisk(): Promise<DiskSnapshot | null> {
  try {
    const stats = await statfs('/')
    const total = stats.blocks * stats.bsize
    // `bavail`, а не `bfree`: часть свободного зарезервирована под root, и мы
    // не root. Считать её своей — значит обещать запас, которого у нас нет.
    const free = stats.bavail * stats.bsize
    if (total <= 0) return null
    return {
      totalGb: Math.round((total / GB) * 10) / 10,
      freeGb: Math.round((free / GB) * 10) / 10,
      usedPct: Math.round(((total - free) / total) * 1000) / 10,
    }
  } catch (error) {
    console.error('could not read filesystem stats', error)
    return null
  }
}

export type DiskPressure = 'ok' | 'warn' | 'critical' | 'unknown'

export function diskPressureOf(snapshot: DiskSnapshot | null): DiskPressure {
  if (snapshot === null) return 'unknown'
  if (snapshot.usedPct >= DISK_CRITICAL_PCT) return 'critical'
  if (snapshot.usedPct >= DISK_WARN_PCT) return 'warn'
  return 'ok'
}
