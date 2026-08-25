/** (#504) Пока страница комнаты открыта, сокет не имеет права сдаться.
 *
 *  socket.io-client переподключается сам — но не всегда, и исключения тут не
 *  экзотика. Он объявляет `socket.active = false` и больше не делает ни одной
 *  попытки в двух случаях:
 *
 *  1. сервер отсоединил сокет сам (reason `io server disconnect`);
 *  2. хендшейк отклонён — `connect_error` от серверного `io.use()`.
 *
 *  Оба у нас достижимы, и оба выглядят для пользователя одинаково: баннер
 *  «Нет связи — переподключение…», в котором никакого переподключения не
 *  происходит, до перезагрузки вкладки. Второй достижим даже после того, как
 *  первый починен на сервере (`shutdown.ts`): новый контейнер успевает начать
 *  принимать сокеты раньше, чем Prisma отвечает, и отказ в резолве личности
 *  приезжает клиенту как окончательный.
 *
 *  Поэтому решение живёт здесь, а не только на сервере: «сдался» — это
 *  состояние, у которого на странице комнаты не может быть законной причины.
 *  Кто именно сдался и почему — вопрос второй.
 *
 *  Пауза растёт (1с → 2с → 4с → 5с), потому что причина отказа может быть
 *  надолго: не поднялась база, комната ушла в отказ по памяти. Пауза
 *  сбрасывается на каждом состоявшемся соединении, чтобы следующий обрыв
 *  начинал с быстрой попытки, а не с накопленного за урок хвоста. */

export const REVIVE_BASE_MS = 1000
export const REVIVE_MAX_MS = 5000

/** Пауза перед попыткой номер `attempt` (нумерация с нуля). */
export function reviveDelayMs(attempt: number): number {
  return Math.min(REVIVE_BASE_MS * 2 ** attempt, REVIVE_MAX_MS)
}

/** То немногое от `Socket`, что здесь нужно: сдался ли он и как его завести.
 *  Своим интерфейсом, а не типом socket.io, чтобы тест не поднимал сеть ради
 *  логики, в которой сети нет. */
export interface RevivableSocket {
  /** Флаг самого socket.io: false — менеджер больше не пытается. */
  readonly active: boolean
  connect(): void
}

export interface Timers {
  set: (fn: () => void, ms: number) => number
  clear: (id: number) => void
}

const DEFAULT_TIMERS: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: id => window.clearTimeout(id),
}

/** Уход самой страницы: эффект в Room размонтируется и зовёт
 *  `socket.disconnect()`. Единственный случай, когда «сдался» — это то, чего
 *  мы и хотели. */
const CLIENT_INITIATED = 'io client disconnect'

export interface SocketRevival {
  /** `socket.on('disconnect')`. */
  noteDisconnect(reason: string): void
  /** `socket.on('connect_error')`. */
  noteConnectError(): void
  /** `socket.on('connect')`. */
  noteConnect(): void
  /** Снять запланированную попытку — вызывать до `socket.disconnect()` в
   *  очистке эффекта, иначе таймер заведёт сокет уже покинутой комнаты. */
  cancel(): void
}

export function createSocketRevival(
  socket: RevivableSocket,
  timers: Timers = DEFAULT_TIMERS,
): SocketRevival {
  let attempt = 0
  let timer: number | null = null

  const cancel = () => {
    if (timer === null) return
    timers.clear(timer)
    timer = null
  }

  const schedule = () => {
    // Уже сдался и уже запланировано — второе событие (а `connect_error` и
    // `disconnect` умеют приходить парой) не должно ни ускорять попытку, ни
    // заводить вторую.
    if (timer !== null) return
    const delay = reviveDelayMs(attempt++)
    timer = timers.set(() => {
      timer = null
      // Перепроверка не формальность: за время паузы сокет мог ожить сам —
      // например, страница вернулась из фона и socket.io успел раньше.
      if (!socket.active) socket.connect()
    }, delay)
  }

  return {
    noteDisconnect(reason) {
      if (reason === CLIENT_INITIATED) return
      // Обычный обрыв: socket.io переподключается сам и делает это лучше —
      // с собственным бэкоффом и джиттером. Вмешиваться незачем.
      if (socket.active) return
      schedule()
    },
    noteConnectError() {
      if (socket.active) return
      schedule()
    },
    noteConnect() {
      attempt = 0
      cancel()
    },
    cancel,
  }
}
