# #680: Dry — исторический барьер импорта воды

Кандидат серверного правила не меняет физические операторы, формат или схему.
`paper_dry` всегда остаётся непокрытым snapshot: сохранённая геометрия воды
запрашивается на timestamp каждого исторического мазка. Два CPU факта:

1. `_ribbonDabsWork` берёт `at=current.timestamp`, сбрасывает sources на
paper_dry/layer_clear, затем допускает чужие доноры возрастом<=120000ms.
`RibbonStrokeScratch.beginStroke` сбрасывает кеш foreignSources на новом жесте.
2. Старое snapshotCoverage считало marker старше120000 wall-clock покрытым,
хотя ни pixels, ни layerState не хранят эту ordered границу.

В реальном round2 журнале full28ops против cold27ops отсутствует только
Dry bC1VlmpSaT; возраст marker236448ms. Для targets seq12..16 CPU-проверка
того же historical scan без marker добавляет7/6/5/4/3 pre-Dry доноров.
Их возраст на момент соответствующего target —51..116сек, хотя к чтению
архива старые мазки имеют возраст247..322сек. Поэтому проверка только
Date.now неверна для этого пути.

Это **не** причинное доказательство pixel difference: отдельный аппаратный
same-packed-journal A/B с/без единственного Dry ещё не выполнен.
`temp/context-loss/dry-barrier-packed.json` хранит записанные timestamp,
packed dabs/IDs/serverseq без переписывания; `dry-barrier-replay-page.js`
создаёт независимый engine и прогоняет именно эти данные без server snapshot.
Оба варианта должны сохранять одинаковые поля/флаги и исходную бумагу.
CPU AsyncFunction compile PASS, GPU не запускался.

Storage/lifecycle audit:
- roomPersistence.persistOperation сохраняет marker обычной operation row;
новая схема и миграция не нужны.
- rooms.getRoomSnapshot и snapshotStore.trimResidentOperations используют
isCoveredBySnapshot: новое правило удерживает marker и в tail, и в RAM.
- residentOperationWhere исключает только COVERABLE_OP_TYPES; marker в этот
список не входит, поэтому cold DB load/fork уже загружают его.
- forkRoutes использует тот же residentOperationWhere и сохраняет rows;
никакого нового marker ID или timestamp не генерируется.
- undo/redo marker остаётся metadata/nonundoable. Layer clear — отдельный
барьер и не меняется этим кандидатом.

Стоимость: в resident журнале остаются все ручные Dry markers, а не только
моложе120сек. Они малы, но больше не считаются transient overlay-only ops.
Нельзя вновь удалять их по wall-clock без доказанной snapshot/replay схемы
для исторической границы импорта. Сохранённые DB rows старых markers доступны
на cold load; уже урезанный live resident журнал сам по себе их не восстановит.

Проверка: snapshotCoverage+rooms tests150PASS, настоящий server typecheckPASS.
Первый запуск на этой worktree не нашёл Prisma из-за отсутствия nested
apps/server/node_modules; использован symlink уже установленного release
server node_modules, без нового npm install/дисковых зависимостей.

Дополнительная проверка actual snapshot lifecycle: roomSnapshots сохраняет
полностью покрытые pixel snapshot и layerState; aged Dry остаётся единственной
операцией в tail с исходным timestamp. Три server файла208testsPASS.
Shared PaperDry doc целиком описывает отсутствие непосредственного нанесения
пигмента и сохранение ordered foreign-import barrier, без прежнего утверждения
о replay-equivalence после удаления marker. Временный server node_modules
symlink удалён после тестов; target dependencies не менялись. Повтор
проверки в стандартной root worktree с собственными deps остаётся за root.
