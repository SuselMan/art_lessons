# Изолированный t0 gate residual presentation

`residualSourceGpu.mjs` создаёт Engine64 с Fine1024, исполняет настоящий source painter water400→pig70 и сохраняет реальные composite arguments. Канонические settle/Room/FIFO/filmstrip не исполняются. Production resample формирует Float128 P/C; отдельная immutable пара копируется GPU→GPU. Исходный composite и residual composite используют один recipe, world и coverage. Проверяются непустой P/ROI, точное RGBA64, Float-copy SHA/байты, sourceP ROI до/после, GL по этапам. Это не whole-source immutability proof.

Считывается 1.0625MiB после рисования (Float пары + четыре ROI). Pool содержит шесть128RGBA32F текстур (1.5MiB); он переиспользован для mobile/initial/zero fixed только в этом тесте. Производственная allocator/runtime схема не изменяется. Shader opt-in требует12fragment samplers.

Первый запуск не создал вкладку: Node HTTPpassport отклонил devcert; исправлен preflight curl для существующего QA HTTPS. Исправленный запуск Surface: pre2178/min1850/post1930MiB, own target закрыт. Actual-source и Float-allocation GL0, затем **INVALID fixture**: plain descriptor не имел production `beginReplaceDraw`. Residual shader/draw не достигнут, эквивалентность не проверена. Raw: `temp/device-runs/residual-source-corrected-surface.json`.

После ошибки добавлен локальный descriptor adapter по существующему `PreviewPairedFloatAllocator` контракту, без изменения original field/pool. CPU тест проверяет FBO/viewport/blend begin/end и отсутствие мутации descriptor. Новый hardware запуск требует отдельного координированного слота. Нет положительного GPU t0 результата и нет artist-ready утверждения.

Второй исправленный Surface запуск достиг resample/copy/compile/original/residual draw и чтения Float32: **18 этапов GL0**, samplers16, Float-copy byteexact. Но singleton input оставил P/C и ROI пустыми, поэтому meaningful gate FAIL; это НЕ shader-equivalence PASS. Raw `temp/device-runs/residual-source-drawcontract-surface.json`, pre2117/min1810/post1870MiB, own target закрыт.

Следующая версия использует точно существующий непустой четырёх-dab корпус `preparedGlSourceGpu.mjs` (размеры400/387/374/361, pressure.8/.8/.8/.13, wet0f37), отдельно water и pigment source scratch. Настоящий production canonical builder CPU-test подтверждает pigmentLevel>0, color stamps, ribbons и положительную tau; production wcResample begin/end contract также PASS. ROI перенесён к фактической точке390,470. Global spacing берётся только из captured compositor arguments, не форсируется88. Новый аппаратный результат остаётся OPEN.
