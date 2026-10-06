# #680: изолированный DEV A/B планирования display

База5f306dfc. Оба private diagnostic flags по умолчанию false и guarded `import.meta.env.DEV`; production/default не меняется. Модель, шейдеры, операторы и канонический порядок не изменены.

T (`_diagnosticRevealPause`) убирает внутренний reveal-owned timeout при pendown. Активный input продолжает свои display и продвижение reveal-clock; onEnd display снова запускает самостоятельные reveal frames. Пауза относится к лишним repaint, а не к физике или времени высыхания. Это соответствует существующему комментарию к таймеру.

R (`_diagnosticDisplayRafCancel`) при прямом display отменяет уже ожидающий RAF, поскольку прямой кадр показывает актуальное состояние. Следующее изменение снова может запланировать кадр. Debug latency timestamp сохраняется как одна завершённая выборка прямого кадра; extra finish остаётся только при уже включённом debug, аппаратный timing выполняется debugOFF. Выполняющийся RAF уже обнулил id и не попадает под новый блок.

Fake-clock тесты используют настоящую reveal lifecycle после watercolor stroke: T не порождает repaint при pendown, активный кадр остаётся, penup возобновляет reveal и он освобождается по истечении срока. R объединяет owed RAF с прямым текущим кадром, принимает будущий кадр и сохраняет debug latency. DefaultOFF сохраняет старое поведение. На исходнике5f два основных новых теста падают: timer запрос при pendown и неотменённый RAF (`temp/display-ab/baseline-negative.txt`).

103 теста/5 файлов PASS: displayScheduling, watercolor, settlePlanLifetime, contextRestore, settleQueue. Typecheck/lint/map:check/map:rules/diffcheck проходят с существующими warning. Hardware ещё не запускался. Prepared `temp/display-ab/run.mjs`: сначала same65 P/C/V/dryPC/fullPNG OFFON, затем balanced burst OFF/ON/ON/OFF с ACK и actualflags; варианты T/R/TR отдельны. Никаких новых readbacks в timing. Не заявляется устранение45Hz или всех input hitch, пассивная трасса имела stack overhead и не является чистым production FPS.
