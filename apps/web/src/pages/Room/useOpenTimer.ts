import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { PencilEngineAPI } from '../../engine'
import { SLOW_OPEN_MS, createOpenTimer, type OpenTimer } from './diagnostics/openTiming'
import { reportRoomOpen } from './diagnostics/reportOpen'

export interface OpenTimerDeps {
  /** The URL id the report is filed under — whatever it is at report time. */
  id: string | undefined
  engineRef: RefObject<PencilEngineAPI | null>
}

/** (#487, #493) How long opening a room took, measured from the press that
 *  asked to go in to the moment the preloader went away — and the alarm that
 *  reports an open that never finishes. Out of Room. */
export function useOpenTimer({ id, engineRef }: OpenTimerDeps) {
  // (#487) Замер входа: от нажатия «войти» до момента, когда преклоадер ушёл.
  // Ref, а не состояние: между стартом и финишем комната перерисовывается
  // (гейт сменяется редактором, движок монтируется), и замер обязан это
  // пережить, ничего при этом не перерисовывая сам.
  const openTimerRef = useRef<OpenTimer | null>(null)
  // Будильник: снимает состояние, **не дожидаясь конца**. Половина, ради
  // которой всё и делается — вход, который не заканчивается, не сообщает о
  // себе ничем, см. openTiming.ts.
  const openAlarmRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Будильник переживает смену экрана внутри комнаты, но не сам уход из неё:
  // отчёт «вход не закончился» от размонтированной страницы — это отчёт о
  // человеке, который просто ушёл, и он был бы неотличим от настоящего.
  useEffect(() => () => {
    if (openAlarmRef.current !== null) { clearTimeout(openAlarmRef.current); openAlarmRef.current = null }
  }, [])

  /** (#487) Гасит будильник и отчитывается о завершившемся входе.
   *
   *  Число слоёв и `gpuInfo()` берутся здесь, а не на старте: на старте их
   *  ещё нет, а объясняют они ровно то, из-за чего вход бывает долгим — все
   *  слои поднимаются разом (#467), и упирается это в GPU устройства (#469). */
  // (#176) Both timers read the URL id through a ref rather than closing over
  // it. They are dependencies of the engine effect, and handleRoomState
  // rewrites the URL (a board id becomes its lesson's) in the same breath as
  // it seats the engine on the board — a callback keyed on `id` rebuilt the
  // engine right after its first mount had consumed the board's content, and
  // the second engine opened empty. The report is per open, not per URL, so
  // whatever the id is at finish time is the right one to file it under.
  const urlIdRef = useRef(id)
  urlIdRef.current = id
  const finishOpenTimer = useCallback((engine: PencilEngineAPI | null) => {
    const timer = openTimerRef.current
    if (!timer || timer.done) return
    if (openAlarmRef.current !== null) { clearTimeout(openAlarmRef.current); openAlarmRef.current = null }
    if (engine) timer.note({ layers: engine.liveLayerIds().length })
    const reportId = urlIdRef.current
    if (reportId) reportRoomOpen(reportId, timer.finish(), engine?.gpuInfo())
  }, [])

  /** (#487) Пускает замер входа и заводит будильник. Вызывается там, где
   *  человек нажал «войти», а не там, где сокет что-то отправил: меряем то,
   *  что он ждёт, а не то, что делает клиент. */
  const startOpenTimer = useCallback(() => {
    if (openAlarmRef.current !== null) clearTimeout(openAlarmRef.current)
    const timer = createOpenTimer(() => performance.now())
    openTimerRef.current = timer
    openAlarmRef.current = setTimeout(() => {
      openAlarmRef.current = null
      // Не гасит замер: вход продолжается, и если он всё-таки дойдёт до конца,
      // финиш об этом скажет. Дедуп по комнате в reportOpen следит, чтобы из
      // двух отчётов об одном входе уехал только первый.
      const reportId = urlIdRef.current
      if (!timer.done && reportId) reportRoomOpen(reportId, timer.stalled(), engineRef.current?.gpuInfo())
    }, SLOW_OPEN_MS)
  }, [engineRef])

  return { openTimerRef, startOpenTimer, finishOpenTimer }
}
