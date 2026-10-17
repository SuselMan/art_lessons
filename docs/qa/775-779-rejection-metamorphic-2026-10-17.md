# #775 × #779: immutable CPU QA

240 seeds × 24 actions, full-history и partial-legacy-undone: 7526 проверок
состояний/effective water PASS. Проверяется accepted-only reference journal,
который не вызывает rejectPending/confirm/absorbHistorical. Общая accepted-event
семантика используется обеими сторонами; это не независимый physics oracle.
SHA OperationLog/controlHistory/watercolorUndo до и после совпали; runtime не менялся.
Компактный результат: `runs/775-779-rejection-metamorphic-2026-10-17/summary.json`.

В старом генераторе отсутствуют Dry/hide. Не расширяя случайную матрицу, добавлены
4 детерминированные проверки dry/hide × автор A/C, по 3 цикла:
rejected Redo → accepted Redo → rejected Undo → late accepted Undo.
Защита воды проверяется относительно ранее установленной eligibility, accepted-only
fresh fold и cold hydration. 4/4 PASS, scoped oxlint PASS.

Команда из корня выбранной копии (tsx уже установлен):

```sh
QA_CANDIDATE_WT="$PWD" QA_FUZZ_OUTPUT=docs/qa/runs/775-779-rejection-metamorphic-2026-10-17 node_modules/.bin/tsx docs/qa/harness/775/rejection-metamorphic.mts
npx --prefix apps/web vitest run --root apps/web src/engine/src/oplog/watercolorUndo.rejectedBoundary.test.ts --maxWorkers=1
```

GPU/сервисы/новые зависимости не использовались. Временных ресурсов не осталось.
