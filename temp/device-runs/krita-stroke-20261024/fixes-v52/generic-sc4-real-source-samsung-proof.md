# Реальные soft-источники: Samsung, GenericSC V2

31.10.2026. Проверка изолированного существующего конвейера, без включения room/editor.

Вход — ранее сохранённые NEW-дескрипторы из настоящих KPP, 209659 байт,
SHA256 `721d0c7ca7245dd3b561a6fa4a0d5974035d196e4ab4f497c016072c19600c13`.
Генератор требует этот явный внешний диагностический вход; unit-тесты не зависят
от игнорируемого файла. Полные дескрипторы повторно в Git не копируются.
Старые исторические fixtures не изменены. Legacy LUT catalog metadata используется
только для структурной проверки descriptor schema; CAS LUT bytes не проверялись и
не использовались: procedural material assets пусты.

Пять случаев: 3 Airbrush — прежний V1/over; 60 Dodge, 61 Lighten, 62 Multiply,
63 Overlay — явно захваченный новый V2 profile. 59 Color остаётся закрытым.
Привязка через настоящий shared canonicalSoftAutoSourceBinding, затем
SourceStrokeAuthor → MaterialAdapter → CanonicalFrameEncoder. В браузере этот
production author выполняется заново; все envelopes совпали с host. Повторный
shared decoder получает захваченный case profile, а не выбирает его из frame.
Каждый запуск использует тот же CanonicalWashLayerCoordinator/FrameExecutor и
существующий composite pass; нового renderer, очереди или сессии нет.

Seed 4321/7654/0.3; два пакета pressure 0.2/0.6. Размещение вычислено через
sourceAutoGeometry по настоящей source geometry/hotspot. Нативные spacing rules
честно дают один dab на два пакета, четыре структурных/рисующих frame. Размеры
масок: 600², 306², 600², 600², 600². Все 4096 наблюдаемых mask samples частично
прозрачны; target заранее заполнен неоднородным непустым straight RGBA, alpha73..222.

Host CPU oracle использует native-derived soft radial curve, scalar fused local
alphaDarken/old over и original-ARM-proven GenericSC point laws. Бюджеты bounded;
1,533,636 mask/work samples и 61,440 point composites. Это не запуск целого
штриха в оригинальном GUI Krita и не доказательство всего native brush engine.

Samsung SM-T970, Chrome156, Adreno650, один собственный WebGL1 context.
80 полных сравнений stable/derived64² RGBA — 1,310,720 байт, wrong=0, maxDelta=0.
Пять источников × два fresh layer/coordinator replay; незавершённые preview и
финальные stable/checkpoint phases совпадают с CPU. Shared source owner строит
таблицу 38 advance вызовами в первом replay каждого случая, во втором — 0.
Все десять запусков завершают checkpoint; cold replay заново создаёт layers,
переиспользуя владельцев программ/кэшей в рамках этой проверки.

GL state restored на enqueue и каждом bounded advance; GL errors=0, raw GL leases
между yields=0 и в конце=0. Реальный ContextStorageOwner ограничен16MiB; отдельный
существующий reserveTransient fence в QA ограничен8MiB (логический headroom,
не повторная физическая charge), peak49152B. После уборки physical
resident/reserved/orphan=0, CPU/cache/pool=0, Texture/Framebuffer/Buffer/Program/Shader
handles=0. Domain complete=false: driver overhead и прочие немигрированные storage
не объявляются покрытыми. Максимальный наблюдавшийся advance84.7ms: это correctness
gate, не подтверждение интерактивной задержки.

KHR_parallel_shader_compile: getSupportedExtensions listed=false,
getExtension available=false. Это read-only capability в том же context.

Два предварительных harness failure корректно остановлены shared guard до GPU:
повторному decoder передали adapter-only targetGeometry. Убрано только это поле,
production не менялся. Компактные error/cleanup receipts сохранены отдельно.
Также initial ADB listing не содержит hardware serial: runner сверяет ro.serialno
после выбора SM-T970, до forward/context. Каждый фактически созданный child и
forward закрыты, все три исходные вкладки сохранены по id+URL.

Результат и source snapshot: `generic-sc4-real-source-samsung-result.json`.
SHA256 `35fc6f93bee695b7a811a0204e7fb0a53c917eebc78744baa4c7403fe2fb6560`.
113 текущих module hashes включают frozen незакоммиченные pool changes, а не только
HEAD. Bundle SHA256 `974128cb64fe8925239d970739f208b79542b3b32c855d774f89e1da7d0cd8f2`.
Input fixture SHA256 `c68fba9cc5519eaa61f81e5c23a2458540aa35f6219f98a9fc47e75e1b35726a`.

Воспроизведение из корня worktree: `node --import tsx .../generate-generic-sc4-real-source.mts <explicit-input>`;
затем `node --import tsx .../run-generic-sc4-real-source-samsung.mts --prepare`
и тот же runner без --prepare после согласованного освобождения устройства.
Bundle только в RAM; новых QA backend/frontend, dependencies или runtime копий нет.
Временные процессы завершены; собственные browser/context/forward убраны.
Сохранены только скрипты и компактные диагностические receipts; исходный pinned
вход остаётся ранее разрешённым диагностическим материалом.
