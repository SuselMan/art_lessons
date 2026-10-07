# #728: чистый Samsung 400 и одинаковый записанный журнал

Источник аппаратного стенда: `5b981f16156b77e16e383eec207fe397cf4c8346`, 987 файлов проверены SHA; HTTPS5331, backend4539. Настоящий Adreno650. Plan/rim OFF, source-film rebase ON, остальные intrinsic defaults сохранены. Собственные вкладки закрыты finally; пользовательские страницы не менялись.

## Нативный контроль

`temp/pure-water-plan/causal-trace/native-cleanAsyncPair_1791364447152/report.json`, terminal47858 EXIT0. Без trace/labels/readback во время input. Физическая страница1754×2480,400px,3сек,2coalesced/rAF; это адаптивный сценарий, одинаковая геометрия не означает одинаковые emitted tapes.

| Материал | Async | Active max мс | Tail max мс | Next-touch handler мс |
|---|---:|---:|---:|---:|
| Вода | OFF |1906|1204|51.2|
| Вода | ON |67|518|42.3|
| Пигмент | OFF |1137|1588|1537|
| Пигмент | ON |50|84|40.8|

Все четыре arms завершили native/Dry/UndoRedo и следующий пигмент. Восемь fullRGBA nativeDry→Redo/следующийpigmentRedo сравнений exact0. Прозрачный водяной PNG сам по себе vacuous; meaningful пигмент1948837/2303094 пикселей, следующий после воды257040/258773. GL0, все native strokes ACK. Нет claims гладких60fps либо статистического paired ускорения.

## Независимый одинаковый журнал

`temp/pure-water-plan/causal-trace/run-emittedAsyncFixed_1791365049887/report.json`, terminal77047 EXIT0. Взяты реальные6/10ops nativeDry из предыдущего прогона, включая ordered Dry. На каждом неизменном tape два fresh engines OFF/asyncON последовательно; та же бумага/страница/base/compositeorder. WholeRGBA SHA OFF/ON совпал; independent sharp native→freshOFF/freshON все четыре сравнения0/max0, nonempty1948837/2303094. История используется полностью, source operations не сокращены. Не fullfield P/C/V proof и не multiuser proof.

## Отозванные результаты и блокирующий код

Предыдущие traced2195 и clean17182 FAIL `newTouch=null` не доказывают Engine dropped-input: старый helper заканчивал tail после первого кадра>1500мс раньше второго rAF, который должен был отправить touch. Raw сохранён, новый отдельный helper ждёт фактическую отправку; исторический общий helper не менялся. Traced active1.7сек не обычный FPS; observer marks/trace оказывают неизвестную нагрузку. Observer ceiling исправлен отдельно, физический порядок/identity unitPASS.

Реальный blocking path: `_onStart` при asyncOFF вызывает `_completeSettle`; Queue.complete синхронно отправляет весь остаток ops, finish и рекурсивный settle. В исправленном clean пигменте actual handler1537мс воспроизведён. Существующий opt-in FIFO отделяет provisional input от canonical owner и сохраняет физический порядок. Candidate defaultON требует актуальную многоавторскую проверку с обязательным peerDuringSettle, history/layer/Dry/loss; этим документом она не закрыта.

Source сравнение с root `c092bb925532de903fcaf61d50bced6cb39766d8`: Plan/Painter/Queue идентичны; Engine отличается лишь поясняющим комментарием около `_unpaintedInBatch`. Caller/UI/backend интеграцию этим совпадением не доказываем.
