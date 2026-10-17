# #744: exclusive settle ownership, RCA pending

Изолированная база85e83641, prototype defaultOFF не менялся.
Аппаратный trace на AMD: capture1/hit1, computations11→11,
но pageerror `Native puddle target requires exclusive settle-field ownership`
и target/oracle5209 differing channels (max28). Отчёт не содержит timestamp/stack
ошибки или owner `_settle`, поэтому связь ошибки с cache-hit ещё не установлена.
Это не объявление исправления/ускорения.

Source facts:

- Единственный такой throw — `PuddleTarget.resetFromScratch`.
- `PuddleRoomController.start` увеличивает computations ДО resetFromScratch.
- `restoreUndo` не запускает target solver; он загружает material+готовый goal.
- `_appendOperationNow` до fold Undo дренирует `_completeSettle`.
  `WatercolorSettleQueue.complete` рекурсивно завершает continuations до null.
- `releaseResident` вызывает host.released, который очищает совпадающий `_wash`.
- Изолированный oracle временно `_puddle=null`, но `_settle` остаётся engine-global.
- В harness перед oracle cache/hidden flags принудительно не выключались.
- В accepted trace все101 stroke имеют M70 tag; prefix span2911ms, последний
  межоперационный gap4447ms, max внутренний prefix gap716ms:120s boundary здесь
  не объясняет различие.

Новый `index.openWetUndoOwnership.test.ts` НЕ mock-ает NativePuddleTarget.
На реальном engine/MockGL32 проверены M70prior → готовый goal → capture →
physical callbacks → own confirmation → fastUndoHit → independent replay.
Реальная проверка exclusive ownership остаётся включена, `_settle` null,
исключения нет:1PASS, scoped lintPASS. Это ownership control, не GPU/pixel proof.
Большинство старых openWetUndo unit tests mock-ают target и этот guard не видели.

Для следующего согласованного native gate нужны pageerror timestamp+stack,
settle owner/scratch/materialModel на capture, restore и при ошибке; exact same
accepted journal OFF control; canonical bytes снимаются ДО oracle, flags oracle
принудительно OFF. Желателен prefix canonical/oracle контроль ДО capture, поскольку
exact journal prefix сам по себе не доказывает, что physical prefix уже совпадает
с replay. Без этих данных защитный `!_settle` в restore не обоснован как fix.

GPU/браузеры/сервисы в этой подзадаче не запускались. Свой targeted CPU process
завершён. Рабочая копия и dependency links пока сохранены для продолжения RCA.

## Обновление: #785, ошибка до cache

Native repeat e8e1f005 снабжён sync window.onerror: исключение at26291ms,
первый capture at29088ms. Stack controller.frame→start→resetFromScratch,
hasSettle=true, asyncFinish=false, stroke=null, epoch46/ready=false.
Это default prefix ownership finding, не установленная причина cache divergence.
Создан #785 «M70 иногда теряет владение settle при онлайн-рисовании».
Fresh OFF sameSPEC затем прошёл exact/no-errors. Гонка не воспроизводится каждый run.
Следующий prefix-only OFF case без101/Undo дал A5199channels/max27, Bexact,
errors0/startSettle ringempty: parity отличается и БЕЗ ownership exception;
не объединяем причинно #785 и #752. Код исправления пока отсутствует.

Дополнительный CPU negative:2 автора,50 concurrent physical pairs,100 принятых
мазков на каждом engine, фиксированный material wall span500ms, queued peer A
под удерживаемым B→UP→confirm→frames. Настоящий NativePuddleTarget guard включён,
_startSettle creator spy не зарегистрировал ни одного вызова.2 tests PASS,
17.9swall/14.4stest; scoped lint PASS. Это ИНАЯ network shape, не воспроизведение
native protocol: у него A50local, затемB50local, accepted server runs
A12/B1/A4/B1/A34/B48, а не50 concurrent pairs.

Для native минимизации нужен отдельный fresh case на cut: A50→B1/2/4/8/16/32/50,
с тем же RAF cadence. Actual canonical bytes снимаются ДО forced-OFF oracle;
не вызывать oracle на живом A между порциями, чтобы не менять shared-field
ownership/timing/cache. Состояние читается через log/queue, не forced-flush getter.
Offline oracle на отдельном контексте возможен, но увеличивает расходы и меняет
нагрузку; это отдельная контролируемая проверка, не repair actual.

## Exact accepted-run CPU negative

Ещё один изолированный test повторяет A50 optimistic local ahead, затемB50,
принимая A12/B1/A4/B1/A34/B48 (после base layer op, server seq смещён на1).
Yield каждые3local gestures,16ms fake-timer scheduling; recorded material clock
фиксирован с шагом10ms, span1000ms, без120s. На обоих engine проверено100strokes,
затем synchronous canonical materialization с настоящим NativePuddleTarget guard.
_startSettle creator trace пуст, исключения нет. Targeted1PASS/2skipped,
8.7swall/5.2stest, scoped lint PASS. Это отрицательное воспроизведение accepted
chronology, не нативного GPU slice budget и не утверждение actual pixel parity.
Тест остаётся в изолированном WT: не добавляем специфичное MockGL=zero-settle
ожидание в основной CI без настоящего causal regression.
