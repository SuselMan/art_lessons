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
