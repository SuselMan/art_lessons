# Krita Curve в общем конвейере

Refs #816. Источник: KDE Krita
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/curvebrush`.
Descriptor@46 содержит `curveTrace`: history2..128, smoothing, connect,
curve opacity и отдельные width/opacity controls. Скалярный BrushCurve для
сенсоров остаётся отдельным типом. Стандартный пресет: Sketching-3 Leaky.

Общий DabSystem подаёт исходные точки пера. Начальная точка является pi1;
история пополняется со следующей pi2, как в native paintLine. По заполнении
окна рисуется quadratic с контролем floor(n/2) либо cubic с контролями
floor(n/3) и2*floor(n/3). Опциональная линия соединяет pi1/pi2.
Размер инструмента управляет толщиной линии. Нативные checkable Line width и
Curves opacity сохраняются; общий Opacity применяется после сборки запроса.

Adaptive de Casteljau допускает0.25px отклонение от хорды и ограничен глубиной8
(256 сегментов). Большие/закрученные пути сохраняют этот предел работы;
capsule antialias и стыки отличаются от Qt painter paths.
Пути растеризуются через общий SketchLineBatch: сначала непрозрачная геометрия,
потом path opacity, затем request opacity один раз над соединением и кривой.
Дополнительный временный буфер — существующий pooled brushCeilingCopy;
нового atlas/тайлового хранилища и отдельного онлайн протокола нет.

Тесты:178 unit,215 Python; отдельные проверки quadratic midpoint,
collinear backtracking, cubic controls, окна истории и клонирования replay.
Linux AMD: live/final/Undo/Redo/cold двух участников совпадают, GL0.
Отдельный GPU сценарий проверяет path opacity и общую opacity пересечения.
Timed input и non-normal compositing отклоняются явно. Native pixel parity
и физическое перо планшета этим проходом не аттестованы.
