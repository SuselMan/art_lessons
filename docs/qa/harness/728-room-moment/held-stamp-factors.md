# Диагностика фактического первого фиолетового stamp

`heldStampFactors.ts` экспортирует `captureHeldStampFactors(device,noiseView,availableCoverageView,outputTexture)`.
Caller предоставляет исходную production noise texture и coverage, выходную RGBA8 texture 1024×1024 с RENDER_ATTACHMENT|COPY_SRC. Входы не изменяются. Output — отдельная диагностическая текстура, не материал комнаты.

Фактические uniform/геометрия сохранены в `ACTUAL_FIRST_PURPLE_STAMP`; они сверены с очередью source5359. Четыре arms последовательно возвращают только ROI96×96 (384,352), всего147456 байт: исходный amount; coverage/hair/tipContact/depth; cloud/2,settling/2,blot/2,wet; counterfactual без множителя tipContact. Noise/functions/vertex код сохраняются. Binding1 — настоящее available coverage. Pool=0 и bristleInk=0 в этом stamp исключают blot/comb как источник дырки.

Это диагностическое изменение output, не изменение production/default. Перекомпиляция с другим output может изменить float contraction; Q8 intermediates не доказывают равенство скрытых float. Counterfactual — контроль причинности, не готовое улучшение модели. Сравнивать stripe pixels (457–459,439) и исходный actual P.B; в первом pigment нет прежней цветной массы. Contact2 требует накопленного source/film состояния и не покрывается изолированным stamp.

Тесты: отдельный Vitest config с include данного `.test.ts`; обычный root config исключает docs. Strict TypeScript config extends apps/web/tsconfig.app.json и включает helper явно. Четыре source/golden tests PASS; strict TS PASS. Аппаратная проверка этого helper ещё не выполнялась. Бюджет GPU: одна output texture4MiB, staging48KiB, uniform160байт;4 draws,4 ограниченных readbacks. Результаты typed arrays передавать base64 compact ACK, не Array<number>.

Пакет READY: `node docs/qa/harness/728-room-moment/build-held-factors.mjs <immutableDirectory>` создаёт run.js/index.html/manifest.json. Passport содержит SHA/байты bundle/HTML, HEAD и SHA production stamp/noise/helper. Размещать в новом immutable каталоге после коммита, не перезаписывать прежний стенд.

ONE controller: `CDP_BASE=http://127.0.0.1:9455 GATE_URL=<allocatedTrustedIndex> GATE_OUT=<newPersistentDirectory> node docs/qa/harness/728-room-moment/held-factor-controller.mjs`. Он проверяет HTTP SHA, RAM1700/500, один60с run, четыре payload строго36864байта/SHA, закрывает только собственную страницу. Никаких Samsung обращений/повторных попыток. Полученные `.rgba` row-top96², JSON не хранит base64. Даже PASS означает лишь успешную диагностику; причинность/картинка оцениваются отдельно.

Scientific decoder: `python3 docs/qa/harness/728-room-moment/analyze-held-factors.py <factorGateDirectory> <retainedActual5359Directory>`. Он проверяет SHA/точный ROI, сравнивает P.B с actual и CPU-double prediction, считает zero-tip/positive counterfactual pixels, сохраняет grayscale PNG с точными Q8. P.G намеренно не сравнивается. Даже разница в1quant остаётся difference. Анализ contact2 не выполняется. Три offline decoder tests PASS.
