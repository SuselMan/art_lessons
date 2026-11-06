# Krita Particle

Refs #819. Native pin KDE
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/particle`.
Descriptor@49: count, iterations, gravity, weight, scaleX/Y. Стандартный пресет
Experimental Webs:65 частиц ×15 итераций, gravity0.906, weight0.06.

Состояние жеста — Float64 позиции и next-position каждой частицы. Сохранена
native необычная инициализация next-position абсолютной начальной позицией.
На каждой итерации сила к текущему перу умножается на оси и(j+iterations)*0.5,
скорость умножается на gravity, позиция меняется на next-position*0.00003.
Wall clock, tiles и network batches в интеграции не участвуют. Авторские
координаты перед интеграцией приводятся к записанным float32. State клонируется
обычным gesture savepoint; первый ввод тоже наносит точки.

DabSystem подаёт исходные knots. SprayShapeBatch растеризует bilinear tent
с полупиксельным сдвигом: native floor(pos) и три соседа получают те же центры.
Веса складываются в существующий ceiling image, затем alpha с постоянным
исходным цветом накладывается OVER один раз на request. Это сохраняет цвет
при насыщении суммы весов. SketchLineBatch переиспользует copy-программу;
старые пути явно выбирают прежнее RGB копирование.

Лимиты:count1..500, iterations1..200, count*iterations<=16384. Один input dab за
вызов расширения, upload2048 точек, fixed staging480KiB. Новых framebuffer нет.
Стратегия native NoSize: размер инструмента не меняет solver. Timed airbrush,
negative/unstable forces, eraser и nonnormal composite отклоняются явно.
GPU bilinear/U8 округление отличается от native. Межвендорная точность не
заявлена; текущие физические перья планшетов этим проходом не аттестованы.

213unit/20files,224Python; web2251/server1109 inputs0diagnostics. Linux AMD:
live до pen-up/final/Undo/Redo/cold обоих участников точны,GL0/pageerrors[].
GPU: насыщенный цвет при alpha128=[25,51,102]; дробная точка даёт alpha191/64 на соседях. Прежняя Sketch opacity по-прежнему128/191. Все пробы GL0, временные GPU буферы уничтожены.
