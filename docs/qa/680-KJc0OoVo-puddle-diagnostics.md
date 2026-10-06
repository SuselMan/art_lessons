# #680: лужи комнаты KJc0OoVo

База: production f5397918. Журнал 47 операций экспортирован чтением PostgreSQL; независимый экспорт семантически совпал с root. Исходные dabs/wet/цвет/seed/ID/время не менялись. Изолированная рабочая копия agents/680-puddle-room-KJc0. QA на домашнем frozen5314, отдельные созданные canvas/engine, без изменения source/пользовательских страниц.

## Аппаратные абляции

На реальном Vega выполнены seq19–29 и отдельно45–47: baseline/noCarry, по завершении каждой операции drain settle/queues. PNG1754×2480. Baseline и noCarry GL0/contextLostfalse. Own Chrome закрыт finally. Это clean replay операции, не native/сетевой/performance QA. Исходники stand не менялись.

noDiffuse seq19–29 INVALID: начиная seq24 GL1282. Его изображение исключено из физических выводов. Сам диагностический режим нуждается в отдельной проверке.

Данные HOME680-combined-stability/temp/KJc0OoVo/{ab,profile,profile2,large}; большие данные остаются HOME из-за ограниченного диска VPS. Скрипты и immutable input сохранены в task temp/KJc0OoVo.

## Светлая линия: доказанный материальный провал

Для seq27 считались реальные inkLoad/inkDry/inkColor/colorDry/solventLoad/coverage, ROI x1235,y1705,w80,h64. GL readPixels использует y=height-worldLocalY-roiHeight; изображения перевёрнуты обратно. P/C/V ненулевые. ring-fields.png показывает совпадающую замкнутую линию в P.b и C.a и светлую линию в composite. Усреднение по радиусу эту узкую линию скрывает и не должно заменять локальный профиль.

На y1736:

| x | Source P.b | Final P.b | V code | Final без carry |
|---|---:|---:|---:|---:|
|1244|0|52|64|19|
|1245|28|31|74|27|
|1246|105|38|96|67|
|1247|178|52|120|120|
|1248|217|49|128|153|

При noCarry нанесение P/C/V на seq27 перед finish совпало, итоговая линия ослабла вместе со всем растеканием. Отключение carry не является исправлением.

Кодовый подозреваемый: wcCarryWeight запрещает обмен при cj-ci<=1e-3. В исходном footprint cost0, поэтому край отдаёт наружу, а равная исходная plateau не подпитывает его. Это гипотеза конкретного механизма, пока cost/material intermediate field не захвачен. Следующий минимальный кандидат: conservative Ti/Tj exchange только между двумя cost0 клетками, внешний directed carry без изменений; обязательно проверить сохранение фактуры и цвета.

## Цвет соседней лужи: физический перенос пока НЕ доказан

Baseline PNG показывает фиолетовый край второй синей лужи; при noCarry он ослабевает. Визуальная формулировка «перенос воспроизведён» отозвана как чрезмерная: material ROI x680,y1500,w100,h200 после синего seq22 и после фиолетового seq25 практически не меняется. P.b19677 и C.a19677 в обоих; depthRGB изменяется лишь на единичные квантованные коды. Данные не подтверждают массовый перенос фиолетового P в этом ROI.

В shader composite остаётся thinPrior=0.12*(1-smoothstep(...depth.a)), добавляющий tauBatch текущего цвета в слабые material pixels. Это конкретная гипотеза внешнего перекрашивания, включая purewater операции с другим номинальным цветом. Следующий causal контроль меняет только nominal color чистой воды seq24 при одинаковом журнале и требует P/C/V exact в старом ROI, отдельно сравнивая composite.

Carry также соединяет strided endpoints без промежуточной wet-path проверки. Это потенциальная отдельная причина прыжка между островами, но она не доказана для текущей жалобы; общий washId сам по себе не доказательство соединённого домена.

## Причинные runtime абляции

На неизменном frozen5314 выполнены baseline/plateau/clearBlue. Все GL0/lostfalse, owned Chrome finally closed. Runtime shaderSource patch ограничен отдельными engine/context и восстановлен finally; plateau заменил ровно одну ветвь wcCarryWeight, patchHits4 (реальный compile, четыре программы). Оригинальные input операции/stand source сохранены.

- **plateau**: равные cost0 клетки могут участвовать в существующем conservative Ti/Tj обмене. Светлая линия seq27 визуально исчезла, растекание осталось, тело немного выровнялось. Вода/coverage ROI остаются exact; pigment/color redistribution меняется. Это causal proof участия запрещённой подпитки source plateau, но не законченный production fix: большой stride может связать раздельные cost0 острова без проверки пути. Следующий безопасный контроль разрешает plateau только при stride1.
- **clearBlue**: только purewater seq24 получает предыдущий синий nominal color вместо фиолетового; все dabs/wet/seed/preset/time/IDs сохранены. В старой лужe ROI x680,y1500,w100,h200 после seq25 inkLoad/inkColor/solventLoad/coverage/inkDry/colorDry byte-exact относительно baseline (0 differing bytes), PNG меняется804pixels. Это доказывает появление части внешней примеси через отображение текущего nominal color без изменения материала. Фиолетовый край не исчезает полностью: последующие фиолетовые операции снова дают tauBatch.

Raw HOME temp/KJc0OoVo/causal/report.json, baseline/plateau/clearBlue.png, comparison.jpg. Скрипт causal.mjs сохранён в task temp; CPU compile всего файла и embedded evaluate PASS. Следующий минимальный color candidate: thin prior из локального depth record вместо текущего цвета кисти; P/V/depth не размывать. Нужен контроль тонкого fringe, белых/цветных артефактов и shader cold compile.

## Минимальные кандидаты после проверки риска

На Vega выполнены baseline/unitPlateau/localPrior: все seq19–29 GL0/contextLostfalse, owned Chrome finally closed. Runtime modifications включались до создания своей engine и удалялись finally. unitPlateau patchHits4, localPrior patchHits2; отложенные/недостигнутые shader changes исключены.

**unitPlateau** разрешает equal-cost обмен только stride1. Линия немного ослабла, но остаётся отчётливо видна. Не включён в source candidate и не объявлен исправлением.

**localPrior** меняет только thin-color prior: средний mass-weighted depth самого texel и четырёх соседей на2px, из существующего u_inkColor. Весь captured material inkLoad/inkColor/solventLoad/coverage/inkDry/colorDry совпадает с baseline byte-exact (0 differing bytes во всех captured before/after ROI). Фиолетовый край второй синей лужи исчезает; другие пятна сохраняют растекание и фактуру, их материальная каёмка остаётся. При thinPrior0 тело оптически не меняется; при полностью пустом depth prior0 не вносит воображаемый цвет. Не добавлены sampler/state/opfields, не размыт pigment/depth record; четыре дополнительных texture fetch только в тонком optical fringe.

Source candidate реализует тот же local depth prior; runtime ablation tauBatch→local ratio переименована в tauPrior (математически эквивалентна, исходное значение batch colour больше не вычисляется). Этот literal source ещё требует отдельного cold compile/контролей на Samsung и native/replay перед передачей пользователю. Performance не измерялся.

CPU shader tests22PASS. Новая проверка настоящего emitted watercolor optical-read GLSL не допускает зависимости от u_color; она FAIL на старом f539 source (1fail/21pass), PASS на кандидате. Dependencies не устанавливались, использован существующий Vitest executable с временным явным config/aliases вне tracked source. Frozen5314 не менялся.

Raw HOME temp/KJc0OoVo/minimal/{report.json,baseline.png,unitPlateau.png,localPrior.png,comparison.jpg}. Перенос между disconnected water islands материальным оператором пока не доказан и этой color правкой не заявлен решённым. Причина подтверждённого внешнего перекрашивания — optical fallback, обе проблемы нельзя объединять в одно объяснение.

## Ограниченная подпитка с проверкой пути: отрицательный результат

Runtime pathPlateau допускает equal-cost обмен только strides1/2/4 и проверяет ВСЕ промежуточные texels cost0. SenderUV передаётся явно в обе outgoing/incoming callsites, поэтому donor normalization проверяет тот же путь. GLSL loop фиксирован p1..3. Baseline/pathPlateau Vega GL0/lostfalse, patchHits4; own Chrome finally closed.

Каёмка seq27 немного ослабевает, но остаётся отчётливо видимой; это не достаточное исправление, source candidate не создан. Растекание сохраняется. В двух видимых раздельных синих пятнах новой примеси не видно, однако это не доказательство нулевого переноса между всеми disconnected components.

В ringROI80×64 final inkLoad P.b sum211627→211210, max98→95, saturated255count0 в обоих; C.a те же значения. inkDry P.b sum210604→210238,max97→94, saturated255count0. В colorDepth RGB saturated255count0. Это только локальные sums/max/counts: поле за ROI не считалось, глобальная масса не заявляется. Разница локальных sums может включать перемещение через границу ROI и восьмибитное округление.

Raw HOME temp/KJc0OoVo/path-plateau/{report.json,baseline.png,pathPlateau.png,comparison.jpg}; CPU script сохранён temp/KJc0OoVo/path-plateau.mjs. Существующий localPrior source candidate0c49d9ab независим и не содержит этой operator абляции.

## #728: предел проводимости вместо произвольного plateau weight

Ночной task branch подтянут к main8aa7e9f0 (merge53b1f886), прежние диагностики сохранены. Carry operator не менялся между f539 и8aa; GPU baseline/limitUnit/limitPath проведён на неизменном HOME5314 f539, поэтому presentation water tone старый. Shader runtime изменения отдельные и откатываются finally, исходный journal immutable.

В существующем weight `pow(min(stride/d,4),WC_CARRY_POW)` при d→0+ предел64 (WC_CARRY_POW3). Прежние plateau проверки с weight1 не были этим пределом: у source edge с тремя внутренними соседями и conductance64 наружу суммарная доля наружу могла оставаться64/(64+3). Поэтому проверены64 только для stride1 и для guarded strides1/2/4 (все intermediate source-cost0).

Все arms GL0/lostfalse, modified shader patchHits4, owned Chrome finally closed. Визуальная каёмка остаётся. На y1736 baseline P x1244/1245/1246=52/31/38; limitUnit52/32/38; limitPath50/36/44. Это недостаточное исправление; никакой operator source fix не включён.

Полный census retained scratch tile state (2097152 texels, не sample):

| state | baseline sum P.b | unit64 | path1/2/4 weight64 |
|---|---:|---:|---:|
|inkLoad|1185422|1185274|1184996|
|inkDry|1163044|1162898|1162654|

Solvent r/a sum13764346 byte-code units во всех arms, max192, saturation255count0. P/C/depth всех retained buffers тоже saturation255count0, maxP117→116→114. Суммы физически масштабируются по прежнему encoding; source/deposit units не изменены. Это исключает saturation для данного финального state, но не промежуточную и не гарантирует точное conservationRGBA8; небольшая разница P−0.036% остаётся.

Ring sourceP344435 exact в ROI80×64 всех arms. Final inside source-mask122865→122790→122867; outside-mask88762→88693→88206. Эти inside/outside суммы только ROI: fringe выходит за ROI, поэтому они не равны всему растеканию/массе. Глобальный census и ROI не подменяют друг друга.

Raw HOME temp/KJc0OoVo/limit-plateau/{report.json,baseline.png,limitUnit.png,limitPath.png,comparison.jpg}. Следующий диагностический опыт — bounded local source strides8/16 с полным промежуточным pathguard и тем же пределом64, пока без source changes. Если до production кандидата дойдёт, eligibility должна явно исключать dry-on-dry: seed-cost0 сам по себе не означает жидкость. Dry brush/рваный кончик в#728 вне scope.


## Ночь #728: guarded source plateau 8/16 (2026-10-06)

HOME `temp/KJc0OoVo/limit-8-16/{report.json,baseline.png,limit8.png,limit16.png}`;
контроллер `temp/KJc0OoVo/limit-8-16.mjs`. Исходный seq19–29 и frozen5314 не менялись.
Три чистых replay завершились GL0, contextLost=false, Chrome finally закрыт.
Модифицированные варианты реально скомпилировали четыре carry-программы.

Предел проводимости64 с проверкой каждого промежуточного texel и cap8 впервые
убирает видимое кольцо, сохраняя внешнее растекание. Cap16 также убирает кольцо,
но заметнее уплотняет центральное тело; минимальный дальнейший кандидат — cap8.
Source P.b в ROI одинаков344435; V во всём retained состоянии одинаков13764346.
Final P.b sums baseline1185422 / cap8 1184900 / cap16 1185559;
финальная saturation255 отсутствует. Это не доказательство точной conservation:
RGBA8 округляет, промежуточные состояния полного поля не считались.
В ringROI outsideP88762→84821(cap8), поэтому неизменное растекание не обещаем.

Локальный source-кандидат дополнительно передаёт effectiveWet в свободный
carry u_band.y: равнокостный обмен разрешён только при доступной воде.
Сухая кисть на сухой бумаге должна сохранить прежний оператор. Этот eligibility
ещё требует GPU controls; кандидат не опубликован и не признан готовым.
Следующие обязательные проверки: сухая кисть/чистая вода, разделённые острова,
load/rebuild, полный source/P/V census и реальная salted compilation Samsung.


### Wet-eligibility и раздельные острова: аппаратные controls

HOME `temp/KJc0OoVo/wet-controls/report.json`, six replay arms on frozen5314;
scoped runtime shader и prepare wrappers воспроизводят a431c57e без изменения
сервера. Все six GL0/contextLostfalse; четыре carry compile hits на кандидат.
Чистая вода seq19: P=0, V3982519 и wholePNG byte-exact baseline/candidate.
Сухой вариант seq27(normal:0:100, recordedwet0): V=0, P327403 и wholePNG byte-exact.
Исходный мокрый row сохраняет эффект cap8 и V13764346 exact.

Дополнительно actual carry shader на32×8 nearest buffers, stride8:
- source islands разделены4texels dry cost1: rightP0, весь output byte-exact,
  Psum5120;
- путь cost0 связан: rightP1280, Psum5120 — положительный reachability control;
- тот же связанный путь с wetgate0: rightP0, output byte-exact, Psum5120.
Это bounded операторный контроль confinement и включения, не утверждение,
что любой естественный waterfront остаётся несвязанным при длительном рисовании.
Нативная скорость, saltedSamsung compile и undo/rebuild ещё не проверены.
