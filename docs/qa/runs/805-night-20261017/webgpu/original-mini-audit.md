# #805: следующий эксперимент для существующего Mini1024

Аудит CPU/source-only, база c78c3068. Старый пользовательский стенд и движок не менялись. Это оптимизация прежнего расчёта, не аргумент за другой API. Длительности ниже — историческая диагностическая синхронизация #802, не новые измерения и не чистое время GPU.

## Что уже делает #802

[front-zero-source.cjs:4–29](../../../prototypes/mini-worker/front-zero-source.cjs) добавляет ранний возврат при `best==0` и конечных ограниченных неотрицательных cost/stride/floor/dryCost/climb. Сосед не может улучшить нулевую цену неотрицательным переходом. Исходные R/G/B/A-выражения сохранены. Есть отдельный guard native-front и prefix-jump; prefix **build** не сокращается. [build.cjs:7–13](../../../prototypes/mini-worker/build.cjs) — opt-in QA flags; сам коммит не доказывает, какие flags/JS SHA сейчас у конкретной открытой страницы.

Число проходов, размер1024², scalar uniforms, формат и порядок итераций не меняются. Переход на Worker и отсутствие RAF-пауз не устраняют GPU-очередь. Gather-specialization/finalOnly уже давали совпадающие поля, но доказанного ускорения не дали ([802 findings](../../802-gpu-queue-20261017/findings.md)). Поэтому повторять их как новое решение не стоит.

## Конкретная цена текущего алгоритма

В [существующем one-wave per-op trace](../../../harness/802-presentation-cause/samsung-per-op-summary.json), finalOnly, после source границы:6reset draws,153draws в89логических шагах,2draws окончательного dry/render. Из161draw **61 фронтовый**:28native +17prefix-jump +16prefix-build. Native28 =8outward +10inward +10group-dry; логический шаг может содержать4frontdraw, «90операций» не означает90draw. Это один исторический inputSHA9c3abe9f…; не универсальное число для любого мазка.

- [WatercolorSettlePlan:564–619](../../../../../apps/web/src/engine/src/raster/WatercolorSettlePlan.ts): outward schedule, inward2flat+remaining, mode11/mode6+gather. [WatercolorFrontPaths:7–13,112–149](../../../../../apps/web/src/engine/src/raster/WatercolorFrontPaths.ts): ceil(steps/8)+8unit; stride8 prefix строит4direction-pairs ×(1base+3aggregate)=16draw, затем17jump в этом trace.
- [shaders.ts:4131–4167](../../../../../apps/web/src/engine/src/raster/shaders.ts): nonzero fragment вычисляет feather `wcFbm` **до** проверки8соседнихci. [wcFbm:249–251](../../../../../apps/web/src/engine/src/raster/shaders.ts):2octaves ×4lattice samples =8source-level noise fetches. Даже недостигнутая сухая область, где всеci≥.999, платит за ненужный feather. В loop `film` инвариантен для текущего fragment и в исходнике считается для каждого подходящего соседа; компилятор может уже вынести это, фактические texture transactions по тексту не определяются.
- [WatercolorFrontPaths:32–49](../../../../../apps/web/src/engine/src/raster/WatercolorFrontPaths.ts): base edge-build тоже дорогой (2directions ×8noise fetches наpair fragment); jump уже использует подготовленные цены, поэтому его нельзя назвать повторным FBM. Native более перспективен для простого локального control без новой текстуры/квантизации.
- [ContrastPhase:17–24](../../../../../apps/web/src/engine/src/watercolor/puddle/ContrastPhase.ts): обязательный `selection.readPixels()`256²RGBA (256KiB), CPU connected components и upload keep. Это реальный sync/reset tail. Обычный путь не читает full P/C только ради вычисления цели; full hashes/backgroundReadback — QA, residency eviction может добавлять отдельные чтения. [PuddleTarget:175–198](../../../../../apps/web/src/engine/src/watercolor/puddle/PuddleTarget.ts) затем выполняет8background ops+2dryguards: smoothing4×P/C (8draw) и2reconstruct+copies.

Исторические dependency waits: передreset70.4мс, послеreset12.8мс, поздние frontgroups33.9/30.1/19.4мс, prefix17draw31.7мс. Эти пробные чтения сами меняют очередь; их нельзя сложить в обычный latency или назвать profile чистого kernel. Но они указывают на дорогой front до final mix, а не на необходимость менять весь backend.

## Изолированный lazy-noise control

[native-front-lazy-source.cjs](../../../prototypes/805-algorithm-search/webgpu/native-front-lazy-source.cjs) сохраняет RHS climb/film, neighbour order, skip threshold, relief/min и output дословно; вычисляет climb/film только при первом `ci<.999`. Нет нового буфера, sampling origin, итераций, readPixels, качества шума или математики. Нулевой guard остаётся раньше. В недостигнутой области feather не нужен вообще. Значимый эффект возможен именно по большой пустой части поля; величина заранее неизвестна, dynamic branching/компилятор могут свести выгоду к нулю.

Подключение к **новой собственной сборке**: один esbuild onLoad для raster/shaders.ts, `source=transformFrontZeroSource(source)` затем `source=transformFrontLazyModule(source)`; jump-zero прежний отдельный loader. Actual-program installer может вызвать `transformFrontLazyShader(WC_WATER_FRONT_FRAG)` после существующего zero. Дубли/дрейфanchors/повторное применение fail closed. Type declarations `.d.cts` рядом. Старую страницу/JS assets не заменять.

4CPU tests: real-source+zero composition, unchanged eligible expressions/output,25920bounded f32-reference cases (ci0/.998/.999/1, best0, bounds0..65536), unused-noise path. Это proof изменения ветвления в CPU модели, **не** GLSL compiler/texture precision proof. GPU gate: natural→normalrepeat→lazy из одного raw source, full P/C/coverage SHA/repeats; только затем pairedwarm timing без observer reads. Минимум wave/dot/two-colors/water-only, плюс false/zero-boundary case. No-MIP texture policy и восстановление owned program должны совпасть. Если байты расходятся, control не продвигать.

Следующие варианты после результата: flat-climb0-specialization сохраняет центр G, но затрагивает лишь часть unitpasses; precomputed feather/height требует float-exact storage, RGBA8 LUT добавит квантизацию и не является безопасным exact shortcut. Сначала проверяем lazy, без нового cache/большого архитектурного переноса.
