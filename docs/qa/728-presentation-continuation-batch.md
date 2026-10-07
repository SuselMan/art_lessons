# #728: ограниченная группировка продолжений презентации

Основа: `7b11b29e`. Архитектурный принцип — `cross-device-determinism`: Operation Log, физические команды, их порядок и входы не меняются; эксперимент меняет только расписание временной презентации.

`presentationBatchEnabled` по умолчанию выключен. WeakMap связывает каждое продолжение с конкретным захваченным генератором презентации. Ownership wrapper наследует этот token. После отпускания пера и только после своевременного кадра очередь может исполнить до четырёх соседних продолжений одного token, синхронизируя GPU после каждой единицы и проверяя прежний бюджет 4 мс. Начальный resume/capture не помечен. Upload, контакт, front и другой генератор остаются барьерами. Порог презентации 150 мс, число проходов, reveal и материал сохраняются.

CPU: 54 теста Queue/Plan прошли. Проверены default OFF, cap4, бюджет после синхронизации, смена token, динамическая вставка с наследованием, отмена/потеря owner внутри tile; существующие Plan тесты сохраняют command order и disposal.

Аппаратные проверки ещё не выполнены. До включения нужны реальная стоимость каждой единицы, неизменные meaningful P/C/V/coverage и whole RGBA на фиксированном журнале, actual native post-lift кадры и lifecycle/new-touch. `syncGpu` здесь — существующий scheduler barrier; его CPU duration не выдаётся за точное время шейдера. Эксперимент не доказывает плавность и может ухудшить кадр, если одна единица уже дорогая.

## Первая аппаратная проверка, Samsung

Изолированный runtime `5327`: архив `9f5ac7cc` / база `7b11b29e`, 970 tracked файлов сверены SHA256 с HOME. Source-film rebase, plateau phase, splitQuanta, lazyContacts, ribbon batch, front/contact batch cap4 включены одинаково; gradient fibres выключены. Один фиксированный journal, forced reveal/fade в обоих плечах, concurrent native/remote writes отсутствуют.

1360 закрылся до рисунка: отсутствовали ignored baked paper assets. После копирования готовой бумаги с совпавшим manifest SHA повтор выполнен. 1361/1362 закрыты, но полный PASS не заявляется: диагностический глобальный command-order assert оказался неверным, поскольку презентация сама вызывает fieldOp/pigmentColor/wcResample, а количество презентаций зависит от неизменного 150 ms wall-clock trigger. Глобальный census нельзя выдавать за порядок физических команд.

В durable partial 1362 все 19 meaningful material/solvent/coverage + whole RGBA сравнений имеют changed=0. Cost nonzero=487532, V nonzero=242502; candidate preview callbacks=184, late=4, carryP=14, existing sync units=1092. Исключение случилось до финального GL/lost summary, поэтому это только ограниченное побайтное доказательство. Native плавность/стоимость единиц/полный lifecycle ещё не проверены. Raw: `temp/presentation-batch/order-scope-1362-failed.json`. Исправленный endpoint controller подготовлен, но ещё не запущен.

Whole-web TypeScript и touched-files oxlint прошли. Новый constant token не добавляет текстур или буферов.

Последний разрешённый retry 1363: endpoint PASS, собственная страница CLOSED. Все 19 meaningful buffers + whole RGBA changed=0; GL0/lostfalse в обоих плечах, pigment guard purple492523. Actual Queue.tick cap4: OFF204 batchticks/879 sync units, ON271/1109. Solver 16.050→10.000 с; первоначальные230 ops выросли до1458/1245. Preview callbacks348→188 при прежнем150ms trigger: быстрее wall-clock даёт меньше временных презентаций, что не меняет физический endpoint. CarryP14 и late4 одинаковы. RAFmax485/535 мс включает диагностические readbacks/export и НЕ оценивает native FPS. Raw `temp/presentation-batch/endpoint-1363-pass.json`. Native/per-unit GPU cost остаются отдельными обязательными гейтами.

## Обычная Room на Samsung

Два новых независимых native журнала, 3 секунды400 px зигзаг + следующий touch, source9f/5327/backend4539. Прочие flags одинаковы. OFF1365 / ON1366: обе собственные страницы CLOSED, authoritative ACK2 seq1/2 done pending0, UI Dry доведён до idle, GL0/lostfalse; painted1,926,311 /1,923,638. Active frames179/177, max36/34 мс, >33=1/3, >100=0/0. Следующий touch handler14.7/15.3 мс; after-lift83.6/66.8 мс. Tailmax67/134 мс: в ON остаётся один кадр>100, поэтому плавность НЕ подтверждена.

5-секундный census наблюдал dry backlog минимум25.12/15.03 с; это нижняя граница длительности, а не точный paired timing. Adaptive input журналы различаются, поэтому FPS и throughput causal-claim не делается. Первый bootstrap native arm1364 закрылся до ввода из-за отсутствовавшего лишнего instrumentation helper; исправление проверено CPU paths/import/embedded compile перед retry.

Raw: `temp/presentation-batch/native-room-fifo_1791341201529/report.json` (OFF), `native-room-fifo_1791341250608/report.json` (ON). Отдельная диагностика стоимости единиц с1×1 FBO/readPixels выполняется после их closure, не во время native рисования.
