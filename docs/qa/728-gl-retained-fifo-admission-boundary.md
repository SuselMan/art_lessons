# Retained input: граница actual Engine FIFO

Целевой CPU gate: `index.retainedFifoAdmissionBoundary.test.ts`, 2/2 PASS. Использованы actual Engine MockGL, его `_wcCanonical` и существующий `retainPointerAdmission`; runtime не изменён.

До завершения предшественника retained DOWN/MOVE/ранний UP не вызывают исходный source handler. После него собственный выполняющийся FIFO request остаётся pending, поэтому actual diagnostic dispatcher отклоняет admission до source mutation. Отмена только retained request не отменяет предшественника: он завершается, очередь становится idle, source dispatch отсутствует.

`predecessor-published` — управляемый CPU маркер порядка конечного generator, **не свидетельство GPU публикации**. Первый бесконечный тестовый predecessor был прерван и заменён конечным; scheduler/runtime не исправлялись.

Положительный runtime путь остаётся HOLD: нужен capability для собственного выполняющегося request без ослабления общей pending-защиты, а также immutable GPU material owner и обычный callback/publication contract. Этот отрицательный gate не доказывает мгновенный следующий мазок или улучшение UX. Новые устройства, стенды и проверки не запускались.
