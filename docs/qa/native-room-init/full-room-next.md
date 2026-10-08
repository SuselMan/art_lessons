# #728: путь от работающей bounded Room к полной native акварели

Принцип прежний: **общий CPU/material owner, меняется GPU executor**. Реальные
PointerInput/DabSystem/Operation Log, prepareDelivery один раз, shared planner,
GL остальные инструменты. Отдельный journal/доза/эффектный float PoC не подходят.

Root actual Room fa86 size40 pigment и water→pigment functional PASS — milestone,
не parity/400/performance/полная Room матрица. Unused paired compiler d369 остаётся
самостоятельным кандидатом. Ниже offline работа, аппаратных запусков нет.

## Сначала точная картинка: узкая локализация

Сохранённый Surface native100 vs GL **43282 changed bytes/max36** относится к
standalone same-model full1536 harness, не к свежей Room. Native author/replay exact;
hardware LINEAR устранён большой carry amplification, но source coverage29/max1,
P447/max3, extended coverage28/max58, band3288/max197 остались. Same-input first
front exact; остальные front итерации этим не проверены. Floor-relative GL fract
исправлял отдельный hair discontinuity, whole native-vsGL улучшения не дал.

Новый offline scalar F32 анализ actual mode11 capture reproduces все24 наблюдённых
channel values в трёх pressure-различающихся пикселях. В x566/y396 исходный pressure
246/243, zero coverage → alpha197/255. Width smoothstep=2.4388 Q8 levels: трёхуровневая
input ошибка действительно способна вызвать58 alpha levels. Это не основание
расширять переход/менять физику и не доказательство причины исходных input ошибок.
[F32 анализ](mode11-offline-sensitivity.json) включает raw/tape/paper SHA256.

Следующий короткий **GPU gate после освобождения слота**, existing harness без
новой модели: selected coverage stamp9 на одинаковом previousGL input И blank.
`runEndToEnd({size:100,coverageSequence:true,coverageSameInputIndices:[9],
coverageBlankSelected:true,diagnosticHardwareLinearInputs:true})`. Основной arm
production baseline; floor-relative variant отдельный диагностический arm, не
смешивать с оптимизациями. Сохранять shader/tape/paper hashes, selected stamp
uniforms, RGBA channels и pixels. Если blank exact, accumulated отличается —
отделять blend Q8 от shader/interpolation; если blank отличается — искать первое
fractional/interpolation место. Existing `coverageOracle.ts` already supports этот
контракт. Не распространять standalone вывод на Room без same tape Room export.

После source — isolated composite **одинаковые** original/coverage/P/C/paper/noise
из residual ROI и реальные finish uniforms: pixel max36 может быть composite
amplification входных max1–3 или дополнительным operator discrepancy. Не менять
композит по whole-layer сравнению разных материалов. Всю source→solver цепочку
затем подать native captured inputs в GL по original Q8 pass order, остановиться
на первом отличающемся операторе; не проверять только первый front. No approximate
mass/colour matching вместо byte gate. На 400 сначала OFF/OFF стабильность: старый
standalone OFF/OFF также FAIL, поэтому AB нельзя интерпретировать до повторяемости.

## Actual Room owner и история — первый следующий integration gate

Уже существует route live/append/rebuild через same callback; source commands
подготовлены после CPU advance и до GL raster. Generation/target identity,
immutable metadata и FIFO blockers обязательны. Реальный replay layer target
регистрируется отдельно, seed читает именно fresh GL buffer. Новый backend не
содержит stateful input/journal.

Нужно actual single-tile Room: authored water→pigment→Dry, Undo/Redo обеих операций,
refresh/rejoin с tail без checkpoint, затем checkpoint+tail. Capture actual
Operation IDs/packed bytes/wet/seed, GL layer output, native material state,
FIFO pending/epoch и errors. Отдельно pencil/erase/layer-clear между watercolor:
прежний native owner publish/drain/retire, новая генерация seed currentGL.
Тестировать Undo/rebuild во время pending job и отсутствие поздней публикации
старого поколения. Snapshot содержит GL pixels, не все active native records:
если tail требует active wash material, его надо восстановить из прежних packed
ops/production wash reconstruction, а не считать pixel seed достаточным. Эту
границу следует подтвердить existing snapshot semantics before изменения.
Это небольшой targeted gate/fix набор, не новая RoomAPI.

## Multi-tile/nonzero origin — существенный следующий кодовый этап

Нельзя просто убрать origin-zero guard или сделать independent owner на каждый
1024 tile: это отрежет физический transport через границы. Нужен один native
material/wash owner с map **actual GL buffer identity → native tile record**,
общим scratch.tileEntries и одним existing settle field для union bounds.

1. `RoomNativeRuntime.consume` строит immutable recipe для каждого actual target
из **того же** preparedDelivery (pure builder), без повторного advance. Вершины
мировые, renderer локализует один раз; center stamps локальные. Nonzero paper/world
origin, sheet clipping и actual target dimensions сохраняются.
2. Общий source executor принимает все tiles, источники/available water local;
planner использует тот же global field и ordered tile upload/copy-back. Tiles,
которые созданы только spreading, разрешаются через actual GL layer resolver;
нельзя ограничить получателей первоначальной геометрией или сделать bbox overflow
тихим fallback.
3. Foreign donor registry привязан к wash/layer/generation и tile; proof только
текущего prepared aux, no stale reuse. Import mode20/mode1 сохраняет chronology
на всех affected tiles. Intra-wash transport идёт через общий planner, не через
независимые локальные simulation.
4. Finish/live/preview код перебирает actual tiles, общий composite pipeline;
raw canvas bridge публикует каждый tile только при живой generation. Completion
barrier перед GL erase/export/snapshot и other-tools input общий.

CPU work O(число actual target tiles + geometry commands), GPU ownership минимум
4MiB на каждый RGBA8 1024 tile **на роль**, не весь лист заранее. MAX/film/solvent
scratch и canonical1536 pool уже существенны; расширять на A2 без memory budget,
retirement/reuse и device limits нельзя. Existing single-tile constructor classes
потребуют generalization, **не несколько строк/флаг**. Проверки: шов x1024 в обоих
направлениях, угловая точка четырёх tiles, nonzero-only stroke, вода cross-seam,
двуцветное слияние, dry gap, replay с иной нарезкой, all tile hashes+GL0.

После multi-tile — multiple layers/users/operation Undo матрица и memory/context
loss. DEV opt-in сохранять, пока не закрыты качество, actual 400 latency, wet
presentation/morph и whole resource budget. Backend primitive timing не является
готовым обещанием ускорения Grafetto.
