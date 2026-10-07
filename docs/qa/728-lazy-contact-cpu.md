# #728: ленивое вычисление полей контакта (CPU эксперимент)

База: 6b186883. Принцип cross-device-determinism: журнал операций и порядок физических команд сохраняются; меняются только границы CPU продолжений. `WatercolorSettlePlan.lazyContacts` выключен по умолчанию и дополнительно требует явного canonical-owner capability (аргумент 14). Metadata остаётся аргументом 13.

Первое поле контакта вычисляется прежним eager producer, чтобы исходный flow input не менялся. Остальные поля вычисляются перед их upload и pulses, в неизменном порядке групп. Генератор сохраняет порядок Float32 dab/y/x accumulation и кодирования байтов. Паузы: каждые 2048 посещённых raster cells и каждые 4096 encoded cells; одно продолжение ограничено проверкой 2 ms между микрошагами. CPU операции не имеют batching tags; upload и presentation барьеры не пересекаются.

CPU oracle сравнивает eager и lazy RGBA поля, crop/radius/order, затем полный ordered command trace с upload bytes через реальные Queue.advance и Queue.complete. Отдельно проверяются fallback без owner, cancellation до поля и reentrant disposal внутри Math.exp работающего генератора. Stable insertion offset общий с presentation, поиска indexOf нет.

Ограничения: синхронные descriptors, первое поле и allocations пока не имеют доказанного временного бюджета. Это не полностью bounded prepare. Проверки используют test GL, не реальное железо; нет hardware full-field proof, native nexttouch, multiuser/loss или performance claim. GPU проверка требует отдельного слота и точного source passport. Флаг нельзя включать по умолчанию на основании CPU oracle.

Логи: temp/lazy-contacts/first-cpu.log, lifecycle.log, final-cpu.log. HOME копия исходников/исполнения: 680-lifetime-hardware/temp/plan-quantum/cpu-lazy.

## CPU worst-case probe

Однократный HOME Node22 diagnostic (не device budget): 40 движений на 3072² domain, aspect2.5, alternating returns. Радиусы40/200/800: eager first field1.10/2.67/79.75ms; максимальный generator.next1.27/0.44/9.04ms; descriptor grouping0.31/0.05/0.04ms. Все generated pixels exact. Для brush400 (radius200) CPU continuation короткие, но allocation/GC и первый eager field всё ещё могут превысить бюджет на больших размерах. Нельзя объявлять общий hard bound по этому измерению. Артефакт benchmark.log и диагностический test лежат в temp/lazy-contacts; не входят в production tests.

## Samsung matched material oracle (root5a102d54)

Own1340 закрыт в finally; Adreno650, GL0/lostfalse. Один immutable loaded journal SHA1b6e411586ed268847e3d6f42f8e03f16f0b26eb09f3c681fe3f962c2c225b09. Одинаковые source/phaseON, fibresOFF, splitON и existing front/contact cap4 в обоих плечах; изменён только lazyContacts. Реальные reveal/fade callbacks принудительно сохранены в обоих плечах для restricted diagnostic scope, no concurrent native/remote writes.

Все19 meaningful fullfield/wholeRGBA сравнения byte exact; material/V/coverage непустые, purple492523, carryP14 и late4 в обоих. Initial→final ops eager953→1358, lazy230→1462. Solver barrier с одинаковыми readbacks14.87→17.35s: отрицательный throughput, не perf win. Wall-clock presentation callbacks324→372 при сохранённом gate. Raw report/passport/controller: temp/lazy-contacts/fixed-report.json и соседние файлы. Это не actual newtouch/Room ownership proof.

Separate own1341 current root5a bakedON: пять свежих salted low/high/carry/colour/baked программ linked PASS, GL0/lostfalse на Adreno650. Затем lazy OFF/ON все19 meaningful fields + endpoint byte exact, purple492521, carryP14/late4. Solver14.92→16.71s, ещё отрицательный throughput. Базовый fibresOFF результат не подменяется: это отдельный материал. Оба собственных target1340/1341 CLOSED. Report baked-report.json содержит source hashes всех5 шейдеров и salt1791336533039.

Own1342 отдельный matched prepare/profile, root5a fibresOFF: все19 fields/endpoint exact, GL0/lostfalse, target CLOSED. Plan.prepare eager47.8ms→lazy2.7ms; CPU-generator.next252 вызова, max1.7ms/sum43.6ms. Профиль охватывает allocation/raster/encode внутри next, без GL/readback в CPU единице. Solver15.15→17.13s, throughput регрессия остаётся. Это показывает снижение targeted synchronous prepare CPU, но actual native PenUp/rAF/newtouch ещё не проверены. Report prepare-report.json.

## Actual native brush400 continuation

Own1343OFF и1344ON root5a последовательно CLOSED, Samsung освобождён. Actual6s dense loaded400 +20mspause→100px500ms gesture. Phase/source/FIFO/split+cap4batchON, fibresOFF, zeroContactsOFF. В обоих2 delivered engine journal ops, metadata13/owner14true, canonical busy на newtouch; GL0/lostfalse, endpoint nonempty487983/493223. Это standalone engine callbacks, НЕ обычная Room/server ACK. Payload адаптивен к rAF, поэтому endpoint разных gestures не paired equality oracle.

Plan.prepare38.8→10.1ms, finish42.3→12.6ms: оба отложенных finish выполнялись уже в newtouch-active. Максимальный newtouch rAF50.2→33.5ms; dense16.8→33.5, postlift33.4both, tail100.3→100.2ms. Dense _onEnd25.5→27.3ms не улучшился. Фиксированный prepare/physical oracle отдельно подтвердил47.8→2.7ms и exact19; native независимые gestures лишь демонстрируют реальное применение lazy owner gate, не строгую causalFPS оценку. Tail и часть задержки самого отрыва остаются открытыми.

## Actual CPU profiler / remaining final paint (own1345)

Frozen root5a lazyON, GL0/lostfalse,2ops, target CLOSED. CDP Profiler interval1ms:676nodes/30193samples. Diagnostic wrappers counted existing GL draw/copy/upload/clear/finish/readPixels/FBOchecks without injecting any GL readback/barrier. Instrumented rAF is not unbiased FPS.

Dense_onEnd26.1ms/8 final dabs: _paintRibbonDabs16.4ms, _paintStrokeDabs17.6ms. Actual CPU sample self-time: buildRibbonBands/body about9.1ms, commitPending2.9ms, captureFinishMetadata2.1ms, GC1.3ms; no existing GL call above1ms inside end. This supports geometry/final metadata CPU as next targeted seam, not a shader/physics change.

One tail rAF gap100.2ms has~95.1ms CPU idle, no wrapped JS call above1ms,18 existing finish calls0–0.1ms. CPU profiling does not establish GPU/compositor cause; no invented root cause. Capture readPixels60.1ms happens only after tail and is not included in this finding.

Clock mapping uses two ordered _onEnd ancestor sample groups within matching passive method entry/exit intervals: offset interval213748360.331–213748360.909ms. Independent Performance.getMetrics→Runtime clock pair has tunnel delay (~42ms here), so cannot be treated as exact mapping. Full raw profile and derived windows retained in attribution-cpu-profile.json, attribution-report.json and profile-summary.json.
