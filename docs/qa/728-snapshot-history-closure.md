# #728: зависимости истории при восстановлении снимка

Принцип: сохранённые пиксели неизменны, но поздний undo/redo/revoke может изменить операцию, уже включённую в них. Выбор покрытия вычисляется заново для входа; хранимый blob и coveredSeqByLayer не удаляются и не переписываются. Используется сохранённый снимок раньше первого изменённого target либо восстанавливается только затронутый слой. Прочие слои сохраняют ускорение.

## Доказанный исходный сбой

Комната P8TL9XaE, физический Custom 640×480, source 18018025. Реальный снимок layer-1/5 содержит undo5 цвета3. Redo6 возвращает цвет текущим участникам, но обычный перезаход оставлял цвет отсутствующим: восстановленный результат отличался на 22784 пикселя, max255. Полный исходный журнал17 в чистом движке точно совпал с текущим участником. Исходные артефакты HOME680-lifetime-hardware/temp/multiplayer/default18018025-stable-keys и default18018025-fresh-oracle сохранены. Это не сравнение независимо нарисованных мазков.

## Кандидат

- snapshotReplayPlan выбирает покрытие по original target seq, включая равенство; undo5 включён в snapshot5, redo6 уже меняет его.
- snapshotReplayLoader разрешает холодные target IDs и подгружает только требуемые слои и лёгкую структурную/history metadata. Источники merge/copy замыкаются рекурсивно. Socket tail и HTTP index используют один алгоритм; join подготовлен до подписки на room channel, с проверкой watermark после async чтений.
- Inclusive prefix до структурного watermark сначала absorbHistorical, с оригинальным состоянием undone/done, затем replay tail. Нельзя просто добавить colour3 как done и вызвать redo: он ожидает undone.
- restoreHistoricalOperations пересобирает только существующие непокрытые слои. Исторические отсутствующие source слои не revoke и используются рекурсивным rebuild merge/copy результата.
- Между room_state и HTTP index покрытие может измениться. Для слоёв без покрытия до index.seq клиент получает scoped history с fixed beforeSeq=index.seq+1 через существующий REST operations; optional layerIds не меняет формат операций/снимков. Безопасные полностью покрытые слои не загружаются. Отказ сети остаётся failed restore, а не пустой успех.

## CPU evidence и пределы

160 целевых тестов (7 файлов): реальный Engine+restoreRoomState пиксельный undo5/redo6 регрессионный контроль; соседний безопасный снимок неизменен; исторический merge/copy результата с отсутствующим source; cold target lookup; older snapshot; missing target fail-closed; HTTP scoped query/source closure; inclusive index-race prefix и normal fully-covered no-fetch. Функции настоящие, Prisma и transport изолированы тестовыми doubles. Это не аппаратный GPU proof.

Аппаратное повторение исходной комнаты, reconnect/late join и реальный StoredSnapshot для кандидата ещё НЕ выполнено. Полная структурная undo-семантика (undo старого delete/merge с восстановлением UI base) этими тестами не доказана: planner source closure не означает её автоматическое исправление. Сценарий original Bundo pixel-noop остаётся отдельным контролем; altered early-Bundo sequence совпал с fresh replay, но это иной журнал.

Для review: source/schema изменяются узко, shader/operators/packed dabs не меняются; source rebase/phase flags root сохраняются при cherry-pick. Новый протокол хранения, вечное удержание всей истории и blanket full replay не вводятся.

## Follow-up: prefix reconstruction завершён до tail source reads

Review обнаружил порядок, который одного absorbHistorical недостаточно закрыть: при suspendDisplay prefix source S откладывается, а tail merge/copy сразу читает live S. Теперь restoreHistoricalOperations запускает существующий rebuild (включая существующую нарезку GPU), асинхронно ждёт окончания только затронутых jobs и проверяет destroy/context loss. После него хвост видит реконструированный источник. CPU regression suspendDisplay→prefix S→tail merge/copy проверяет nonempty S и точные пиксели R; первоначальная deferred реализация это условие не выполняет. No-snapshot fast loader также повторяет чтение при изменившемся watermark. 49 тестов трёх затронутых файлов проходят; server/web types проходят. Hardware gate должен отдельно наблюдать отсутствие prefix rebuild jobs при первом tail redo/copy.

Подготовлен controller temp/hardware/snapshot-closure.mjs (ignored artifact, node --check PASS): тот же P8TL9XaE, оригинальный persisted blob layer-1/5 HTTP200, проверка реальных undo5/redo6 target IDs, оба обычных restore, чистый full authoritative journal oracle, обычный reconnect и новый auth late join; one Chrome/two contexts максимум,180s finally. Подавляется только новая публикация снимков из собственных QA pages, чтобы не замаскировать прежний снимок новой копией. Исходники/операции/пиксели не переписываются. Контроллер пока не запускался.

## Vega actual StoredSnapshot gate: PASS (f877b418)

Root mirror5322/backend4538, tarSHA9be0504d6373fe492bd868d464b250c59ec7b976478ecffa691aeecf7fa9188b; Engine indexSHA9c97437580fb80a8eccdc0e5455790ec68e04b81a8e1acd40a46499d94e7ebee. Source film rebase ON, phase OFF. Тот же P8TL9XaE,17 authoritative operations, физический640×480.

Оригинальный immutable blob /snapshots/layer-1/5 остался доступен HTTP200. Вычисленный index seq5 не выбирает его после redo6. Missing layer prefix запрос /operations?beforeSeq=6&limit=500&layerIds=layer-1,background успешен HTTP200, включая undo5. Его существование в БД не заменено новым снимком: собственные QA pages подавляют только новые snapshot uploads, никаких моделей/операций не меняют.

После полного restore: A/B, A/full-authoritative fresh17, обычный reconnectB, новый auth lateC — **whole transparent PNG640×480 exact0/max0/premult0**. У каждого22475 nonempty alpha pixels,17 entries, GL0/contextLostfalse. Это закрывает исходный22784px restore mismatch. Первый tail redo IDzu_MSBV80G входит2089.60ms после второго prefix-done2089.20ms; targetdL0tkZP8-3 действительно undone, pending/jobs0. Поздние tail undo/rebuild штатно могут снова создавать jobs, это иной этап.

Артефакты HOME680-lifetime-hardware/temp/night-load-ui/temp/snapshot-closure-f877-settled/{report.json,A-restored.png,B-restored.png,fresh.png,B-rejoined.png,C-late.png}. Один собственный Chrome finally CLOSED, watchdog180s.

Ранние попытки исключены: RAM guard остановил до Chrome при1388MiB; второй helper экспортировал в async preload gap до завершения второй prefix, хотя jobs временно0. Исправленный helper требует displaySuspendDepth0, prefix-done и redo actualID; это fixture correction, не новый engine fix. Все исходные partial artifacts сохранены. Общая covered structural undo политика и original Bundo промежуточная семантика по-прежнему отдельно проверяются.

## Issue #737: structural coverage is independent from pixel coverage

CPU review found a separate failure: restoring the uploaded structural tree as
an immutable base cannot undo a structural operation covered by that tree. With
real `makeInitialLayerState()` (implicit `background` and `layer-1`), covered
`layer_delete`, `layer_merge`, and `layer_duplicate` followed by tail undo produce
incorrect UI layer IDs; merge/copy also keep a result buffer as a false base layer.
The earlier L1 colour redo hardware PASS does not cover these structural cases.

The proposed computed join mode `replayStructure` is set only when a later
history change names a structural target at or below the uploaded tree watermark.
It does not mutate stored blobs, stored coverage, or the uploaded tree. The loader
resolves cold targets, fetches the complete lightweight structural/history prefix,
and retains per-layer safe pixel snapshots; only affected/source layers load heavy
pixel history. Both Socket and HTTP selection use the same plan. Scoped HTTP prefix
includes deleted layers absent from the uploaded tree and is pinned inclusively to
that structural watermark.

In this mode the engine starts from the original implicit base, folds the prefix
before safe bitmap handover, and does not treat snapshot-created layers as permanent
base layers. Room UI derives structure from the same original base plus the full
done journal. The usual snapshot mode and its historical-prefix exclusion remain
unchanged. Existing fork #498 retains structural operations, so a normal fork can
reconstruct its original structure without fetching every covered stroke.

A legacy snapshot-only root whose layer/folder creation is absent from the prefix
is refused explicitly; currently alive IDs are not evidence of its original base.
This is a conservative unresolved legacy limitation, not proof that such a room
can be repaired from missing data.

CPU gates: 173 targeted tests across eight files pass; three actual engine tests
compare covered delete/merge/copy undo and redo against the full-history engine, including
UI IDs, buffer IDs, and complete layer pixel arrays. A harness-only old-source
negative removes structural prefix reconstruction and all three tests fail. Loader
tests preserve a safe unrelated bitmap, restore deleted-source history, refuse an
unknown base, and keep ordinary snapshot acceleration. Client tests require prefix
fold before safe bitmap application, followed by scoped pixel reconciliation. A retained-earlier-source fixture proves why the second pass is required: it preserves post-watermark pixels after the earlier bitmap is applied. Already seeded IDs are re-marked against the newly pinned snapshot coverage. These are CPU/mock-GL and transport tests;
actual Room UI/stored snapshot/reconnect structural hardware gates are pending.

Original negative artifacts remain in ignored `temp/closure/structural-negative/`;
old-source failure is `temp/closure/structural-corrected-negative.log`, positive aggregate
is `temp/closure/structural-final.log`. No production source or frozen f877 QA stand
was changed during this preparation.

### Topology-only initial handover

Review identified redundant heavy replay before bitmap application. The first
`restoreHistory(prefix, true)` now absorbs the prefix, synchronizes buffer topology
with `rebuildNewLayers=false`, and preloads images; it does not rebuild any pixel
layer. After safe blobs are pinned, the normal scoped dependency pass marks seeded
IDs against that coverage and performs the sole prefix pixel reconstruction.
All other `_syncBuffersToLog` callers keep their existing rebuild behavior.

Actual engine test spies assert zero `_rebuildLayer` calls in the first phase,
unique per-layer calls in the dependency phase for all three structural cases,
and exactly one call for the retained earlier source bitmap. Undo/redo UI trees,
buffer IDs, and complete layer pixels remain equal to the full-history oracle.
74 relevant tests across engine structural/network snapshots and client restore
pass. This removes a duplicate replay; it is not a hardware speedup claim.

### Restore base and presentation setters

Structural restore now initializes active layer and composite order from the folded
original prefix state, rather than the superseded uploaded structural tree.
`setBaseLayers` resets historical structural derivation when the same engine begins
a new ordinary snapshot restore. A real same-engine regression confirms that
historical `layer_add` is exposed in structural mode and excluded again in ordinary
snapshot mode. The hardware controller records activeId, UI tree and composite
order after Room synchronization; this does not assume authors share local selection.

### Консервативная проверка исходной структурной базы

В computed structural mode исходный prefix до включительного watermark снимка складывается через настоящий OperationLog и replayLayerState. До передачи bitmap движку проверяется совпадение topology и общих style-полей с сохранённым layerState. Локальные selection/collapse и локализованные имена implicit-слоёв исключены; явный layer_rename, общие lock/ownerLock, opacity и visibility проверяются. Неполный старый prefix приводит к явному отказу, а не к придуманной initial topology.

35 целевых тестов snapshotRestore/structuralSnapshotBase, web typecheck, lint и map:check прошли. Negative fixtures намеренно моделируют неполный legacy-like prefix; это не доказательство ошибки современного fork: residentOperationWhere сохраняет непиксельные move/style-операции. Аппаратный runtime 158ebc9e этих дополнительных проверок ещё не включает.

### Реальные сохранённые structural снимки: Vega, 7 октября

Отдельный runtime 158ebc9e = f877 + 0169 + be03 + e119, frontend5323/backend4539, sourceRebase ON; дополнительный base validator22cd ещё отсутствует. Три новые физические комнаты640×480: delete nr4FbjsH, merge RufXI0gi, duplicate ztBMER_1. В каждой два настоящих авторизованных участника нарисовали native watercolor, записали structural operation и shared Dry. Literal HTTP POST сохранил bitmap/state при watermark5; после covered Undo computed index включил replayStructure.

Во всех трёх случаях live peer, ordinary reconnect, новый автор latejoin и независимый full-authoritative replay дали одинаковые полные RGBA640×480 (0 отличающихся пикселей, max0); UI topology и реальные buffer IDs совпали, восстановленный activeId допустим, GL0/context alive. Последующий Redo синхронизировал peers точно. Все собственные Chrome закрыты. Raw HOME680-puddle-outline/temp/structural/{delete-retry2,merge,duplicate-retry1}/; JSON копии temp/hardware/structural-reports/ в данной worktree.

Ранние bootstrap/geometry-guard попытки не являются проверкой исходников. Первый duplicate получил not_a_checkpoint_seq из-за конкуренции automatic first upload; retry отключал только автоматическую публикацию своих QA engines и сохранял настоящий оригинальный bake для literal POST. Retained earlier source bitmap остаётся отдельным следующим аппаратным сценарием; эти три результата не закрывают произвольный legacy/fork base и не доказывают cross-GPU пиксельную идентичность.

### Сохранённый ранний source bitmap: отдельный аппаратный контроль

Четвёртая новая комната BlP6uf6x, тот же frozen158ebc9e. Сначала literal upload только source-1791333222713 при seq4 (hash d2b56660db9c7539ec00c58cb7555c9dbf7f2949c1907126555d678666f893b8), затем ещё один source pigment, Dry и rename. Поздний literal upload только layer-1 при seq7 сохранил ранний source4. После covered Undo rename computed structural index оставил оба safe bitmap; ordinary B реально получил source/4 по HTTP200, затем prefix восстановил последующий pigment.

Полные RGBA640×480 ordinary reconnect, независимого authoritative fresh и нового latejoin C совпали с живым A точно (0/max0), UI/buffer topology совпали. Последующий Redo peers тоже0/max0, GL0/context alive, nonempty12269 на Undo. Собственный Chrome CLOSED. Raw HOME680-puddle-outline/temp/structural/retained/, копия temp/hardware/structural-reports/retained.json. Это проверяет порядок topology-only → ранний bitmap → единственная pixel reconciliation на реальном StoredSnapshot, отдельно от трёх delete/merge/duplicate случаев.

### Обычная загрузка KJ-shaped журнала: отдельно от вычисления мазков

Исходной KJc0OoVo в изолированной QA БД нет (readonly Prisma room.findUnique=null). Поэтому создана собственная azbKYBhx с исходной физической страницей1754×2480, fine/#fdfdfc, viewport640×480. Все47 original operations сохранены по dabsPacked/wet/preset/color/tool/layer; IDs/author/wash namespace и единый timestamp origin переведены на собственную комнату. Это может менять hash-derived procedural seeds и не является утверждением идентичности исходной production картинки. Затем явно добавлен shared Dry48 для безопасного первого snapshot. Actual server ACK всех47 и Dry48 сохранены в raw отчёте.

На frozen158ebc9e/sourceRebaseON/phaseOFF seeding занял22.212s; это setup, не cold load/native speed. Literal StoredSnapshot layer-1 seq48 hash fb4e27228df2ef57239360225e9a8748ef3645a0c327a00aff576fdb34eab2a3. Независимый full-authoritative48 engine, ordinary cold new-auth browser-network-cache-disabled join и warm same-auth reload совпали с seed по полным RGBA1754×2480 точно (0/max0), nonempty1,580,034, resident48, GL0/context alive. Cold navigation→paperReady→restore quiet1623ms; warm1200ms. Это собственный localhost devserver, не production WAN/Android и не полностью cold driver/shader cache.

Cold index23ms, blob54ms, фактический restoreLayerFromSnapshot107.7ms; warm index16ms, blob22ms, restore98.1ms. Параллельные времена не суммируются. В каждой загрузке применён один covered bitmap и два публичных history reconciliation вызова с6/4 records для отсутствующего background coverage; число содержит повторные metadata и не равно pixel replay count. Public appendOperation reader trace0 не доказывает0 внутренних pixel rebuilds. Все48 entries присутствовали после backfill. Два первоначальных RAM-preflight отказа до Chrome сохранены отдельно; рабочий retry2 завершён, собственный Chrome CLOSED. Raw HOME680-puddle-outline/temp/load/KJ47-retry2/, копия temp/load/report-KJ47.json.

### CURRENT backend для combined matrix

Отдельный HOME680-puddle-outline/temp/current-server запущен на4539 из exact root680-water-wet-tone commit47e6e6a4; frozen root5322/4538 и прежние158/apps не изменялись. Архив server/shared tarSHA f0a4bc171fcf61c21d1f6370b620c95374dcad2cfd33daac5f8f92b83c9673ff; все128 src-файлов HOME совпали с git archive. 115 актуальных snapshot pathway tests в6файлах и server typecheck прошли. Реальный /health вернул200; launcher1137138/listener1137149, PID/cwd проверены. GPU/Chrome при подготовке не использовались.

Зависимости взяты из существующей real-deps HOMEкопии: tsx alias на актуальный shared/src и существующий app-local generated Prisma client. Первый startup без Prisma alias завершился ERR_MODULE_NOT_FOUND до listen, это исправленная runtime dependency seam; install/symlink не создавались. Backend startup/CPU checks не являются combined browser pixel gate. Журналы и полный source passport: HOME temp/current-server/{backend.log,health.json,source-passport.txt,source-hashes.txt}; VPS temp/current-server/{tests.log,types.log,source-hashes.txt} этой worktree.
