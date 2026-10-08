# #728: аудит загрузки настоящего WebGL Room, 08.10.2026

Read-only аудит текущего root; никаких новых runtime изменений. Нативная bounded сцена не подключена к обычному Room и её ускорения не относятся к его загрузке.

## Что действительно доказано

Предыдущий этап 07.10: первый вход без snapshot занимал 52.315 с / 39 paint calls; повторный со snapshot — 5.017 с / 0 paint calls. Это исторический конкретный прогон, не нынешний production SLA. Позднее отдельный stored48 gate дал cold/warm input-ready 1615.4/1152.3 мс, restoreLayerFromSnapshot 55/70 мс; bitmap wholeRGBA exact0 относительно независимого full48 replay, 1 578 930 непустых pixels, GL0. Штатный uploader сохранил snapshot48, blob HTTP200 / 3 244 431 bytes. При готовности было 6 dependency ops, обычный backfill затем довёл журнал до48.

Источники: [отчёт прошлого этапа](728-night-report-20261007.md), разделы «actual47-op stored snapshot load PASS» и «ordinary firstload engine-free47»; private raw `temp/night-728/load-current/stored-load-report.json`, `728-firstload-sync/temp/surface-unit/engine-free-reader-1791390150/report.json`.

Clear-prefix candidate по-прежнему не доказал ускорения обычного Room: standalone Samsung 41.115→35.359 с и material/UndoRedo exact не заменяют Room gate. В последнем ordinary trace было47 append /39 paint; opt-in не достиг ветки: latestKnownSeq=0 при replayTail47. Timeout ожидания click30 с не доказывает engine failure, endpoint bitmap не снят. [Контроль и ограничения](728-firstload-clear-prefix-wiring.md).

За ночь 07→08 текущий [night report](728-night-2026-10-08.md) оставляет реальную загрузку Room открытой. Измеренные static cache и bounded scheduling относятся к WebGPU bounded scene. Перенос общего settle planner и CPU trace equivalence также не являются новой скоростью Room. Нет нового завершённого ordinary snapshotless OFF/ON gate, который можно честно назвать решением загрузки.

## Реальный путь

1. Socket room_state может ожидать создания engine. [engineWiring](../../apps/web/src/pages/Room/engineWiring.ts) сначала ждёт paperReady, затем вызывает restore.
2. [restoreRoomState](../../apps/web/src/pages/Room/restoreRoomState.ts) держит replayGate и suspendDisplay. Если snapshot впереди, восстанавливается индекс и пиксели; противоречивый/неудачный snapshot означает явный failure, не replay одного хвоста на пустой лист.
3. [snapshotRestore](../../apps/web/src/pages/Room/net/snapshotRestore.ts) загружает compressed blobs ограниченно параллельно; inflate/decode/applyLayer выполняются последовательно по слоям, чтобы не держать все распакованные RGBA одновременно. Исторический dependency prefix восстанавливается отдельно от pixel tail.
4. Images preload, затем tail applyRemoteOp→appendOperation. Уже отменённые операции остаются в журнале, но могут не рисоваться. Restore уступает event loop между операциями после100 мс; одна тяжёлая watercolor операция этим бюджетом не ограничена.
5. В [engine/index.ts](../../apps/web/src/engine/index.ts) appendOperation выбирает spread только для remote при displaySuspendDepth===0. Historical restore держит suspend, поэтому _paintDabs и осадок проходят синхронным историческим путём. Предыдущий asyncFinish experiment дал12.797/12.435 с против~12.5 с и не доказал ускорения именно по этой причине.
6. Undo/revoke/redo могут вызвать deferred rebuild. resumeDisplay запускает pending rebuilds; watercolor rebuild выбирает checkpoint, создаёт fresh buffer и sliced job, затем _applyPixelOp. Это отдельный путь: скорость append не доказывает скорость undo replay.
7. Restore синхронизирует store, объявляет content-ready; history backfill может продолжаться. Первая snapshot публикация запрашивается после snapshotless restore и ждёт publishable слоя. Content-ready, полный журнал для Undo и завершённый GPU job нельзя считать одной метрикой.

## Три ближайших изменения с наименьшим риском

1. **Довести existing clear-prefix guard до реального immutable47 Room gate.** Сначала зафиксировать порядок watermark в hook/restore и доказать полноту authoritative prefix; не удалять equality без замены доказательства. Применять только DEV opt-in и существующие отрицательные случаи. Успех:39→31 paint calls, меньше snapshotless input-ready; полный журнал47/author ACK/Undo48/Redo49, bitmap exact, stored snapshot/reentry и actual held peer arrival. Это устраняет заведомо стёртую работу без новой математики краски.
2. **Измерить и сократить лишнюю работу snapshot fast path.** На текущей большой комнате отдельно собрать index/blob bytes и wall fetch, inflate/decode, applyLayer/upload, dependency history, tail watercolor count/time, resume/rebuild, input-ready и full-history-ready. Проверить, почему нет свежего publishable snapshot или почему хвост велик, пользуясь существующими uploader/gates; не обходить wet/pending/watermark guards. Уже известный выигрыш snapshot-path намного больше операторных процентов, но его доступность именно для текущей комнаты ещё не доказана. Фикс выбирать только после атрибуции (например повторный запрос/декодирование неизменного blob), с exact material и Undo covered-prefix gate.
3. **Пропуск доказанно нулевых/неизменных операторов в historical replay, по существующим guard contracts.** Начать с измерения счётчиков уже имеющихся zero-pigment/contact-cache веток на immutable47, а не переносить WebGPU cache по аналогии. Предыдущий pure-water standalone пропуск дал solver10.568→4.337 с, но это не смешанная комната. Новый пропуск возможен только при доказанных P/C zero, сохраняет water/front и все Q8 границы; контроль loaded pigment/foreign wet/два цвета/Undo/peer обязателен. Если hit ratio мал, оставить OFF и не расширять scope.

Для каждого кандидата один и тот же journal/paper/source, отдельные snapshotless и stored плечи, холодный/тёплый запуск, RGBA+alpha endpoint и real ACK. Не создавать дополнительный readPixels в измеряемом вводе. Этот документ не утверждает, что какой-либо из трёх кандидатов уже исправлен.
