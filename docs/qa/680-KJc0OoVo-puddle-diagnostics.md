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
