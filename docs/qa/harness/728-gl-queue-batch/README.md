# Solver tag batching: диагностический OFF-кандидат

`WatercolorSettleQueue.diagnosticSolverBatchEnabled=false` по умолчанию.
ON допускает только смежные уже помеченные contact либо front операции:
не более4 заtick, остановка после8мс, измеренных после syncGpu **каждой**
единицы. Capture/upload/unmarked операции — барьер; переход contact↔front
тоже барьер. Presentation группы не включаются. При drawing или late frame
остаётся исходная политика1операция/пропуск, без continuation tasks.

Порядок GPU операций и callbacks не меняется: каждый `advance()` выполняет
ровно исходное замыкание, сохраняет каждыйtexturewrite/Q8boundary, затем
исходные ownership/liveness/finish правила. Добавленная синхронизация не
устраняет и не объединяет оригинальныеpasses. При cancel/throw/wash teardown
последующие операции не выполняются. Полный synchronous drain не изменён.
Не объединяются новые gestures/jobs, не изменяются seed/profile/dose/solver.
Source coroutine/ribbon не помечены contact/front: их streaming preview не
пропускается. Но промежуточная частота показа оседания может измениться:
визуальную анимацию/живое перо/Room нужно проверять отдельно, GPU byte gate
этого не доказывает. Добавленный syncGpu может ухудшить время/frame pacing.

Queue capture добавляет tickstarted/ended/gap/nexttag/drawing/readyReason.
Reason — наблюдение результата, не вмешательство в admission: next/index
может смениться при callback chainedjob. Gap — междуticks, а не самrAF.

CPUtests: исходные29 +4контрактных теста =33PASS; контроли cap4, synced8ms,
class/upload barriers, drawing, cancel, равенство последовательныхQ8шагов.

## Surface measured gate

Frozen f9be0d84. Четыре собственные свежие страницы OFF/ON/ON/OFF:
5895.9 / 2427.2 / 2476.6 / 6077.5 paint мс. Средние5986.7→2451.9,
наблюдаемое уменьшениеwall≈59% в этой одной серии. Все 26 полей,
целый материал, RGBA иtape совпали побайтно. Undo stroke-2 действительно
изменил материал, redo восстановил точно во всех4arms. GL errors=0/lost=false.
Это whole фиксированный packed replay 400/Fine, не обещание59% обычного Room или пера.

334 ticks → 133/134; contact204/front70 сохраняются. Legacy barrier counter
60→61 оставлен вreport, не скрыт: wrapper считает `advance()` даже без
следующего оператора (completion), это не GPU pass count. Тела tick суммарно
OFF135/137ms, ON96/124ms; P95OFF0.5ms/ON1.0–1.2. Synccallback272/271,
CPU elapsed3.7/4.7ms — не доказательство физической GPU завершённости.
GapP95ON16.9–17ms, max64–70ms: разница числа ticks реально измерена,
но отдельные паузы ещё есть. MaxbodyON26/38ms обусловлен в том числе
не batchable barrier/finish; лимит 8 ms ограничивает только группы tagged units,
одна атомарная операция может превысить его.

Defaults OFF; перед actual Room включением нужны animation/source preview,
первый/следующий контакт пера, вода→пигмент, большой зигзаг, zoom, concurrent
participants/undo/reentry на целевых устройствах. Изменение расчёта не означает
доказанно удовлетворительную анимацию промежуточных frames. Samsung не проверен.
RAM preflight≥1700, минимум 1013 MiB при abort 500; после close free 1893 MiB.
Raw ignored temp/device-runs/gl-queue-surface.json, compact surface-summary.json.

CPU verification: 49 tests (33 queue +16 frozen plan), app/harness TypeScript и oxlint
PASS. Отдельный controller требует GATE_URL, не коммитит private URL, создаёт
свежие собственные страницы, закрывает после любого исхода. Новый stand
использует существующий gallery preview сервис без смены default/production.

## Обычная Room на Surface

Изолированный QA backend4558/PG55549, собственный DEV frontend5352;
два свежих проекта Fine1024×1024. `qaJoinedTouch=1`, остальные mixed,
deferred, asyncFinish и materialPresentation OFF. `qaSolverBatch=0/1`
применяется только в DEV constructor; production query его не включает.

Четыре реальные PointerInput последовательности внутри страницы: мокрый
пигмент400, второй DOWN примерно200мс послеUP при ещё активном settle,
вода без пигмента400, затем пигмент поверх неё. Это синтетические события
в штатных обработчиках Room, не измерение настоящего касания физическим
стилусом. Elapsed сцены10931.5→6650.8мс (наблюдаемые39% в однойOFF/ON серии).
Dry через штатную кнопку; клавиатурныеUndo действительно меняют материал,
Redo точно восстанавливают; перезаход после восстановления7serverops
сохранил тот же материал у обоих. InitialOFFreentry observer ошибочно прочёл
новыйengine с0ops доbackfill, исправленный bounded readonly reentry gate
прошёл; первоначальный false raw сохранён, не выдан за сбой модели.

**Плавность не прошла полностью.** Pigment-over-water даёт активный gap
533.4мсOFF/450мсON. Second-pigment при active settle: OFFmax16.8мс,
ONmax83.5мс (дваgap>33); возможный риск, пока один cohort, не статистический
регресс. Общие18→24gap>33 нельзя сравнивать без длительности/фазы: ON сцена
короче. Source остаётся живым, но частота промежуточного показа меняется.
Только финальныеPNG сняты; animation filmstrip во время рисования не снят,
поэтому «нет карандаш→пигмент артефакта» или хорошее морфирование не доказаны.

First DRAW/DISPLAY отмечены CPU submission timestamps. При наличии старого
settle первыйdraw может быть его drain до нового пигмента! Быстрые9–17мс
DOWN не означают мгновенный видимый цвет. Дальнейший offline probe
`room-phaseProbe.mjs` отдельно ограничивает onStart/completeSettle/onMove/
source/runSlice/GL1upload/finish CPU интервалы, без query/readback/new fence.
Он ещё не выполнялся на устройстве. Полусекундныйgap может соответствовать
GPUочереди после синхронной отправки старого job, но причина этим trace ещё
не доказана. Нужен фазовый замер, а не произвольная замена шейдера.

Peer не добавлялся под RAM guard, Samsung обычная Room не проверен.
Все собственные страницы закрыты, post-release free2002MiB. Raw
`temp/device-runs/queue-room-{surface,reentry-surface}.json`, compact
`room-surface-summary.json`; source flags имеют отдельныйcommitca9f8bc2.
Defaults OFF до live/animation проверки. Заключение — быстрее завершение
канонической сцены, ещё не решение всех проблем отзывчивости.

### Уточнение фазы длинного gap (offline RAW)

Большой gap не расположен сразу на первом MOVE. После DOWN pigment-over-water
rAF OFF приходят на +15.8,+32.7,+49.2,+66.0,+82.6ms, затем +616.0ms;
ON +15.3,+32.0,+81.9,+98.6,+115.2ms, затем +565.2ms. Таким образом
задержка проявляется после нескольких обработанных MOVE, а не доказывает
блокировку самого первого MOVE. Она может включать ранее отправленную GPU
работу, очередное исполнение source/solver либо иной stall; текущий trace
не различает эти причины и не доказывает cold compilation/allocation.
CPU probe добавляет preset/tool, вложенность и allocation hooks
_makeLayerBuffer/_createBuffer/_destroyBuffer. Его два unit gate проверяют
порядок drain→source, неизменные return/throw и bounded recorder/detach;
GPU/экранную задержку эти тесты не измеряют.

### ONE CPU phase probe на Surface

Frozen `b63329bd`, ON ordinary Room, те же четыре PointerInput gestures.
988 bounded rows, dropped0; GLerrors0/lostfalse. MinRAM1280MiB,
после закрытия своей страницы2029MiB. Scene6675.8ms — instrumented,
не новая сравнительная оценка ускорения. RAW сохранён отдельно
`temp/device-runs/queue-room-phase-surface.json`; sanitized compact
`room-phase-surface-summary.json`.

Pigment-over-water: old settle next34/187 перед DOWN; _completeSettle4.8ms,
DOWN7.6ms. rAF +15.7,+65.8,+82.5,+99.2,+515.9ms: gap416.7ms снова есть.
_handleMove перед ним начинается на +99.5ms и занимает0.1ms; следующий
начинается на +528.1ms и занимает1.1ms. Внутри промежутка нет выполнявшихся
покрытых _paintDabs/_paintRibbonDabs/_runSlice/allocation/upload/finish/
_display методов. UP37.9ms выполняется позднее. Следовательно этот gap
не объясняется CPU длительностью этих вызовов. Это не доказательство
конкретного browser/GPU виновника: предшествующая GPU очередь, browser
scheduling или непокрытый task остаются возможны. Начальный drain старой
воды отправляет GPU работу быстро на CPU; время её GPU исполнения этим
probe не измерено. Generator resume/pool internals отдельно не покрыты.
Inclusive nested CPU durations не суммировать. rAF timestamp не равен
моменту исполнения callback и не показывает реальную задержку экрана.

### Joined mixed: локализация и отдельный exact gate

ONE actual Room pair, queue ON, joinedTouch ON, deferred/async/material OFF.
Mixed OFF water→pigment400: первые rAF до +82.5ms, затем +482.5ms (gap400ms).
Mixed ON: 27rAF до +465.8ms, максимальный gap в этой фазе33.3ms. Captured
finish/lease сохраняет старый водный job; DOWN не досылает его153+операций.
OFF DOWN10ms/complete6.6ms, ON DOWN5.8ms; старый drain теперь происходит
при UP15.7ms, весь UP55.7ms. Scene6688→6904ms, ускорение whole не доказано:
работа перенесена с живого ведения кисти к отрыву. Общий maxgap400ms остаётся.
ONE instrumental pair не доказывает стабильность/физическую pixel-onset.

Отдельный static no-React fixture `mixedQuality.mjs`: те же fixed400 water→pigment
inputs, queueON/deferredFALSE/mixedOFF→ON. Нет post-DOWN pixel probe старого
joined-mixed harness; hash/readback/export только после natural idle.
24 named roles (14 tile/10 working), wholeRGBA и packed material EXACT.
Meaningful Undo и exact Redo прошли обеих arms. Это24, не прежний26-role gate,
не full peer/layers/reentry proof. GLerrors0; minRAM1460/free2074MiB.
Static DOM host устранил два harness-only failed starts (missing surface и
SPA navigation); failed raw сохранены. Итог raw `queue-mixed-quality-surface.json`.

Review manifest содержит runtime SHA и query flags, private host/room URL
хранятся вне Git. Runtime unchanged, defaults OFF. Для смотрин проверять
отдельно: foreground water→pigment, второй цвет касается мокрого первого,
а также задержку UP/следующего DOWN. Filmstrip до сих пор не записан.

### Следующий UP кандидат, пока CPU-only

Никаких изменений source/runtime смотрин. Existing opt-in
`qaJoinedFinishDeferred=1` совместно с joined/mixed сохраняет immutable
successor finish и lease-owner при UP. Старый job завершается в обычной
очереди; затем его complete запускает captured successor exactly once.
Q8 passes/order не меняются, publication/checkpoint/export блокируются,
пока held successor не готов. Это ещё не аппаратный proof качества/плавности.
Третий DOWN при незавершённом successor сохраняет conservative drain,
поэтому бесконечную цепочку без задержек этот кандидат не обещает.

Новые CPU edge fixtures: water100/pigment0 → pigment100, queue ON;
OFF/ON UP barrier, captured pigment profile/colour после изменения tool,
ordered Dry с обоими accepted strokes, Undo pending owner/stale resume.
Вместе с существующими joined/deferred suites: 27tests PASS.
Команда из repo root:
`npx vitest run --config docs/qa/harness/728-gl-queue-batch/mixed-deferred-vitest.config.mjs --maxWorkers=2`.
MockGL не доказывает actual RGBA; next hardware требует separate passive
Room cohort и same-input exact/history, после освобождения Surface.
