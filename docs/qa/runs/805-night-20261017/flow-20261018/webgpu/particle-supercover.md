# Particle v4: подтверждённый corner-cut и отдельное исправление

V4 hardware-пара по диагональной сухой линии показала около5% переноса цвета через неё у обычных и compact particles; dry pixel count при этом оставался0. Значит проверка только «не оставили цвет на сухом пикселе» не доказывала отсутствие пересечения. Отрицательный результат сохраняется: старый source не переписывался задним числом.

Причина воспроизводится CPU: путь `(10,21)→(11,22)` через raster-линию `x+y=32` при обычной nearest sampling пропускает клетки линии, хотя sample distance≤1px. NEW `macro4-particles-safe.ts` заменяет единственную функцию pathWet: при одновременном переходе X/Y дополнительно проверяет обе ортогональные клетки. Это консервативный supercover, запрещающий проход между соприкасающими сухими углами; он может также отвергать диагональные wet-only necks. Остальная траектория, source-index seed и splat не меняются.

Используется узкий adapter к **настоящему** GPUDevice: все native методы bound к исходному device, только один uniquely matched shader module получает новый source. Никакого software GPU, fake capability или изменения app shader нет. CPU тест проверяет ровно одну замену. Новый work guard учитывает до трёх environment probes на каждый path sample; канарейки с≤5000 active wet pigment pixels проходят128M cap при первых двух presets. Большие dense inputs по-прежнему отвергаются явно.

5 CPU tests PASS, включая фактический старый counterexample и более40 диагональных пересечений; strict TypeScript/lint и полный146-word reserved audit PASS. Аппаратный counterpart нового source ожидается. Static-domain исправление не следует переносить в dynamic-wetness solver: там initial dry paper намеренно проницаема, и это другой oracle.
