# Atomic full-room-prefix-v2 routing

V2 полный исходный read проходит тот же `restoreCanonicalEmptyRoom` transaction
sink, что V1 empty-history baseline. Перед display/replay side effects вызывается
`read.assertFullHistoryBase(originalTail)`; frame/undo/redo не разбираются на
частичный legacy replay. Наличие original owner, join/нулевой cursor, отсутствие
snapshot/pending previews и реальный engine/sink остаются обязательными.

Существующие post-await lifetime/replay-ticket guards, cursor/readiness publication
и запрет uploader для baseline распространяются на обе версии. Имя public sink
сохранено для совместимости; нового atom-loop или независимой транзакции нет.

Tests-first: R52/restore-full-v2-red.log — четыре новых success/yield tests упали
на прежнем `Canonical room restore sinks unavailable`. В restoreRoomState.test.ts
используется настоящий V2 preparer с завершённым frame + undo + redo. Проверяются
один вызов атомарного sink с исходным read/tail, отсутствие legacy replay/preload/
backfill/snapshot/uploader, правильный seq3/readiness, rejected copy/stale/catchup/
pending/missing sink до side effects и fail/stale/superseded при yield без ready.
V1 и legacy tests остаются в той же матрице.

Устройство/сервисы/временные сборки этим изменением не создавались. Room handlers,
sockets и server activation этим локальным routing не включаются.

Проверка: `restore-full-v2-green.log` — 34 restore tests PASS;
совместный `confirmed-close-restore-final.log` — 69 tests / 4 files PASS.
Scoped oxlint и `git diff --check` PASS.
