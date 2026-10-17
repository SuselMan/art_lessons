# Macro2: художественные механизмы после transport-canary

v1 hardware дал настоящий дальний перенос, но Darcy018 выглядит гладким размытым пятном с видимыми кодовыми кольцами. Это не художественная победа. В малой каплеR26 при большом двумерном horizon сохранение массы неизбежно снижает среднюю плотность; простое увеличение RGB после расчёта подменило бы материал. Macro2 меняет распределение и фиксацию carriers, не умножает готовый цвет/альфу шумом.

## Мобильный и закреплённый пигмент

`macro2-sorption.ts`, export `macro2Definitions`. Неявный перенос сохраняет концентрацию относительно W*paperCapacity, затем отдельная реакция обменивает mobile↔fixed. Paper capacity меняет, где масса скапливается; осаждение сильнее в выбранных бумажных долинах/менее мокрых клетках. Остаток закреплённого pigment остаётся на месте и может быть поднят обратно заданной desorption. Mobile+fixed сохраняются в идеальной арифметике, rates ограничены для nonnegative pools. Final sum производится до pack; optional10%initialfine residual сохраняет часть детальной формы. Никакой post-noise/rim/bias brightness операции.

Параметры не откалиброваны для реального PB15. Называть это реализацией всей Curtis/MoXi нельзя. Исходная идея разделённых mobile/fixed состояний соответствует [Curtis et al. §4](https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf) и [Van Laerhoven et al., 2004 §3](https://www.cs.ucf.edu/courses/cap6105/fall09/readings/watercolor_sim.pdf). Эти работы различают перенос в поверхностной жидкости, deposition и capillary paper water, а не дают основание просто рисовать шум поверх blur.

## Fine-grid частицы

`macro2-particles.ts`, export `particleDefinitions`. 1024fine input, без coarse averaging. Каждый исходный pigment pixel запускает4/8/16 subparticles с **фиксированным input.seed** и integer hash; никакого Math.random/Date/time. Каждый walk проверяет всю траекторию с шагом≤1px, а не только конец длинного перехода. Направление выбирается с paper-affinity и persistence, то есть цвет фактически переносится по path. Это Brownian/biased-particle исследование, а не точное дискретное исполнение MoXi. [Sun et al., 2018](https://strathprints.strath.ac.uk/64963/1/Sun_etal_i3D_2018_Fluid_computational_model_for_mineral_and_vegetal_pigments_diffusing.pdf) рассматривает Fick/Brownian pigment-water motion; наша модель не воспроизводит их полный материал/результат.

Все splats накапливаются atomic u32, поэтому порядок GPU threads не меняет целочисленную сумму. Общий power-of-two quantum подбирается по ВСЕЙ input alpha: totalAlpha*quantum≤2^32−1, quantum≥samples; source premultiplication дополнительно ограничивает каждуюRGBсумму alphaсуммой. Per-particle channel units целые. Bilinear alpha shares разлагаются в4целых части, сумма точная; RGB распределяется через CDF alpha capacities, поэтому на КАЖДОМ destination RGB≤A и полный исходный channel sum сохранён без дополнительного clamp. Максимальное произведение при CDF делении65280²<2^32. Глобальные atomics не переполняются даже при всех частицах в одной клетке.

Ограничения: trajectories f32/weighted selection, поэтому между GPU совпадение заранее не доказано. Один seed даёт воспроизводимость, не универсальное художественное качество; finite particles могут выглядеть зерном/точками/лучами. Final RGBA8 saturation/rounding всё ещё может терять массу. Доказанный integer ledger относится к pre-pack accumulator, не к последним PNG. Бумажная чувствительность на flatpaper отсутствует по определению — обязательно сравнить реальные gallery inputs с настоящей paper height, а не признать канарейку финальной картиной.

## Смысл следующих проверок

1. Большая лужа+капля / два раздельных цвета в одной воде: actual carrier за50/100/200px и контакт цветов, не grain count.
2. Сухая1pxполоса / раздельные лужи: отсутствие tunnelling. Paths и interpolation fallback обязаны оставаться в мокрой области.
3. Реальные gallery inputs: сохранение силы ядра, плавность градиента без concentric8bitrings, негрубая бумажная структура, фактический перенос между мокрыми частями. Для почти сухого штриха отсутствие большого reach нормально.
4. Повторы full outputSHA + mass bychannel + saturation/quantization loss, а не только alpha pixelcount. GPU completion отдельно от upload/readback.

CPU macro2:5 tests PASS, strict TypeScript PASS. GPU/скорость/изображения macro2 на момент этой записи не проверены. Только source/CPU, никаких новых device/process/service ресурсов.

Particle work admission добавлен до аппаратных тестов: default128,000,000 estimated environment reads, explicit override ограничен500,000,000. Верхняя оценка = occupiedWetPigmentPixels*(1+samples*(steps*(16+stepPixels+1)+4)), отдельно1024² исходных чтений. Она учитывает endpoint water+paper для8направлений, path≤ceil(length),4splat probes; не включает atomics/арифметику и не является latency promise. Все3пресета проходят при5000активных пикселях; плотные200k отвергаются, а не молча прореживаются. Это эксперимент для sparse drop, пока не масштабируемое решение широкого густого мазка. CPU work-admission regression PASS; всего macro2 теперь6 tests.
