import * as Sentry from '@sentry/react'

import { diagLog } from '../../lib/diagLog'
import { isSlowOpen, stagesLine, type OpenReport } from './openTiming'

// (#487) Отправляющая половина замера входа. Что произошло, решает
// `openTiming.ts`; здесь только что с этим делать — то же разделение, что у
// #474 (`restoreReport.ts` / `reportRestore.ts`).

/** Одна категория на все крошки о входе: «как открылась комната» должно
 *  доставаться одним фильтром. */
const BREADCRUMB_CATEGORY = 'room.open'

/** Комнаты, по которым в этой сессии уже отчитались. Дедуп по комнате, а не по
 *  имени события: медленный вход в одну комнату и медленный вход в другую —
 *  две разные новости, а второй медленный вход в ту же самую за одну сессию
 *  почти всегда тот же самый факт. Квота бесплатного тарифа Sentry реальна,
 *  см. #177. */
const reportedRooms = new Set<string>()

/** Записывает, как открылась комната, и поднимает событие, когда это перестало
 *  быть похоже на загрузку.
 *
 *  Крошка остаётся всегда, включая быстрый вход, и это та половина, которая
 *  окупается на поломках, которых мы не предвидели: чужое исключение через
 *  десять секунд после входа теперь приезжает с тем, как эта комната
 *  открывалась. Ровно этот вопрос пришлось задавать в разборе #486, и ответа
 *  на него не было. */
export function reportRoomOpen(roomId: string, report: OpenReport, gpu?: unknown): void {
  // Всегда, а не только когда медленно, и именно через diagLog: на планшете
  // девтулзов нет, а этот буфер уезжает в кнопку «скопировать логи». Когда
  // преподаватель говорит «открывалось долго», ответ должен уже лежать на
  // устройстве, а не собираться заново.
  diagLog(`open ${report.outcome} ${Math.round(report.totalMs)}ms`, stagesLine(report), report.facts)

  Sentry.addBreadcrumb({
    category: BREADCRUMB_CATEGORY,
    level: report.outcome === 'stalled' ? 'warning' : 'info',
    message: `open ${report.outcome} ${Math.round(report.totalMs)}ms`,
    data: { roomId, reached: report.reached, stages: stagesLine(report), ...report.facts },
  })

  if (!isSlowOpen(report)) return
  // Дедуп ставится до отправки, а не после: у застрявшего входа будильник
  // может сработать раньше, чем финиш, и оба отчёта — про один и тот же вход.
  if (reportedRooms.has(roomId)) return
  reportedRooms.add(roomId)

  Sentry.captureMessage(
    report.outcome === 'stalled'
      ? 'room open did not finish'
      : 'room open slower than threshold',
    {
      level: report.outcome === 'stalled' ? 'error' : 'warning',
      tags: { roomId, openOutcome: report.outcome, openReached: report.reached },
      extra: {
        totalMs: Math.round(report.totalMs),
        stages: Object.fromEntries(
          Object.entries(report.stages).map(([k, v]) => [k, Math.round(v as number)]),
        ),
        ...report.facts,
        gpu,
      },
    },
  )
}

/** Тестовый шов: дедуп живёт на модуле, а модуль в vitest один на файл. */
export function _resetOpenReports(): void {
  reportedRooms.clear()
}
