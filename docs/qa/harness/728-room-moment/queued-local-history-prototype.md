# DEV queued local history — review candidate

Private `_queuedLocalHistoryDev=false`, runtime DEV gate. Нет constructor/query/UI opt-in, нет аппаратной проверки или рекомендации включать. OFF сохраняет обычный synchronous Undo/Redo.

Intent выбирает exact target/control ID один раз и входит в существующую FIFO. До natural material boundary нет log mutation, PaperWet forgetting, local callback/outbox emission. Repeated Undo/Redo возвращают null busy, source DOWN refused. `getOperations` не рекламирует unemitted intent как done. Export/review/preview/snapshot/fullreplay/checkpoints failclosed. Когда существующий rAF drain допускает применение, используется обычный _appendOperationNow; acceptance callback и serverseq semantics остаются после material.

_flushOpQueue callers проверены: appendOperation раньше queues pending intent + arriving operations; suspendDisplay отклонён explicit busy exception до incrementdepth; contextloss отменяет unemitted intent перед обычным journal flush. Destroy тоже отменяет unemittedintent. Остальные alreadyaccepted source операции остаются.

Target gate: только stroke gesture; structural Undo/Redo остаётся исходным synchronous путём с существующим UI confirmation. DEV getQueuedHistoryStatus возвращает read-only metadata.

Failure: exact request outcome failed сохраняется, pending не исчезает молча. Если materialthrow произошло до acceptance callback, control tombstoned и history target восстановлен inverse CPU API; stale material publication/source/queue drain блокированы до context restore. Callback boundary recorded: если уже вступили в local acceptance callback, нельзя откатить possibly-emitted control даже при callbackthrow. Это восстановление после исключения требует дальнейшего review; автоматического GPU repair/callback retry нет. FIFO arriving remote ops сохраняются для contextloss/restore, не отбрасываются.

30 actualEngine CPU tests PASS включают baseline synchronous emissionorder, queued exactidentity/no duplicate/no forceddrain/newsource refusal/export gate/PaperWet timing, FIFO peer identity, CPU material parity Undo/Redo, contextloss+restore/destroy cancel onlyunemittedintent, failure sentinel explicitstatus/inverse target, accepted callbackthrow preservation, existing rAF drain wait/application. CPU mock GL parity не доказывает реальные GPU поля или производительность.

Ограничения: пока API null busy и internal request outcome; UI pending indicator не подключён. Prototype не решает стоимость history repair после natural boundary; цель — не forceddrain в click. Требуется root review error rollback/meta journal/confirmation race и real rAF protocol прежде UI/device rollout.
