# Структурированный fuzz: диагностический протокол, не художественный тест

Статус: CPU/helper проверены; GPU не запускался автором. Исходные kernel-файлы 14/34/39/41 не меняются.

`deterministic-fuzz-input.ts` задаёт 12 записанных рецептов `structured-carrier-v1` и u32 seeds. Размер строго 1024², 6MiB на вход: premultiplied RGB/A, скалярные water/paper. Пятна 4/8/32px, фазы относительно сетки 8px, вода {0,1,4,61,255}, сухие одноточечные/диагональные полосы, редкие непрозрачные пиксели, слабые коды и RGB==A. Рецепты 00/01 water-only, 02/03 полностью сухие; остальные смешанные. Это ограниченный adversarial corpus, не все возможные изображения и не случайный белый шум.

План `structured-fuzz-cases.json`: 4 пакета × 3 выбранные модели. Каждый запрос имеет **три** уникальных рецепта и **12 основных выполнений**: fresh A/B/C, один reused A→B→A→C→B→A, затем fresh A/B/C. Для Fine39 после них идут три fresh fine0 controls: **15 выполнений / 10 instances**, остальные модели **12 / 7**. Fine0/Fine4 сравниваются по всем четырём integer mobile sums, не по выходным пикселям. Все instances имеют собственные finally. Семь основных candidate instances, каждый destroy в finally; worker owns/destroys device. Входы одного запроса занимают 18MiB; readbacks последовательные. Полные входы не кэшируются между запросами. Полные выходы/исходники шейдеров после хеширования не включаются в результат. Нет PNG, raw, UI-рисования и измерений времени. Временный SHA-буфер/строки crypto/драйвер и внутренние GPU staging кандидата не входят в оценку 18MiB.

В EACH candidate.create перехватывается только `device.createShaderModule`, записываются фактические code SHA и label в порядке создания плюс отсортированное множество SHA. Own descriptor восстанавливается точно либо inherited shadow удаляется в finally. Хук не живёт между вызовами factory. Fresh/reuse сравниваются по ordered shader list/set, полному выходному SHA и стабильному снимку metadata. Это обнаруживает source drift; само по себе не доказывает математическую корректность WGSL или исполнения драйвера. Асинхронное создание новых модулей после возврата factory не покрывается; текущие три factory создают программы до возврата.

Обязательные guards: все четыре coarse delta нулевые, coarse pigment/water conservation, zero range/premul/representation counters, prePackGuard. Fine39 дополнительно требует fine initCapacityFailures=0/packFailures=0/guardPassed и четыре целочисленных mobile totals. Три дополнительные fresh fine0 controls дают initialFineRGBA4 на том же входе/инициализации, с которыми сравниваются fine4 итоги. Сам источник WGSL для controls также записывается и сравнивается. Никаких требований точной глобальной массы после RGBA8 или художественных оценок.

Water-only требует полный нулевой RGBA; full-dry — точную byte identity с исходником. Выходной RGB≤A проверяется без допуска. Входные три SHA/seed проверяются до/после upload и после readback. Ошибка сообщает recipe/stage/inputSHA; воспроизведение по generatorVersion/seed/recipe/config/source SHA. Экспорт raw при ошибке не реализован в первой версии.

Запуск **только оператором после GO**, на выбранном замороженном build:

```sh
QA_BUILD=... QA_OUTPUT=... QA_CASES_FILE=docs/qa/runs/805-night-20261017/flow-20261018/gl/structured-fuzz-cases.json node docs/qa/harness/805-algorithm-search/flow-fuzz-probe.cjs
```

Harness использует existing owned-loader, проверяет неизменность сборки и закрывает собственный context в finally. Никаких URL/секретов в плане. Worker отвергает чужую модель, неизвестные/нецелые/вне допустимого диапазона config-параметры, повторные/неизвестные recipe IDs до adapter/device. Hidden API `__algo805.probeFuzz` сериализуется existing working guard и сбрасывает его в finally. Диагностика не меняет обычный `run`.

CPU: generator determinism/valid premul/controls/palette/rare opaque; exact fresh/reuse/repeat + shader recording; намеренно stale, input mutation, RGB-only coarse ledger drift при true booleans, RGB-only fine0/fine4 drift, missing guard, shader drift, output premul violation; ошибки factory/upload/run/read/digest и точное восстановление own/inherited descriptor; actual worker pre-GPU rejection. CPU mocks не являются GPU проверкой.

CPU validation 2026-10-18: **7 новых fuzz tests + 5 existing reuse tests PASS** (`node --test .../candidate-fuzz.test.cjs .../candidate-reuse.test.cjs`, ~11s). Strict TypeScript/noUnused отдельно DOM entry/helper и WebWorker worker: **0 diagnostics**; harness `node --check`: PASS. Ни реального GPU результата, ни вывода о качестве из этих CPU тестов нет. Собственных процессов, временных dependency copies и новых сервисов не осталось.
