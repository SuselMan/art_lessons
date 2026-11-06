# Krita Hatching

Refs #817. Native KDE Krita pin
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/hatching`.
Descriptor@47 сохраняет авторский tip и добавляет hatching: угол, origin,
separation, thickness, antialias/subpixel и варианты crosshatching.
Стандартный пресет: Screentone Moire.

Перекрёстные проходы: none/perpendicular/minusPlus/plusMinus/moire.
У включённых сенсоров cross действуют native пороги0.5 либо0.33/0.67;
moire использует сенсорный поворот360°, а выключенный cross — поворот−10°.
Angle добавляет свой проход по native double-base-angle правилу.
Separation использует2..7 замкнутых сверху dyadic bins, толщина округляется
до целого с минимумом1px. Сенсоры используют общий source clock/random capture.

Процедурные линии закреплены в мировых координатах и обрезаются общим tip.
Фаза каждого прохода редуцируется на CPU по origin тайла, в шейдер передаются
локальные координаты. Opt-in вариант stamp shader сохраняет исторические строки
шейдеров для кистей без hatching. Нового временного framebuffer нет; readiness,
context loss, destroy и composite принадлежат прежнему BrushBehaviorPainter.

Это перенос механизмов, не пиксельный Qt/DDA оракул: сглаживание и округление
концов линий отличаются. Режим non-subpixel удерживает целую высоту шага,
но не воспроизводит отдельное округление концов каждого native отрезка.
Opaque background, timed input и non-normal compositing отклоняются явно.

184unit/15files,218Python; TypeScript web2244/server1107 inputs0diagnostics.
Linux AMD GPU: live до pen-up, final/Undo/Redo/cold двух участников совпали,
GL0/pageerrors[]. Unit-тесты покрывают порядок/пороги cross, moire, separation
bins, толщину, отрицательные координаты и фазу между соседними тайлами.
