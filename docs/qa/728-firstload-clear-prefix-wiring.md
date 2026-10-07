# #728: ограниченное включение clear-prefix в настоящем Room

База: cd56ac8e. Изменяется только передача существующего opt-in в Room:
`?qaClearPrefixElision=1` при `import.meta.env.DEV`. Production, обычный URL и
все остальные значения оставляют OFF. Журнал, формат операций, сервер и физические
операторы не меняются. Опция не записывается в настройки пользователя.

## Доказанная лишняя работа

В immutable KJc0OoVo seq1–47 до layer_clear seq11 находятся 9 watercolor strokes.
Один уже исключает undoneInBatch; existing clearedInBatch может не рисовать ещё 8.
Все операции всё равно append в журнал. Общие gesture/wash через clear, неполный
prefix, structural readers, redo/revoke и неизвестные слои исключают оптимизацию.
Source cd56 уже содержит эти ограничения, но production Room не передавал флаг.

Предыдущий ordinary Room OFF: 52.315 секунд, 39 paint calls; обычный snapshot
reentry 5.017 секунд и 0 paint calls. Standalone Samsung OFF/ON 41.115/35.359 секунд,
17 material maps exact и Undo/Redo exact доказывают ограниченный replay, а не
ускорение настоящей загрузки Room. Это разные сценарии и версии исходников.
Примерно 14% экономии standalone не закрывает общую задачу загрузки.

## CPU проверка

20 tests / 4 files PASS (clear-prefix planner, actual restore, hook forwarding,
DEV-only query). Новый actual-engine случай удерживает подтверждённый peer undo
во время append prefix. При release проверяется пустой replay-local skipped set,
полный `_log.entries`, undone target и вызов реального rebuild. Остальные cases
сохраняют проверку Undo clear / Redo clear с прежней историей. Проверяется, что
restore не переписывает latestKnownSeqRef. getOperations возвращает done subset;
для проверки полного журнала используется `_log.entries`.

Лог: private `temp/cpu/clear-prefix-wiring.log`. `git diff --check` PASS.
Полный TypeScript требует root real-deps QA; hardware ещё НЕ запускался.

## Обязательный следующий ordinary Room gate

Одно и то же immutable47 без snapshot и pruning, одинаковые paper/page/source;
новые собственные комнаты для OFF и DEV opt-in ON. Сверять authoritative seq/IDs,
actual paint calls 39→31, whole nonempty RGBA и idle отдельно от network/restore.
Последующие Undo/Redo фактических target IDs (ожидаемые seq48/49 проверять по ACK),
peer arrival во время replay, полный журнал и snapshot watermark должны совпасть.
Ordinary reconnect и latejoin после stored seq49 — без повторного пропуска history,
whole PNG против full-journal fresh oracle. Snapshot HTTP index/blob/coverage
сверяются отдельно; правило существующего snapshot/catchup остаётся OFF.

Никакой claim ordinary ON load/peer/whole material PASS до этого hardware gate.
Следующие контакты/solver оптимизирует profiler; данный commit не меняет их cadence.
