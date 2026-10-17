# После macro2: стоимость частиц и квантование

Read-only/CPU analysis; существующие frozen builds/шейдеры не изменяются. Выбор следующего solver ждёт v3 изображений. Ошибка v2 particle WGSL `target` исправлена только переименованием `drawThreshold`; добавлен воспроизводимый аудит всех10macro shader strings против146reservedwords из W3C CRD20260921. Это наш source compile bug, не аппаратная несовместимость.

## Compact occupied list

Текущий particle walk dispatch=1024² threads: первый source read для каждого, большая часть сразу возвращается. Active часть уже ограничена128Mestimatedenvironmentreads; на канарейке это несколько тысяч исходных пикселей, а не миллион дорогих walks. Поэтому уменьшение dispatch в200раз **не означает** ускорение в200раз: дорогое active pathwork остаётся тем же.

Вариант следующего API: во время уже существующего CPU upload scan собрать exact list indices с alpha>0 &&water>0. Один u32/index, GPU capacity4MiB на1024, CPU list allocated поactualcount. Walk shader получает occupiedCount и1D list binding, dispatch ceil(count/64), sourceIndex=list[gid.x]. All source/paper/seed/particle equations неизменны. Fully dry source возвращать literal original в final pack (original+environment дополнительныеreadonlybindings), а не запускать для него walks. Тогда clear accumulator остаётся GPU clear16MiB, не требуется upload16MiB dry backing. Fine final pack всё равно должен записать1024² output. Bounds/count/empty input нужны отдельные tests. Compile/alloc перед timing, list scan/upload учитываются в totalReady; дополнительный4MiBcapacity нельзя скрывать.

Потенциал: уменьшить idle walk scheduling/исходные чтения и uniform divergence, сохранив вход/particle IDs. Не уменьшает O(occupied*samples*steps*pathLength), поэтому не решает 200kгустой мазок. Возможная выгода устанавливается GPUcompare, не поумножению workgroupcounts.

## Coarse superparticles

Агрегация4×4sourcecells дала бы до16×меньше trajectories, но меняет geometry/initial color mixture и стирает тонкие детали. Один крупный particle не должен нести усреднённый RGB вместо суммы optical carriers. Допустим exact sum4channels +source centroid, но это уже новая модель, не exact compaction.

Есть integer-риск: нынешний exact CDF splat использует product channelUnits*cumulativeAlphaUnits, гарантированно≤65280²<2^32 для одного исходного pixel/subsample. Superparticle может нарушить эту границу, даже если TOTAL atomics всё ещё неoverflow. Нужен дополнительный split крупных carriers на bounded chunks, либо иной exact64bit emulation; WGSLu64непредполагается. Нельзя просто увеличить массу одного particle и оставитьстаруюформулу. Bound обязателен до GPU. Sparse fine compaction безопаснее первой оптимизации.

## Почему carrier f32 всё равно дал PNG-кольца

v1 непрерывный перенос очень малой капли по большой площади уменьшает localalpha до нескольких кодов. Даже f32внутри не устраняет последнюю RGBA8 ступеньку. Round-to-nearest обрезает хвосты ниже.5/255, поэтому часть inputmassисчезает, хотя coarse/atomic ledger сохраняет её. Это формат/вывод отдельно от physics. Искусственное поднятие alpha всего результата было бы ложной компенсацией.

Возможный будущий диагностический pack: одна и та же фиксированная stochastic/ordered threshold для ВСЕХ RGBAchannels. Функция floor(code+threshold) монотонна, поэтому сохраняет premultiplication безclamp, а средняя ошибка unbiased приравномерномthreshold. Это не exactglobalmassproof для одной картинки и создаёт зерно; обозначать как quantizationvariant, не как новыйphysicaltransport/бумагу. Ошибку надо измерять до и после pack. Per-channel cumulative row-error-diffusion удерживает массу строки, но может нарушить RGB≤A и породить горизонтальныеартефакты, поэтому автоматически не выбран.

Более честная проверка градиентов — отдельный float-output renderer/metrics, но текущий common contract/outputgallery работает сRGBA8. Для него сначала сравнить v3 paper-driven particles/sorption: они реально перераспределяют carrier и могут убрать гладкие кольца без декоративного post-noise. На flatpaper канарейках большая область смешения не равна художественному acceptance; реальные native baseline RMS17–20px остаются важнымориентиром, а не требование каждому мазку достичь200px.

## Что показал particle v3 и как читать sparse aerosol

Оператор сообщил: actual перенос есть, но изображение — разреженные отдельные точки, не мокрая жидкость. ДляR26drop примерноπ*26²≈2124исходных pigment pixels;8subparticles дают≈17kwalks. При распределении по области радиусом100px это лишь≈.54particle/pixel. Пуассоновская оценка около58%пустых pointbins — объяснение samplingvariance, не доказанная статистика конкретного correlatedwalk. Bilinear splat снижает пустоты, но малая плотность и final8bitquant дают видимые белые дырки. Увеличениеsamples в8раз дорого и не исправляет отсутствие коллективного velocityfield.

Cloud-in-cell/TSC density reconstruction — математически другой bandwidth частиц, не дополнительный шум. Нормированный широкий kernel может заполнить дырки, сохранив сумму particleweights, но fine wet-mask boundary требует перенормировки/консервативного faceflux; обычный boxblur перенёс бы массу через сухую стенку. Coarseparticlecell accumulation+fine normalizedweights экономит atomics, однако снова теряетfinegeometry и требует отдельного mass/permeabilityproof. Поэтому сначала exactcompaction как узкийperfконтроль, а для нового художественного варианта выбран **implicit transport→conservative finepaper reconstruction/flux**: масса ведёт себя коллективно, безбедности индивидуальных particles. Отдельные частицы остаются исследовательским отрицательным результатом, а не искусственно объявленной акварелью.

Диагональнаямаска: текущий baselineparticle sample≤1px не универсален для rastercornercrossings. Strictsupercover должен проверять обеorthogonalcells приодновременномизменении X/Y. Это отдельное geometryисправление, НЕсмешанное сexactcompactionproof. Канарейка сvertical1pxdryline не исключает этотcornercase.

## Точная масса всех RGBA после pack: есть несовместимые требования

Контрпример в единицах выходного bytecode: два pixels `(R,G,B,A)=(.6,0,0,.6)` и `(0,0,.6,.6)`. Округлённые глобальные суммы — R=1,B=1,A=1. Если сохранять нулевой color support (не переносить красный во второй pixel и синий в первый) и premultiplication, для R1 в первом нужен A≥1, для B1 во втором нужен A≥1. Тогда Aсумма≥2, что противоречит target1. Значит универсальный pack, одновременно сохраняющий все roundedglobalchannel totals, premultiplication и точный color support, **невозможен даже на двух pixels**. Exact integer pre-pack ledger не устраняет эту несовместимость финального8bit представления.

Нужно явно выбрать ослабление: сохранять expectation посредством correlated stochastic rounding; разрешить tiny межпиксельное перераспределение carrier; выводить больше бит/float до общего display; либо принимать измеряемую ошибку финальных bytes. Нет основания автоматически компенсировать потерю alpha globalbrightnessgain. Для художественных whisps предпочтительнее сначала не терять концентрацию избыточным horizon и использовать fine transport/physical deposition, а не маскировать эту численную границу.
