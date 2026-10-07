# #728: ленивое вычисление полей контакта (CPU эксперимент)

База: 6b186883. Принцип cross-device-determinism: журнал операций и порядок физических команд сохраняются; меняются только границы CPU продолжений. `WatercolorSettlePlan.lazyContacts` выключен по умолчанию и дополнительно требует явного canonical-owner capability (аргумент 14). Metadata остаётся аргументом 13.

Первое поле контакта вычисляется прежним eager producer, чтобы исходный flow input не менялся. Остальные поля вычисляются перед их upload и pulses, в неизменном порядке групп. Генератор сохраняет порядок Float32 dab/y/x accumulation и кодирования байтов. Паузы: каждые 2048 посещённых raster cells и каждые 4096 encoded cells; одно продолжение ограничено проверкой 2 ms между микрошагами. CPU операции не имеют batching tags; upload и presentation барьеры не пересекаются.

CPU oracle сравнивает eager и lazy RGBA поля, crop/radius/order, затем полный ordered command trace с upload bytes через реальные Queue.advance и Queue.complete. Отдельно проверяются fallback без owner, cancellation до поля и reentrant disposal внутри Math.exp работающего генератора. Stable insertion offset общий с presentation, поиска indexOf нет.

Ограничения: синхронные descriptors, первое поле и allocations пока не имеют доказанного временного бюджета. Это не полностью bounded prepare. Проверки используют test GL, не реальное железо; нет hardware full-field proof, native nexttouch, multiuser/loss или performance claim. GPU проверка требует отдельного слота и точного source passport. Флаг нельзя включать по умолчанию на основании CPU oracle.

Логи: temp/lazy-contacts/first-cpu.log, lifecycle.log, final-cpu.log. HOME копия исходников/исполнения: 680-lifetime-hardware/temp/plan-quantum/cpu-lazy.
