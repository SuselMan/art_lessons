# #747 — конус зависимостей M70 и геометрия окон

База: 7d2ca321 (#796, explicit M70 policy). Это pure planning helper и CPU
операторное доказательство, не включённый tiled renderer и не native RGBA proof.

## Что доказано тестом

Настоящий WatercolorSettlePlan.prepare исполняет radius40/S1/water1/standing1,
wetPeak1, bloom0, один/два пигмента, непустой brushTravel. M70 policy отключает
contacts и включает paired optical color. Учитываются все реальные fieldOp,
waterFrontStep, diffuseStep, framebuffer copies и clear. Версии буферов
разделяются до записи, поэтому ping-pong/alias не превращается в цикл.

Число реальных front draws45, paired diffusion draws26. Консервативный радиус
зависимости финальных двух groupTide outputs **612 worldpx**, включая +1 pixel
на LINEAR reads mask/pressure. NEAREST/pool поля не получают этот запас.
Поддержка берётся из конкретных shader веток:

- prefix8 front читает cost/film по длине stride;
- carry pigment/color — один stride, pressure для incoming donor — два stride,
  capillary дополнительно3px;
- diffusion — radius на обычном и2*radius на knight stencil;
- mode5 gather — dir; mode6 pressure-ring10px; fibre gradient3px;
- pointwise bookkeeping; любые незнакомые fieldOp отклоняются.

Тест закрепляет hash трёх GLSL исходников: изменение sampling требует review
сертификата. Он не заменяет проверку новых shader веток/новых диагностических
режимов. Контракт ограничен нынешним каноническим M70, а не всеми legacy моделями.

## Окна

halo640 + core256 + halo640 = field1536. Это90MiB только для десяти RGBA8
solver fields. Source clones, fast-front5textures, raw fields, targets и pool
надо учитывать отдельно:90MiB НЕ обещание пика всего процесса.

m70Windows принимает физический page и ЯВНЫЙ canonical domain. Domain должен
покрывать страницу и иметь размеры, кратные256. Выбор minimum1024/1536 здесь
не скрыт: helper не меняет нынешнюю build-зависимость nativeMinimum.
Каждая ось окна равна min(1536,domainAxis), одинаково для всех окон этой оси.
Окна у края clamp к ГЛОБАЛЬНОМУ domain edge, а не к physical page edge.
У core недостаточный halo допускается только на настоящем global edge.
Pixel origins целочисленные, иногда128mod256; allocation sizes кратны256.
Это сохраняет world S1 grid и4px foreign-water grid. Вне physical page, но
внутри domain источники нулевые; за domain сохраняется прежний skip/clamp.
Просто вырезать physical-page rect и clamp его края — другая физика.

Геометрические проверки покрывают A4/A3/A2, узкую ось1024 и неровный1537²,
точное покрытие core без пропущенных пикселей и halo у внутренних границ.

## Обязательные условия для renderer

1. Сохранить прежний <=1024 monolithic путь. Не менять его размер field.
2. Все окна читают одну immutable raw revision; source scratch парковать ДО
   загрузки остальных тайлов, а не после OOM. Нельзя читать уже solved соседа.
3. Один global Contrast/coarse-grid и connected-component selection до solver.
   Полный reference P/C/coverage раздаётся окнам; prepare не запускает Contrast.
4. После завершения ВСЕХ окон собрать global Background coarse inputs из
   готового P/C, выполнить coarse diffusion, затем одинаковый global-world
   reconstruction. Запуск Background отдельно в каждом окне не эквивалентен.
5. Предвычисленные global foreign source selection и4px grid должны совпадать.
   Нельзя пересчитать selection по subset metadata каждого окна.
6. Никакого CAP среза core, S изменения, autoDry или solver per independent tile.
7. Native проверка обязательна: другая нормировка UV/field dimensions может
   изменить floating-point rounding даже при математически том же sampling.
   CPU612 доказывает dependency locality, не bit-exact WebGL arithmetic.

Итог: bounded overlapping solve оправдан для текущего контакты-OFF M70 при
общих глобальных фазах. Полной гарантии runtime equivalence ещё нет; эти
условия должны быть выполнены адаптером и проверены native reference.
