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
доказанно удовлетворительную анимацию промежуточных frames. Samsung отдельно прошёл fixed replay gate: [53.7% wall / exact26fields](../728-gl-queue-samsung/README.md). Живой Room на Samsung пока не проверен.
RAM preflight≥1700, минимум 1013 MiB при abort 500; после close free 1893 MiB.
Raw ignored temp/device-runs/gl-queue-surface.json, compact surface-summary.json.

CPU verification: 49 tests (33 queue +16 frozen plan), app/harness TypeScript и oxlint
PASS. Отдельный controller требует GATE_URL, не коммитит private URL, создаёт
свежие собственные страницы, закрывает после любого исхода. Новый stand
использует существующий gallery preview сервис без смены default/production.
