# DEV queued local history — review candidate

Текущий candidate: private `_queuedLocalHistoryDev=false`, explicit DEV constructor/query `wcQueuedHistory=1`; PROD игнорирует flag. OFF сохраняет ordinary synchronous Undo/Redo. Один малый actual Surface UI/material gate прошёл (ниже); это не доказательство ускорения или восстановления после реальной GPU ошибки. Старые этапы review ниже отражают последовательность разработки.

Intent выбирает exact target/control ID один раз и входит в существующую FIFO. До natural material boundary нет log mutation, PaperWet forgetting, local callback/outbox emission. Repeated Undo/Redo возвращают null busy, source DOWN refused. `getOperations` не рекламирует unemitted intent как done. Export/review/preview/snapshot/fullreplay/checkpoints failclosed. Когда существующий rAF drain допускает применение, используется обычный _appendOperationNow; acceptance callback и serverseq semantics остаются после material.

_flushOpQueue callers проверены: appendOperation раньше queues pending intent + arriving operations; suspendDisplay отклонён explicit busy exception до incrementdepth; contextloss отменяет unemitted intent перед обычным journal flush. Destroy тоже отменяет unemittedintent. Остальные alreadyaccepted source операции остаются.

Target gate: только stroke gesture; structural Undo/Redo остаётся исходным synchronous путём с существующим UI confirmation. DEV getQueuedHistoryStatus возвращает read-only metadata.

Failure: exact request outcome failed сохраняется, pending не исчезает молча; queued drain rAF cancelled/stopped. Если materialthrow произошёл до acceptance callback, owner-bound opaque OperationLog checkpoint восстанавливает ТОЧНЫЕ pre-existing gesture entry states/per-layer counts; только собственный unconfirmed control tombstoned, revision monotonic. Нет broad applyInverse, foreign/stale/intervening witnesses rejected. После callback accepted control не откатывается. Failure blocks source/export/drain даже через contextloss; cure не обещается автоматически. Explicit DEV recoverQueuedHistoryMaterial, только own idle/no-input/no-settle boundary, восстанавливает affected layer pixels из canonical journal существующим rebuild, ждёт jobs/settle; лишь после этого снимает failure и возобновляет retained remoteFIFO. Timeout/throw возвращаетfalse и сохраняет HOLD. Аппаратной проверки recovery нет.

33 actualEngine CPU tests PASS включают baseline synchronous emissionorder, queued exactidentity/no duplicate/no forceddrain/newsource refusal/export gate/PaperWet timing, FIFO peer identity, CPU material parity Undo/Redo, contextloss+restore/destroy cancel onlyunemittedintent, failure sentinel explicitstatus/inverse target, accepted callbackthrow preservation, existing rAF drain wait/application. CPU mock GL parity не доказывает реальные GPU поля или производительность.

Ограничения: пока API null busy и internal request outcome; UI pending indicator не подключён. Prototype не решает стоимость history repair после natural boundary; цель — не forceddrain в click. Требуется root review error rollback/meta journal/confirmation race и real rAF protocol прежде UI/device rollout.

Outcome `accepted` не означает published: `materialIdle` отдельный conservative witness jobs/settle/canonical/queue/context lifecycle. Snapshot serverwatermark readiness остаётся отдельным существующим контрактом. Backfilled mixedstate fixture использует prependHistorical API; underlying SnapshotIO inconsistency исправлена отдельно интеграцией atomic backfill в `3c774a5d`.

## Async repair error boundary

DEV prototype tracks request→affected layers and exact RebuildJob identity. Only those jobs gain an error catcher; OFF and foreign jobs retain original throwing behavior. Accepted repair keeps new source/controls/publication gated until owners finish. A failed owned job stops queued drain rAF, retains the accepted control (no rollback), cancels only its own timer/buffers using existing rebuild cancellation, and cancels a settle only when that exact job owns it. Status becomes failed. Explicit recovery reconstructs affected canonical layers, retaining remoteFIFO; failure-epoch guard refuses recovery if its new job fails again. Loss/destroy release owner map and preserve accepted journal.

Validation: whole targeted suite50 PASS (34 engine +2 exact-log transaction +14 parser), then added loss/destroy async lifecycle test1 PASS (engine now35); app TypeScript PASS. Actual sliced job fixture validates accepted→async exception→failed→no loop→remoteFIFO→explicit recovery; OFF rethrows same sentinel and keeps original job. Lifecycle fixture forces slicing to keep an actual owned job pending through loss/destroy. No hardware/GPU/performance claim, no manual stand opt-in.

## Repair-owner FIFO boundary review correction

appendOperation and _flushOpQueue now also hold for owned async repair; flush checks the boundary again after EACH queued op, because its application may create a repair. materialIdle includes owners and pending rebuilds. Normal cancellation releases only the exact matching job/request marker; restarting transfers it to the new generation, and an obsolete job cannot clear the replacement owner.

Validation52/52 PASS (engine36, logtransaction2, parser14), app TypeScript PASS. Actual-job CPU fixture performs its first repair slice with a controlled budget clock solely to retain the slice boundary (no perf/pixelclaim), then remote pencil+layer_delete must remain FIFO and cannot destroy the live owner. Restart→obsolete-step→cancel preserves/releases exact ownership; final queued application order matches source IDs. No UI/device activation.

### Малый Surface UI gate, 2026-10-09

Source `1788fa89`, DEV `qaJoinedTouch=1&wcQueuedHistory=1`, mixed lease OFF.
Один actual Room/PointerInput сценарий кистью24: первый мокрый пигментный штрих
досох естественно; второй имел pending settle перед actual Undo. Контрол принят
ровно один раз с точным target `ewReexssFC`, затем canonical idle. Whole1024RGBA
после Undo совпал с baseline; actual Redo изменил материал. Повтор Undo/Redo на
том же target восстановил ровно обе исходные whole SHA. GL error0/context alive.
Accepted и materialIdle записаны отдельно; никакого forced settle/clock override.
Это функциональный/material gate одной комнаты, не latency/performance доказательство.
No-input loopback URL infra error сохранён отдельно, исправлен до рисования.
Summary `queued-history-small-ui-surface-summary.json`; контекст/forward закрыты,
после cleanup SurfaceRAM1468MiB, ниже допуска следующего аппаратного запуска.

### Manual candidate готовность

Runtime source `3c774a5d` проверен на existing5381 по served SHA для Engine,
OperationLog, SnapshotIO, Room и strict flag parser. URL suffix:
`?qaJoinedTouch=1&wcMixedLease=1&wcQueuedHistory=1` (baseline: без двух wc flags).
Собственный VPS standalone64 canvas через реальные импортированные parser/constructor
подтвердил joinedTouch+mixedLease+queuedHistory ON, async/deferred OFF, active input OFF,
GL0/context alive. Контекст закрыт. Software Room restore probe истёк по hard45 без
рисования; это сохранённый infra/software limitation, не Room correctness PASS.
Пользовательскую manualroom и её вкладку не открывал/не перезагружал. Новых сервисов,
backend или аппаратных запусков не было.

Что смотреть вручную: следующий мокрый штрих, Undo во время досыхания и Redo.
Queued Undo ждёт natural material boundary; новый штрих/повторный history control во
время pending отклоняется busy. UI indicator пока не добавлен. Нет доказательства
physical latency, крупной кисти400, нескольких peers или hardware failure recovery
для объединённой конфигурации. Малый Surface UI PASS проверял queuedHistory с mixedLease OFF;
mixedLease имеет отдельное прежнее material/performance evidence.
