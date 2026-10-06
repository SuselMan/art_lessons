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

## Vega R-only balanced результат

T выключен во всех случаях. Same65 OFF/ON пять canonical buffers/wholePNG EXACT, actual3ACK/GL0 во всех fresh-room bursts. Четыре случая OFF/ON/ON/OFF:

| R | active median ms | burst2 max ms | burst3 max ms |
|---|---:|---:|---:|
|OFF|22.2|150.1|233.4|
|ON|22.2|133.3|161.0|
|ON|22.2|133.4|116.7|
|OFF|22.2|150.0|200.0|

45Hz не исправлен. Обе пары дают ограниченный сигнал сокращения худших burst hitch, но остаются133–161ms и выборка составляет лишь две пары. Это не доказательство общего production исправления или GPU/photon latency. Forced-complete CPU submission6–13ms, remaining971..952 /991..973 /976..970 /973..960 ops; driver/GPU backlog механизм этим не устранён. Background solver/reveal23.6–24.3s. Native журналы различаются по реальным rAF input sampling, поэтому их канонические PNG между случаями не сравниваются; exact65 gate использует один и тот же журнал.

Оставлено DEV/defaultOFF. Raw `temp/display-ab/R-results`. Chrome finallyclosed, GPU передан five-participant QA. Следующее причинное исследование подготовленоCPU: finaldefaultFBblit-only ablation (paper pass, framebuffer bindings и bookkeeping остаются), поскольку прежниеwhole-screen-noop60Hz, paper-fragments-onlyskip45Hz и preservefalse45Hz не объясняют именно последний draw. ON отображение намеренно stale, diagnostic не является productfix.

## Final default-FB draw изолирован аппаратно

На8e50, T/R OFF, debug=false, та же бумага/9flags/source65, balanced OFF/ON/ON/OFF. ON пропускает только последний screenBlit draw; paper-compose, bindings, viewport и bookkeeping сохранены. ON экран **устаревший**, это diagnostic, не исправление UX.

| skip final draw | active median ms | burst2 max ms | burst3 max ms | post-export wall ms |
|---|---:|---:|---:|---:|
|OFF|22.2|150.0|133.3|226.4|
|ON|16.7|16.8|22.3|208.6|
|ON|16.7|16.8|16.8|272.1|
|OFF|22.2|150.1|233.4|242.0|

Actual canvas1600×1000/DPR1/angle0/residualScale1/zoom0.35484. ON действительно пропустил816/828 final draws, OFF0. Debug синхронизация исключена. Same65 fivebuffers/fullPNG exact; actual nativeACK/GL0 и post-export nonempty во всех случаях. Post-export включает GPU/readback/PNG CPU, не pure GPU timer; секундного отложенного backlog этим не видно.

Сигнал локализует default-framebuffer/presentation path, но не доказывает высокую стоимость fragment shader: изменяется также compositor/GPU scheduling. Следующий разрешённый CPU DEV-off кандидат — тот же partial rect как scissor финального draw при preserveDrawingBuffer=true, с существующими full invalidations; цель проверить pixel-area против fixed presentation overhead. Никакой source production оптимизации не включено. `temp/display-ab/blit-results` содержит полный timing/flags/source/canonical/passthrough counts; Chrome finallyclosed, GPU передан precision QA.

## CPU кандидат S: partial default-FB blit

Новый private `_diagnosticBlitScissor`, DEV/defaultOFF. В конце существующего screen pass при partial rect и actual preserveDrawingBuffer=true тот же rect ограничивает финальный defaultFB draw; после draw scissor отключается. Full/null/неpreserved/attrsnull остаются full copy. Camera/cachekey/resize invalidation и все канонические операторы неизменны. Getter контекстных attrs используется только в ON partial ветке, не GPU readback.

Пять FakeGL контрактов наблюдают реальный default-framebuffer draw и paper-cache draw: идентичный scissor rect/снятие scissor, preservefalse/null fallback, full invalidation, defaultOFF. Старый8e50 source не проходит первый контракт (defaultFB draw не clipped). Это GL-state proof, не raster/pixel proof. 108 тестов/6 файлов, typecheck/lint/map проходят; только существующие warnings. Hardware кандидат ещё не проверялся, production не включён. Будущие gates: same65 fullPNG/fields, defaultFB/cache pixel oracle, pick, resize/camera, actual reveal continuity, balanced native ACK/debugOFF/perf.
