# DEV queued local history — review candidate

Private `_queuedLocalHistoryDev=false`, runtime DEV gate. Нет constructor/query/UI opt-in, нет аппаратной проверки или рекомендации включать. OFF сохраняет обычный synchronous Undo/Redo.

Intent выбирает exact target/control ID один раз и входит в существующую FIFO. До natural material boundary нет log mutation, PaperWet forgetting, local callback/outbox emission. Repeated Undo/Redo возвращают null busy, source DOWN refused. `getOperations` не рекламирует unemitted intent как done. Export/review/preview/snapshot/fullreplay/checkpoints failclosed. Когда существующий rAF drain допускает применение, используется обычный _appendOperationNow; acceptance callback и serverseq semantics остаются после material.

_flushOpQueue callers проверены: appendOperation раньше queues pending intent + arriving operations; suspendDisplay отклонён explicit busy exception до incrementdepth; contextloss отменяет unemitted intent перед обычным journal flush. Destroy тоже отменяет unemittedintent. Остальные alreadyaccepted source операции остаются.

Target gate: только stroke gesture; structural Undo/Redo остаётся исходным synchronous путём с существующим UI confirmation. DEV getQueuedHistoryStatus возвращает read-only metadata.

Failure: exact request outcome failed сохраняется, pending не исчезает молча; queued drain rAF cancelled/stopped. Если materialthrow произошёл до acceptance callback, owner-bound opaque OperationLog checkpoint восстанавливает ТОЧНЫЕ pre-existing gesture entry states/per-layer counts; только собственный unconfirmed control tombstoned, revision monotonic. Нет broad applyInverse, foreign/stale/intervening witnesses rejected. После callback accepted control не откатывается. Failure blocks source/export/drain даже через contextloss; cure не обещается автоматически. Explicit DEV recoverQueuedHistoryMaterial, только own idle/no-input/no-settle boundary, восстанавливает affected layer pixels из canonical journal существующим rebuild, ждёт jobs/settle; лишь после этого снимает failure и возобновляет retained remoteFIFO. Timeout/throw возвращаетfalse и сохраняет HOLD. Аппаратной проверки recovery нет.

33 actualEngine CPU tests PASS включают baseline synchronous emissionorder, queued exactidentity/no duplicate/no forceddrain/newsource refusal/export gate/PaperWet timing, FIFO peer identity, CPU material parity Undo/Redo, contextloss+restore/destroy cancel onlyunemittedintent, failure sentinel explicitstatus/inverse target, accepted callbackthrow preservation, existing rAF drain wait/application. CPU mock GL parity не доказывает реальные GPU поля или производительность.

Ограничения: пока API null busy и internal request outcome; UI pending indicator не подключён. Prototype не решает стоимость history repair после natural boundary; цель — не forceddrain в click. Требуется root review error rollback/meta journal/confirmation race и real rAF protocol прежде UI/device rollout.

Outcome `accepted` не означает published: `materialIdle` отдельный conservative witness jobs/settle/canonical/queue/context lifecycle. Snapshot serverwatermark readiness остаётся отдельным существующим контрактом. Backfilled mixedstate fixture использует prependHistorical API; underlying SnapshotIO inconsistency не исправлялась.

## Async repair error boundary

DEV prototype tracks request→affected layers and exact RebuildJob identity. Only those jobs gain an error catcher; OFF and foreign jobs retain original throwing behavior. Accepted repair keeps new source/controls/publication gated until owners finish. A failed owned job stops queued drain rAF, retains the accepted control (no rollback), cancels only its own timer/buffers using existing rebuild cancellation, and cancels a settle only when that exact job owns it. Status becomes failed. Explicit recovery reconstructs affected canonical layers, retaining remoteFIFO; failure-epoch guard refuses recovery if its new job fails again. Loss/destroy release owner map and preserve accepted journal.

Validation: whole targeted suite50 PASS (34 engine +2 exact-log transaction +14 parser), then added loss/destroy async lifecycle test1 PASS (engine now35); app TypeScript PASS. Actual sliced job fixture validates accepted→async exception→failed→no loop→remoteFIFO→explicit recovery; OFF rethrows same sentinel and keeps original job. Lifecycle fixture forces slicing to keep an actual owned job pending through loss/destroy. No hardware/GPU/performance claim, no manual stand opt-in.

## Repair-owner FIFO boundary review correction

appendOperation and _flushOpQueue now also hold for owned async repair; flush checks the boundary again after EACH queued op, because its application may create a repair. materialIdle includes owners and pending rebuilds. Normal cancellation releases only the exact matching job/request marker; restarting transfers it to the new generation, and an obsolete job cannot clear the replacement owner.

Validation52/52 PASS (engine36, logtransaction2, parser14), app TypeScript PASS. Actual-job CPU fixture performs its first repair slice with a controlled budget clock solely to retain the slice boundary (no perf/pixelclaim), then remote pencil+layer_delete must remain FIFO and cannot destroy the live owner. Restart→obsolete-step→cancel preserves/releases exact ownership; final queued application order matches source IDs. No UI/device activation.
