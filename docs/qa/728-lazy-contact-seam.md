# #728: предложение отложенной CPU подготовки контактов

Это план для review, не реализованное изменение. Принцип `cross-device-determinism`: Operation Log и порядок material-команд неизменны; меняются только границы выполнения CPU подготовки внутри уже существующего owner/FIFO. Новая модель воды, новые GPU buffers и новые владельцы не предлагаются.

## Что дорого

Adreno current34aae samepayload prepare60.5→26.4мс после max-exposure optimization, fieldFor0.2/0.1мс. Contact CPU ещё блокирует main thread. HOME Node22 диагностически разделён `brushDragField`, без изменения выходных bytes: на том же journalSHA1b6e4115…225b09 восстановлены93packed dabs→62kept travel→40contacts. Contact cells293147; это соответствует293156baseline Math.log calls минус9других Plan logarithms. Максимальный contact9810cells, encoded bytes1172588. Все instrumented fields byteexact с исходными при worldrect3072² (не assert exact cropped Plan origin).

Медианы7samples: contact construction12.33мс, raster6.136, RGBA encode3.684, Float32 allocation1.799, encoded allocation0.572, grouping remainder0.087. Максимальный один field0.571мс. `Math.exp` выполнен289907раз. Это Node на HOME, не Adreno timing; диагностические счётчики добавляют overhead. Узел для scheduling — raster+encode одного contact, а не дешёвая группировка и не новая GPU программа. Row-hoist ускорения не показал и откатан.

## Предлагаемый шов

1. Выделить прежнюю группировку `brushDragContacts` в лёгкие descriptors `{travel,rect,radius}`, сохранив каждый Math.hypot/trig/crop/flush и порядок. Existing eager API остаётся defaultOFF и создаёт такие же fields. ZeroContacts gate сохраняется отдельно.
2. При `lazyContacts && presentationOwnerLocked14` вычислить первый field сразу. Он нужен как `flow=contacts[0].field` в captureInputs и ранних material passes, поэтому откладывать его upload нельзя. First field используется повторно для первого contact, не пересчитывается.
3. Вместо заранее вычисленных остальных fields поставить CPU preparation placeholder точно в прежней позиции каждого contact: после всех предшествующих diffuse/carry-команд, непосредственно перед его существующим upload и pulse sequence. Он вычисляет один field, тот же max exposure/substeps/gain, затем вставляет неизменные upload+tagged pulse closures перед следующей физической командой. Их C→P pair и копии остаются атомарны; ни один pulse не пропускается.
4. Не отключать `present`: каждый pulse вызывает его на прежнем месте. Его wall-clock trigger остаётся прежним и может дать другой промежуточный preview; endpoint oracle должен оставаться точным.
5. Обычный case9810cells подходит для одного CPU preparation quantum. Большие cases должны использовать прежнюю raster математику с pausable row cursor и encode cursor, например16rows за micro-step до ограниченного wall budget. Float32 накопление остаётся в исходном `dab→y→x` порядке. Обработка не должна завершаться случайным synchronous fallback после исчерпания budget.

## Обязательные ограничения

Metadata13 содержит captured brushTravel; никаких ссылок на текущий gesture options или его изменяемую scratch trail. Capability14 даётся только owned FIFO finish, canonical scratch заблокирован до завершения settle/abort. Без capability весь прежний eager schedule сохраняется. FieldFirst, descriptors и partial CPU arrays принадлежат одному prepare/job; cancel/loss только забывает CPU ссылки, не возобновляет generator и не вызывает GL. Дополнительных GPU snapshots нет. Encoded field можно отпустить после его последнего upload/pulse; первая flow field живёт до первого contact.

Dynamic insertion должна использовать один общий stable-index+insertedOffset механизм для CPU children и presentation children. Existing Plan14 wrapper предполагает, что только presentation вставляет ops; добавлять чужой splice без обновления общего offset нельзя. Для inserted entries сохраняется base index, скорректированный после insertion; последующие children учитывают общий offset. Никакого per-step indexOf/O(n²). Copy `contactPulseOp` WeakSet tags в wrapped physical children; CPU preparation и upload не помечать batchable. Batch никогда не пересекает CPU/upload/presentation barrier.

## Риски и пределы

Первый field может быть большим: если его eager construction превышает budget, это отдельный pre-source prepare stage в существующей FIFO task (не новый gesture owner). Нельзя объявлять fully bounded вариант лишь по маленькому среднему field. Создание descriptors/O(travel), allocation большого typed array и GC тоже остаются синхронными узлами; нужен самый тяжёлый chisel400/span case. Extra CPU steps добавляют минимум кадр на contact в нынешнем Queue.tick, поэтому надо измерять tail throughput вместе с active/newtouch. Для крупных row chunks нужен bounded CPU driver; без него тысячи row steps могут снова увеличить время сушки. Нельзя молча включать группировку через physical barriers ради компенсации.

## Гейты до включения

- Eager/lazy full encoded fields, descriptor order/rect/radius, exact exposure/substeps/gain на исходном journal + overlaps/returns/large chisel.
- Exact ordered command trace C/P/uploads/copyback/presentation callbacks с controlled clock; dynamic insertion через реальную Queue.advance и Queue.complete.
- Cancel до field completion/после upload, loss, exception/reentrancy; immutable metadata во время newtouch; foreign peer watermark и unknown snapshots должны сохранять zeroContacts отказ.
- Current samejournal meaningful P/C/V/coverage/wholeRGBA + dry/redo; native brush400 continuous6–10с и immediate nexttouch. Чистая вода и pigmented/mixed layer отдельно.
- CPU per-quantum maximum и total tail, GPU synchronized unit cost без readbacks во время обычного active. Scheduling improvement не выдавать за изменение физики или полную плавность.
