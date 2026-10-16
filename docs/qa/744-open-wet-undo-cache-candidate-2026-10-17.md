# #744 — bounded CPU cache для Undo открытого мокрого слоя

QA-прототип, по умолчанию выключен. В engine-instance включается `diagnosticOpenWetUndoCache=true`; публичного продуктового переключателя нет. Родительское согласование — материал/goal остаются кешем, журнал остаётся источником истины; архитектурная тема #763.

Перед собственным M70 DOWN сохраняется уже resting материал и **уже готовый** canonical goal текущего слоя. Если goal dirty/not-ready, источник pinned/closing или cache budget не позволяет сохранить версию — обычный путь, без synchronous solve ради capture. Буферы читаются непосредственно в CPU, GPU-копии для checkpoint не создаются.

Undo сначала штатно меняет журнал. Быстрый путь разрешён только для собственного Undo M70, без ongoing input/history repair/rebuild этого слоя, и только если вся итоговая effective non-meta history точно совпадает с сохранённым списком immutable объектов. Сравнение глобальное и консервативное: посторонняя активность тоже может отклонить кеш. Same-ID zero-pigment projection, чужой Dry/hide, reorder и новые операции не принимаются по одному совпадению ID. Whole physical gesture сохраняется до первого chunk; успешная отмена всех его chunks может восстановить один исходный checkpoint.

Восстанавливаются исходные water/pigment/original bytes, scalar metadata и canonical **goal bytes**, не raw composite вместо готового результата. Нового native target solve и повторного рисования старых штрихов нет. Вместе с материалом возвращаются committed PaperWet cells с прежними monotonic timestamps: это локальное ephemeral поле продолжает стареть и даёт следующему живому мазку правильный wet profile. Формат операций/снимков/шейдеры не менялись.

Владение массивами одно: существующий MaterialResidency с общим 64 MiB budget. Source+goal+PaperWet counted in `bytes`; parking этого же target перезаписывает Undo-версию, LRU другой парковки может её вытеснить. После успешного Undo версия расходуется; Redo использует ordinary replay. Отдельного unlimited map для Undo нет.

**64 MiB — retained CPU-cache budget, не предел RAM процесса.** Как и парковка #747, capture имеет один временный readback staging: до ~44 MiB RGBA8 для source+goal на 1024px плюс PaperWet metadata, затем store/eviction и GC. Сами display/layer GPU buffers, JS engine и журнал в этот бюджет не входят. Моментальная RAM может быть выше cache budget; это явно ограниченный staging, не вторая постоянная коллекция.

Ограничение покрытия: сто быстрых мазков без паузы, пока предыдущий goal ещё не готов, не получают этот shortcut. Для аппаратного positive case: 100 мокрых операций → дождаться готового goal → новый собственный DOWN/UP → Undo. Надо измерить и выигрыш Undo, и цену capture/первого видимого пикселя нового DOWN, особенно Surface/Samsung/1024px. До этого флаг остаётся OFF.

Диагностика `_puddle.state`: `undoCaptures`, `undoHits`, `undoCaptureLastMs`, `undoRestoreLastMs`, `cpuBytes`, `residentLayers`, `parkedLayers`, `computations`. Контроль: successful Undo увеличивает hits, не computations; Redo не увеличивает hits. Hardware GLSL/картинка ещё не проверены этим unit-набором.

Проверено targeted: 7 файлов / 45 тестов. В том числе byte-backed source+goal restore и следующий wet interaction; default OFF; not-ready без solve; ordinary Redo; подтверждённый own stroke перед foreign dependency; zero-pigment projection под исходным ID; foreign Dry; whole gesture из двух chunks; бюджетный отказ; LRU eviction Undo bytes при сохранённом pinned live source; исходные 8-layer residency и cancellation regressions. Engine fluid target/presentation mocked; произвольные RGBA-байты десяти material fields отдельно проверены CPU primitive tests с полными массивами из #747, а точность native GLSL требует аппаратной QA.
