# Solver tag batching: диагностический OFF-кандидат

`WatercolorSettleQueue.diagnosticSolverBatchEnabled=false` по умолчанию.
ON допускает только смежные уже помеченные contact либо front операции:
не более4 заtick, остановка после8мс, измеренных после syncGpu **каждой**
единицы. Capture/upload/unmarked операции — барьер; переход contact↔front
тоже барьер. Presentation группы не включаются. При drawing или late frame
остаётся исходная политика1операция/пропуск, без continuation tasks.

Порядок GPUопераций и callbacks не меняется: каждый `advance()` выполняет
ровно исходное замыкание, сохраняет каждыйtexturewrite/Q8boundary, затем
исходные ownership/liveness/finish правила. Добавленная синхронизация не
устраняет и не объединяет оригинальныеpasses. При cancel/throw/wash teardown
последующие операции не выполняются. Полный synchronous drain не изменён.
Не объединяются новые gestures/jobs, не изменяются seed/profile/dose/solver.
Source coroutine/ribbon не помечены contact/front: их streaming preview не
пропускается. Но промежуточная частота показа оседания может измениться:
визуальную анимацию/живое перо/Room нужно проверять отдельно, GPUbytegate
этого не доказывает. Добавленный syncGpu может ухудшить время/frame pacing.

Queue capture добавляет tickstarted/ended/gap/nexttag/drawing/readyReason.
Reason — наблюдение результата, не вмешательство в admission: next/index
может смениться при callback chainedjob. Gap — междуticks, а не самrAF.

CPUtests: исходные29 +4контрактных теста =33PASS; контроли cap4, synced8ms,
class/upload barriers, drawing, cancel, равенство последовательныхQ8шагов.

## Surface measured gate

Frozen f9be0d84. Четыре собственные свежие страницы OFF/ON/ON/OFF:
5895.9 / 2427.2 / 2476.6 / 6077.5 paint мс. Средние5986.7→2451.9,
наблюдаемое уменьшениеwall≈59% в этой одной серии. ALL26fieldrecords,
wholematerial, RGBA иtape совпали побайтно. Undo stroke-2 действительно
изменил материал, redo восстановил точно во всех4arms. GLerrors0/lostfalse.
Это whole fixedpackedreplay400/Fine, не обещание59%обычногоRoom или пера.

334ticks→133/134; contact204/front70 сохраняются. Legacybarrier counter
60→61 оставлен вreport, не скрыт: wrapper считает `advance()` даже без
следующегооператора (completion), это неGPUpass count. Телаtick суммарно
OFF135/137ms, ON96/124ms; P95OFF0.5ms/ON1.0–1.2. Synccallback272/271,
CPUelapsed3.7/4.7ms — не доказательствофизическойGPUзавершённости.
GapP95ON16.9–17ms, max64–70ms: разницачислаticks реальноизмерена,
но отдельныепаузыещёесть. MaxbodyON26/38ms обусловлен втомчисле
неbatchablebarrier/finish; лимит8ms ограничиваеттолькогруппыtaggedunits,
однаатомарнаяоперацияможетпревыситьего.

DefaultsOFF; передactualRoom включением нужны animation/sourcepreview,
первый/следующийконтактпера, вода→пигмент, большойзигзаг, zoom, concurrent
participants/undo/reentry нацелевыхустройствах. Изменениерасчёта не означает
доказанноудовлетворительнуюанимациюпромежуточныхframes. Samsungнепроверен.
RAM preflight≥1700, минимум1013MiB приabort500; послеclosefree1893MiB.
Rawignoredtemp/device-runs/gl-queue-surface.json, compactsurface-summary.json.

CPUverification:49tests (33queue +16frozenplan), app/harnessTypeScript иoxlint
PASS. Отдельныйcontroller требуетGATE_URL, некоммититprivateURL, создаёт
свежиесобственныестраницы, закрываетпослекакогоугодноисхода. Новыйstand
используетсуществующийgallerypreviewсервисбезсменыdefault/production.
