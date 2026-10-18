# Исходная кистевая структура: отрицательный CPU-опыт

Проверено только сохранённое actual Samsung t4 Lite RGBA из `functional-v25-timestep-results`, сцены mini/sheet3/sheet4/sheet12. Исходные6MiB input SHA совпали с GPU report; target decoded SHA проверен. Flow/GPU/worker/registry не менялись. Выход — **CPU reconstruction draft**, не измерение GPU-скорости и не эквивалент native.

В каждой8×8ячейке исключены stationary slots exact fast-initializer. InitialWetRGBA=0 при исходной воде0. Остаток `R_i=nFree*initialWetRGBA_i−sumInitialWetRGBA` имеет точную нулевую сумму каждого канала. Общий рациональный k ограничен всеми четырьмя nonnegative bounds, alpha≤255 и A−RGB≥0. Strength0/.5/1 умножает этот k, без clamp. Alpha округляется по fractional priority до исходной суммы ячейки; затем RGB до своих исходных сумм под уже целочисленной alpha-ёмкостью; deterministic spare-capacity fallback предусмотрен. Stationary target slots не меняются. Нулевой target не может воскресить пигмент/отсутствующий цвет.

1000seeded inputs×3strength CPU PASS: все4целочисленные суммы каждой ячейки точны, premul/cap, stationary неизменны, strength0 exact target. Реальные12выходов также прошли exact guards. Strength1 изменил mini — 227488px, sheet3 — 12945px, sheet4 — 59675px, sheet12 — 39011px. Strength.5:226608/12764/58350/36892px. Actual SHA и counters в `detail-preserving-actual.json`; rounding fallback codes0 на этих входах.

## Что видно

Два side-by-side PNG показывают0/.5/1 с явной меткойCPU DRAFT. На mini и sheet4 .5/1 дают сильную клетчатую рябь8px и белые разрывы внутри следа. Острая исходная текстура возвращается в старых координатах, без переноса вместе с изменившимся wash; общий k ограничивается разными пикселями каждой ячейки, создавая скачки по границам. Это не аккуратное сохранение кистевого характера и не улучшение кромки. **Предлагается отклонить прямой8×8residual без GPU-портирования.** Низкая амплитуда могла бы замаскировать дефект, но не устраняет механизм и не предложена как новый вариант.

Native `apps/web/src/engine/src/raster/WatercolorMaterialReconstruction.ts:37` устроен иначе: `base+keep*(new−old)`; fine-film смешивается только в eroded moving-brush core, coarse owns boundary. Затем original*bounded gain используется в core. Color reconstructs optical density per unit mass (`:48`), после чего привязывается к reconstructed mass. Это не независимый поканальный cell residual и не доказанная4channel консервация native; прямой перенос формулы сюда требует отдельного дизайна и не выполнялся.

CPU draft требует cell reductions, общего min-ratio и ordered balanced rounding64slots×4канала; это не бесплатная pointwise PACK-вставка. Для exactGPU реализации потребовались бы workgroup coordination/sort/allocator и новые guards. При текущем плохом изображении такая сложность неоправданна.

Два выбранных CPU DRAFT PNG и report сохранены в приватном review evidence/detail-residual-cpu с SHA/qualification NOT GPU. Их content manifest — detail-preserving-evidence.json; приватные URL/пути в Git не включены. Зарегистрированный own cache detail-805-cpu-20261018 (около69MiB воспроизводимых RGBA/RGB) удалён штатным qa-cleanup finish после проверки SHA выбранных evidence. Исходные защищённые GPU dumps не менялись. Собственных browser/process нет.
