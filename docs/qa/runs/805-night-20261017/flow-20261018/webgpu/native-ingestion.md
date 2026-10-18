# Проверка native-клеток полной матрицы

`docs/qa/prototypes/805-algorithm-search/review_ingest_native.cjs` работает только с закрытыми результатами и сохранёнными байтами. Устройство, сервер и новый расчёт не запускаются.

Параметры CLI: `--input-catalog`, `--plan`, повторяемые `--allowed-builds`, `--build-dir`, `--report-dir`, затем `--artifact-root` и `--output-dir`. Все значения — явные пути. Разрешённые сборки должны быть связаны с текущими ключами каталога; файлы каждой сборки перепроверяются по её manifest.

Выход: `native-cells.json`, `authored-source-proofs.json`, `native-ingestion.json`. Их затем передают строгому `review_fixed_matrix.py` вместе с worker-клетками и 30 reference-клетками. Нормализация не публикует галерею и не объявляет покрытие полным.

Обязательны минимум три фактических запуска: три proof, sample и одинаковых P/C/coverage SHA. Проверяются исходные семь плоскостей, маски независимым CPU BFS, фактические GPU-readback SHA подготовленных плоскостей, неизменность исходников, нулевой материал снаружи компонента и сухие пиксели. Original и paper сохраняются глобально; отсутствие foreign допускается только как явно доказанный logical zero. В authored sidecar replaySHA означает внутренний `capture.replay.operationSHA`, а не SHA всего JSON сцены.

Native endpoint C преобразуется в общий carrier с исходным capture scale; forward seed использует отдельный encoding scale 0.5. Общий PNG независимо декодируется и сравнивается с уравнением общего вывода, исходными paper и display scale. Это настоящий native расчёт с общим выводом материала, а не заявление о совпадении с финальным композитором Grafetto. Исторический native diagnostic остаётся отдельным доказательством.

Нет PNG, повторов, исходных байтов или подходящего source proof — нет клетки. Старый одноразовый authored export годится для проверки источника, но не для итоговой клетки. Время componentLoop сохраняется как несопоставимое с worker upload/run; межсемейный коэффициент ускорения из него не вычисляется.

CPU-регрессии: `node --test docs/qa/prototypes/805-algorithm-search/review_ingest_native.test.cjs docs/qa/prototypes/805-algorithm-search/review-native-source-audit.test.cjs`; `python3 docs/qa/prototypes/805-algorithm-search/review_fixed_matrix_test.py`.
