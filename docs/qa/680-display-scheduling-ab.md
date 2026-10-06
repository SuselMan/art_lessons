# #680: изолированный DEV A/B планирования display

База5f306dfc. Оба private diagnostic flags по умолчанию false и guarded `import.meta.env.DEV`; production/default не меняется. Модель, шейдеры, операторы и канонический порядок не изменены.

T (`_diagnosticRevealPause`) убирает внутренний reveal-owned timeout при pendown. Активный input продолжает свои display и продвижение reveal-clock; onEnd display снова запускает самостоятельные reveal frames. Пауза относится к лишним repaint, а не к физике или времени высыхания. Это соответствует существующему комментарию к таймеру.

R (`_diagnosticDisplayRafCancel`) при прямом display отменяет уже ожидающий RAF, поскольку прямой кадр показывает актуальное состояние. Следующее изменение снова может запланировать кадр. Debug latency timestamp сохраняется как одна завершённая выборка прямого кадра; extra finish остаётся только при уже включённом debug, аппаратный timing выполняется debugOFF. Выполняющийся RAF уже обнулил id и не попадает под новый блок.

Fake-clock тесты используют настоящую reveal lifecycle после watercolor stroke: T не порождает repaint при pendown, активный кадр остаётся, penup возобновляет reveal и он освобождается по истечении срока. R объединяет owed RAF с прямым текущим кадром, принимает будущий кадр и сохраняет debug latency. DefaultOFF сохраняет старое поведение. На исходнике5f два основных новых теста падают: timer запрос при pendown и неотменённый RAF (`temp/display-ab/baseline-negative.txt`).

103 теста/5 файлов PASS: displayScheduling, watercolor, settlePlanLifetime, contextRestore, settleQueue. Typecheck/lint/map:check/map:rules/diffcheck проходят с существующими warning. Hardware ещё не запускался. Prepared `temp/display-ab/run.mjs`: сначала same65 P/C/V/dryPC/fullPNG OFFON, затем balanced burst OFF/ON/ON/OFF с ACK и actualflags; варианты T/R/TR отдельны. Никаких новых readbacks в timing. Не заявляется устранение45Hz или всех input hitch, пассивная трасса имела stack overhead и не является чистым production FPS.

## Vega T A/B: полезность не подтверждена

8e50bf70 на собственном5311, один Chrome, прежние девять flags/idleBatchOFF. Same65 OFF/ON пять canonical buffers и полный прозрачный PNG EXACT. Четыре fresh-room native bursts OFF/ON/ON/OFF с actualACK/GL0, без stack observer/readback во время timing:

| T | burst1 median ms | burst2 max ms | burst3 max ms |
|---|---:|---:|---:|
| OFF |22.2|150.0|150.0|
| ON |22.2|149.9|133.2|
| ON |22.2|149.9|133.4|
| OFF |22.2|133.4|127.7|

Устойчивого улучшения45Hz или hitches нет, последниеOFF показатели не хужеON. Оптимизация не обоснована для integration. R/TR аппаратно ещё не выполнялись.

Дополнительный Dry→новый штрих в другом участке получил настоящий reveal и pendown, сняты шесть кадров с шагом250ms. Однако старая область630,420,260×70 byte-identical во всех соседних кадрах ОБОИХ вариантовOFF/ON. Baseline motion в этом straight-stroke fixture отсутствует, поэтому continuity gate **inconclusive**, нельзя назвать T безопасным: будущая проверка требует puddle/pigment fixture с доказанной baseline motion. CPU-fakeclock lifecycle не заменяет экранную непрерывность.

Chrome закрыты вfinally; GPU передан urgent restore QA. Исходники production не менялись. Raw artifacts: `temp/display-ab/T-results` (full timings/passport/ACK/fixedfieldsPNG), `temp/display-ab/visual-T` (PNG иactualreveals/pendown); source8e50 остаётсяdefaultOFF DEV экспериментом.
