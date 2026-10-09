# Contact field и foreign stencil: отдельный CPU census

Текущий `CanonicalWatercolorSettlePlan.prepare` общий `up-prep-cpu-raster` включает foreign stencil, grouping и contact fields. В приватной настоящей OFF записи комнаты6pbY2G4A обе операции имеют один washId. `_ribbonStrokeWork` исключает предыдущие operations того же wash из foreign sources (`index.ts`7506–7540); аппаратный журнал имеет uploadForeign0. Поэтому этот owned fresh-room cohort проверяет empty foreign admission, а не затратный scanline чужой лужи. Он не измеряет stencil в произвольной загруженной комнате. Другая старая аппаратная лента со span76ms не объявляется тем же workload.

Runner `contact-real-tape-cpu.mts` с `QA_CONTACT_SPLIT=1` сохранил identity gate и exact30 upload bytes. Контакты wet восстановлены через тот же `prepareDrawableRibbonDabs.wetOf` и `noteRibbonWetContacts`. Warm median восьми samples, два stroke вместе:

| CPU leaf | Медиана |
|---|---:|
| contact fields, исходный producer |20.60ms|
| contact grouping |0.1175ms|
| empty foreign admission |0.000063ms|

Последняя величина — 10000 повторений двух early-return вызовов, делённые на repetitions. JIT может сильно упростить этот микроbenchmark; это масштаб пустого пути, не точный одиночный event и не runtime exclusive CPU доля. Contact fields явно доминируют в этом cohort. Flow orderedSHA/geometry совпадают с аппаратными данными; отсутствие foreign output не доказывает общую скорость nonempty stencil. Compact `contact-raster-split-summary.json` содержит samples/source/fixtureSHA, raw приватен.

## Worker/WASM feasibility по существующему source

Движок не имеет contact worker или WASM pipeline. Единственный близкий worker — `Room/net/snapshotCompression.ts`: transport-only compression после synchronous bake, clone exact input view, transfer, bounded reply, terminate finally. Он не задаёт material ownership для pending stroke. Нельзя перенести этот механизм на finish и просто отпустить mutable scratch.

JS worker с прежним producer мог бы освободить UI thread, но сам contact result позже станет готов; это не уменьшает обязательную compute работу и не обещает раньше pigment/display. Нужны существующие immutable owned task inputs, exactgeneration/layer/context отмена, FIFO publication и readiness/export blocked пока результат pending. Transfer допускает только fresh output payload, не уже удерживаемые upstream canonical inputs. `Math.exp` в JS worker не аппроксимирован, но точные output bytes на actual browser всё равно проверяются; WASM/libm/SIMD нельзя считать byte-equivalent по умолчанию. Изменение тут не реализовано.

Уже есть более узкий эксперимент `lazyContacts && presentationOwnerLocked`: `brushDragFieldWork` сохраняет dab/y/x и Float32/Q8 порядок, yield каждые256 cells; planner берёт work до2ms CPU budget и добавляет continuation перед соответствующими contact pulses, отменяет generator при dispose. Это существующий owner-gated путь, а не новый scheduler. Он может сдвинуть cold CPU prep с UP на следующие ticks, одновременно увеличить finish latency/queue occupancy; эффект и history/newstroke/material ownership требуют отдельного QA. Ни worker, ни lazyContacts сейчас не включены на пользовательском стенде.

Вывод: в этом exact actual cohort сначала существенны contact producer и дальнейший GPU/publication critical path. Простая оптимизация чужого stencil тут не снимает76ms; worker — потенциальная отзывчивость с owning/FIFO стоимостью, не бесплатное ускорение. Аппаратного запуска/изменения runtime не было.
