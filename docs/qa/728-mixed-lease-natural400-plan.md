# Следующий gate: естественная cadence, вода → пигмент, кисть 400

Запускать только после strict controlled-input field/export/history gate. Это отдельный cohort, не продолжение model-clock эксперимента. Никаких подмен performance.now/Date.now, дополнительных gl.finish/readPixels или screenshot в профилируемом интервале.

- Actual Room/PointerInput, размер UI и engine 400, round, water100. Первый длинный штрих water100/pigment0, следующий water100/pigment100 с тем же цветом.
- Генерация pointer moves по реальным requestAnimationFrame, с одинаковым количеством coalesced samples на кадр. Между UP и следующим DOWN не ждать canonical idle. Журнал событий сохранять: frame/event timestamps, pressure, положения и длительность; разные живые OFF/ON ленты не выдавать за exact same-input oracle.
- При second DOWN сохранить факт pending predecessor до вызова `_onStart`. Сразу после вызова сохранить actual lease/admission и факт DOWN drain. Если predecessor уже завершён или lease не был использован, запуск не проверял mixed candidate — не объявлять улучшение.
- Раздельные часы: second DOWN handler begin/end; первый пигментный source draw begin/end; первый последующий display/composite submission begin/end; первый rAF после этого. Source/composite — CPU submission в WebGL queue. Даже следующий rAF **не** является физической видимой pen latency.
- По всей последовательности: max rAF gap, median/p95 gap, ограниченные counts queued/pending/settle; phase переходы до/во время/после штриха. Временные wrappers не сериализуют аргументы и не пишут файлы внутри callback, сохраняют только ограниченные массивы scalar timestamps.
- После завершения временного профиля отдельно ждать bounded idle, проверить GL/context и непустой material export. Любые readback/export/SHA времена записать отдельно и исключить из input timing.
- OFF/ON — отдельные собственные contexts, strict model flags identical кроме private snapshot lease, текущие source/paper SHA passports. RAM preflight/monitor, 120s deadline и own-context cleanup обязательны. До выдачи Samsung/Surface root coordinator не занимать устройство.

Успех требует сохранённой картины плюс сокращения actual DOWN→source/composite submission без новых больших frame gaps. Побайтную fidelity устанавливает предыдущий controlled cohort; этот живой профиль устанавливает лишь механизм отзывчивости. При mixed lease FAIL сохранять pending/admission/phase и не ослаблять guards.
