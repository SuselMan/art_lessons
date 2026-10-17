# #744/#779: независимые исторические water-proofs одним проходом

Это CPU-оптимизация вычисления effective journal, без нового cache, wire/physics
и изменения пользовательской Undo-семантики. GPU/UI latency не измерялись.

Исходный resolver SHA256 `7d98c8d485b5356bf41142debcba4775b5b5b53c746c8f8ffde7d1c7da737efe`
совпадает с ранее сохранённым baseline82313 и актуальной интеграцией до кандидата.
Гипотезы whitelist-only и closed-layer cache ранее были отрицательными; здесь
не повторяются и не вводятся.

## Почему объединение допустимо

1. Консервативный spatial partition использует ВСЕ M70-жесты исходного journal,
   включая удалённые, rejected, нулевую воду и потенциальные будущие мосты.
   AABB-overlap может лишний раз объединить компоненты, но не разделить реально
   пересекающиеся footprints. Все chunks одного жеста объединяются независимо
   от расстояния: whole-water retention связывает даже далёкие chunks.
2. Fast path разрешён только при конечных timestamps ВСЕХ stroke-операций и
   общем `max-min < dryAfter`. Тогда ни один probe не может получить natural
   expiry; иначе общий layerclock сделал бы далёкие компоненты зависимыми.
3. Все material barriers и операции остаются в chronological probe. Убирается
   только повторение геометрии независимых proofs, не границы Dry/clear/hide.
4. В одном batch максимум один source из компоненты. Его исторический whitelist
   точно сохранён в собственной компоненте: объединённые чужие whitelists лежат
   в заведомо непересекающихся компонентах. Новый connector не становится старым.
5. Несколько sources одной компоненты идут отдельными раундами в прежнем порядке,
   сохраняя влияние earlier-enabled sources на later-source proof.

При одном компоненте, невалидном clock-span или чрезмерной broad-phase работе
исполняется прежний individual-source proof. Broad-phase ограничен8×числом
entries, поэтому dense grid не превращает сам partition в новый квадратичный
проход. Spatial cell16 влияет только на частоту fallback, не на семантику.

## Проверки

6целевыхфайлов/70тестов PASS. Существующий независимый disc/BFS oracle сравнивает
10000 prefixes. Новые differential tests сравнивают ВСЕ effective operations
(включая controls, payload и presets; local seq нормализован) с существующим
slow path: только во второй журнал добавлен уникальный автор/отдельный слой с
clock outlier. Он не меняет исходный материал, но запрещает batch guard.

Дополнительно5760 random-prefix actions на240 трёхавторских историях с rejected
controls; целевые far-chunk bridge, replacement bridge, NaN/Infinity, natural
120s и repeated reversible Dry cycles. Старый resolver не копируется в app.

## Измерения

Existing `docs/qa/harness/728-night/boundary-resolver-cost.mjs`:
independent A→Dry→B→UndoDry→UndoAllA→RedoDry→UndoDry, три последних UndoDry.
Все waterOnly counts равны числу исходных независимых луж. Компактные численные
результаты и hashes — в соседнем JSON.

Первый вариант partition с default cell128 давал budget fallback и НЕ ускорял:
240≈314–407ms,480≈1370–1447ms;960 прерван собственным точным PID. В candidate
используется cell16; это уточнение broad phase, не новый graph predicate.

Для dense60 source/consumer в одной точке alternating old/new в одном процессе:
прогретый old45.48/47.79/45.27ms, new43.53/43.02/43.54ms. Холодные запуски обоих
имели JIT/GC выбросы42–124ms, поэтому не выдаются за стабильный latency benchmark.
Transient instrumented240 fixture даёт3proofBatches за3UndoDry: один geometry
proof на каждый UndoDry вместо240. Instrumentation и временная копия original
resolver существуют только в зарегистрированном disposable каталоге и удаляются
после сохранения итога. Production flags/caches/reference-copy не добавлены.

Дополнительный direct differential `dryingScope=component` PASS; после его
добавления новый testfile15/15 PASS (всего71уникальныйцелевойтест). Предшествующие
web TypeScript/scopedlint PASS. Зарегистрированный disposable
`puddle-744-independent-proof-batch-20261017` удалён штатным guarded finish
с привилегированным procvisibility; registryownership восстановлен.
Временные old/instrumented resolver copies и harness удалены; browser/GPU/сервисы
не создавались, собственных процессов не осталось. Dependencylinks/generated
shared удалены после верификации; исходники/Gitистория/worktree сохранены.
