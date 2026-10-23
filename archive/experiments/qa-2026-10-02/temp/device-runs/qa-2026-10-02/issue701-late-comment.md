Дополнение 19:22 MSK. Усиленная QA выявила крайний случай в локальной оптимизации: continuation приходит, пока `job.fresh` ещё не опубликован в `_layers`. Прежний `_rebuildLostWash` не находил этот target. Исправление теперь перезапускает соответствующий sliced job через microtask с проверкой актуальности.

Прежний unit assertion (`minY<24`) был слишком слабым из-за halo. Сравнение с исходной границей wash даёт корректный FAIL:20 вместо-6. После дополнения3/3PASS; related113PASS.

Native WebGL regression удерживает один renderer перед `_swapRebuiltLayer` и подтверждает retirement wash. Через настоящий Socket.IO доставляется continuation; после release/redo сравниваются raw SHA с независимым peer и fresh late replay (все Chrome на AMD). Fixed PASS18.7sec. Диагностический контроль с **только прежним методом восстановления**, без отката остальных правок: FAIL raw SHA mismatch peer/author. Артефакты `rebuild-spill-strong*.log`, `rebuild-spill-mid-browser3*`, `rebuild-spill-mid-baseline*` в QA worktree.

Два ранних браузерных FAIL относились к rig: gate между срезами не успевал до последнего swap. Теперь задан явный gate перед публикацией; автор выбирается по подтверждённому server order. Полный unit suite повторяется после нового code change. Исправление локальное, push не выполнялся. Отдельный #702 (долгий фоновый readback вне rebuild) остаётся без исправления.
