# Headroom2: реальные границы кэша

Сеть snapshotCodec.ts SnapshotTile содержит origin/size и только RGBA8 готовых layerpixels. bakeNetworkSnapshot сериализует layerbuffer, не wash inkLoad/inkColor. Поэтому старый network snapshot не является физическим record старых единиц: новый renderer продолжает поверх прежних готовых пикселей. Старые мазки выглядят по-старому до полного replay — это отдельная визуальная политика, не decode corruption.

Физические scratch buffers действительно сохраняются в локальном JS CheckpointStore: cp.washes/CarriedWash, _carryWashes snapshot и _seedWashes RibbonStrokeScratch.restore (index.ts4920–4978). Они не сериализуются snapshotCodec в сеть и не переживают новый engine/page. Горячая замена шейдеров в существующем engine может смешать units: нужна новая engine instance либо полная очистка производных scratch/replay/cache/checkpoints. Context restore также должен пересоздать программы/derivedstate согласованно.

Epoch network-format только ради headroom2 не требуется. Если цель обновить внешний вид старых комнат, нужно выбирать full operation replay отдельно и не считать snapshot view чистым сравнением нового движка. Старый открытый клиент на старом bundle и новый клиент могут показывать разные рендеры; это релизная проверка peer/build consistency, не причина менять форматы daбов.

Ранее общий checklist wording про persistentphysical checkpoint уточняется этим аудитом: persistent network только pixels; физические carriedwashes transient JS. Источники проверены read-only, новых gating/инвалидаций не реализовано.
