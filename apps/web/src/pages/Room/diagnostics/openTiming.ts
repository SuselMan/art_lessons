/** (#487, трек #314 §1) Сколько длится вход в комнату и на чём он стоит.
 *
 *  Чистая часть: решает, что произошло. Отправкой занимается `reportOpen.ts` —
 *  то же разделение, что у `restoreReport.ts` / `reportRestore.ts` (#474), и по
 *  той же причине: решение о том, медленно ли открылась комната, должно быть
 *  проверяемо тестом, а не только наблюдаемо в Sentry.
 *
 *  **Почему по таймеру, а не по завершении.** Соблазн померить вход и сравнить
 *  с порогом на финише не ловит тот случай, ради которого всё затевается.
 *  24.08 комната `U68gWoq-` открывалась так: вкладка вставала на «Joining…» и
 *  не сдвигалась никогда. Исключений нет, запросов нет, конца нет — измерять
 *  нечего, потому что финиша не существует. Сервер при этом видит `ping
 *  timeout` и переподключение, то есть здорового клиента. Поэтому у таймера
 *  два выхода: `finish()` на готовности и `stalled()` — снимок состояния,
 *  который вызывающий берёт по будильнику, не дожидаясь конца.
 *
 *  **Почему по фазам, а не одним числом.** «Медленно» не сообщает ничего: на
 *  разбор #486 ушёл день именно потому, что число было одно. У каждой фазы
 *  свой виновник — сеть и размер непокрытого хвоста, загрузка текстуры бумаги
 *  (#441), объём блобов снапшота (#425), цена реплея на CPU и GPU (#467, #469).
 *  Фаза, на которой вход застрял, — это и есть ответ.
 *
 *  Содержимое холста, имена и почта сюда не попадают: только миллисекунды,
 *  счётчики и seq. См. #323. */

/** Порог, после которого вход перестаёт быть нормальным. Не «страшно», а
 *  «дальше это уже не похоже на загрузку»: на исправной комнате всё, кроме
 *  первой загрузки бумаги, укладывается в секунды. */
export const SLOW_OPEN_MS = 10_000

/** Фазы в порядке прохождения. Имена — стабильные идентификаторы, по которым
 *  это группируется в Sentry месяцами, а не сообщения для человека. */
export type OpenStage =
  /** Нажали «войти» → `join_room` подтверждён и `room_state` приехал. Здесь
   *  живёт вес непокрытого хвоста: у `U68gWoq-` он дорос до 43 МБ JSON. */
  | 'join'
  /** Ожидание текстуры бумаги. Движок отказывается начинать штрих, пока её
   *  нет (`_paperTexLoaded`), так что это честная часть открытия, а не фон. */
  | 'paper'
  /** Индекс снапшота и по блобу на слой. */
  | 'snapshot'
  /** Реплей хвоста операций поверх восстановленных пикселей. */
  | 'replay'

const STAGE_ORDER: readonly OpenStage[] = ['join', 'paper', 'snapshot', 'replay']

/** Всё, что объясняет число. Каждое поле необязательно на своих правах: на
 *  застрявшем входе половина из них ещё не известна, и это само по себе
 *  сведение — «встали, не дойдя до снапшота» видно по тому, каких фактов нет. */
export interface OpenFacts {
  /** Операций в хвосте, который пришлось проигрывать. */
  tailOperations?: number
  /** Последний seq комнаты и seq последнего снапшота — их разрыв это ровно то,
   *  что меряет серверный сторож из #480 §1, только с этой стороны. */
  latestSeq?: number
  snapshotSeq?: number | null
  restoredFromSnapshot?: boolean
  /** Слоёв в комнате: восстановление поднимает их все разом (#467). */
  layers?: number
}

export interface OpenReport {
  /** `ready` — вход дошёл до конца. `stalled` — снимок по будильнику, вход в
   *  этот момент ещё шёл. */
  outcome: 'ready' | 'stalled'
  totalMs: number
  /** Миллисекунды по фазам. Незавершённая фаза попадает сюда с тем, что
   *  накопила к моменту снимка. */
  stages: Partial<Record<OpenStage, number>>
  /** Фаза, на которой вход стоял в момент отчёта. Для `ready` — последняя. */
  reached: OpenStage
  facts: OpenFacts
}

export interface OpenTimer {
  /** Открывает фазу, закрывая предыдущую. Вызывается по факту перехода, а не
   *  заранее: закрывается именно та фаза, которая только что кончилась. */
  stage(next: OpenStage): void
  /** Досыпает факты по мере того, как они становятся известны. */
  note(facts: OpenFacts): void
  /** Вход дошёл до конца. Повторный вызов возвращает тот же отчёт: у входа
   *  один финиш, а вызывающих у него может оказаться несколько. */
  finish(): OpenReport
  /** Снимок на ходу — для будильника. Не завершает и не мешает `finish()`. */
  stalled(): OpenReport
  /** Уже завершён: будильнику не о чем отчитываться. */
  readonly done: boolean
}

/** `now` передаётся, а не берётся из `performance.now()` внутри, ровно по той
 *  же причине, по которой в скриптах воркфлоу запрещён `Date.now()`: иначе это
 *  не проверить тестом. */
export function createOpenTimer(now: () => number): OpenTimer {
  const startedAt = now()
  const stages: Partial<Record<OpenStage, number>> = {}
  let current: OpenStage = 'join'
  let currentStartedAt = startedAt
  let facts: OpenFacts = {}
  let finished: OpenReport | null = null

  const closeCurrent = (at: number): void => {
    stages[current] = (stages[current] ?? 0) + (at - currentStartedAt)
    currentStartedAt = at
  }

  const snapshot = (outcome: OpenReport['outcome']): OpenReport => {
    const at = now()
    // Копия: `stalled()` не должен закрывать фазу по-настоящему — вход в этот
    // момент продолжается, и следующий отчёт обязан считать ту же фазу с её
    // собственного начала, а не с момента, когда её кто-то подсмотрел.
    const partial = { ...stages }
    partial[current] = (partial[current] ?? 0) + (at - currentStartedAt)
    return { outcome, totalMs: at - startedAt, stages: partial, reached: current, facts: { ...facts } }
  }

  return {
    stage(next) {
      if (finished) return
      // Назад не ходим: переподключение посреди входа может повторно объявить
      // уже пройденную фазу, и зачесть её второй раз значило бы приписать
      // время не тому виновнику.
      if (STAGE_ORDER.indexOf(next) <= STAGE_ORDER.indexOf(current)) return
      closeCurrent(now())
      current = next
    },
    note(next) {
      facts = { ...facts, ...next }
    },
    finish() {
      if (finished) return finished
      finished = snapshot('ready')
      return finished
    },
    stalled() {
      return finished ?? snapshot('stalled')
    },
    get done() { return finished !== null },
  }
}

/** Стоит ли об этом отчитываться. Застрявший вход — новость всегда: снимок по
 *  будильнику берётся ровно тогда, когда порог уже перейдён. */
export function isSlowOpen(report: OpenReport): boolean {
  return report.outcome === 'stalled' || report.totalMs >= SLOW_OPEN_MS
}

/** Компактная строка по фазам для хлебной крошки — полная таблица уходит в
 *  контекст события, крошке достаточно быть читаемой рядом с чужой ошибкой. */
export function stagesLine(report: OpenReport): string {
  return STAGE_ORDER
    .filter(s => report.stages[s] !== undefined)
    .map(s => `${s} ${Math.round(report.stages[s] as number)}ms`)
    .join(' | ')
}
