Финальная проверка QA 02.10,19:43 MSK: AMD laptop / Intel Surface / Apple iPad Safari16.3, последняя локальная QA версия6ca18d16 (base origin/main8990c479). После нагрузки3physical+17Socket.IO новые операции остановлены; pending/queue/jobs/unsettled пусты у всех.

Полные ordered operation IDs **и SHA256 всего payload журнала** совпадают (834operations; при canonical hash исключён только локальный `op.seq`, ключи объектов сортируются). Точная сверка clipped raw fine RGBA,14,368,768channels, без усреднения48×48:

| Пара | Каналы с diff>24 | Max | Mean |
| --- | ---: | ---: | ---: |
| AMD/Intel |202|45|0.035639|
| AMD/Apple |202|45|0.025332|
| Intel/Apple |0|24|0.017245|

У пар с AMD p99=1,p99.9=3. AMD/Intel193outlier pixels (202channels). Capture выполнен после общей server snapshot baseline и дополнительно прошедших18rounds/9tools/reconnect/undo-redo; нельзя выдавать его за повтор первоначального сложного случая до snapshot. Порог не ослаблялся. Большая часть отличий мала, редкие локальные различия выше выбранного критерия сохраняются. Причина этих остаточных различий не установлена.

#700 исправил конкретный stale coarse LOD case (native WC+eraser/smudge пары6/6PASS); #701 исправил лишние finished-wash readbacks в rebuild и потерю начала при continuation до публикации fresh target (усиленный native baseline FAIL→PASS). Эти правки **не являются полным исправлением #691**; issue остаётся OPEN.

Артефакты: `temp/device-runs/qa-2026-10-02/three-exact-final-*`, metadata/payload hashes/raw RGBA gzip/comparison/outliers; каталог QA-001…QA-021 и run report в `docs/qa/`. Исправления локальные, push не выполнялся.
