# Плавность принятой акварели: ограниченный native benchmark

Исходная release-ветка bd864ae3; фактический SHA и __APP_VERSION__ записываются при запуске. Перенос на техническую clip-ревизию выполняет root. Только отдельные свежие A2 комнаты и один owned Chrome; GPU запуск требует PERF_GPU_SLOT=granted. Источник не изменяется.

Первая серия: size80, 8legs ×300ms, 2coalesced samples/rAF. Сценарии densezigzag100:100, purewater100:0, water100:0→200ms→pigment0:100. Последний сценарий — два полных native жеста с общим путём, не equal-volume comparison. Модель не тюним. Затем size220 и400 только при отдельном boundedcost разрешении root.

Путь задаётся в мировых координатах середины A2 и переводится через обратную фактическую affine PointerInput трансформацию. Проверяются world margins и visible client bounds. Размер/путь/камера/DPR/GPU/source/version/flags попадают в паспорт.

500ms baseline, native strokes, максимум45s ожидания settle и1500ms background. Отдельно phase rAF p50/p95/p99/max, dropped>33/100/200ms, longtasks>200ms, LoAF, native handler wall. drawArrays/elements/vertices — CPU submission counts, не GPU execution time. Первые paint submission/display не означают видимый фотон; readPixels и gl.finish в timing loop отсутствуют.

Каждые500ms записываются perf scratch/field/reveal MB, JS heap если браузер предоставляет, queue/settle/rebuild/reveals. Наблюдатели, GL и engine wrappers, pointer capture восстанавливаются finally. Screenshot и canonical export/256alpha nonempty выполняются лишь после остановки timing. Purewater dryPNG может быть прозрачным, проверяем nonzero source strokes и peakWet.

120s Node watchdog на каждый случай закрывает owned browser, включая зависший JS. finally всегда browser.close. Результаты сохраняются на диске, не /tmp. Сравнение native FPS с gallery replay wall недопустимо.

Read-only performance гипотеза: importForeignWater вызывает geometry selection до проверки foreignImportedGestures; уже импортированные источники снова проверяются на каждом сегменте. Возможная точная оптимизация — prefilter imported прежде geometry, не меняя order/chunkIDs. До измеренного baseline/AB не реализована.


Burst follow-up only after ordinary size80 gates and separate root grant: PERF_SCENARIOS=burst, three 8-leg/1.2s size80 gestures with150ms Up→Down pauses. Records pendingBeforeDown, forcedCompleteSettle, down handler latency, submission/display and phase rAF. No forced Dry, no solver/model changes. Same bounded watchdog/posttiming transparent nonempty control.
