# Изолированный t0 gate residual presentation

`residualSourceGpu.mjs` создаёт Engine64 с Fine1024, исполняет настоящий source painter water400→pig70 и сохраняет реальные composite arguments. Канонические settle/Room/FIFO/filmstrip не исполняются. Production resample формирует Float128 P/C; отдельная immutable пара копируется GPU→GPU. Исходный composite и residual composite используют один recipe, world и coverage. Проверяются непустой P/ROI, точное RGBA64, Float-copy SHA/байты, sourceP ROI до/после, GL по этапам. Это не whole-source immutability proof.

Считывается 1.0625MiB после рисования (Float пары + четыре ROI). Pool содержит шесть128RGBA32F текстур (1.5MiB); он переиспользован для mobile/initial/zero fixed только в этом тесте. Производственная allocator/runtime схема не изменяется. Shader opt-in требует12fragment samplers.

Первый запуск не создал вкладку: Node HTTPpassport отклонил devcert; исправлен preflight curl для существующего QA HTTPS. Исправленный запуск Surface: pre2178/min1850/post1930MiB, own target закрыт. Actual-source и Float-allocation GL0, затем **INVALID fixture**: plain descriptor не имел production `beginReplaceDraw`. Residual shader/draw не достигнут, эквивалентность не проверена. Raw: `temp/device-runs/residual-source-corrected-surface.json`.

После ошибки добавлен локальный descriptor adapter по существующему `PreviewPairedFloatAllocator` контракту, без изменения original field/pool. CPU тест проверяет FBO/viewport/blend begin/end и отсутствие мутации descriptor. Новый hardware запуск требует отдельного координированного слота. Нет положительного GPU t0 результата и нет artist-ready утверждения.
