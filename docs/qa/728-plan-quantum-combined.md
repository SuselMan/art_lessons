# #728: Plan14, подготовка контактов и Samsung

Проверка 07.10.2026 на настоящем Samsung SM-T970 / Adreno650 / Chrome154, собственные страницы1328–1339 закрыты в finally. Standalone engine с настоящими `_onStart/_onMove/_onEnd`, pen pressure и rAF, A4Fine1754×2480, viewport768². Это не обычная Room, не server ACK, не multiuser и не production FPS. Source passport и immutable journal SHA сохранены в каждом отчёте.

Сборка58ac2510 (код cbe52652): index2eef69c4, Plan1c14f7d9, Queue87966479, shadersbf97bd94. Обе формы metadata13 и owner14 реально передаются из owned FIFO finish. FIFO/sourceRebase/phase ON, fibres OFF. Split и batching указаны отдельно. Сборка34aaeeb2 меняет только max contact exposure (Plan60bafa80, brushDrag5499e30c); диагностический `.baseline728.ts` сохраняет точный предыдущий Plan1c14f7d9. Между paired arms HMR не выполнялся.

| Проверка | Наблюдение | Граница вывода |
|---|---|---|
| Fixed loaded journal1330, split OFF/ON |19 полных byte comparisons P/C/V/coverage и wholeRGBA exact0; carry14/preview8/late4 обе arms; ON953→963 ops|Одинаковый forced real reveal callback, нет concurrent writes; restricted физический oracle|
| Native loaded400,6с + nexttouch100/500мс, split OFF1328/ON1331|GL0,2stroke; nexttouch ON canonicalbusy=true/gesture512мс; maxRAF100.2/100.3мс; tail~33→53с|Жесты независимы; улучшения максимума не доказано, throughput ухудшился|
| SplitON same fixed journal1333, batching OFF/ON(cap4,4мс+syncGpu)|Все19byte comparisons exact0; solver barrier34.08→15.10с; carry14/late4 неизменны|Finish включает одинаковые тяжёлые readbacks; RAF401/786мс не являются обычной ценой кадра рисования|
| Native loaded400 split/batchON1334|Dense max33.4мс, newtouch66.9мс, tail133.8мс; actual metadata/ownertrue, GL0|Нет readbacks во время active, но independent gesture, не paired FPS proof|
| Native truewater400 split/batchON1335|Dense16.9мс, newtouch66.9мс, tail100.4мс;2stroke/purple0/GL0|Полезный контроль, задержки не устранены полностью|

1329 splitON завершился прежним30с idle watchdog; FAIL сохранён. Retry1331 с60с watchdog и read-only5с progress показывает реальное продвижение652/1236→959/1406→queuefalse/owners0, затем нормальный endpoint. Эта попытка не доказывает deadlock. Асинхронный preview сохраняет прежний150мс wall-clock gate, поэтому callback count меняется при другом расписании (796→316 в1333); каноническая физика совпадает.

## Причина CPU prepare и узкая оптимизация

Warm attribution1332: первый prepare51.2мс, fieldFor0.3мс, pool.acquire3вызова0.1мс, clear0/FBOchecks0;286446 Math.log вызовов. Следующий prepare2.6мс/2957logs. Таймер каждого log не добавлялся, только счётчик. В этом случае hitch принадлежит контактному CPU пути, не выделению field/FBO.

Matched1336 на одном current34aae runtime: baseline использует ровно старый Plan.prepare, candidate штатный новый. Split/batchON одинаковы. Prepare60.5мс/293156logs→26.4мс/49logs; fieldFor0.2/0.1мс. Все19 полных material/V/coverage/whole comparisons exact0, nonempty guards проходят. Это один matched sample со счётчиком и диагностическими обёртками, не обещание FPS. Максимум encoded byte и один исходный log сохраняют точный IEEE754 результат;65536orderedpairs и реальные contact pulse counts/gains покрыты CPU тестами. Оставшаяся стоимость brushDragContacts не устранена.

## Чистая вода: существующий консервативный gate

`_wcZeroPigmentContacts` оставлен opt-in. Его разрешение требует `scratch.pigmentInputsKnownZero` и `pureWaterLayerProof` полного известного журнала, без неизвестного snapshot prefix или активного чужого пигмента.

Native1337 на новом чистоводном layer: actual skipContacts=true в обоих owned finish; metadata/ownertrue,2stroke/purple0/GL0. Prepare9.0мс, densemax33.4/newtouch33.5/tail100.2. Сравнение с49.2мс1335 использует разные жесты и уже изменённую exposure оптимизацию; абсолютный эффект gate оценивается ограниченно.

Negative1338: pigmented immutable remote prefix в том же layer, затем nativewater400. Во всех3jobs skipContacts=false; сохранён пигмент483885pixels, GL0. Оптимизация не ошибочно считает мокрый пигмент пустой водой.

Strict fixedwater1339: одинаковый immutable payload, flags/scheduler/reveal одинаковы; zeroContactsOFF/ON передаёт actualgatefalse→true. Initial ops966→162, final971→167:804 доказанно лишних контактных continuation исчезают. Все19 полных comparisons exact0. P/C действительно нулевые во всех каналах; meaningful V244422nonzero components, coverage356315nonzero components. Carry14/preview4/late4 сохранены; whole endpoint без пигмента в обеих arms. Нулевые P/C здесь ожидаемы и не выдаются за pigment no-op guard.

Артефакты сохранены на VPS `728-plan-quantum-fifo/temp/combined-plan14/` и HOME `680-lifetime-hardware/temp/plan-quantum/combined-plan14/`: controllers/functions/passports/reports, исходный journal и failed1329. Большие material bytes сравнивались напрямую в странице и не экспортировались через CDP; отчёты не подменяют сохранённые raw pixel maps. Все функции можно повторить по исходному journal.

Split без batching не предлагается defaultON: оно ухудшает throughput. Даже split+batch+purewater gate оставляет100мс tail и loaded newtouch67мс. Дальнейшие combined Room/foreign/undo/loss/ACK проверки и профилирование остаются необходимыми; публикация не выполнялась.
