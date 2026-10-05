# #680: перенос пигмента независимым объёмом воды

Изолированный эксперимент от `7fdcc459`, `agents/680-solvent-flux`. Выключен по умолчанию: `setWatercolorAb({ ..., solventFlux: true })`. Не публиковался и не предназначен для пользовательского стенда.

Принцип: пигмент перемещается долей консервативного потока воды `q / Vdonor`, а не отдельным выталкиванием к обводу. Движущий напор — дополнительная вода `max(V − base, 0)`. Вязкость зависит от фактического `P.b / V`, не старого совместного carrier alpha.

## Доказательства CPU на настоящих полях

Spiral и stationary compact blob: реальные recorded operations, frozen5297, combined delivery / bottomless independent V. Канонический pre-front P RGBA и V; source solventBase захвачен до releaseFilm. V source/canonical byte-identical, геометрия совпадает, GL0, context alive. ROI680×600 внутри канонического поля1536²: вода на всех краях ROI отсутствует. Raw captures, скрипты и отчёты находятся в соседней рабочей копии `680-spiral-spread/temp/spiral/actual-*`.

В отличие от прежнего surrogate, реальная неподвижная клякса тоже добавляет воду. Отсутствие движения не означает отсутствие потока жидкости. Контроль с V=base даёт exact byte no-op для P обоих кейсов.

CPU зеркало byte-оператора, world-strides16/8/4 два цикла,12 операций по граням: наружная доля actual P.b —0.896% у спирали,2.706% у кляксы. Суммы всех4actualP каналов и V сохраняются точно в байтах, отрицательных значений, превышения255 и отрицательного V-base нет. Constant-concentration invariant доказан предыдущим float oracle; независимое byte-округление может отклонять концентрацию на квант, поэтому точный float invariant не заявляется для byte-версии. Actual C не захвачен как paired mobile depth: singleTau восстанавливает его позже, это не GPU-доказательство массы восьми компонентов.

## Ограниченный GPU прототип

Standalone lazy shader, без увеличения Adreno bookkeeping program. Двенадцать направленных face steps,24draws (P+V), immutable old P/V для обоих выходов. Каждая связь проверяет мокрость всех промежуточных texels; q ограничивается общей вместимостью V и всех P компонентов принимающей точки. Передача округляется вниз в целых байтах и симметрично вычитается/добавляется.

Это **replacement** legacy carry для данного A/B, а не дополнительный перенос поверх него. Front/domain и последующие settle stages остаются; окончательную картинку ещё надо проверить. Транспорт допускается только после начального штриха чистой водой, для первого ненулевого pigment stroke и одного цвета. Физический serial увеличивается только при beginStroke, не при newFilm/chunk: live-разбиение не меняет purity gate. Прямой мокрый мазок без предварительной воды сохраняет прежний carry даже при включённом флаге. Gate хранится в scratch snapshot/spill metadata; восстановленное старое неизвестное состояние не допускается, наличие GPU texture не служит доказательством чистоты.

При1536² две дополнительные RGBA8 scratch textures требуют18MiB (baseV+nextV). Владение регистрируется до следующей аллокации; finish возвращает их в pool, abandoned/context-loss lifecycle использует существующий owned-solvent set. Программа lazy, удаляется при destroy, ссылка сбрасывается после context restore.

**V меняется только в каноническом scratch этого эксперимента.** Он пока не записывается обратно в persistent entry.solventLoad. Это не solvent ledger и не поддержка следующего pigment gesture: тот исключён metadata gate. Нельзя включать эксперимент глобально или переносить на multi-paint без отдельного решения.

До review нужны Vega pixels/GL, контроль кляксы и grain/fingers, load/rebuild, затем настоящий salted Samsung compile. Длинные связи — ускоренная гидравлическая модель, не доказанная эквивалентность локальному PDE. Прототип может быть отвергнут по картинке или стоимости.

## Vega QA ac0db4e2: технически проходит, картинка не принята

2026-10-05 22:23–22:24 UTC, standalone5299, один Chrome на4small synthetic cases (не полный userstroke), затем отдельный Chrome на direct negative. Оба закрытыfinally; shadercompiledреально впервые на этом runtime. Все6кейсов GL0/no-context-loss.

| Кейс | Flux draws | Ошибка массы P RGBA | Ошибка суммы V | P.b снаружи seed |
|---|---:|---|---:|---:|
| small spiral |24|0/0/0/0|0|1.579%|
| compact blob |24|0/0/0/0|0|3.694%|
| direct wet100 |0|negative control PNG byte-identical|—|—|

Файлы `temp/flux/gpu/{report.json,*-pre/post-P/V.rgba,*.png}`, `temp/flux/direct/`, `temp/flux/metrics.json`, `temp/flux/compare.jpg` наVPS/домашнейкопии. Исходные4componentP суммы успирали9598658каждая, послеexactтеже; уblob1090992каждая, послетеже. Никакого скрытого clamp/mass loss.

Визуально: светлое внутреннее кольцо исчезло, ядро стало слитнее. Но наружные пальцы/grain заменены слишком гладким круглым ореолом, особенно у кляксы. Поэтому этот вариант **не интегрировать и не передавать на пользовательский review**. Load/rebuild и saltedSamsungcompile не выполнялись: сначала нужна более правильная картинка. Wallcase11s spiraloff/on и5.3/6.6s bloboff/on включают дополнительное readbackon, это не GPU timing.

Следующий эксперимент: консервативный q/V перенос с проводимостью существующего бумажного front-cost по каждой грани. Не добавлять обратно legacy carry поверх этого оператора и не вводить отдельную шумовую маску. Проверить симметрию conductance, mass/headroom/negative controls, затем отдельный короткий GPU A/B.

## Кандидат с бумажной проводимостью: CPU

Проводимость использует существующий `field.pressure` (outward front cost), не `field.band` с доменом/пигментом. Front seed и water-front steps перенесены перед flux: читают исходный P, не меняют его. До завершения всех24flux draws pressure не перезаписывается. Это проверено тестом порядка вызовов и отсутствия P feedback.

Для длинной грани суммируются целочисленные превышения соседних cost-byte differences над `ceil(WC_FRONT_FLOOR * 255 / costMax)`, где действующий floor=0.85. Сумма сопротивления одинакова при обходе грани в обе стороны. Conductance=`1/(1+2*resistance*costMax/(255*stride))`; равная стоимость внутри пятна даёт1, поэтому прежний запрет пути по плоскому interior не возвращается. Направление потока задаётся только разностью дополнительного V-base.

CPU byte mirror: spiral наружная доля P.b0.383% против0.896% без paper gate; blob1.265% против2.706%. Все4P/V integer sums сохраняются точно, negative/overflow/negative-head отсутствуют. Reverse-face symmetry проверена явным assert. Источник cost пока **предыдущий actual front с той же recorded geometry**, не current independent-V capture; это ограничение, не готовое GPU-доказательство. Данные: соседний `temp/spiral/actual-solvent/paper-byte-results.json` и `paper-proof.log`.

Дополнительных текстур нет: прежние18MiB max; cost sampler unit5 не перезаписывает bookkeeping u_e наunit4, укладывается в WebGL1 minimum8textureunits. Программа остаётся отдельной. Следующий GPU A/B должен захватить настоящий current cost и проверить grain/fingers, массу, direct negative. До него кандидат default-off и не принят.

## Vega QA 05830816: отвергнут по изображению и dry control

Четыре small synthetic paper cases и direct negative прошли GL0. Все четыре P-channel sums и V сохраняются точно. Outside P.b: spiral0.7404%, blob1.8238%; direct wet100 PNG byte-identical. Настоящий current front-cost захвачен вместе с pre/postP/V в `temp/flux/paper-gpu`, direct в `paper-direct`.

Пальцы не восстановились: бумажный gate уменьшает гладкий ореол, но mean conductance длинной грани не локализует поток на путях. Кольцо исчезает и ядро слитное, однако клякса остаётся менее живой. Поэтому не интегрировать и не передавать Samsung review.

Отдельный dry0 pigment over prewater control (`paper-dry`) выявил регрессию:41970 отличных pixels, max206/255, mean absolute channel difference2.927. При addedV=0 flux не переносит воду, но legacy carry уже отключён. Следующий оператор обязан исключать этот случай; текущий эксперимент не решает dry-on-water. Все owned Chrome закрытыfinally, runtime5299 оставлен.

## Следующая CPU проверка: локальный и капиллярный напор

На прежних actual recorded V/P и previousactualcost проверен strictly1px: даже96P/V draws дают spiral наружную массу0.00114%, blob0.00522%. Scalar V-base relaxation не обеспечивает заметный фронт в48drawbudget; длинные прыжки скрывали это ограничение.

Диагностическая эвристика capillary face drive `Δ(V-base)+λΔ(cost)`, дополнительный предел q<=0.2donorExtraV, receivercapacity/actualwetpath. Stride4,48draws, λ.05: spiral outside0.448%, blob0.569%, все4P/Vmass exact/V>=base. Но видимая P>8 геометрия слаба: spiral max6px/p95=3px, blob max4px/p95=3px; λ.1 не увеличивает p95. Core peak255, средний core сдвиг<0.5/255. Это небольшой edge, не достаточное живое растекание; GPU candidate не оправдан. Скрипты и geometry JSON соседний `temp/spiral/actual-solvent/`.

Для следующей причинной проверки нужен current cost и pre-baseV в одном фактическом capture; harness подготовлен. До этого scalar head и λclosure не считать решением.

## Current baseV/cost capture и закрытие stale-cost гипотезы

Frozen5299 readonly capture current P/V/baseV/frontcost small synthetic spiral/blob: GL0, Chromeclosedfinally. Данные `temp/flux/current-base-capture`. ExtraV alpha-byte sums: spiral3030533, blob435380; peak64, отрицательных нет. CurrentcostMax107.2, costzero99.30% source spiral и100% blob: внутри source этот cost не содержит направленного напора.

CPU λ.05 closure4px/48draw с **currentcost**: spiraloutside0.889%, p95visible4px/max7px, haloPeak251/255; bloboutside0.736%, p95visible3px/max5px, haloPeak45. λ.1 не расширяетp95. Масса P4/V точная, V>=base. Это узкий слишком плотный edge, не живой заметный фронт. GPU solver AB такого closure не обоснован. Legacy material.r role исследуется отдельным основным агентом; pressure mode10 прямо использует P.a/coverage.b, поэтому случайное смешение units запрещено. Прототип не интегрирован.

## Альтернативный механизм: концентрационная диффузия

`WC_DIFFUSE` сейчас использует P/V только для вязкости gate, а движущий член остаётся D(Pi−Pj). Это не D·min(Vi,Vj)(Pi/Vi−Pj/Vj): состояние P=cV при неодинаковом V не стационарно. Диффузия пигмента в стоячей воде — другой механизм, чем перенос водой; dry pigment может диффундировать при extraV=0.

Scalar float oracle actual recorded P/V/coverage: finite wet-path по всем промежуточным texels, conservative pair incidence, outgoing/receivercap по1/8, stationaryP=cV exact и dry-gap0. Ошибки общей scalarмассы<8e−9; это не RGBA8GPUдоказательство и не pairedC гарантия. Height bias отсутствует; физически depleted mobile/fixed slices не точная production undepletedweighted-slices replica.

Actual concentrationcore45: spiraloutside1.78%/p95front19px, blob9.72%/15px. Core0 отдельно:2.45%/22px и10.85%/17px. Extendedbudget25steps:2.91%/26px и16.21%/24px. Gate removal усиливаетblob сильнееspiral, глобально не предлагать. Dry-path gate почти не меняет actual результаты: исходные лужи связны.

Главный геометрический контроль: spiral area141007/boundary1746=1.24%, blob11492/480=4.18%. Median mobilityspiral0.344, blob0.219; coverage1обоим. Поэтому spiral не заблокирована viscositygate: она имеет3.37×меньшийperimeter/area. Absolute outside P-byte/boundarytexel:203.3 vs387.9; halo mean P/V0.152 vs0.0197, core1.089vs1.188. Visible spiralfront даже ширеblob. В900×800 capture нет объявленного физического формата, px→mm без него не заявляется.

Matched-concentration surrogate P=.5V внутри исходного footprint (не изменение оригинальных данных): core45 spiraloutside2.82%/p95=15px, blob16.38%/p95=4px; core0 отдельно4.27%/20px и25.21%/14px. Relative outside не равен ширине/живостиfront. Файлы `temp/flux/diffusion[-path|-matched-concentration]`, scalar-compare — условная визуализация P, не canonical renderer. Концентрационная диффузия физически обоснована дляdry-on-water, но CPU не обещает устранение smoothhalo/fingers и не оправдывает blanketcore/gateизменения.
