# Krita Experiment / Shapes Fill

Refs #826. Native pin KDE
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/experiment`.
Descriptor@50: evolving closed contour, speed correction, smoothing threshold,
radial displacement, winding/parity и hard/soft edge. Native NoSize: размер
инструмента не масштабирует форму, определяемую движением пера.

Общий inputKnots накапливает канонические float32 точки. Первый paintLine
сохраняет начальные две точки, следующие дополняют контур. Speed использует
native коэффициент0.5*length*speed*.35 и saved-coefficient/point smoothing0.6/0.4.
Smoothing порог управляет quadratic дугами, displacement сдвигает точки от
текущего конца на trunc(displace*.14+1−manhattanLength).
Qt преобразование управляющих элементов и его simplify приближены плоскими
сегментами; de Casteljau имеет0.25px/256segments предел. При8192 вершинах
детерминированное прореживание сохраняет начало/конец и ограничивает память.

Маска последнего контура заменяет gesture coverage в прежнем BrushBehaviorPainter.
Dirty bounds включают предыдущую и новую формы: исчезнувшая область композитится
с frozen original, а не остаётся старым отпечатком. Отдельного history/online
пути нет. PolygonFillBatch использует triangle fan и один переиспользуемый
DEPTH_STENCIL renderbuffer: INCR_WRAP/DECR_WRAP для winding, INVERT для even-odd.
Stencil winding modulo256; чрезвычайные кратности256 могут дать другое заполнение.
Soft edge — четыре subpixel stencil прохода. Scissor ограничен текущим полигоном
в тайле. Renderbuffer4MiB при1024² один на painter, не на каждый тайл.
Он отсоединяется от pooled framebuffer в finally; context loss/destroy общие.

Pattern fill, timed input, eraser и nonnormal composite отклоняются явно.
Native pixel/Qt curve parity и перья планшетов не заявлены.
219unit/21files,226Python; web2255/server1110 inputs0diagnostics.
Linux AMD: live до pen-up/final/Undo/Redo/cold обеих сторон точны, GL0.
Независимый GPU probe: двойной контур winding255/parity0, soft edge128,
уменьшение формы alpha255→0 вне нового контура, внутри RGB[51,102,204].
Stencil attachment снят, color mask/scissor восстановлены, GL0. Offscreen
проверочные буферы уничтожены; stencil ресурс принадлежит живому engine.
