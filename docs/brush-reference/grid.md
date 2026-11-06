# Krita Grid и Blender Pixelize

Refs #818. Native KDE pin
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/gridbrush`.
Descriptor@48: ширина/высота сетки, scale, offsets, division/pressure division,
границы/случайные границы, пять форм, point sampling, color-per-cell и opacity.
Старый пресет без Grid/diameter берёт gridWidth; Pixelize имеет одну ячейку20px.
Размер Grafetto меняет диаметр покрываемой области, шаг выдачи запросов равен
ширине основной ячейки и не увеличивается вместе с диаметром.

Grid использует общий mixer/source путь. Сначала собирается один GPU участок
исходного слоя, затем все ячейки читают его и рисуются упорядоченным batch.
CPU readPixels в рабочем пути отсутствует. Source dependencies и историческое
воспроизведение остаются у общего механизма canvas-mixer. Shape0 — ellipse,
1 — rectangle,2/3 — diagonal thin line,4 — tapered line. Ячейки привязаны к
миру, включая native fmod для отрицательных координат и offsets. Перед
дискретной привязкой Dab приводится к записанным float32 значениям.

Pressure division сначала truncates level*pressure, затем округляет scale*level.
Слишком широкие borders нормализуют перевёрнутую клетку. Равные random borders
разделяют одну случайную величину. Color-per-cell=false выбирает цвет первого
центра на весь запрос; true — отдельного центра каждой клетки. Random opacity
имеет двойное применение alpha, как native color+painter opacity.

Лимиты:4096 ячеек за запрос; превышение отклоняется целиком до allocation/read,
без зависящего от кадра частичного префикса. GPU staging216KiB/1024ячейки,
source patch <=512² из существующего16MiB idle scratch pool. При большем
мировом охвате источник масштабируется до512px. Shader readiness, context
loss/forget и destroy интегрированы в SmudgePainter.

Границы: источник — pre-request canvas, не native transaction-old изображение
начала жеста. Для нестандартных перекрывающихся/разделяемых сеток обратная связь
может отличаться. Qt/DDA endpoints/AA, случайные числа и пересечения ячеек при
пониженной общей opacity приблизительны. Background fill/mix, активный random
HSV, timed input, eraser и nonnormal composite отклоняются явно.

208unit/19files,221Python; web2249 inputs0diagnostics. Соседние тесты старой
растушёвки/image sampler проходят. Linux AMD: цветной слой, live до pen-up,
final/Undo/Redo/cold двух участников совпали; GL0/pageerrors[]. Независимый GPU
тест получил red/blue для разных центров и red/red для общего центра, а правая
половина отдельного тайла совпала с соответствующей половиной полного буфера.
Временные GPU буферы уничтожены. Перо планшетов/native pixel parity не заявлены.
