# Krita Bristle в общем движке Grafetto

Refs #815. Native reference: KDE Krita commit
`bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `plugins/paintops/hairy`.
Это поддержка механизма, а не обещание совпадения каждого пикселя.

`hairybrush` преобразуется в immutable descriptor@45: фиксированное множество
волосков из первого кадра авторской маски; длина волоска равна её alpha.
Сохраняются scale, density, shear, random, pressure threshold, connected path,
mouse pressure, Size/Opacity/Rotation sensors. Инициализация ограничена256px и
4096 волосками; более крупные/плотные конфигурации явно отклоняются.

DabSystem подаёт исходные точки пера, без обычного размещения отпечатков.
Отдельные волоски соединяют предыдущую и текущую позиции; connected path
сохраняет собственный трансформированный конец каждого волоска. Нажим управляет
контактом, размером и сдвигом, случайность закреплена за жестом/точкой/волоском.
Клонирование gesture state сохраняет продолжение и preview/replay.

Растеризация переиспользует `SketchLineBatch` в общем coverage/composite.
Режим AA без compositing складывает покрытия волосков внутри одного запроса,
остальные поддержанные режимы используют OVER. Групповая opacity применяется
один раз. Новых тайловых GPU поверхностей нет, staging ограничен2048 линиями,
обработка разрезается по4 исходных даба. Shader preparation/context loss/destroy
общие со Sketch; поведение существующих дескрипторов не меняется.

Границы: популяция выбирается детерминированным Grafetto RNG при импорте;
capsule AA и line coverage отличаются от native DDA/Wu и U8 rounding.
Авторская bitmap-маска масштабируется до начального source size, используются
первые pipe-кадр и его alpha. Цветные волоски, ink depletion/soak, aliased
maximum-alpha, timed input и nonnormal compositing не заявлены. Depletion,
aliased maximum-alpha и timer отклоняются явно.

Стандартный пресет: `d) Ink-8 Sumi-e` (218 волосков). Другие стандартные
`Bristles` чаще принадлежат Pixel, название кисти не определяет её движок.
Локальные проверки:5 unit-тестов траекторий/контакта/replay/границ,212 Python
проверок импортера, shared catalogue validation, TypeScript web/server.
Реальный Linux AMD GPU: live второго участника, final, Undo/Redo и холодное
восстановление проверяются перед публикацией каждого изменённого рендера.
