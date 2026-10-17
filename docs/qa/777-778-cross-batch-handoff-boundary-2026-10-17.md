# #777 / #778: граница batch и минимальный durable handoff — OPEN

## Подтверждённая граница #778

Real createLostWorkBatcher: batch1 содержит A и flush на800ms. Затем на1801ms
приходят scopedDry/B того же deadLayer, второй flush на2601ms. #778 сохраняет
Dry и timestamps, но recoveryOperations создаёт recoveryLayer1 для A и другой
recoveryLayer2 для Dry/B. Dry теперь адресует layer2, поэтому A остаётся мокрым
на layer1. Material ownership исходного общего слоя не восстановлен. Для A/B
без Dry та же граница также разрывает общую мокрую source.

Bounded test проверяет два настоящих плана, наличие scopedDry во втором и его
другой target. Desired one-source-target assertion FAIL: ожидался1, получено2.
Сохранён it.fails OPEN; runtime не менялся. Исправление c16482da корректно только
внутри одного доступного recovery batch, это не полное исправление recovery
истории. Сохранить исходный layerId нельзя: он уже удалён. Надёжное соответствие
old-target→recovered-target между batch/reload требует отдельного контракта.

## Конкретный минимальный план #777 (не реализован)

Текущих RAM debounce + OutboxStorage.put/delete недостаточно для crash-safe
handoff. Самый узкий полноценный кандидат использует ТОТ ЖЕ object store и
roomId, без нового IndexedDB store/version и без shared/network schema:

1. После definitive target_gone записать в существующую OutboxEntry локальную
   terminal-recovery фазу с исходным payload/result и captured boardId. До этого
   original payload остаётся durable; после подтверждения записи эта entry
   НИКОГДА не идёт в send/resendAll, а передаётся recovery planner. Это новый
   явно типизированный local-storage contract; не маскировать его attempts или
   nextRetryAt sentinel-значениями. Перед реализацией отдельно обсудить миграцию
   старых записей и replay terminal-фазы.
2. Освободить network send lease сразу после server result, ДО ожидания recovery.
   Отдельный bounded settling-ID guard исключает повторный send, пока идёт
   local persistence. Recovery completion означает durable storage completion,
   а не engine.paint/ACK/whenIdle. При storage failure повторять handoff/storage,
   не сеть с уже отклонённым original.
3. Captured-board planner собирает recovery. Atomic `replaceWithRecovery`
   транзакцией в существующем store записывает обычные replacement operations
   (с заранее выбранными стабильными в рамках этого handoff IDs) и удаляет
   terminal originals. Простые отдельные put→delete дают crash-window дубликатов;
   delete→put — потери. Нужен новый API atomic handoff, но не новый store/schema.
4. Только после durable commit завершить return-completion callback. При активном
   исходном board можно применить operations его engine; при switch/unmount
   оставить их под OLD roomId до обычного открытия/отправки. Никакого чтения
   нового engineRef в отложенном callback. Terminal/replacement work переживает
   reset UI batcher, он больше не единственный owner payload.

Почему не deadlock при MAX_CONCURRENT_SENDS2: старые network leases уже отпущены.
Даже если оставить их до local completion, enqueue ждёт persist, не ACK, поэтому
чистый storage handoff не зависит от слотов. Но callback→whenIdle/ACK запрещён:
оба old lease могут ждать новые operations, а те не могут отправиться. Нужны
unit tests двух одновременных target_gone + storage-deferred recovery + rejoin.

Этот план минимален по границам модулей, но НЕ является уже согласованной ночной
реализацией: local entry phase, atomic storage API и captured-board planner
требуют отдельного решения. Он также не решает #778 cross-batch target mapping
сам по себе — mapping должен иметь такую же durable board-scoped ownership.

Добровольный page turn можно отдельно смягчить synchronous flush старого batch
до смены refs и до existing whenIdle; без durable handoff это лишь UX-мера.
Forced switch/unmount/browser crash остаются вне такой меры. Не пересылать
permanently rejected original в качестве механизма восстановления и не flush
его в новый board.
