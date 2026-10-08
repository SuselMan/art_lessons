# DEV Room: native watercolor routing

Принцип: shared CPU/material owner, changed GPU executor. Обычный `Room` и `PencilEngine` сохраняют PointerInput, DabSystem, packed operations, сетевые callbacks и GL инструменты. `wcNative=1` — только DEV, default OFF. Это не отдельный native input или второй журнал.

`paperReady()` загружает реальную бумагу, затем native backend с теми же world size и scale. Painter после единственного prepareDelivery создаёт immutable команды и отдаёт source native владельцу, пропуская GL source/composite. Source, live publication и тот же canonical planner/finish попадают в существующий WatercolorCanonicalFIFO. Native continuation не вызывает GL fence. Paper display остаётся существующим GL compositor; raw native материал публикуется в настоящий GL layer tile через canvas bridge.

Границы владения: смена инструмента/wash добавляет ordered retirement; rebuild/snapshot/context loss отменяют поколение и блокируют late publication. Неакварельные pixel operations при replay ждут предыдущие native пакеты в той же FIFO. Смена бумаги пересоздаёт native owner; pending initialization защищена epoch. Destroy освобождает owner/device без synthetic pen-up.

Ограничения первого вертикального среза: источник должен охватывать ровно один настоящий origin-zero GL tile 1024×1024. Размер листа может быть обычным A4/A2; он не подменяется. Native foreign-wash imports пока явно unsupported. Multi-layer/multi-tile и взаимодействие нескольких native wash не объявлены поддержанными. Canvas bridge не является zero-copy. Предыдущая hardware byte parity shader погрешность остаётся; эта интеграция не устраняет её.

Проверка: app TypeScript и targeted CPU routing/FIFO/parser tests. Реальная Room hardware проверка ещё требуется: packed append/replay, eraser/pencil barrier, undo/redo и snapshot restore, вода→пигмент с проверкой явного unsupported, init/unmount cancellation. Не публиковать как готовый пользовательский стенд до этой проверки.
