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
