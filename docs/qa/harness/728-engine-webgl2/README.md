# Standalone actual-engine WebGL2/MRT gate

Из worktree root:

```sh
node docs/qa/harness/728-engine-webgl2/build.mjs temp/engine-webgl2-standalone /path/to/existing/apps/web/public/paper
```

Разместить generated folder как static preview на уже доверенном HTTPS сервисе.
Адрес в Git не сохраняется. Никаких Room/API/Socket/DB; one own canvas/context.
Asset fetch `/paper/…` перенаправляется внутри этой отдельной страницы на её
`./paper/…`. Flat работает без файлов. Fine/medium используют фактический bake.

ESM `run.js` exports PencilEngine, WatercolorPasses, AccumulationBuffer,
runPrototype/disposePrototype; globals window.runPrototype/disposePrototype.
Не создаёт GPU context до explicit run. Для собственного controller достаточно
DOM container `#surface`; diagnostic UI output/button опциональны.

`await runPrototype({backend:'webgl1'|'webgl2'|'mrt',scenario:'zigzag'|'puddle',paper:'flat'|'fine'|'medium'})`.

Каждый запуск освобождает предыдущий engine и создаёт свежий canvas. Fixed tape
имеет stable IDs/timestamps/dabs400, два цвета, explicit wet strings и paper_dry.
Window.__prototypeEngine присваивается до await paperReady; внешний sampler может
поставить setter до runPrototype и обернуть методы этого конкретного instance.
Для GPU timer attribution baseline сравнивать с timed run того же backend/tape.

Результат содержит tapeSha256, renderer, glError/lost, materialWholeLayer tile
RGBA SHA256, decoded exportRGBA SHA256, MRT pairs/pixels, meaningful undo,
exact redo. Здесь materialWholeLayer означает итоговые layer pixels; внутренние поля также захватываются в `fields` после timed paint и до undo. Runtime timings —
полный replay включая renderer/RAF/join wait/rebuild, не чистое device GPU time.
Hash/readback/export идут после timed paint и должны быть исключены из GPU samples.

Внешний controller обязан сохранять результаты на диск, проверить одинаковый
tapeSha256 и wholeRGBA/export hashes для всех backends. No screenshots alone
as parity gate. Code identity в provenance.json и result.code; build отмечает
`+ dirty` до commit. Исходные generated bundle/maps/assets не коммитятся.

План аппаратного gate — ../../728-engine-webgl2-mrt-prototype.md. До него это
не user stand и не production backend.

`fields.records[]` содержит `{key,role,width,height,channels,byteLength,nonzero,max,sum,sha256}`.
P/C/cov берутся из фактических live/replay scratch; water — plane coverage.a.
Рабочие pooled поля имеют роль `working:<slot>` без предположения о текущей физической
семантике. h считывается из настоящей paper texture в отдельный RGBA8 FBO на
нативном разрешении bake; paperCatch — её alpha. Raw bytes в payload не входят.
`fields.coverage.nonemptyRequiredRoles` должен быть true для parity физических
ролей; `mrtExercised` отдельно требует pairs > 0. Пустые/уже освобождённые scratch
после dry явно не доказывают parity: смотреть unavailable и coverage gate.
Сравнивать одинаковые key/role/dimensions/hash, а не только финальный PNG.
