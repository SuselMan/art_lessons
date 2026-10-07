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

Уточнение watermark: CPU held-peer handler только append/rebuild, он не является
production confirmedStreamHandler и не advances latestKnownSeqRef. Проверка неизменного
head3 не доказывает правильность watermark после peer4. Hardware peer runner теперь
до Redo49 разрешает настоящую публикацию B и требует POST200/index48; без этого gate
не принимается. First-load основной runner отдельно проверяет index49. Peer waveform
не обещает snapshot49, потому что уже сохранённый48 не обязан обновляться до100.

## Повторный CPU review перед аппаратным слотом

21 targeted tests /4 files PASS; own web closure TS0, session30032 EXIT0.
Новый тест подключает настоящий createConfirmedStreamHandler к настоящему restore:
при seq4 Undo gate удерживает watermark3; после end() ref становится4, исходный
prefix/Undo остаются в полном journal, clear undone, requestFirstSnapshot вызывается
после release, onSeqObserved получает0→4. Это устраняет ограничение прежнего mock
handler; HTTP48/49 аппаратное доказательство всё ещё отдельно обязательно.

Исправлены конкретные fixture ошибки: raw immutable47 — массив, а не только `{ops}`;
реальное поле diagnosticCostDomainPaths вместо вымышленного diagnosticCostPaths.
Проверяются ВСЕ доступные scheduling/physics diagnostics OFF, async/materialfalse.
Transparent PNG guard теперь отклоняет empty, полностью opaque paper и чистую серую
воду: требуются partial alpha support и coloured alpha>=16. Это не P-field mass claim.

Переносимые контроллеры сохранены tracked `docs/qa/harness/728-firstload`:
controller.mjs ordinary47/Undo48/Redo49/snapshot49/reentry; peer-arrival.mjs отдельный
2auth actual-arrival waveform/index48 доRedo. Guard controls8 PASS; оба CPU dry-run
на исходном raw journal PASS, SHAdec30b3a6399c3835819b71fa651cd41f213394ff4bba6f51a7df30292ca1266.
Новая immutable исходная manifest подготовлена private source-passport.json:940
tracked web/shared files. Это SHA исходников ownworktree, НЕ verified HOME runtime.

Следующие safe actions: root review единственного DEV wiring; затем по GPU grant
отдельный own immutable runtime с exact HTTP module SHA/940manifest и syncbaseline.
Первый hardware ordinary OFF/ON последовательно (1engine); после его успешного
полного endpoint/snapshot49/reentry — независимый peer48 waveform (2auth/2engines).
Индекс49 не позволяет заново измерить snapshotless47 в том же room: два плеча
создают две собственные комнаты и сохраняют тот же материальный payload.
Без успешного whole/ACK/nonempty аппаратного результата не включать ON пользовательскому
стенду и не переносить прежние standalone14% в claim ordinary Room load.

## Изолированный runtime готов, аппаратный gate ожидает Vega

Own HOME5341 PID1416563, immutable `680-puddle-outline/temp/firstload-sync-f0b784ed`:940 исходных SHA exact, HTTP raw engine/useRoomRestore/helper exact, create200,7 paper SHA, authenticated clients[]. Runtime источник44/f0; QA config явно направляет @shared в свою копию, backend4539 общий существующий. Это временный QA стенд; пользовательские5329/5339 не менялись. CPU dry-run47/head47/SHAdec30b PASS. ACK/seq, bitmap и snapshot49 ещё не доказаны. `guards.test.mjs` принимает QA_INPUT; default приватный VPS fixture сохраняется для текущей рабочей среды.
