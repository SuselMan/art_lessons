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
