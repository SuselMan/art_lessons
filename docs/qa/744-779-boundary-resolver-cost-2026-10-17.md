# #744 / #779: дорогой Undo Dry, CPU finding

База 82313a4c, выбранная новая копия `744-boundary-resolver-cost`.
Runtime остаётся побайтово исходным; правок движка и нового cache нет.
Это VPS CPU/OperationLog проверка, не end-to-end UI/GPU измерение.

Сценарий: N независимых пар A/B на слое, A → Dry → B → UndoDry → Undo всех A,
затем три RedoDry/UndoDry. Историческая защита восстанавливает все N whole-water
источников. Время только последнего effective-material resolve каждого цикла:

| Луж | Baseline, ms | Geometry whitelist, ms | Closure metadata cache, ms |
|---|---|---|---|
|240|355 / 260 / 255|229 / 137 / 137|361 / 281 / 295|
|480|1179 / 1240 / 1509|1034 / 1040 / 1052|1341 / 1406 / 1273|
|960|6180 / 6230 / 5951|6293 / 6238 / 5793|5807 / 5410 / 5758|

Baseline получен родительским агентом до экспериментов; кандидаты измерены
последовательно, без параллельного собственного test-run. Это одиночные CPU
серии, не статистически надёжное сравнение. На 960 нет убедительного выигрыша;
оба кандидата отброшены. Whitelist прошёл 55 существующих тестов в 4 файлах,
но вводить новый внутренний geometry/clock путь без практической пользы не стали.

## Scoped profile последнего resolve

В отдельном исходном run480 Inspector включён ТОЛЬКО перед третьим UndoDry resolve
и выключен сразу после. 1305 samples, 1565 sampled ms, wall1479ms с profiler overhead.

- `enableHistoricalBoundarySources`: inclusive1400ms, self579ms.
- `resolveGeometry` под ним: inclusive818ms, self491ms.
- `m70WaterResetLayers` под private proof: self138ms.
- `WatercolorFootprintIndex.candidates` под proof: self56ms.
- Обычный финальный `resolveGeometry` вне helper: inclusive10ms.
- GC68ms (общий профиль, не приписывается конкретному helper).

Таким образом repeated historical proof — подтверждённое узкое место именно
последнего вызова, а не только начального построения timeline. TSX выдаёт JS
одной строкой: профиль различает функции/стек родителей, но не ветви строки TS.
Детали и source SHA: `runs/744-779-boundary-cost-20261017/scoped-profile-summary.json`.
Для120 отдельные временные counters третьего цикла дали120 private proofs,
44160 visits,240 proof nodes; ordinary resolve368 visits/240 nodes.
Нельзя заключать, что достаточно оптимизировать только количество геометрических
узлов: обе проверенные локальные гипотезы не решили худший случай.

## Воспроизведение

Из нужной выбранной копии с уже доступным tsx:

```sh
QA_POOL_COUNTS=240,480,960 node_modules/.bin/tsx docs/qa/harness/728-night/boundary-resolver-cost.mjs "$PWD"
# QA_CPU_PROFILE=/registered-disposable/scoped.cpuprofile добавляет Inspector
# только вокруг последнего resolve; для профиля достаточно QA_POOL_COUNTS=480.
```

Новый exact-result cache не реализован: он ускорил бы прежде всего повторные
циклы, сохранив дорогой первый UndoDry и добавив lifecycle/invalidation риск.
#744 ускорение остаётся OPEN. Нет новых зависимостей, сервисов, GPU/browser.
Сырые CPU profiles/инструментация удалены после сохранения компактного результата.
Изолированная рабочая копия и история сохранены для review. Собственные per-entry
dependency links и generated shared dist/tsbuildinfo удалены; полных копий
node_modules не создавалось.
