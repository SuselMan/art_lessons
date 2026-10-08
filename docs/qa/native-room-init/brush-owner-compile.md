# #728: отдельный compile-кандидат contact owner

До кандидата создание каждого `CanonicalPlanAdapter` компилирует paired и single
brush programs. `brushPair()` всегда возвращает false, original producer выполняет
два отдельных `brushPass()` через `encodeSingle()`. Paired program в реальной Room
не используется. Backend Room-owned уже не создаёт своего duplicate brush.

Кандидат `CanonicalBrushContact(device,deferPaired=true)` компилирует **single
сразу**, deferred paired — только при явном `encode()`/paired getter. Room-owned
adapter выбирает deferPaired; standalone/diagnostic default false сохраняет прежний
eager paired→single порядок. Single compiler cost не переносится на первый contact.
WGSL strings, constants, pipeline descriptor, uniform bytes, scissor, dispatch,
контактная математика, Q8 и original два-pass schedule не изменены.

Регрессия сравнивает module code/labels/descriptors eager и Room variant, actual
`encodeSingle()` P затем C uniform byte arrays и compute command order/dispatch;
deferred paired по явному diagnostic запросу совпадает с прежним descriptor и
создаётся один раз. Это CPU/ownership proof; **GPU timing/FPS выигрыш не измерен**.

## Почему один pipeline не решает все затраты первого штриха

Первый actual owner создаёт native target1024 (4MiB), finish composite pipeline,
canvas bridge/pipeline, performs GL seed readback и GPU upload/completion wait.
Scratch material и film/solvent fields выделяются только в первом source quantum,
а CPU recipe уже подготовлен. MAX+pigment/color+solvent ветка может создать original,
coverage, P/C, running coverageFilm, четыре pigment/color film/base и три solvent
record —12×4MiB=48MiB scratch дополнительно к target (ветки проверяются исходным
кодом, это не замер реального heap). Source phase pipelines lazy компилируются по
нужной фазе/blend при первом emission. Неизменный fieldOp program тоже lazy и может
скомпилироваться при первом landing. Planner1536 появляется позже, не в INIT.

Поэтому ожидаемый результат узок: убрать один заведомо unused shader compilation
с каждого первого owner. Живой first stroke ещё может быть ограничен GL seed,
GPU driver allocation/compiler и source→live→bridge barriers. Ранее standalone
native exact kernels/bridges не доказывают whole Room FPS/performance. Нужно actual
first40 correctness, water→pigment, затем cold/warm400 timestamped runtime отдельно.

Устройства в этом атоме не запускались; root сохраняет аппаратный слот.
