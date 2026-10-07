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

## Синхронная база после отката пользовательского стенда

Кандидат перенесён без конфликтов на 27ee2f12 в отдельный worktree
`728-firstload-sync`, commit 44b00a7c. Room asyncFinish=false и
materialPresentation=false сохраняются. При A/B меняется только query option;
никакие shader/scheduler flags не включаются. Первоначальная база cd56 — только
история CPU диагностики, её async ON не используется для следующего hardware.

Private CPU-ready runner: `temp/ordinary-room-sync/controller.mjs` и
`room-probe.js`. Нужны явные QA_URL, QA_SOURCE_PASSPORT, QA_INPUT, WC_RELEASE_ROOT
и QA_GPU_GRANT; без них запуск запрещён. Одна Chrome/context, engines последовательно,
RAM preflight1700/abort500, outer900s; finally закрывает собственные страницы/Chrome.
Actual ordinary Create/Join/socket ACK, original A4/Fine47, Undo48/Redo49 и normal
stored rejoin проверяются whole PNG. Есть source HTTP SHA, исходный input SHA,
flags async/material=false, stored index49 и ненулевые blob200. Bake временно
заблокирован только для собственного measured snapshotless arm; затем возвращается
реальный normal first snapshot policy, без uploader-force.

Это replay исходных packed операций в настоящем Room, не native pen benchmark.
Held peer arrival сейчас CPU доказан; отдельный actual peer hardware остаётся
обязательным до полного принятия оптимизации. GPU ещё не запускался.

## Собственный TypeScript и actual peer controller

Own web closure TS (include own src/landing, own shared, существующие root real-deps)
EXIT0, 0 ошибок: `temp/cpu/web-closure.tsconfig.json`, `web-types.log`.
Никаких install/symlink и изменений root config.

Отдельный private `peer-arrival.mjs` готов для OFF/ON, два раздельных auth contexts,
не более двух engines одновременно. Автор A сохраняет исходные47 ACK; читатель B
идёт обычным join. После реального начала setUnpaintedInBatch A отправляет Undo clear
через свой engine/network callback. Пассивный listener реального WebSocket сохраняет
только ID/seq/clock/count конкретного QA Undo, без URL/auth/полного wire payload.
Обязательный guard: операция48 действительно получена при suspended display,
активном skipped set и неполном prefix (<47). Не удалось попасть в окно — это
INCONCLUSIVE fixture, не peer PASS. Прямая подача operation читателю запрещена.

После release оба клиента: full sequential ACK48, clear undone, meaningful Undo
pixel delta и whole A/B exact. Redo49 возвращает original47 endpoint exact.
Затем обычный first snapshot49, ненулевой blob, fresh stored rejoin exact. OFF/ON
сравниваются также между собой. Проверка parser трёх scripts `node --check` PASS;
реальные timing/arrival/bitmap результаты ещё отсутствуют. На hardware отдельно
повторить RAM preflight и source passport; runtime/stand пока не изменены.
