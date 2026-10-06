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


### Cold Adreno: полный кандидат a431c57e

6 октября, отдельная новая Samsung Chrome вкладка1215: все четыре полные
эмитированные программы low/high/carry/colour с уникальным salt успешно
скомпилированы и linked. Размеры37977/37999/38022/38046 байт. GPU: ANGLE
Qualcomm Adreno650. У всех LINK_STATUS=true, log пустой, GL0, lost=false.
Статусы прочитаны до удаления shader/program handles. Собственная вкладка
закрыта; старые вкладки не менялись. Это compile gate, а не доказательство
скорости нового carry. Raw: temp/KJc0OoVo/carry-cold-report.json; точные hashes
в temp/KJc0OoVo/carry-cold-input.json. Источник shaders собран непосредственно
из a431c57e, без сокращения mode ветвей. Native/performance gate остаётся
отдельным.


### Samsung: небольшой нативный путь и собственный replay

Исправленный controller дождался document load и проверил actual-origin
resource: index.ts HTTP200 text/javascript,1165058 байт. Отдельная вкладка1218
закрыта finally. Standalone engine512×512 на неизменном5314; runtime-кандидат
добавляет одновременно shader plateau и actual Plan wetgate, accepted localPrior
включён в обоих arms. Источник приложения не переписывался.

Каждый arm: собственный native water160→pigment80, две записанные операции,
ненулевой pigment. После завершения свой журнал воспроизведён через _replayInto.
Whole512×512 RGBA native/replay byte-exact:0 отличающихся пикселей в baseline
и candidate. GL0/lostfalse. Candidate patchHits6; actual mode15/16 wetgate
достигнут56 раз, minimum=maximum1. Это scoped native/canonical контроль,
не Room/server ACK, не Undo UI и не полный real-puddle visual gate.

Производительность не признана готовой. Независимые gestures не являются
строго парным измерением. rAF phases без диагностического readback во время
рисования: baseline pigment1153.6мс/max1103.4мс, drying9809.1мс/max389.8мс;
candidate pigment1120мс/max718.8мс, drying9361.6мс/max150.5мс. Readback/export
происходят после остановки frame collector. Холодный standalone context и
первый штрих могут влиять; нужен отдельный warmed carry-cost контроль.
Raw report/PNG/metrics: temp/KJc0OoVo/samsung-native-*.

Предыдущий большой standalone controller остановлен по180с без собственного
engine canvas и без измерений. Это незавершённый bootstrap fixture; ни app bug,
ни slowdown нового carry из него не следуют. В старом run не было phase markers.


### Samsung: warmed carry-only cost

Один standalone context на arm, поля и draw-параметры одинаковые. Modes15/16,
stride8, wetgate1. Перед измерением каждого размера3 warm draws, затем5 draws
с синхронизацией readPixels1×1 из destination FBO. Все GL0/lostfalse,
собственные страницы закрыты. Mean milliseconds (material/colour):

| Size | Baseline | Plateau8 |
| --- | --- | --- |
|128²|0.72 /0.84|1.12 /1.42|
|256²|1.36 /1.30|3.24 /3.34|
|512²|4.18 /4.44|10.40 /10.68|

Maximum candidate draw11ms. Это~2.5× стоимость данного warmed оператора на512²,
а не total settle или нативного штриха. Нельзя суммировать частичные интервалы
и выдавать за профиль всего solver; canonical field1536 здесь не измерялся.
Raw: temp/KJc0OoVo/samsung-carry-cost-report.json.

Найден следующий кандидат оптимизации (ещё НЕ реализован): считать donor
normalization только при Tj>Ti. При Tj<=Ti incoming flux точно0, поэтому
текущий внутренний loop из4 weight-запросов не влияет на out4. Это не меняет
пути/домены/массу и не требует новых текстур, но equivalence и стоимость
нужно проверить отдельно до принятия.


### Нулевой входящий поток: проверенная локальная оптимизация

Donor normalization теперь исполняется только при Tj>Ti. Для реального
carry travelling share0.35; RGBA8 alpha∈[0,1]; wcCapillary=1 и cap∈[0.15,1].
Поэтому Ti/Tj конечны и неотрицательны. При Tj<=Ti старое incoming add равно
нулю, а его weights нигде больше не используются. Положительный поток и
нормализация не изменены. Новых полей/проходов/сэмплеров нет.

Samsung отдельная вкладка1226, whole emitted shader replacement4hits, GL0
lostfalse; закрыта finally. Шесть выходных RGBA buffers (material/colour,
128²/256²/512²) ненулевые и SHA256 byte-exact unoptimized/optimized.
Input и stride8 одинаковые. Sums128:743652/390600;256:3044196/1600200;
512:12314772/6477000. Это actual shader-output gate, не пустой ROI.

Mean synchronized warmed draw milliseconds unoptimized→optimized:
-128² P1.44→1.16, C1.74→0.72;
-256² P3.82→1.40, C3.20→1.44;
-512² P11.46→4.50, C12.72→4.08; maximum optimized5.3/4.3ms.

Время относится только к данному оператору/полям. Полный solver/native/frame
профиль из этих интервалов не выводится. Raw: samsung-shortcut-report.json.
22 shader CPUtests PASS. Полный real-room/native candidate после shortcut
ещё проверяется отдельно; данные предыдущего native относятся к a431 без него.


### Wet/morph: первое ограниченное воспроизведение

Samsung, отдельные страницы1229/1230 закрыты. Frozen5314 index идентичен8aa;
в оба emit DAB_FRAG/PAPER_COMPOSE_FRAG подставлены полные8aa программы
(hits2/1, hashes в timeline-input.json), без кольцевого кандидата. Native
water80→pigment15,512×512, плотный зигзаг; снимается actual display через
Page.captureScreenshot, не dry export. GL0/lostfalse. Первый timeline показывает
наклонный светлый клин справа на2s/5s. Это ещё не доказанный треугольник mesh.

Следующий независимый native gesture использован только для presentation AB:
queue.advance остановлен (tick вызывает именно advance), автоматический display
приостановлен, performance clock фиксируется внутри ручного display.
Normal→motionOff→wetToneOff→normalAfter. NormalAfter1088×1088 RGB byte-exact0
(это crop512CSS px, не whole canvas). Все6 материальных buffers до/после
сохраняют hashes; P1552073/C1552073/V6960058/coverage14845441 ненулевые,
dry records0. MotionOff изменяет508936pixels/max82; wetToneOff538929/max7.
Косой край в этой сцене визуально остаётся, но его форма слабее первого native
журнала. Поэтому исходную грань нельзя считать причинно объяснённой этим AB.

Кропы450×340: HOME680-combined-stability/temp/KJc0OoVo/triangle-crop-*.png.
Для следующего опыта сохраняется первый журнал без изменения dabs/seed/wet;
нужны source P/C/V и polygon-domain stage maps. Только тогда можно отделить
геометрию и MAX envelope от физики/промежуточного target.


### 2026-10-07: dry10 guard и shortcut на исходном ряду

Genuine Vega, один собственный Chrome, четыре последовательных arms, exit 0 / OWNED_CHROME_CLOSED. Frozen HOME5314 исходников не менялся. Обе ветки получили полные DAB/PAPER emitted shaders принятой 8aa7e9f0 (DAB `a31574c649beff73d75478b51926c51e91f8ff228c6dd16013641b0925bafeb9`, PAPER `004a5371d0e61c36b0b11379a7e47c10eab3c42999efb4b77d4385a21589619e`); index старого f539 идентичен 8aa. Все arms GL0 / contextLost false.

Dry10 — явно диагностическая копия seq27: неизменные геометрия, seed и packed dabs, только normal:10:100 и нулевая recorded wet fixture; исходный журнал сохранён. Legacy/path8: whole 1754×2480 RGBA различаются в 1147 пикселях, max111. Source P обоих 376402; final P 376323→375766; C меняется; V одинаковая sum10349/max6, outside P в 80×64 ROI остаётся0. Это отрицательный gate сохранения сухой кисти: a431 нельзя включать по умолчанию. Одного effectiveWet>0 недостаточно; следующее ограничение должно опираться на реальную жидкость, а не произвольный порог номинального water10.

Исходные seq19–29 без изменений: path8/shortcut whole RGBA exact0. Полные material P/C/V sums/max совпадают (P1184900, V13764346), ring ROI source344435/inside126213/outside84821 совпадает; shortcut достигнут в4 emitted programs. Это подтверждает эквивалентность shortcut относительно path8 на данном реальном ряду, но не снимает отрицательный dry10 gate самого path8.

HOME raw: `680-combined-stability/temp/KJc0OoVo/dry10-shortcut/{report.json,*.png}`. Контроллер `temp/KJc0OoVo/dry10-shortcut.mjs`; VPS сводка `dry10-shortcut-metrics.json`. Проверка не является native UI, серверным ACK или замером плавности.

### 2026-10-07: локальная V-phase, кандидат по умолчанию выключен

Две плотностные абляции отвергнуты: flux-only меняет dry10 в605px/max106, weighted-conductance — в134px/max30 на Adreno. Последняя улучшает кольцо слабо. Нельзя включать их по номинальному preset water: сухая кисть на настоящей луже должна оставаться подвижной.

Следующая отдельная гипотеза использует существующие границы0.45/0.70, применённые к локальному независимому V (alpha×4), а не объявляет V равным PaperWetness. Нулевая V в любом промежуточном узле блокирует plateau-path даже при cost0. Opt-in захватывается при prepare; source defaultOFF, новые буферы/форматы операций не добавлены.

На Vega, при одинаковых неизменных packed inputs и accepted8aa DAB/PAPER shaders, whole1754×2480 RGBA pure/dry10/dry0 exact0. Wet100 меняется1844px/max63, low-water10 в реальной луже9405px/max66: подвижность зависит от местной жидкости, не запрета low-water. В реальном ряду seq19–29 кольцо визуально уходит, внешнее растекание сохраняется; ring source P344435 совпадает, inside122865→126213, outside88762→84821. Whole P1185422→1184900 (−522), V13764346 совпадает: это не доказательство сохранения массы пигмента. HOME: temp/KJc0OoVo/phase/report.json, PNG и ring-comparison.png.

Старые три micro-cases в полном phase report были запущены с прежним контроллером без правильного V-binding и НЕ являются доказательством связности. Исправленный phase-tiny run: connected rightP1280 и Psum5120; separated-cost-gap, cost0/dry-V-gap и wetgate0 exactRGBA0/rightP0, Psum5120. GL0/lostfalse. Это ограниченные32×8 field fixtures, не полный натуральный water-domain proof.

Четыре новых CPU Plan tests проверяют defaultOFF, фиксацию opt-in до выполнения, реальные capturedV и отсутствие destination alias, noV fallback. Они проходят на новом source; старый Plan отрицателен (undefined default вместо false). На Adreno650 четыре ПОЛНЫХ emitted shaders с уникальным salt linked=true, GL0/lostfalse, максимум5 активныхsamplers; own1254 закрыт. phase-cold-report.json. Samsung dry10 wholeRGBA exact0, материал ROI совпадает, GL0/lostfalse, own1255 закрыт. Это runtime shader/Plan-parameter AB, не actual-source-native/undo/replay gate; они пока ожидаются.

Adreno whole controls (компактный CDP export с wholeRGBA сравнением внутри страницы): pure/dry0/dry10 exact0, source P/C/V ROI совпадают; ring51994px/max39, source344523 exact, inside122763→127026/outside88911→85357. Lowwater10 в луже9527px/max64, source438085 exact, finalinside209432/outside105258. Все GL0/lostfalse, own1255–1259 закрыты. Samsung crop визуально подтверждает исчезновение замкнутого светлого кольца без выключения внешнего растекания. Исходные и phase arm используют одинаковые packed operations, не независимо нарисованные жесты. Полный native source/own replay gate ещё не выполнен.

Локальный source commit d852c8ab. Полные22 Plan tests и22 shader tests PASS; старый Plan negative падает на четырёх новых default/captured-switch cases. Вызовы u_tau проверены: carry15/16 раньше не использовали tau, opt-in z0 сохраняет legacy cost0 exclusion. Кандидат не включает transport globally и не вводит новый UI/Operation Log контракт.

Actual-source Adreno gate выполнен отдельно в собственном HOME680-puddle-outline:5320 (существующие реальные node_modules, без installs/symlinks). Полный phase source d852 +a431/6042 и accepted8aa; index SHA c0fd96c0492b05408550ef8baf91a1b3e8389688a1b5375c38af763b16373408, shaders6abf35854dd66ae9c3db6e265602b5fc987ec53dc57ef17c241e2e863cc50671, Passes1f88c56a35029c8a9f3879ffba456adbc4c59ea83741d9e45af5a3c9b9393e62, Plan830164a216037ad40b78620125a3573d8ae6437a2e38c7d090171643ee97eaca.

Standalone actual _onStart/_onMove/_onEnd вода→пигмент,2 записанные операции каждогоarm, затем его собственный packed journal через _replayInto. Candidate actual56/56 carry calls получили tau.z1 и capturedV; baseline56/56 получили z0/eabsent. Native материал ненулевой (candidate P579431). Whole512×512 native/replay exactRGBA0 в обоих arms, GL0/lostfalse, own1261 CLOSED. Не используется runtime shader/Plan parameter replacement. Между arms рисовались независимые жесты, поэтому их время/доза не являются причинным OFF/ON сравнением. Это также не UI/Room/serverACK gate и не performance claim.

На Adreno исправленные four32×8 micro-cases подтвердили separated-cost и cost0/V0 dry gap exact0/rightP0, connected rightP1280 при Psum5120, gate0exact0, GL0. Собственный1260 CLOSED.

Actual-source5320 immutable original seq19–29 OFF/ON контроль без shaderSource/prepare/field-parameter replacement воспроизводит runtime5314 BYTE-EXACT по wholeRGBA SHA обоихarms: legacy376694ce09c64cf44133fb52aaf4e63181c61c29226e852dc6c2a521ba16aaea, phase de98f52f63e03f58171d48b95b44e49ea31bfda0f2fd80d8c84699f087d76261. Ring source344523/inside127026/outside85357,51994px/max39, GL0/lostfalse, own1262 CLOSED. Таким образом actual-source wiring достигнуто и визуальный эффект предыдущей диагностики воспроизводится. Не утверждается PNG exact относительно legacy (он намеренно меняется), общей массовой сохранности, производительности или решения всех мокрых сценариев.

Adreno cost diagnostic на actual5320, own1263 CLOSED: одинаковые синтетические P/C/cost/V поля,128/256/512;3 cold draws отброшены,5 warm, readPixels1×1 вокруг каждого draw. Median P/C(ms) OFF→ON:128 0.7/0.7→1.0/0.9;256 1.3/1.2→2.0/1.8;512 2.8/2.9→5.1/4.9. GL0/lostfalse. Shortcut присутствует в обоихarms. Это стоимость отдельных операторов, не времени всей carryphase; сумму медиан нельзя выдавать за phasewall. ActualPlan группирует до4strides×C/P в одномop, поэтому рост стоимости может увеличить GPU backlog.

Native/replay512 gate НЕ является performancePASS: rAF trace содержит duringpigment интервал baseline869мс/candidate853мс. Gestures независимые и cold/engine state не изолированы, поэтому причинного slowdown/improvement из этих цифр нет. Для отзывчивости требуется отдельный правильный paired/pending gate.

DefaultOFF: d852 branch d<=1e-3 проверяет tau.z0 перед любыми path/V чтениями и возвращает0, как8aa. Positivecostpair mobility=1; flatpair weights0 означает zeroexchange. ActualOFF5320 целый ring совпал с frozen8aa legacy wholeSHA. Отдельный actualOFF5320 dry10 vsfrozen8aa whole пока не выполнен; runtimephase dry10 OFF/ON exact0 не заменяет этой проверки.

Последующий actual defaultOFF→frozen8aa контроль закрыл ранее отсутствовавший gate: dry10/dry0/pure/ring wholeRGBA SHA и все source/final material ROI captures EXACT в четырёхfixtures. Dry10 ff399c93179c966cd6add61bd8c7db38ff3d5b3741c512515420700b8e0faabd; dry0 294d719877c2d17a6b5267da265dd5237b5419399600aff9c327d2eb09eab771; pure f388445226486271802fb7f480311fef2f232cf447acb28f5438538ff51831e8; ring376694ce09c64cf44133fb52aaf4e63181c61c29226e852dc6c2a521ba16aaea. Все1754×2480, GL0/lostfalse; own1264/1265/1266 CLOSED (ring ранее1262). Generated dry10/dry0 оставляют originalseq27 geometry/dabs/seed/color, меняя только preset и wet=zeros; предшествующей воды в обоих generated fixtures нет. Pure берёт unchangedseq19. Ring unchangedseq19–29 со всеми water predecessors. Это четыре конкретных byte-compatibility контроля, не доказательство всех возможных сцен. actual-OFF-vs-8aa-default-gate.json.

### 2026-10-07: real prefix27/34 stage planes и пределы crystal-гипотезы

Оригинальные fullprefix1..27/34 включают undo/clear/dry и всю предварительную воду. seq14 по реальным packedpaths — плотный зигзаг, не спираль. Target27 находится в water26;34 в water33, с ранее31/32 того жеwash. Не изолированы отдельные пигментные операции. Frozen5314 сaccepted8aa DAB/PAPER, phaseOFF. Каждый predecessor проходит canonicalqueue/rebuild barrier. Fixed historical Date.now используется только внутри _wetFromForeignStroke; это воспроизводимый input clock, не утверждение текущего real-time wetstate.

Vega field1536×1536/S1:27 origin1024/1454 иROI1235/1705/80×64;34 origin640/1154 иROI875/1395/145×135. Оба actual firstfront scissorEnabled=false (устаревший box неактивен), front bounds/аргументы не сужены до ROI. P/C/V/coverage beforecarry nonzero guards PASS, GL0/lostfalse, оба OWNED_CHROME_CLOSED. Raw HOMEtemp/KJc0OoVo/stage-KJ{27,34}/report.json иfield-sheet.png.

P доfront/доcarry:27 344435,34 882213 (RGBA/P.b одинаковы); V соответственно438584/1455412 и неизменен междустадиями. After lastop P210604/799456. Последний pressure handle уже переиспользован solver, поэтому его нельзя называть финальным cost. C доfront — stitchedtotal, доcarry — фактическипарный mobileC; не универсальныйchannel-unit proof.

Field sheets показывают резкие складки/диагонали coverage.r ещё доfront. Однако .r кодирует acrossN×cov, а не водную маску. Найденный потребитель poolStreaks выключен WC_POOL_STREAK=0; изменения такого deadconsumer не объяснят картинку. Pseed доcarry не меняется, послеcarry появляется известное материальное кольцо. Эти двеROI не доказывают физические triangle/crystal артефакты, хотя дают корректные ненулевые stagecaptures. Мягкая грань первоначального timeline2ops остаётся отдельным presentation/geometry вопросом.

### 2026-10-07: thin positive-V bridge, диагностическое ограничение

Vega36 one-pass32×8 cases: endpoints alphaV64 (V≈1.004), bridge alphaV0/1/8/16/32/45/64, strides1/2/4/8, costgap и wetgate0 controls. SourceP5120, bridgeP0; измерены leftP/bridgeP/rightP, без изменения shader/source. V0gap/costgap/gate0 noflow/exactRGBA0 во всехstrides. При тонком положительномV≈.0157/.1255/.251 strides1/2/4 noflow, stride8 передаёт rightP1280/bridgeP0 — столько жеrightP, как fullV1 bridge. V≈.502 наstride8 даёт right1280/bridge128. V≥.706 локальные strides1/2/4 даютbridge86/184/416; stride8 right1280/bridge1280. Psum5120 совпал во всех36 ограниченныхcases, GL0/lostfalse, OWNED_CHROME_CLOSED. Raw HOMEtemp/KJc0OoVo/phase-lowbridge-vega-report.json.

Причина из shader: path проверяет только V>0 для connectivity, conductance берёт phase только endpoints. Поэтому крупныйstride не моделирует толщинубутылочного горлышка. Это не утверждение, чтоpositiveflow через связанную тонкуюводу является багом: критерий physicalconductance ещё не определён, и данныйendpointclosure остаётся гипотезой. DefaultOFF не изменён; никакой новыйthreshold/source tuning не внесён.
