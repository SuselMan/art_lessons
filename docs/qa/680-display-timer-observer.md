# #680: пассивная трасса display/reveal во время рисования

Источник аппаратного стенда 5311: `5f306dfc`, ANGLE AMD Radeon Graphics/radeonsi renoir ACO. Один собственный Chrome, четыре native PointerInput-жеста size80 по8×150ms, пауза150ms. Все четыре операции имеют server ACK, GL0, solver/reveal завершились. Idle batching выключен. Контекст: preserveDrawingBuffer=true, premultipliedAlpha=false, antialias=false, DPR1. Девять художественных flags записаны native passport. Исходник не менялся.

Passthrough observer не добавляет GL/sync/readPixels, RAF или таймеры. Он записывает времена/caller stack, pendown, pendingRAF, paper damage/partial, аргумент paper-compose. Stack capture и metadata имеют CPU overhead; это не чистый production FPS measurement. Лимит2500 событий достигнут в burst4-settle: все четыре активные фазы присутствуют, поздний tail отсутствует. Отрицательные выводы по отсутствующим событиям запрещены.

В сохранённом префиксе 41 reveal-inner-timeout вызов `_displayIfNotSuspended` при pendown. Все имеют фактический Vite stack index.ts:7400, проверенный текстом emitted source: внутренний33ms таймер не повторяет проверку `_strokeLayerId`. После38 таких запросов ближайший paper-compose в пределах50ms полный. При pendown наблюдались160 partial и46 full compose (full по жестам1/2/3/4:1/15/16/14). Семь direct `_display` входов сохраняли pendingRAF: четыре из onEnd и три из onStart. Это доказывает наличие лишних timer-full frames и pending direct-display, но не единственность причины низкой частоты или последующий duplicate actual draw без дополнительного анализа.

Базовая median16.7ms, active22.2ms (~45Hz); максимумы жестов2/3/4:155.5/133.3/150ms. Background settle до solver idle14.83s, весь tail23.54s — не FPS. Не выполнялись художественные изменения или оптимизация defaultON.

Артефакты (не tracked): `680-device-qa-guards/temp/display-observer/results/report.json`, `analysis.json`, `passive.js`, `pageBench.js`; home mirror `680-lifetime-hardware/temp/display-observer`. Chrome закрыт в finally, GPU передан следующему агенту. Старый собственный5321 PID747318 остановлен после проверки args/cwd/source manifest7322; его артефакты сохранены.
