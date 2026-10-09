# Убрать статическую загрузку Engine до формы создания

Фактический Surface no-input OFF/ON: HTML/API200, DCL/load complete, затем через10s форма0/enginefalse. ON React root — один DIV без текста; source RouteFallback рисует именно пустой фиксированный DIV. Оба traces имеют ~120 pending engine module requests. Это ещё не прямое наблюдение владельца Suspense promise, но статическая причина тяжёлой зависимости доказана компилятором:

`CreateRoom → RoomAccessControl → useRoomAccessSource → roomStore → toolSlice → toolSchemas → engine/index`.

ESM должен разрешить статические imports до resolve lazy CreateRoom promise. Engine barrel импортирует raster/buffers/input и всё дерево акварели. Поэтому его загрузка попадает до первого render формы, независимо от добровольного dynamic Room preload в useEffect. Shared prebundle убрал17 shared requests, но эту цепочку не менял.

Добавлен лёгкий `engine/toolOptions.ts`: только переэкспорт существующих preset lists, configs, types и функций. Tool schemas и pressure/tilt curves читают его; старый Engine API сохранён. DEFAULT_GRAPHITE_COLOR перенесён единственной tuple definition в pencilPresets, Engine импортирует и реэкспортирует тот же объект. Mutable CHARCOAL_FEEL/PENCIL_TILT, остальные численные параметры и функции не копируются. Рендеринг, scheduler, callback порядок и dynamic Room preload не менялись. Ручной стенд5381 находится в другой рабочей копии и не затронут.

CPU gate использует реальные TypeScript-erased static imports рекурсивно:96 reachable source modules формы, engine/index/raster/buffers/native отсутствуют. Negative Engine-entry case доказывает, что guard действительно замечает renderer.47 тестов tool settings/authoritative object identity + app TS PASS. Это доказательство устранения source dependency; Surface boot readiness/ускорение пока не проверены и отдельно требуют новой allocation.

## ONE actual Surface readiness — PASS

После независимого source review: ordinary product Vite config, без shared alias/prebundle, source836. Реальная форма `/create` появилась: form1/noEngine, rootTextLength437, page/network errors0. goto→DOMContentLoaded12.42s, goto→form18.86s. Это всё ещё медленная cold dev navigation, не production latency и не paired ускорение. Engine runtime requests отсутствовали до первого DOMform; форма впервые наблюдалась MutationObserver, Network.wallTime сохранён, sub5ms clock boundary отдельно признана неоднозначной. Dynamic Room preload не запрещён и не изменён.

Сохранён actual source passport нового lightweight entry, preset/consumers и старого Engine API; protocol h2. Owncontext/frontend5382/forward9455 закрыты, postRAM1900MiB. Ни room submit, ни stroke не выполнялись. Ресурс gl-create-boot-fixed-5382 finished после durable promotion; root standardguard удаляет safe-hold. Следующий painting cohort требует отдельного разрешённого слота и актуального runtime/source manifest.
