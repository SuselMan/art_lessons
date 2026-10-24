# Первые исправления после сравнения117 кистей

Рабочая копия brush-import, исходный frozen QA eccdc7c2 и702PNG сохранены.
После baseline выполнены generic исправления, без исключений по именам:

- Krita ALPHAMASK: форма opaque серого PNG читается из inverse Qt gray × alpha,
  а не только из alpha. Positive GBR остаётся positive. KPP application flags
  разрешаются явно; LIGHTNESSMAP/RGB/gradient не объявлены реализованными.
- Общий mixer.initialLoad задаёт foreground при касании (0 для чистого blender).
  Без поля сохраняется историческая .85 загрузка.
- Общий mixer.smearAlpha разрешает подхват прозрачных пикселей. Converter7
  переносит ColorRate и native SmudgeRateSmearAlpha defaulttrue.
- Новый immutable каталог117@7: krita-stock-default-v16,220assets,20skipped,
  1 243 306 raw asset bytes. Старый v15/descriptor6 не заменён.

## Реальная проверка

Samsung SM-T970/Adreno650, текущие исходные модули через тот же Vite QA5386.
Отдельный offscreen engine на каждый preset, source registry с candidate
metadata/assets, исходный PointerInput fixture1024×512/48px/3линии. Engine и
его GL context уничтожены после каждого экспорта; в комнату операций не добавлено.
Это source candidate, а не утверждение об обновлении frozen compiled стенда.

Проверены6масок25/26/27/74/82/84 и6blender53–58, один экспорт на кисть,
GLerror0 во всех12. Свидетельства и скрипты в temp/device-runs/
krita-stroke-20261024/fixes-v7. Новые картинки не заменяют исходный baseline.

Все6blender теперь дают0пикселей на двух пустых контрольных линиях и0красных
пикселей, как native. До исправления на пустых линиях было17 905–86 615
непрозрачных пикселей. Перенос синего пятна всё ещё не совпадает.

Для Bristles25/26/27 ошибка суммарной alpha относительно native уменьшилась
примерно с33/26/67% до3/.8/.4% (включая общий seed; это НЕ pixel fidelity score).
Визуально исчезли сплошные прямоугольники, вернулась щетина/контуры.
Spines/Spray восстановили форму, но расходятся RNG/расположение/плотность.

## Что дальше доказано

SmudgeRate у legacy native Smearing управляет переносом предыдущего canvaspatch;
наш pickup управляет обновлением carried reservoir текущим patch. Направление
параметра и feedback разные. Knife native tail439px против candidate19px при
alpha>=16, после seed. Простая настройка радиуса это не исправляет. Native
Dulling требует отдельного общего режима семплирования, а не per-name tuning.

Текстура теряет preprocessing/offsets/операцию альфы; наш pressure smoothstep
не эквивалентен native multiply/subtract/height. RGBA требует lightness material.
Детали: analysis-mask-plan.md, analysis-blender-plan.md и fixes-v7/texture-analysis.md
в приватных доказательствах. Совпадение всех кистей не заявлено.

## Проверки и ресурсы

73 Python tests;41 targeted TS tests; full typecheck; lint (старые предупреждения);
map:check; map:rules (0errors,7warnings). Source-only tests не заменяют GPU проверку.
Новые постоянные сервисы/runtime/node_modules/worktree не создавались. Каталог7 и
компактные доказательства сохранены. Существующие QAfrontend/backend/PG оставлены.
Production/Git push Grafetto не выполнялись.

## Пространственный перенос, importer9

Добавлен opt-in source previousCanvas для чистого legacy Smearing. Положение
предыдущего placed stamp хранится в gesture state; обе canvas snapshots берутся
до записи; source имеет текущие dimensions. COPY/OVER работают отдельной веткой
без travel/paper/density/tooth/stochastic rounding. Поддержаны ограниченные
pickupDynamics через общий input response. Первый placed stamp только задаёт центр.

Новые реальные Samsung PNG в fixes-v8 (это importer9, имя каталога — этап8).
Кандидат исходников cc8e10ca, metadata stock-v18,5presets54/55/56/57/116, GLerror0.
Синий хвост alpha>=16 native/candidate: Blur38/35px, Knife439/436px,
Rake431/307px, Smear49/43px, WaterPattern127/68px. Для Knife до нового source
было19px, Blur430px, Smear172px. Mask/texture/radius различия ещё видны.
8 новых integration tests проверяют firstcontact, snapshot order, no-travel,
COPY/OVER, chunk/gesture state, pressure dynamics и однократную opacity.
Полный typecheck после source/controls прошёл. Новый этап текстур не включён
в эти результаты. Нативная Krita повторно не запускалась: baseline пригоден.

## Текстура, importer10 и повтор117

Новый runtime f45126ee: общая alpha operation перед flow/opacity, native integer
pattern grid, отдельный NEAREST/base-only cache variant, prepare+batchlease.
Перенесены offline brightness/contrast/neutral/invert/cutoff/scale и фаза;
Texture/Strength sensors работают через общий grainDepth response. Для native
QtSmooth scaling используется явно отмеченная PILbilinear аппроксимация.

Все117 пресетов candidate stock-v19@10 повторно нарисованы на реальном Samsung,
по одному экспорту того же трёхлинейного fixture, WebGLerror0. Во время прогона
в harness исправлен пропуск recursive dual asset dependencies после index31;
renderer не менялся, прогон продолжен, все117 PNG присутствуют. Исторические
702PNG неизменны. Новые картинки/20contacts/хеши — fixes-v10.

Dithering69 снова рисует, визуально близок к native. Непрозрачные прямоугольники
и pure-blender foreground injection исправлены. Остались важные несовпадения:
foreground mixer41–48 слишком бледный, разные width/footprints19/23/44/49,
контур51 вместо filled native;53/58 — ещё другой Dulling. У42 форма лучше,
плотность хуже: это явно фиксируется, не маскируется случайностью.

Отдельный authored GLSL witness224cases на Adreno650 и Apple GPU: hard/soft
multiply/subtract, s0/.5/1, NPOT5×3/8, LUMINANCE.r/ALPHA.a и tile phase.
Оба PASS, max channel delta0, GLerrors0. Это проверка формул GPU, не утверждение
native fidelity всех кистей на iPad. Все shader contexts закрыты в finally.

Итог проверок этапа:102 targeted TS tests/11files,93 Python, полный typecheck,
lint (старые warnings), map:check/map:rules (0errors,7warnings). Offline lightness
helper сохранён с тестами, в importer/GPU пока не подключён. New material не заявлен.

## Регрессия плоских форм и поворот, importer12

Просмотр117 выявил109/110: после правильного inversegray старая Rotation-ошибка
проявилась как12px вместо47px native. Старый opaque прямоугольник её скрывал.
Добавлен отдельный generic raw-tilt direction control: IEEE atan2(-tiltX,tiltY),
вертикальное перо имеет нормализованную reference .25; slope azimuth не менялся.

Одновременно проверена handedness: native image/auto вычисляют inverse mapping,
общий descriptor хранит физический clockwise angle. Converter12 переводит base
angle со знаком минус и single ascension response v=.5+s*(C(u)-.5). Это общий
format-boundary перевод, не исключение для109/110. Native9 presets имеют этот
поддержанный single sensor. Остальные rotation sensors отмечены unsupported.
AsymmetricL witness45/10 даёт physical rightleg(.976187,+.216930), не зеркальный
negativeY. Scalar/math proof не заменяет будущую freehand tilt проверку.

Все117 importer12 снова экспортированы на Samsung, GLerror0. У109/110 широкий
след восстановлен; native firstline bbox высота47/48px, candidate47/47px при
alpha>=32. Перечень других неисправленных режимов остаётся открытым. Этапы10/11
сохранены как доказательства промежуточных результатов, не текущая сборка.

## Активация QA версии12

Стенд переключён на compiled `f0c45c37`, каталог117@12. Новый frontend и backend
подтверждены qa-source/health. При активации обнаружено, что объединённый279
каталог превышает2MiB file-limit загрузчика: runtime provisioned только117новых,
а279 operator definitions сохранены в storage независимо. Это решение не меняет
продуктовые лимиты. Все25 неподкреплённых старых DB references оставлены доступными;
остальная история имеет room pins. Ни room manifests, ни операции, ни CAS не удалялись.

В compiled Samsung реальные UI selection+asset loading и отдельный engine export
для26/55/69/109 прошли с GLerror0; PNG побитово совпали со source-module12.
На iPad также выполнены четыре compiled UI-driven exports: GLerror0. Первичная
ошибка селектора устранена учётом русского интерфейса и выбора DigitalBrush.
Различия против Samsung после premultiplication малы: max RGBA delta<=5.883/255,
mean<=.189/255; для55 max<1/255. StraightRGB при alpha≈0 даёт ложный max255,
поэтому отдельно сохранены premult/alpha метрики. Это не native identity и не
полная проверка undo/replay. Viewer6/page, поиск
Dithering1,512/1024 режимы и отсутствие page errors проверены Playwright;
его context/browser закрыты в finally.

## Dulling и светлотный материал, importer13

Pure53/58 opt-in `mixer.sampling={mode:uniformMean,radius}` не снимает старый
foreground guard. Saved SmudgeRadiusVersion<2 мигрирует /100: .41→.0041,
.5→.005. Предыдущая область усредняется отдельным pooled1×1 GPU pass до
переноса; native Halton first64, количество min(area,64), без CPU readback.
Точный native adaptive stopping/differenceA не заявляется; >512px gather
уменьшается, RGBA8/colorspace округление остаётся ограничением.

В первом native fixture tail alpha>=16:53 native50px, прежний12=34, new13=46;
58 native64, прежний85, new62. Оба visually ближе, на blank foreground не возникает.

LIGHTNESSMAP97–102 получает отдельные alpha/adjustedgray CAS planes, paired
animationframes (включая одинаковый alpha при различном gray). GPU объединяет
их в premult LA и фильтрует до деления; один sampler, общий индекс без новых
RNG calls. Native encodedRGB lightness quadratic и RGBshift/gamutfit реализованы
отдельно от обычного HSL. Cache key включает обе plane IDs; preparation/leases
и холодная загрузка обходят обе, байтовый лимит сохранён. Mask-only child не
наследует родительский материал. Auto/legacy midpoint/brightness/contrast
компилируются offline; singular unsupported параметры отклоняются явно.

Actual BRUSH_STAMP_FRAG authored witness:219cases на каждом Adreno650/AppleGPU,
max CPUoracle delta1/255, GLerrors0; между GPU max1/255. Проверены цвет, strength,
alpha/transparentRGB, PM filtering и mips. Это не Qt byteidentity или nativeE2E.
Контексты закрыты finally. Полный typecheck и map:check прошли; targeted
19TS suites/114tests прошли; Python107 и shared targeted17 ранее прошли.
Native сравнение показывает у102 значительно ближе тёмный цвет, но у98 ещё
ошибка ширины;100/101 отличаются размещением secondary/давлением. Поддержка
material сама эти независимые причины не устраняет.

## Финальная проверка и стенд13

Mean-only phase исправлена отдельно: сохраняется действительный центр aligned
отпечатка, учитываются subpixel/hotspot/parity, Qt half-away и signed integer
centre на отрицательных координатах. Spatial путь не менялся.15 targeted tests
и web typecheck прошли. Native non-square image extent не восстанавливается
побайтно из квадратного descriptor footprint — это оставшееся ограничение.
Повтор53/58 после phase: хвост49/57px против native50/64; до этого46/62.
Первая метрика улучшилась, вторая стала дальше на5px: корректность геометрии
не подгонялась под один хвост. Прежний12 давал34/85. Визуальная структура
переноса остаётся ближе native, полная идентичность не утверждается.

Стенд compiled `c0222899`,117@13/240assets; servedhealth/db и sourceSHA проверены.
Operator396 definitions сохраняют все25 старых неподкреплённых room references;
зафиксированные room manifests/CAS/операции не удалялись. Полный117 source-run
был на7ed947bc, после phase перерисованы только53/58; provenance записан вproof.
У остальных nonmaterial различия от нового shader составили max<=2/255 либо
3/255 на1–9pixels/524288. Это не81 содержательно изменённая кисть.

Compiled UI selection+готовность cold assets+exports53/58/100/102/109 прошли
на обоих устройствах, GLerror0. Samsung все5 pixel-equal source13. Apple vs
Samsung max premultdelta5/255, mean<=.179/255, уDullingmax<=2/255. Undo/redo
53/100/109 на обоих вернуло pixel-identical PNG; это проверка отдельных engine,
не новая запись на общей комнате. Viewer6/page, поискточнойRock,512/1024toggle,
переходизисходногоreport PASS; browser/context закрыты.

Временные test jobs закончены, лишние dist-picker/dist-native10/dist-current
удалены после проверки process registry. На Samsung существующая report tab
переведена на версию13; собственная room tab закрыта, ADB forward19226 удалён.
Остаются только существующие QA frontend/backend/PostgreSQL, активный один
compiled build с hardlinked report, компактные evidence/каталоги и source cache.
Grafetto коммиты локальные; production/main/push не выполнялись.

## Foreground, scatter, soft mask и давление: версия16

Source/compiled SHA `7141a439db40c1b9bd52ebacd5acf67c5c04b204`, importer16,
каталог117/245assets, manifest SHA
`a7caee026c0574a2eb28ed23953d9d48dc7c69f53cdf0beeb60c5d3c524f05ec`.
Все117 заново нарисованы source-engine на реальном Samsung: GLerrors0.
42 изображения отличаются от13,75 побайтно прежние. Два независимых визуальных
review изменённых кистей не нашли новых тяжёлых регрессий; это не эквивалентность.

Для восьми контролируемых Wet41–48 средняя абсолютная ошибка premult RGBA
относительно native уменьшилась на74–95% на одном и том же union alpha>=8 mask
каждой пары. Это метрика этих трёх контрольных линий, не «процент поддержки».
49 улучшилась лишь на5.6% и всё ещё существенно отличается. Остались49/51
(форма),67/71 (размещение/ориентация/цвет),100/101 (составные маски),102
(pressure coverage), часть акварельных режимов и неподдержанные engines.

Полный authored GPU witness foreground transfer:1944 cases на Samsung и iPad,
max CPU-oracle delta1/255, GLerrors0; межустройственный максимум1/255.
Shader SHA `34f178768e23f01f9298cb4261226615a303c0e8238d99df4424f5df84ff875e`.
Не является сравнением с закрытым движком или полной Qt byteidentity.
Typecheck,206 tests/24 suites,128 Python tests, lint и map checks пройдены.
Evidence: `temp/device-runs/krita-stroke-20261024/fixes-v16` и
`temp/device-runs/krita-wet-20261024`; сырые токены/данные комнаты не публикуются.

Обновление operator metadata с396 до279 сохраняет последние исторические
версии и все25 старых неприкреплённых preset references из106 DB references;
81 уже закреплена room manifests. Room manifests, CAS и операции не удалялись.
Это уменьшение списка определений, не удаление рисунков/комнат.

Compiled16: UI/cold asset loading/экспорт9 кистей41/42/44/47/53/100/102/109/110
на каждом устройстве прошли, GLerrors0. Samsung все9 побайтно совпали с source16;
Apple premult maxdelta5/255, mean<=.082/255. Gallery117,6/page, переход из старого
отчёта, поиск Rock,512/1024toggle проверены настоящим Chromium; browser закрыт.

Сравнение13→16:16 случаев (два GPU × четыре Wet кисти ×48/128px),72rAF batches
по4 события, независимый engine. Samsung p95=16.8ms (раньше16.8–17), Apple17–19ms
(раньше17–20); в каждом случае один кадр>33ms. Новая версия сохраняет обычный
кадр, но cold первый мазок остаётся проблемой: Samsung max83.6–150.5ms,
Apple38–70ms. Не заявляется устранение задержки первого мазка, OS pen latency
или устойчивость памяти длительного рисования. Offscreen engines/GPU contexts
закрывались finally; реальные комнатные операции не создавались тестовыми мазками.

Undo/redo42/47/100/109 на обоих GPU:8 случаев, экспорт после redo побайтно равен
исходному PNG. Собственная Samsung room tab3615 закрыта, прежняя report tab3613
переведена на16, свой ADBforward19228 удалён. Неактивные builds13/15 удалены
после проверки registry и /proc; сохраняется один активный compiled16 с отчётом.
Временных jobs/browser contexts/дополнительных GPU contexts не осталось.
Остаются существующие QA frontend5386/backend4560/PG55560, компактные evidence,
исторические каталоги/CAS и source cache. Grafetto push/main/deploy не выполнялись.

## Версия17: устранение сильных различий формы/динамик

Source/compiled `3c038d146d82efb1dfb0c61be9da5ffe3b5828ad`, importer17,
каталогv28:117/245assets, manifest SHA
`b50d17595f8f4ca3ea045c9c5ac63009ccd9924fa4160fd42dfde871f3b58f81`.
Источник — прежний pinned Krita; исследований GPL runtime в продукт не копировали.
Добавлены нормализованный random sensor, fuzzy Size/Opacity/Rotation, identity
DrawingAngle+offset, локальная-Y Ratio и signed HSV adjustment при unit strength.
Исправлена потеря opacity independent child. Никакой подгонки по имени пресета.

Причины подтверждены KPP и source:49 пропускала random rotation узкого эллипса;
51 secondary subtract теряла opacity .47 и вырезала середину;67 пропускала
random size/opacity/ratio;71 пропускала direction offset91° и hue/value.
Контрольные изображения восстановили характерные формы и цвет этих четырёх.
На фиксированных union alpha>=8 масках ошибка premult RGBA к native снизилась
для49/51/67/71 на53.2/60.8/42.7/14.2%; статистика разных случайных расположений
не означает процент эквивалентности. Сохраняются RNG/geometry/coverage различия.

Все117 заново отрисованы source на настоящем Samsung, GLerrors0;40 изменены,
77 побайтно совпали с16. Данные/proof/contact sheets в `fixes-v17` рядом с16.
133 Python tests,364 TS tests/23 suites,полные typecheck/build/lint,map checks
прошли; существующие lint/map warnings сохранены. Roundness geometry witness
проверяет сохранение local-X при сжатииY; HSV witnesses проверяют hue180°,
белый/чёрный, grayscale и порядок saturation/value. Перестановка сетевых chunks
не меняет secondary sampling; configured opacity не теряется.

Стенд17 активирован, operator остаётся279definitions/283assets: новая117 и
исторически необходимые определения. Повторный readonly DB audit106refs,
81pinned и25unpinned: все25 сохранены; CAS/room manifests/операции не удалялись.

Производительность17: четыре проблемных кисти49/51/67/71 ×48/128px ×2GPU,
72rAF batches по4input events. Samsungp95≈16.8ms, iPad17–22ms; GLerrors0.
Cold maxima Samsung117.1ms/Apple59ms сохраняются,51/128Samsung имеет два
кадра>33ms. Это иной набор кистей, не прямой perf A/B к старому набору Wet.
Нельзя объявлять устранёнными pen latency, cold stall или memory reloads
по короткому offscreen тесту. Длительный pressure/tilt/freehand остаётся отдельной
проверкой. FanCorners/locked/custom absolute curves и HSV nonunit strength пока
явно ограничены, а не переведены в приблизительную случайную формулу молча.

## Коррекция шага: финальный стенд18

Source/compiled `39d06a7ebab0f595f96b4e86a373f20a7db6cca5`, importer18,
каталогv29:117/245, manifest SHA
`2d8a523c50120bcdbb726866ae4ae1af9ad849a3add8f539319f17034f3c46a5`.
Fixed nominal spacing обходил actual fuzzy size; теперь dynamic shape включает
source diameter-spacing. Его X использует actual stamp.aspect: изменение ratio
сжимает Y, не X; отдельно проверены осевые шаги20/5px при ratio.25.
Все117 source-экспортов повторены Samsung GL0;41 изменён против16,76 byte-equal.
133 Python,379 TS tests/25suites плюс73 DabSystem/behavior tests,полные
build/types/lint/map checks PASS. Существующие warnings не скрывались.

Это не сняло все расхождения111/112: площадь покрытия по-прежнему недостаточна.
Alpha-crop0..300 исключает blue seed320..448:111native431144,17=59127,
18=234032;112native583698,16=968541,17=93460,18=262439. Числа — сумма8-bit alpha,
не проценты похожести. Первоначальная проба crop0..340 включала20строк seed и
заменена исправленным отчётом; в выводах используются только crop0..300.
Отдельный visual gate Native/16/18 для изменённых low/high не выявил новой общей
тяжёлой регрессии. Улучшения49/51/67/71 и91/98/106/110 сохранены;100/101 всё ещё
слишком крупные в ramp/mix,85 слишком бледная решётка,111/112 недопокрыты.

Страница18 сравнивает Native/16/18, без примешивания устаревшей начальной
классификации к актуальным заметкам.117 кистей,6/page, pagination/searchRock,
512preview/1024original PASS, браузер/context закрыты. Старые отчёты сохранены.

Compiled18 UI/prepare/export9 ×2GPU PASS,GL0; Samsung все9 побайтно равны
source18; Apple vsSamsung maxpremultdelta5/255,mean<=.149/255. Current served
117@18, operator279/283 metadata сохраняет все25unpinned references,health/dbup.
Performance18 на67/71/111/112 ×48/128 ×2GPU: Samsungp95≈16.8ms,Apple17–20ms,
GL0; cold maxima117/66ms остаются. Это короткая синтетическая проверка rAF,
не доказанная аппаратная задержка стилуса или memory soak.

Undo/redo49/51/67/71 ×2GPU:8 случаев вернули побайтно идентичный экспорт.
Собственная Samsung room tab3616 закрыта, прежняя report tab3613 открыта на18,
свой ADBforward19230 удалён. Неактивные builds16/17 и неопубликованные
промежуточные каталоги26/27 удалены после проверки registry и/proc. Browser/GPU
contexts закрыты finally, registered temporary jobs пусты. Остаются один
compiled18/report, существующие QA frontend/backend/PG и компактные source/
evidence/каталоги/CAS. Grafetto коммиты локальны; push/main/deploy не выполнялись.


## Независимая геометрия и Impasto: стенд19

Importer19 (reader331f2550), final source e19c4288; performance-only renderer
3498ec38. Каталогv31:117кистей/245assets, manifestSHA
`b1cf934876d21eb1875cfbc78b257291c39c4e5d306261905196dbb42e2f63be`.
Исправлены собственный angle/aspect/spacing child, интерполяция nonlinear pressure,
фаза при повороте, single-scaling Max плюс additive fuzzy; добавлены combined
rotation и per-stroke random. Все изменения общие, без ветвлений по имени кисти.

Повторный source-run всех117 на Samsung: GL0,24изменены к18/93byteequal.
Два visual gates проверили24изменённых: новой тяжёлой общей регрессии не выявлено.
100/101 заметно ближе native по толщине и pressure ramp,19/74 также улучшились.
111/112 всё ещё бледнее native;104бледная,106–109 имеют слишком резкий старт.
Timed airbrush, native random sequence, corner-fanning и часть sensor combinations
не поддержаны полностью. Это не заявление идентичности всех117кистей.

136 Python tests,383 TS/25suites,42 child/spacing tests,17 texture-cache tests;
полные types/build/lint/map PASS (существующие предупреждения сохранены).
Viewer19 Native/18/19:117/6page/searchRock/512preview/1024original PASS.
Source-proof и результаты лежат в temp/device-runs/krita-stroke-20261024/fixes-v19;
performance — в соседнем krita-wet-20261024. Приватные runtime logs не коммитятся.

Impasto100 требует повторных uploads из-за рабочего набора больше GPU16МиБ.
Кэш CPU lightness mip-деривативов4МиБ устраняет повторное построение, но не uploads:
в идентичном инструментированном прогоне166base/1649mip uploads до/после на обоих
GPU. Samsung mean inputCPU11.40→6.57ms; Apple6.15→6.79ms (нет доказанного выигрыша).
Обычный повторный прогон100/101/111/112 ×48/128 ×2GPU: GL0; Samsung100p95
33–50ms, остальные≈16.8ms; Apple17–21ms. Cold maxima до117ms остаются.
Короткий синтетический прогон не доказывает OS stylus latency или memory-soak.


Final compiled3498ec38:18exports (9brushes×2GPU) GL0 и побайтно равны версии
до кэша; undo/redo51/100/101/112×2GPU вернули идентичный PNG во всех8случаях.
Все106QA references сохранены:81room-pinned,25разрешаются operator279/283.
Активен только dist-candidate19b, старые inactive18/19 удалены после проверки
registry+/proc. Samsung report3613 открыт на19, собственнаяroom3617 закрыта,
ADBforward19232 удалён; temporary jobs пусты. GPU contexts/browser закрыты finally.
Остаются прежние QA frontend/backend/PG, один compiled19b/report и компактные
исходные данные/история/CAS/evidence. Grafetto push/main/deploy не выполнялись.


## Krita20: восстановление слабых масок и постепенного начала

Продолжение §15 release track #314 (эпик #547 «Цифровая кисть»), понимание
#807 «Инструменты-кисти». Source5d028ac1, final compiled4f130813. Reader20,
каталогv32:117brushes/245assets,manifestSHA
`ea0a73cb3cdf155dff2637502e74189591bfe7d3b610013e5b52cc1e6185e186`.
Все изменения общие, без per-name коэффициентов и ручного усиления alpha.

Primary source audit нашёл пропущенный native Fade:106–108 Opacity по100/169/100
отпечаткам,109 Flow по204;107 child Flow186 со своей curve,115 Opacity264.
Native firstseq0 и post-paint increment; прежний fade был убывающим distance
и намеренно не переиспользован. Добавлены dabProgress, fork/periodic/bounds
witnesses, совместимый portable validator и счётчик stationary mixer skips.

Второй дефект — двойное ослабление bitmap: coverage содержалmask, а ceiling
ещё раз умножал её на smoothstep(0,.3,M). Новый uniform-ceiling профиль устраняет
этот множитель. Authored actual SamsungGPU constant mask26 дал alpha7 в старом
режиме и26 в новом, GL0. Исходные asset alpha и Flow не умножались вручную.
Alpha-сумма crop0..300 (без синей seed области):111native431144/19=234030/
20=410572;112native583698/19=330882/20=695113. Это не проценты сходства.

Full117 source Samsung GL0:98pixel-changed к19/19unchanged. Один source-run
прервался на54 после HMR reload при правке SmudgePainter; сохранённый прогон
продолжен. Final frozen compiled14exports GL0, все14побайтно равны source20.
Undo/redo51/106/107/112/115:5из5 вернули идентичный PNG. iPad в этом этапе
недоступен, проверка20 на AppleGPU НЕ заявлена. 575TS/35suites,138Python,
fulltypes/build/lint/map PASS; viewer117/6page/search/pagination/512↔1024 PASS.

Visual gates всех98changed PASS в смысле отсутствия новой тяжёлой массовой
регрессии:106–109 gradual-onset,38–40 плотность,98/104 покрытие и111/112 заметно
ближе native. ЛОКАЛЬНЫЙ FAIL115 early pressure-ramp: тонкий тёмный старт стал
слишком слабым, хотя constant/mix начало улучшилось. Fade/sourcecurve проверены,
конкретного importerbug нет; Wash accumulation остаётся общей неточностью.
12/85 всё ещё сильно отличаются, часть pencil/soft/mixer также PARTIAL.

Native111/112 PaintOpAction2=WASH/defaultcreamy. ConstantO1 даёт стандартное OVER
M*F, но variableO использует running average и alpha-darken, не наш max ceiling.
Это конкретный следующий механизм, вместе с time sensors108, tiny-mask filtering
и timed airbrush. Источники с полными формулами сохранены в analysis-111-112-v20.md
и analysis-106-109-v20.md рядом с компактным evidence; native source pinbd6e8d0.

Performance20 Samsung100/101/111/112×48/128,72rAF batches×4events: GL0;
100p9533–50ms, остальные≈16.8ms. Cold stalls до100ms остаются. Ускорение100
этим изменением НЕ заявлено; OSstyluslatency/memory-soak не измерялись.

Stand117@20/healthdbup, operator279/283 сохраняет все25unpinned из106refs,
81room-pinned. CAS/операции/пользовательские рисунки/история не удалялись.


После проверки собственная Samsungroom3618 закрыта, прежняяreport3613 открыта
на20; ADBforward19234 удалён. Browser/GPU contexts закрыты finally; temporaryjobs
пусты. Inactive compiled19b/20 и неопубликованный interimcatalog30 удалены с
registry+/proc проверкой. Остаются один compiled20b/report, прежние QA frontend/
backend/PG и compact evidence/source/CAS/history. Worktree/dependencies не копировались.
Grafetto main/push/productiondeploy не выполнялись.


Исправление предыдущего отчёта о typecheck19/20: параметр-свойство конструктора
BrushMipCache нарушало erasableSyntaxOnly (TS1294). Результат полного typecheck
был ошибочно отмечен PASS по хвосту workspace-лога; это утверждение отозвано.
Vite/GL/image проверки20 оставались успешными. Конструктор исправлен вf516330d;
повторный полный npm run typecheck действительно завершился exit0 (включая
web/SW/shared/server/e2e/scripts), wash-types-fixed.log. Новые проверки21 ниже.


## Krita21: AlphaDarken/OVER и фактический шаг с давлением

Reader5cd08263, final runtime12319e4d; источник полного117run runtime5634eccd,
финальный inputкаталогv34,117brushes/245assets,manifestSHA
`9395bbbccb5ccf3b30749f1bf776e5cf65c3ab3b1f186588240dce0c73a50c5d`.
Каталогv33 был внутренней неопубликованной пробой Wash до source-spacing fix;
backend его никогда не активировал. Финальные данные21 опубликованы изv34.
Результаты и source-proof: temp/device-runs/krita-stroke-20261024/fixes-v21.

По pinnedKrita bd6e8d0 перенесены creamy AlphaDarken color/alpha и averageOpacity,
per-dab opacity OVER, forced alphaDarken masking-context.88WASHparent,4OVERparent,
20WASHchildren;9WASHparent с material/HSV явно approximate по стоимости feedback,
16colorsmudge сохраняют previousCanvas. Основной и child clocks независимы.

Actual source axes включены для всех кистей вместо выборочного fuzzy/Ratio gate.
115 PressureSize identity раньше не включала профиль: шаг2.88px вместо
max(.5,2.88*p). Fade264dabs поэтому набирался к760px вместо≈145px.
После исправления тонкий насыщенный earlyramp115 восстановлен, localFAIL20снят.
Source/time/history/read-only audits и formula witnesses сохранены рядом.

Все117 sourceSamsung GL0:104changed к20/13unchanged; обаvisualgates всех104PASS.
Улучшения28/51/70/106/108/115.12 всё ещё сильно бледнее native,85 имеет неверную
сетчатую фактуру;116 перенос синего и часть edge/filter/RNG остаютсяPARTIAL.
Native Qt pyramid, time sensor108 и timed airbrush ещё не полностью воспроизведены.
Полная идентичность всех кистей не заявлена. iPad/AppleGPU21 недоступен.

8actualGPU scalar/color witnesses проверили falling-opacity, Flow1/.25/0,
цвет междуchunks, saturatedD>A и fast rising. Flow0 действительно меняетцвет,
не alpha. Nativefloat premultdelta<=1.5/255 сRGBA8rounding; saturatedfall alpha204
сохранена, chunk-colour pixel-identical single-op. После batching/parametercache
эти witnesses повторены.581TS/36suites,140Python; fulltypecheck/lint/map/build
успешно завершены exit0. Erratatypecheck19/20 выше сохраняется, не скрыта.

Быстрые последовательные dabs рисуются одним renderpass; uniformflow/A/mode
обновляются при изменении, feedback копирует только footprint в existingceiling.
Первый21вариант с per-dab FBO switching дал100p95до67ms; он заменён batching.
Matched Impasto100 ABBA (72rAF×4events, дваразмера, одинаковый actualSampler,
одинSamsung/sourceclass12319e4d) сравнил descriptors20/21 и старый strippedshader.
На48px20p95≈50ms,21p9517–34ms;128px20p9517–33ms,21p9517ms.
Diagnostic stripped20 shader дал48pxp9550–67ms,128px≈17ms.
У21drawcalls2263→1924 и1688→1478, FBO switches4549→4280/3935→3743;
texImage2Dвсехmiplevels1658/1134 не изменились. Strippedlegacyshader не дал
стабильного выигрыша: гипотеза лишней shaderbranch как причины не подтверждена.
Это короткое instrumentedAB, не обещание60FPS/OS pen latency. В fixed/variable
19/106/111 p95≈16.8ms, coldstalls до150ms остаются. Memory-soak не заявлен.

Оставшееся конкретное performanceнаправление: устранить повторные uploads при
16МиБ conservative GPUbudget, не увеличиваялимит. Возможный эксперимент —
упаковка анимированных alpha/material frames вRGBAканалы с побайтно идентичными
mips и swizzle; это пока план, не реализованная/измеренная оптимизация.


Final compiled12319e4d:20selectedexports (включаяrandomOpacity67/81/82) GL0,
все20 byte-identical frozen source5634. Undo/redo7cases pixel-identical.
Actual WebGL lose/restore67/115:2cases вернули тот же PNG,новыепрограммы/average
перестроились из журнала. Authored8witnesses повторены наfinalruntime без изменения.
Viewer21Native/20/21:117/6page/search/pagination/512↔1024 PASS; browser/contextзакрыты.
Operator279/283:106refs=81pinned+25operatorresolved,serverhealth/dbup.


Фактический Samsungentry проверенCDP: main-fq-5XEU0.js совпал сdist21d,
включая active serviceworker. Свояroom3619 и version-probe room закрыты,
прежняяreport3613на21, forwards19236/19238удалены; temporaryjobsпусты.
Browser/GPUcontextsзакрытыfinally. Приcleanup одинsameUID/proc/cwd был защищён;
привилегированный read-only аудит подтвердил0references/0unreadable, затем
удалены только knowninactive20b/21/21b/21c и unactivatedcatalog33. Остаются один
compiled21d/report, прежниеQAfrontend/backend/PG,compactsource/evidence/CAS/history.
Новыхworktree/dependencyкопийнет;Grafettomain/push/productiondeployне выполнялись.
