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
