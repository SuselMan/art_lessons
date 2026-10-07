# #728: реальный GPU completion clock

Принцип: бюджет проверяется после фактического completion GPU; canonical Operation Log и порядок физических операторов остаются прежними. Diagnostic1373 показал, что gl.finish CPU0.2–0.8ms не включал оставшееся GPU wait до51ms. Scoped tiny-FBO readPixels переместил wait внутрь12ms clockbudget, сохранив19fieldsRGBAexact0.

Прототип `_wcBudgetFenceScope: 'off' | 'drawing' | 'settle' | 'all'` имеет default'off'. Typed routing отделяет drawing/FIFO и Queue budget без runtime wrappers. Engine владеет одним ленивым `GpuBudgetFence`: RGBA8 texture/FBO1×1, четыре CPU bytes. Только `_runSlice` group/end, `_advanceAsyncCanonical` и Queue.ctx.syncGpu используют этот completion clock. Display/debug/checkpoint вызовы finish не меняются. Init сохраняет framebuffer, TEXTURE0 binding и activeTexture; sync читает ровно1×1RGBA unsignedbyte c PACK_ALIGNMENT1, затем восстанавливает framebuffer/pack. Никакой аллокации наunit. Destroy release ровноowned handles, loss forget без GL удаления, restoration лениво создаёт новые.

CPU19tests PASS: disabled finish/noalloc, routing3budget paths, actualEngine registeredjob cancellation/loss/restore/destroy; helper allocationfailure/incompleteFBO/readthrow state restore. Wholeweb TypeScript/touchedlint PASS. MockGL lifecycle не заменяет аппаратный fixedfields/native400/multiowner gate. До этих проверок defaultON не предлагается.

Samsung1374 actual prototype6f76794f/base40c402e0, own5330,975trackedSHAexact: all19meaningfulfields+RGBA exact0/GL0/lostfalse/492523purple. Global3scope fence solver9.881→23.732s; full duration including19readbacks+export12.4495→26.3079s. Extra waits inside true4ms Queue budget substantially reduce throughput. No defaultON recommendation.

Samsung1375OFF/1376ON ordinary3s400 pigment+newtouch+UIDry, independent adaptive journals, allACK2/pending0/GL0/lostfalse/nonempty. Active178/max40/2>33 vs170/max34/9>33, first1.5s-tail100ms both, newtouch12.4→32.8ms. Last5s-sampled idle state23.9→63.7s frompageclock, NOT exact complete duration; revealcompletion later. Both CLOSED. Prior native helper does not measure fulltail; separate fulltail controller prepared.

Samsung1377 causal scope: Queue.ctx.syncGpu uses originalfinish inbotharms; actualflag fence onlyrunSlice/FIFO. Same19fieldsRGBAexact0/GL0. Solver9.4257→9.6195s; fullreadbacks/export total11.8978→12.143s. Global large regression belongs to Queue budget scope, not drawing-only fence. Both original physics/caps4/trigger preserved. TargetCLOSED. Raw temp/fence-hardware/{report.json,drawing-scope-report.json,native-room-fifo_1791345871390/report.json,native-room-fifo_1791345926721/report.json}; HOME copies planned alongside runtime.

Fulltail1378OFF/1379ON drawing-only ordinary native: rAF measured until canonical+revealidle and stoppedBEFOREexport. OFFactive171/max50.2/9>33; ON164/max83.6/11>33. Whole tail965/max351/6>100 vs1089/max334.3/6>100. Newtouch16.7→30.2ms; canonical afterstart19.510→22.004s, wholeidle21.516→24.026s, export25.051→27.543s. Adaptivejournals differ; this does not establish causal FPS improvement. BothACK2/pending0/GL0/nonempty/CLOSED. Drawing-only defaultON is not recommended either. Rawfulltail-summary.json retains precise clocks. Source fixed6f boolean prototype; new typed scope is API cleanup only, no furtherhardwareclaim.

### Native CPU profile 1380: ordinary Room, fence OFF

Frozen runtime 5330 remains 6f76794f/base40, not typed-scope76fd. Samsung Adreno650, ownRoom lRYafo81 A4/Fine1754×2480, loaded400/3s plus nexttouch and UI Dry. Profiler1ms, bounded passive method events; no additional pixel readback/fence during measured gesture/tail. Profile stopped before manual export. Both strokes authoritative seq1/2; GL0/lostfalse; own1380 CLOSED. Raw HOME `680-lifetime-hardware/temp/gpu-fence-runtime/profile1380/`.

Active max50.2ms; whole tail max367.8ms, seven>100. Canonical idle25.220s, whole idle27.2595s, frame monitor stopped27.5063s; clocks are page performance.now. The284.2ms interval26.5072–26.7914s contains ~201ms GC plus uploadSnapshot/bytesToBase64/btoa/fetch samples. This is automatic bootstrap snapshot upload, not harness export. The preceding367.8ms interval26.1227–26.4905s is overwhelmingly `(program)`, without wrapped solver/display invocation; network snapshot bake/readback is a concrete next attribution target, not yet proved as the exact cause. Remaining100–134ms intervals mostly CPU `(idle)`, with Queue.advance/display under4.1ms; CPU profile alone cannot identify GPU/compositor duration.

Profiler raw568230bytes, passive events bounded20000 and no overflow. Methods with actual hits: paintDabs108/display534/advanceAsyncCanonical129/finishRibbonStroke4/Plan.prepare2/Queue.advance2278. `_runSlice`, `_takeCheckpoint`, `_trimChunkCache` not hit; raster wrapper aliases were not reached and are not evidence of no physical GPU work. Timebase uses Profiler microseconds minus Performance.NavigationStart, with before/after Timestamp-to-page evaluations separated32.5–32.9ms by CDP; this is a clock observation uncertainty, not an independently measured32ms clock offset. Wide-window attribution robust; submillisecond event alignment not claimed. Initial267ms frame precedes actual native activity/profile samples and must not be attributed to pen-up.

### Snapshot attribution repeat1381

Same frozen6f runtime/flags, fence OFF, ordinary native loaded400 plus nexttouch; profiler/passive wrappers only. ACK2/GL0/lostfalse/own1381 CLOSED. Successful bakeNetworkSnapshot74.3ms; _bakeTiles63.7ms; six actual GL.readPixels, maximum19.7ms. This does not account for the worst351ms frame: it starts24625.2ms AFTER bake finished24574ms, ~341ms CPU `(program)`; native pipeline internals remain unresolved. Next284.2ms frame has207ms GC plus uploadSnapshot/base64 activity; btoa22ms and fetch27.1ms are measured passive calls. These are automatic bootstrap snapshot operations before harness export. Raw HOME `680-lifetime-hardware/temp/gpu-fence-runtime/profile1381/`. Proposed CPU-only encoding seam: native Uint8Array.toBase64 when available, otherwise bounded0x8000 string chunks matching existing dabCodec, preserving bytes/HTTP schema; watermark-sensitive snapshot readback timing remains unchanged. No fix implemented or native speedup claimed.

### Encoding candidate c866e9fa: native1383

Runtime5330 now frozen6f plus ONLY snapshotSync.ts/snapshotBase64.ts fromc866; two files SHA match VPS/HOME. Adreno650 Uint8Array.toBase64 is actually available. CPU32tests incl actual uploader/gzip roundtrip/native view/fallback chunk boundary PASS, whole-web TS/lint PASS. Native1383 ACK2/GL0/lostfalse/CLOSED, complete monitoring/profiler stopped before manual export. HOME rawprofile1383.

Confirmed limited result: preceding baseline1381 GC samples295.2ms versus candidate68.6ms; network old bytesToBase64/btoa stack disappears, snapshotBase64 samples3.3ms. The284ms upload/GC frame disappears. Entire tail nevertheless max351ms with8>100; active max33.5ms, wholeidle26454.8ms minus monitoringstart4479ms =21.9758s. The351ms frame AFTER bake still341.9ms `(program)` plusresolve8.6ms; cannot attribute to a particular native compression operation solely from these samples. Bake168ms vs baseline74ms, firstreadPixels116.6ms vs19.7ms, reflecting unbounded readback/queuedGPU variability. Independent adaptive journals, no causal pairedFPS claim. Encoding improves one observed family; fulltail remains unresolved. No deferred snapshot watermark or server contract change.

### Compression causal isolation1386

1385 plain-page API403 was an access-fixture failure, CLOSED without compression measurement. Readonly development grafetto_pg_wc dump restricted to own room7uv_Zz9X/owner UID a5a9cc40-9e04-4619-b5ad-6a285e587e7c (matches native journal), layer-1 seq3. Compressed3,124,731B; raw17,399,780B; raw SHA659734a7377881d6b715a4ccb23fa984d734428d6beb6c5ee4584ce7636b97b0 matches stored index. Binary resides outside served apps/web and is not committed.

Native1386 loads exact immutable raw into a plain same-origin HTML, NO engine/WebGL/physical solver. Original gzipBytes:402.8ms await duration and334.3ms rAF gap4607–4941.3ms. CPU profile391.1ms `(program)`, Blob9.8ms, gzipBytes8.7ms, arrayBuffer1.3ms. Gunzip length/raw bytes exact0 differences, own1386 CLOSED. This reproduces the long-tail compression family independently of watercolor GPU work; it does not isolate CompressionStream internal native subcalls individually. Worker experiment remains pending. HOMErawcompression1386.

Monitor counting correction: pre-input267ms Profiler startup frame is excluded from post-lift counts. Actual post-lift>100/max:1380 six/367.8,1381 five/351,1383 seven/351.

### Worker diagnostic1388 and isolated transport prototype

Same stored raw/SHA as1386, same existing gzipBytes running in a same-origin module worker. Clone exact typed-array view transferred; original snapshot retained. Plain no-WebGL page: await596.1ms (includes cold worker startup and clone), ZERO rAF gaps>33ms versus baseline402.8ms await/334.3ms gap. Gunzip exact length17,399,780/changed0, compressed3,124,731, own1388 CLOSED. Response-time win has +193.3ms wall tradeoff; ordinary Room fulltail not proved by this diagnostic.

Production experiment preserves understanding.yaml cross-device-determinism: immutable canonical bake bytes/watermark stay synchronous and untouched; only gzip transport computation moves. createSnapshotUploader second options.workerCompression defaults OFF, existing Room callers unchanged. One disposable same-origin module worker per sequential layer; input clone ≤32MiB (caller not detached), result≤40MiB,30s timeout, terminate exactly once before fallback. Constructor/CSP/older-browser/error/malformed reply/timeout use old gzip API. No Blob worker URLs, textures or new physical passes. Extra transferred raw clone can cost16.6MiB on this A4 while the unchanged gzip path also clones inside worker; memory tradeoff must be checked before enabling.

CPU41tests3files PASS, whole-web TS/lint PASS; actual uploader opt-in test proves synchronous bake at47 followed by pending observation48 still uploads exact47/gunzip payload. Default-OFF/fallback/ownership/timeout coverage included. Vite worker-build smoke emits same-origin worker33.02KB, no dependency install. Actual ordinary Room snapshot upload/fulltail and broader lifecycle remain pending before defaultON.

### Region driver1389 and public worker boundary

Actual Adreno650 primitive oracle uses candidate5197 class SHA7db908ec83d7acdc119d9fef131026c17e1e97c77ad0f627a016be2ca02605bd, asymmetric1024² RGBA, old full read plus bottom-up CPU crop versus direct region. Six regions1024×1024/730×1024/1024×432/730×432/731×431/0×432 all changed0; restorePixelsRect roundtrip changed0, PACK_ALIGNMENT8 restored, GL0/lostfalse, own1389 CLOSED. Rawtemp/fence-hardware/native-room-regiondriver_1791348928580/report.json. This proves driver read/restore primitive, not ordinary snapshot publication or scene lifecycle.

Worker now imports public engine/snapshots.compressLayerTiles rather than private oplog/gzip; same compressor, no contract change. CPU41tests PASS, whole-web TS/lint PASS, worker-build33.06KB. map:check covers987files; map:rules exits0 with only four existing orphan warnings and11ignored known violations. Existing dependencies used via NODE_PATH, no installation or symlink. Ordinary Room worker opt-in hardware gate remains next.

### Ordinary Room worker + region1390

Frozen5330 base6f76794f/40c402e0 plus region5197, encodingc866, publicworker3d800 and ONLY diagnostic Room caller workerCompression:true; seven-file SHA manifest temp/fence-hardware/worker-region-source.json. Production callers remain OFF. Adreno650 A4/Fine1754×2480 dense pigment400 then next touch and UI Dry: actual ACK journal, nonempty export1,913,743px, GL0/lostfalse/own1390 CLOSED. Monitoring ends before export. Active151frames/max33.6ms/0>100. Raw267.5ms max was pre-input Profiler startup and must be excluded; post FIRST actual_onEnd7815.1ms maximum133.7ms/two>100 versus encoding-only1383 max351ms/seven>100. Different adaptive gesture tapes and GPU load: this is not strict paired FPS or total smoothness proof.

Ordinary bootstrap bake50.4ms, _bakeTiles39.4ms, sixreadPixels32ms sum/max13.2. Encoding-only1383 bake168ms/firstread116.6 variedGPUwait; cannot attribute entire bake speedup to edge region. One actual fetch/upload. Read-only own development DB y2R_sNIe owner matches nativeuser: layer-1 seq3 compressed3,110,225B; gunzip17,399,780B SHA0b37b34bb59e56162ff0bbadb4bceab72c3a3becb60a7836185297acfd683756 equals stored hash. Exact six-tile framing/nonempty/allbytes consumed. Smallstored-summary.json in rawfolder. Fresh driver snapshot restore pending. Runtime opt-in source verified; worker creation/fallback invocation was not passively wrapped, so this ordinary run alone does not prove which compressor branch ran. Earlier plain-worker1388 explicitly proves off-thread branch responsiveness/bytes.

RawVPS temp/fence-hardware/native-room-workerregion_1791349176264 contains CPUprofile/report/wholePNG/storedsummary/privatecompressedbytes. No readback/export during measured tail apart from ordinary automatic snapshot bake. No physics/shader/defaultflag changes.

### Fresh snapshot restore1392

1391 fixture stopped at ordinary Join project, engine absent; own CLOSED, no rendering verdict. Corrected join1392 loads same own y2R_sNIe seq3 snapshot: full exported RGBA17,399,680B exact0/max0 versus saved author endpoint, nonzero5,741,090, Adreno650 GL0/lostfalse. Engine log[] because coveredseq3 leaves no tail; original three authoritative operations remain saved in1390 journal. This is snapshot restore, not replay-all proof. Same storedbytes compressSnapshot opt-in creates/posts/receives/terminates one moduleworker, browsererror0, gunzip raw17,399,780 changed0. Successful message body was not separately inspected, so fallback remains a minor diagnostic caveat. Own1392 CLOSED. Rawtemp/fence-hardware/native-room-workerrestore_1791349438479/report.json.

### Frozen root standacf1 correctness smoke1393–1395

Ordinary ownRoomR9plW-dT on5329, sourceacf1/defaults unchanged (asyncFinish=false). Native400 one-second stroke plus nexttouch authoritative ACK1/2, UIDry3, actual keyboard Undo4/Redo5. Undo changes695,549 RGBAbytes, redo full17,399,680B exact0/max0, allGL0/lostfalse. Default performance is unacceptable here: active250.8ms/four>100, tail1805.3ms/six>100; correctness is not a smoothness claim.

Fresh rejoin1394 prematurely exported before asynchronous restore began (log only1..3, later queue/settle active), producing an empty endpoint: fixtureFAIL/inconclusive, not snapshotregression. Corrected1395 requires authoritative seq5 then stable queue/rebuild/revealidle. Actual log1..5 retained and done, fullRGBA exact0/max0/nonzero4,704,129 againstauthorendpoint, AdrenoGL0/lostfalse/ownCLOSED. No checkpoint-only visual tuning and no newgesture/source changes. Rawrootstand_1791349530213/endpoint-summary.json and rootrestore_1791349645879/report.json.

### Reviewed A2 transport size policy, still defaultOFF

Ordinary A2 full3508×2480 RGBA/12tile headers occupies34,799,556B=33.187MiB, so former32MiB worker input cap necessarily used main-thread fallback. Reviewed input40MiB/output48MiB covers this board while bounding one extra transfer clone to40MiB; larger inputs deliberately retain old compressor. A2 callerraw+transferclone+existinggzip internalcopy already~99.56MiB, before Blob/compressed/retainedtiles/GPU; this is no memory reduction claim.64/80MiB caps rejected as unnecessarylarger ceiling. CPU actualA2-sized gzip/gunzip preserves everybyte/callerownership, Worker createdonce; >40MiB boundary uses no worker and old compressor preserves endpoints/length.43tests3files/wholewebTS/lint/workerbuild PASS. NativeA2memory/validreply/transport timing remain pending; productionoptin defaultOFF.

### 2026-10-07 06:34 UTC: current zero-contact proof, Samsung 1412

Источник — неизменный `321d0260`, собственный HOME runtime `zero-proof-321d`
на 5330; backend 4539. Между плечами менялся только
`_wcZeroPigmentContacts`. Source film ON, phase/fibres OFF;
async/split/lazy/band/front/contact/presentation diagnostics одинаковы.
Default OFF сохранён.

Вход — явная производная родного журнала 1396: preset двух strokes изменён
с `normal:100:100` на `normal:100:0`; packed dabs, wet, времена и Dry неизменны.
SHA входа `5f026d02a6c5086e9e17dda10c0b10d8989c0cc73c57cf804de9234ca18302c5`.
Это matched standalone NORMAL replay, без сокетов/новых gestures/forced reveal
или подмены owner14; не проверка native FPS и не обычной Room загрузки.

Вместо прежних 19 фактически сравнились **27** именованных результатов:
6 canonical tiles × P/C/V/coverage, field cost, actual solvent field и whole RGBA.
Все byte exact: changed=0/max=0. Whole RGBA — 17,399,680 bytes.
P/C нулевые ожидаемо для чистой воды; solvent field имеет 493,700 ненулевых
байтов, solvent и coverage ненулевые во всех шести tiles. Cost в этой
конечной точке уже нулевой и сам по себе не служит guard.

| Метрика | OFF | ON |
| --- | ---: | ---: |
| actual brushPass calls | 2596 | 0 |
| actual waterFrontStep calls | 252 | 252 |
| prepare skip=true calls | 0 | 2 |
| Queue advance units | 1498 | 140 |
| solver wall, seconds | 10.568 | 4.337 |
| whole run including captures/export, seconds | 11.060 | 5.035 |

Это причинный результат пропуска доказанно нулевого обмена на одном и том же
журнале, не адаптивное сравнение различных native жестов. Сохранённый front и
ненулевой V исключают пустой no-op PASS. GL=0/contextLost=false в обоих плечах.

Дополнительные hardware guard probes использовали настоящий
`appendPeerLiveDabs` pencil (paintedTotal=1, committedOffset=0), реальные
appendOperation(pencil) и suspended appendUndo, затем настоящий pure-water
RibbonStrokePainter scratch на canonical target. prepare argument11 лишь
наблюдался, физический Plan в этих маленьких probes не исполнялся:
peer на том же слое → false; peer на другом → true; pending Undo → false;
предшествующая pencil history → false. GL=0/lost=false. Это actual guard
reachability, не whole multiuser/Undo endpoint oracle.

Первый собственный 1411 FAIL сохранён: старый passive helper ошибочно получал
V через carry opts.e, который задан только при phase ON. При phase OFF
undefined readback ломал finish wrapper; это fixture failure, не physics
regression. Retry брал V из настоящего `diffuseStep` аргумента12 (solvent),
подтверждённого source Plan. Flags/source не менялись.

Raw: `temp/fence-hardware/native-room-zeroproof321d_1791354881103/report.json`;
предыдущий FAIL: `..._1791354789958/report.json`. Passport:
`temp/fence-hardware/zero321d-passport.json`. Собственный 1412 закрыт finally,
Samsung освобождён. Никаких публикаций/default изменений.

### Current loaded negative, Samsung 1414

После 1412 проверен **оригинальный**, не pure-derived, журнал1396 (100:100).
Тот же immutable321d runtime/flags, normal finish/owner, только zeroContacts
OFF/ON. Все 27 field/wholeRGBA comparisons exact0; meaningful cost840,228,
V493,702, tile0 P1,726,140/C1,725,875 nonzero. Обе arms реально исполняют
brushPass2596/front252, skipTrue0/skipFalse2. GL0/lostfalse, собственный1414
закрыт. Wall11.305/11.744s не утверждение улучшения скорости: положительный
пигмент правильно не оптимизирован. Raw:
`temp/fence-hardware/native-room-zeroloaded321d_1791355079228/report.json`.

Рекомендация: guard-backed zero-contact identity допустима для default ON;
доказательства включают pure matched hardware, positive P/C negative,
conservative unknown-prefix/live/peer/rebuild rejection. Оптимизация не меняет
front и не является решением всей плавности или native loaded tail.

### d88 default native pure water, Samsung 1415

После нового source passport rootstand5329 d88bb738 на Adreno650 создана
обычная собственная A4/Fine1754×2480 Room `r3w_mPWB`. Rootstand index
81b85164…1d36b34 / Plan aa8d4c4c…42ed222 совпали с git show; ни один
experimental flag не переключался. Default zeroContacts ON; async/split/
lazy/band/front/contact/presentation/sourceCopySlices OFF, sourceFilm ON,
phase/fibres OFF.

Настоящий pointer controller рисовал чистой водой brush400 три секунды,
затем второй touch. Две authoritative strokes ACK seq1/2, UI Dry3, Undo4,
Redo5; GL0/lostfalse. Фактический prepare skip=true дважды, false0.
До Dry прочитан настоящий owned wash solventLoad:4,194,304 bytes,
848,160 nonzero. Этот диагностический readback после gesture занял121.7ms
и может изменить поздний tail; blank высохшая pure-water картинка не была
единственным PASS guard. Author→Redo full17,399,680RGBA bytes exact0;
для воды это только endpoint/sequence correctness, не доказательство
перераспределения пигмента.

Active180frames/max33.5ms/1>33/0>100; nexttouch handler55.8ms. **До**
диагностического readback native controller уже зафиксировал tail919ms,
2>100, поэтому default плавность всё ещё не решена. Whole rAF monitor
max919.4ms/3>100 включает дополнительный readback и15s ожидания transport;
это не clean native FPS и не сравнение с предыдущим payload. Ни одного
worker/upload не наблюдалось: pure-water dry endpoint пустой, соответствующее
15s ожидание записано как timeout, без заявления upload PASS.

Raw/compact summary:
`temp/fence-hardware/native-room-currentdefaultwater_1791355595790/{report,summary}.json`.
Собственный1415 закрыт finally; Samsung освобождён. Новых публикаций нет.

Passive Queue chronology уточняет это последнее окно: tick6 закончился9704.5,
tick7 начался10620.7, разрыв916.2ms. Соседние advance job1 op4→5/op5→6
заняли≈0.1ms JS, tick≈0.2ms. V diagnostic начинается11244.3, позже этого
разрыва. Это исключает наш aftergesture readback как причину919ms, но не
называет конкретный shader/GPU duration: другие display/browser/submit
операции в этом окне не профилировались. Наблюдались38 async advances;
синхронный complete не проходит тот же advance wrapper, поэтому38 не полное
число физических шагов.

### Default d88 passive attribution, Samsung 1417

Actual start06:52:09UTC, terminal06:52:46; сообщение о06:54 было ошибкой часов.
Один свежий обычный Room/default flags, pure400 три секунды/второй touch/Dry,
без дополнительного V readback и без экспорта до конца хвоста. Собственный1417
закрыт; ACK2/GL0/lostfalse. Active180frames/max33.4ms, nexttouch62ms,
нативный tail1003ms. Диагностические policy/source не менялись.

Пассивные wrappers: gl.finish/readPixels/checkFramebufferStatus, actual
Engine runSlice/finish/complete/display/compose/paint/snapshot иQueue.syncGpu;
события>=2ms ограничены512, overflow=false. Вложенные durations неаддитивны.
Для default batchingOFF вызовы gl.finish/Queue.syncGpu/runSlice/checkFB=0 —
это соответствует реальной Queue ветке, а не отсутствие GPU работы.
FinishRibbon max6.9ms, completeSettle10.9ms, paintStrokeDabs30.9ms,
display8.9ms, composePaper0.5ms. Между tick6end11019.7 иtick7at12019.7
1000ms; display11019.7..11022.7 занял3ms, следующий12020.1..12024.1 —4ms.
Ни snapshot, ни readPixels в этом окне не было. Wrapper coverage не равна
полному JS/GPU trace: точный GPU shader/браузерный stall всё ещё не доказан.

Позже обнаружены20 bakeNetworkSnapshot attempts,109readPixels total,
bake max47.3ms/read max56.5ms. Первый bake только13468.7, после1000ms окна;
затем пустой pure-water dry слой повторно читается примерно раз в секунду.
Worker/upload0. SnapshotIO.bake возвращаетnull при !tiles.length без
markPublished, bootstrap tryFirstSnapshot оставляет dirty слой retryable.
Это отдельный CPU/readback расход, не причина обнаруженного1s окна.

Raw: `temp/fence-hardware/native-room-currentpureattribution_1791355929500/report.json`.
Новых GPU прогонов/source changes после этого не выполнялось.

### CPU-only следующий pure-water fast path: границы доказательства

Принцип cross-device-determinism: OperationLog неизменён; оптимизируем только
оператор, тождественный на доказанном нулевом P/C, сохраняя воду и ownership.
Current skipZero proof + captured known-zero scratch подтверждает логические
P=C=0; это **не** означает, что все используемые FBO содержат0 во все моменты.

Кандидаты на identity skipping после отдельного oracle: paired carry15/16,
P/C diffuseStep, remobilisation18/split3, bloom/rim pigment gathers,
settled-slice accumulation/fibre1, итоговое pigment/tide sum. Их логические
нулевые P/C outputs следует сохранять как явные нулевые ссылки/clear, включая
правильную ping-pong parity. Shader zero-preservation каждого семейства ещё
нужно проверить; hardware1412 доказывает конечные поля, не каждый промежуточный
оператор. Colour reconstruction2 от нулевого deposit также кандидат, но её
назначение может быть running source/base, поэтому не вырезать wholesale.

**Coupled, не удалять:** capture solvent/foreign solvent/coverage;
front seed10/outward/inward waterFrontStep; coverage extension11/merge20;
band6/mask5; copy-back coverage, solvent/source chronology иfinish/dispose.
`frontOps(c,a)` использует deposit buffer a как water-cost ping-pong/tmp:
после фронта a содержит ненулевые cost/band данные. Обычный carry/diffuse
перезаписывает его pigment output; простое удаление оставит cost как краску.
`field.ca/cc` также используются costDomain scratch, если включён path режим.
`field.pressure` после diffusion используется pigment final spare: глобальный
фильтр fieldOp/mode1 по имени не является безопасной границей.

Следующий конкретный эксперимент: opt-in water-only specialization внутри
Plan.settle при existing captured proof, сохранить front/capture/coverage,
после последнего front явно восстановить только логические P/C temporaries,
выдать прежние presentation callbacks/inputs на zero material без изменения
water overlay/reveal triggers. Сначала по одному семейству carry, затем
отдельно diffuse/tide; не одним blanket early return. RunningFilm/copy-back
и runningSourceCommands остаются прежними: новый пигмент может появиться
между prepare иfinish, нельзя clear всего canonical tile под old zero proof.
Гейты: actual intermediate role/alias oracle, same immutable full P/C/V/
coverage/endpoint, positive/unknown/Undo/peer negatives, реальный nexttouch
пигментом во время water settle, cancellation/contextloss. До них нет кода,
никакого утверждения математической эквивалентности всей fast ветки.
