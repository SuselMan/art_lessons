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
