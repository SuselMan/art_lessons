# Исторический replay: узкий кооперативный путь (план, не реализация)

Причина: appendOperation разрешает spread только remote && displaySuspendDepth===0. restoreRoomState держит suspendDisplay весь replay. Поэтому asyncFinish не меняет стоимость одной исторической операции; yield между операциями не разбивает её GPU работу.

Предлагаемый контракт: отдельный awaitable historical apply, лог append ровно один раз, display suspension сохраняется. Для watercolor запускается существующий sliced ribbon generator. Promise завершается только после deposition, land и всех порождённых физических settle/finish continuation этой операции, не после первой slice. Следующая историческая операция стартует строго после него. Остальные инструменты остаются на существующем пути.

Нельзя просто вызвать _paintOpOverFrames: текущий метод void, его land запускает последующее физическое завершение, а отсутствие scratch приводит к синхронному drain. Нужен completion token с epoch и явным результатом completed/cancelled/failed; потеря context/destroy не должна разрешать Promise как успешную покраску. Пустой auxiliary recipient определяется cache identity, не наличием tiles.

Room сохраняет replayGate, unpaintedInBatch, authoritative seq и per-op failure accounting до окончания await. Store ready и snapshot boundary не открываются при pending token. Поступившие live/confirmed ops остаются в replayGate FIFO. Исторический prefix, уже покрытый snapshot, восстанавливается логически существующим restoreHistoricalOperations без повторной покраски.

Scheduler должен продвигать физические slices и при suspendDisplay; presentation пропускается, не материал. RAF скрытой вкладки может заморозить загрузку: использовать существующий кооперативный scheduler/yield механизм с ограниченным GPU quantum, а не обещать отзывчивость по CPU submission. Последний resumeDisplay один раз после всех операций.

Гейты: exact full P/C/V/coverage + wholeRGBA same journal immediate/cooperative; 47 ops cold/warm actual inputReady; arrivals during replay; Undo/Redo and unpainted revocations; snapshot failure; actual loss/epoch cancellation and replay retry. Нет реализации до review.
