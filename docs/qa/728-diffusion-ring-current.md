# Кандидат устранения внутренней каймы (#728)

База c092bb92. В собственном worktree изменена только face gate WC_DIFFUSE_FRAG: min(wi,wj)/(1+8density²) → min(wi,wj). Это возвращает исходный linear suspension oracle, оставляя current coverage domain, water/P/C delivery, carry, schedules, rates, typography, snapshots и default diagnostic flags. Baked fibres здесь не включены: отдельный runtime gate необходим. Не опубликовано, не integrated.

Historical identical curated42: first-parent0a58 GOOD; merge8f render-source идентичен5cb BAD. Отдельный oldDiffuse и noDensity counterfactual убирают отчётливое кольцо. Current62505 three arms EXIT0/CLOSED: baseline имеет замкнутую белую линию; noDensity её убирает; oldCoverage-only сохраняет. Current shader operator вклад подтверждён, но не полное художественное одобрение. Raw HOME680-water-wet-tone-qa/temp/ring-regression-cea/temp/current-controls, VPS728-ring-expanded-gates/temp/regression/current-three-atlas.png.

Target61 scoped ROI sums: inkLoad732155→729329(−0.386%), inkDry714131→713718(−0.058%), coverage/V unchanged. Это не fullfield conservation. Fixedcore alpha233.23→222.02; wholePNG support177734→197689, optical alpha12504725→13580239. Это перераспределение и optical response, не доказательство массы. Halo обоих имеет triangle lattice, отдельный accepted baked-gradient flag gate готовится.

CPU13tests PASS: existing wetDiffusion invariants (mass, positivity, dry confinement, radius schedules) и новый actual emitted gate regression: wet face не закрывается при изменении pigment/absorption amplitude, dryface остаётся0, противоположные directions equal. На old shader новый regression fails (exit1), fixed passes. Проверка использует emitted expression production WC_DIFFUSE_FRAG, не копирует формулу для ожидаемого результата. Existing K(D+B)≤1 тест не дублируется. Webtypes/fullengine/snapshot integration на source candidate ещё pending; no default publication до hardware visual+foreign/native/replay.


Typed activation: optional PencilEngineOptions.gradientFibres (standalone omitted=false); Room passes true. Constructor sets flag before _initGL; warm runs after initFieldUniforms AND initFieldAttributes. Existing program-cache invalidation in initFieldPrograms enables one synchronous rewarm on context restore. Readiness regressions verify exact actual init order, no createProgram on first marked mode1 operator, fresh program after restore, and no warm for default standalone boot/restore. Two new tests PASS; types/full source review pending. No asynchronous prewarm API is invented: existing warm is synchronous.

### Два текущих сохранённых рисунка и Adreno

Свежий полный curated42 sheet3, без Room/snapshot/native/ACK claims: очищенный diffuse + baked выполнил 68 фактических gradient-операторов, GL0, непустые P/C. Закрытая светлая линия и треугольная решётка исчезли; ядро и внешний halo сохранились. Сумма P в scoped target ROI изменилась 730830→731479 (+0.089%); это не доказательство глобального сохранения массы. Whole endpoint и исходный журнал сохранены HOME `ring-regression-cea/temp/clean-baked-pair`.

Foreign sheet4: неизменные 24 исходные операции, исключён только reference image (23 исполняемых), target WSfGdMae5C/seq39, полный водный/структурный prefix сохранён. Оба плеча выполнили 64 gradient-оператора, GL0, непустые material, собственные Chrome закрыты. Форма и цвет пересекающего лужу мазка сохранились; scoped optical core alpha −1.15%, support +0.16% — оптические метрики, не масса. Raw HOME `ring-regression-cea/temp/foreign-clean-baked-pair`; VPS atlas/report `728-ring-expanded-gates/temp/regression/foreign-clean-baked-*`.

Samsung salted whole-program cold 2026-10-07: Chrome154, Adreno650; baseline diffuse5913B, clean diffuse4372B, полный baked field40170B — три успешных link, GL0/context intact. Свой target1455 закрыт. Raw `728-ring-expanded-gates/temp/regression/samsung-clean-cold-retry1/report.json`. Первое создание target через /json/new HTTP500 не создало GPU контекст; сохранено отдельно. CrossGPU typed-constructor replay остаётся отдельным текущим gate.

### Typed boot и тот же журнал на двух GPU

Коммит34050f9a: optional constructor gradientFibres, Room true/standalone false; синхронный warm после field uniforms/attributes, автоматический rewarm при context restore. 21 targeted test PASS (root исправил только TS private access в тесте). Нет runtime-переключения private flag или ручного prewarm в следующем аппаратном gate.

Samsung same42 typed constructor: session36167 EXIT0, own1457 CLOSED, Chrome154/Adreno650, GL0/lostfalse, 68 фактических baked calls и непустые P/C/V. Архив929 tracked SHA, bundle7dcbd4bff3ac7135e39281d8254a13f90ec69031964ff15b250f9201d47ccd5e, journal ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9. Raw VPS `728-ring-expanded-gates/temp/regression/samsung-warm-same42-retry1`.

Vega слева/Adreno справа в `vega-left-adreno-right.png`: кольцо и решётка отсутствуют в обоих, ядро/halo визуально сохранены. Побайтового crossGPU равенства нет: whole opaque101422px/max65; transparent35057px/max255, alphaMax76/premultMax76. Support197688→197934. Это положительный визуальный/операторный gate, не strict crossGPU pixel parity. Первое boot-guard failure1456 проверяло вымышленное имя `_gradientFieldProgram`, исправлено на реальный `_gradientField.program`; сохранено отдельно, не source failure.

### Контроль унаследованных crossGPU outliers

Два дополнительных полных same42 Samsung gate, session30094 EXIT0, own1459/1460 CLOSED, GL0/material nonempty, bakedCalls0. Старый c092 bakedOFF против сохранённого Vega: opaque max57 (p99=1,p99.9=5, >16:29px), transparent alphaMax66/premultMax58.06 (>8:1066px, >16:63px). Clean340 constructor gradientOFF против сохранённого Vega noDensity: opaque max65 (p99=1,p99.9=5, >16:19px), transparent alphaMax76/premultMax76 (>8:978px, >16:35px).

Clean gradientOFF имеет тот же worstpoint994,1231 и alpha50→126, что bakedON. Таким образом outlier76 присутствует без baked; приписывать его новой шумовой программе нельзя. Density removal меняет распределение редких GPU outliers; strict crossGPU equality не достигнуто. Эти controls устанавливают конкретную границу утверждения, а не объявляют ошибки шумом или нормой. Raw `samsung-inherited-c092` и `samsung-clean340-gradientOFF` рядом с первым crossGPU report, полные PNG/журнал сохранены.

### Подготовка первого расходящегося прохода (CPU only)

Worst994,1231 находится на внешнем fringe water Gq9CPrzxWh/seq64 (normal100:0 chisel), затем pigment ytlRBmw3Tg/seq65 (normal100:100 chisel), washCEiuPnsbmF. Существующий material capture seq61 не покрывает этот участок: исходное поле до расхождения неизвестно, нельзя приписать outlier конкретному оператору.

Переносимый QA-only контроллер `docs/qa/harness/728-crossgpu-neighborhood`: неизменные42 операции/41 исполняемая, исключена только reference imageYr38r8lLbf; sourcef685 (web/shared byte-equal1f), public constructor gradientFibres:false. Точки before/after actual diffuse и выбранных field0/1/6/7/14/15/16/19, post64/post65 raw P/C/V/coverage/composite tile. Физический origin/S берётся из actual noteStorageBounds + fieldFor, а не угадывается по размеру1536. Top→GLbottom, offset/S2, halfopen, clipped bounds, original return/arguments, FBO restore, row cap и semantic alignment проверены CPU controls. Runtime/GPU не запускался.

Принцип: read-only наблюдение реальных входов/выходов, без изменения операторов. До512 compact records; cap hit делает gate incomplete. Выравнивание сначала проверяет ops/stage/domain/readbounds, затем сравнивает bytes; handleIDs/clock не считаются material difference. Высота: raw uploaded LA SHA, исходные четыре байта и intended CPU bilinear плюс actual sampler settings; это НЕ измеренная GPU height interpolation. LUMINANCE_ALPHA paper нельзя молча считать RGBA-renderable FBO. Если входы уже различаются до diffuse, следующий диагноз должен искать более ранний оператор; если расходится первый output, гипотеза GPU arithmetic/sampling остаётся гипотезой до отдельного измерения.

Перед запуском требуются explicit source-passport и полный private ops path, source/runtime verification, ownership grant и HOME RAM preflight. Один собственный target/engine, bounded360s/arm, Tracing не используется. Raw/secrets/journal в Git не добавлены. Этот commit не меняет модель и не объявляет pixel parity PASS.
