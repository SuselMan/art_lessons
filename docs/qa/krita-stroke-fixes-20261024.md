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
