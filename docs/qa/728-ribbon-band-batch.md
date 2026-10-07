# #728: один CPU проход геометрии для трёх material bands

База5a102d54. Принцип cross-device-determinism: Operation Log, прежние double значения геометрии/материалов, Float32 vertex order и физические draw команды сохраняются. Новый builder проходит геометрию один раз и выдаёт три независимых массива. Старый buildRibbonBands сохраняет прежний алгоритм и API; экспортированы только три pure geometry helper.

Painter.diagnosticBandBatch выключен по умолчанию. Используется только при segmentMode + inkFor + diagnosticSolventField + !stampsOnly; прочие инструменты/сухая кисть/кончик не изменены. Три текущих callbacks pure: pigment, same pigment with contact-before wetOf, solvent. Каждый вызывается однажды на сегмент своего material; interleaving вместо трёх полных geometry walks безопасен для этих callbacks. Материальные double products вычисляются до Float32 encoding; закодированные floats не используются обратно в геометрии.

Writer: дешёвая initial capacity по числу сегментов, grow перед сегментом на уже вычисленном poseSubdivisions, без второго geometry walk. Геометрические doubles не меняются. Actual final8 Samsung1345 + varied ellipse/roundedBox/film/scale/pressure/return/zero-travel/negative-opacity: все три массива byte exact против старых builders25cases. Existing geometry31tests и actual Painter ordered band bytes/modes/uniforms7tests:63PASS, webTS PASS. oxlint --fix:0errors, один существующий no-this-alias warning const owner=this вне данного diff.

Отрицательный первый writer с тремя Number[] сохранён в generic-negative-benchmark.log: HOME paired15samples10reps median15.115→16.324ms; диагностический Vitest timeout5s после вывода. Этот writer заменён, не предлагается к интеграции.

Typed writer: HOME alternating15pairs3reps actual final8 median old13.969→new2.775ms. CPU diagnostic, не Adreno/Room/FPS. Artefacts temp/ribbon-band-batch. Default OFF до immutable hardware material/endpoints/native gate. Ни shader/physics tuning, ни GPU correctness claim пока нет.

## Current root4b57ed77 Samsung

Own1346 immutable journal SHA1b6e411586ed268847e3d6f42f8e03f16f0b26eb09f3c681fe3f962c2c225b09: bandBatchOFF/ON, identical lazy/split/front+contactcap4/source+phaseON, fibresOFF. Все19 meaningful P/C/V/coverage+wholeRGBA byte exact, nonempty guards, purple492523, carryP14/late4, GL0/lostfalse. Solver16.754/16.770s: geometry не ускоряет физический solver tail. Target CLOSED.

Native1347OFF/1348ON последовательно CLOSED, source4b неизменён. Actual6s400 loaded +20ms→100500msnewtouch,2engineops,owner14/metadata13true,nonempty/GL0/lostfalse. Actual CDP CPU samples подтверждают buildRibbonBandBatch ON. Dense_onEnd25.6→17.5ms; postlift rAF33.5→16.7; nexttouch_onEnd10.6→5.0. Dense/newtouch max33.5both; tail117→100.3 остаётся. Adaptive rAF делает journals разными, поэтому это не strict causalFPS claim. Ordinary Room/serverACK, purewater/drybrush negative и default enable ещё не подтверждены.

CPU profile OFF dense_end: body/buildRibbonBands~14.3ms, GC2.1ms. ON geometry push~2.2ms/lerp1.2/nibSupport1.1; commitPending~5.6ms стал крупнейшим sampled residual. Не выдавать маленькую выборку за точную долю каждого метода.

Bounded GPU traces: circular buffer4MiB, expanded JSON20.6/21.2MiB (streamguard32MiB), categories gpu+blink.user_timing. Actual trace marks одновременно содержат trace ts и performance startTime: OFF offset range214724288.671–288.790ms, ON214798883.565–883.648ms. ON100.3ms tail gap совпал с CrGpuMain Scheduler::RunTask82.992ms / CommandBufferService:PutChanged82.914ms, main CPU~83.1msidle. Это доказывает GPU-service burst, но не конкретный shader/pass или hardware GPU elapsed. OFF117gap main113.3msidle, observed GPU-service max4.5ms: другой scheduling gap; эти причины нельзя смешивать. Полный Viz/compositor wait не покрыт категориями.

RawVPS: temp/ribbon-band-batch/{fixed-report.json,native-off.json,native-on.json,passport.json,trace-summary.json}; raw/CPU/traces/контроллеры сохранены HOME680-lifetime-hardware/temp/plan-quantum/band-root4b. Samsung освобождён после1348.

### Разбор вложенности tail GPU-service

ON82.992ms Scheduler::RunTask содержит только общие WebGL/Flush/PutChanged envelopes; ни LinkProgram, ни shader compile, allocation или детализированного decoder event внутри нет. Все26 DoLinkProgram находятся на странице в1458.607–1544.357ms, задолго до tail23119.834ms. Это отрицательное свидетельство гипотезы поздней компиляции в доступных trace categories.

Wall/thread CPU существенно различаются: Scheduler82.992/0.300ms, PutChanged82.914/0.235ms. GPU-service thread почти весь интервал не исполняет CPU; ожидание драйвера/синхронизация вероятно, но причина ожидания и физическая цена shader не установлены. Handler .WebGL-0x78028a7000, put_offset45571; flow23412 связывает renderer23911/tid23922 flush ts214821990307 с GPU flush ts214822003450. Это связь renderer→command buffer, без per-program attribution.

Текущий4b native controller не записывал пассивный per-draw/program timeline, поэтому восстановить конкретную последовательность GL draw данного интервала из aggregatefieldModes нельзя. Предыдущий5a профиль относится к другому payload/source и не подменяет это доказательство. Дальнейший диагностический прогон потребует пассивные bounded draw/program/upload records и synchronized user marks, без дополнительных active readbacks/barriers. Детальный JSON: trace-burst-detail.json.

### Дополнительная пассивная native wave1349

Current4b bandON, прочие flags как1348. Own1349 CLOSED, GL0/lostfalse/nonempty. ShaderSource/attachShader/linkProgram пассивно записаны с начала constructor; FNV32+length сопоставлены с exact transferred shaders.ts (диагностическая identity, не SHA). GLqueries/extra compile/readback/barriers не добавлены. Ring4096records, максимум3gapcaptures; wrappers восстановлены finally. Trace/CPU profiler прежние bounded limits; дополнительный overhead wrappers не выдаётся за pairedFPS.

Новый117ms tail gap23343.1ms **не воспроизвёл** прошлый82ms GPU-service wait: mark offset215211194.351–194.448ms, maximum Scheduler4.260ms/threadCPU2.203ms внутриgap. Следовательно программа прежнегоwait этим новым опытом не установлена, compositor/scheduling вне выбранных trace categories остаётся неизвестным.

Последние150ms содержат183draws/51bufferData/16texImage2D/36copyTexSubImage2D/50existingFinish:48WC_FIELD_OP,40WASH_REVEAL,32DAB,18RIBBON,12WC_RESAMPLE,8WC_BRUSH_DRAG,7WC_WATER_FRONT,5LAYER_COMPOSITE,5PAPER_COMPOSE,5SCREEN_BLIT,3FIELD_HIGH. Последние RIBBON/DAB submission23229.6ms означают исполнение следующего queuedgesture послеclosure: нельзя назвать весь antecedent dryingpass. LinkProgram вgap отсутствует. Artifact native-program-on{,-cpu,-trace}.json и program-gap-summary.txt сохранены HOME band-root4b. Нужен отдельный широкий compositor trace или matched конкретный операторный контроль; слепое shader tuning этим результатом не обосновано.

### Truewater и low-water matched negative gates

Current4b frozen: сначала actualnative400px6s capture truewater normal:100:0 (own1350), затем fixed single-op tape OFF/ON (1351). SHA67ff2184348868ecd445606b971e96b91d47c7acbb5418bf098bcf64528af679. Все19buffers+wholeRGBA EXACT0, GL0/lostfalse, P/Color/purple0 ожидаемо, meaningfulV229524/solventtile0 205854/coverage328756 nonzero. Carry14/late4; не пустой очищенный oracle.

Low-water normal:10:100 native1352, matched fixed1353, SHAddb7419be27b5d6d27d6d7b78ac9f8609435e578eba929285f7954662c2622a6:19buffers+wholeRGBA EXACT0, purple309216, meaningfulV233600,carry12,late0,GL0. Все4ownedtargets CLOSED. Painter runtime profile для обоих tapes: waterDepletion=true,stampsOnly=false,solventFlag=true; ON diagnosticBandBatch=true. Это purewater/low-water material ветки, не stamps-only skipped branch; художественная сухая текстура не менялась и не оценивалась.

Обе fixedarms сохраняют прежний modifiedreveal/owner14 isolated scope, не ordinaryRoom lifecycle. Снижение/рост wallclock solver не является физическим throughput утверждением. Нативные adaptive gestures служат записью tape, без pairedFPS claim.

### Ordinary Room current backend ACK

После закрытия1353 перезапущен только own5311 Vite (PID1180026), source4b неизменён, SERVER_PORT4539/current47e backend. Первый Room1354 остановлен до input из-за fixture ENOENT pageLib, target CLOSED, FAIL сохранён. Исправлен только абсолютный путь existinghelper.

Retry1355 own Room CpqCxCHq1754×2480Fine: actual PointerController3s dense400+nexttouch с bandON и прежними lazy/FIFO/split/cap4/source+phaseON, fibresOFF. Дваstroke authoritativeACKseq1/2 done/pendingfalse, realUI paper_dryseq3. Final1754×2480PNG1890226paintedpx, GL0/lostfalse, owners0/presentations0, canonical/settle/rebuild idle. Target CLOSED. Это delivery/nonemptyendpoint проверка ordinaryRoom, не matchedhistory/reload parity.

Active151frames/max50ms/28>33/0>100; nexttouch handler20.5ms послеlift100.3ms, tailmax100ms. Долгий solver остается:12canonical requests/reveals4 наблюдались в54.4s, canonicalidle59.4s затем revealendpoint. Standalone более быстрые rAF не подменяют этот Room результат. DefaultbandOFF сохраняется, smoothness не решена.

### Broad compositor trace1356: ограничение доказательства

Own1356 actual nativebandON завершил physics/endpoint GL0/lostfalse, два rAFgap83.7ms. Расширенные categories gpu/userTiming/viz/cc/renderer.scheduler/toplevel с binary4MiB развернулись более32MiB JSON; hard streamguard остановил скачивание. Target CLOSED, rawreport/CPU/partialtrace сохранены HOME. Partialtrace невалиден, compositor attribution этим прогоном не установлена. Следующий подготовленный контроллер уменьшает circularbuffer до2048KiB, убирает toplevel и закрывает IOstream также в guard-finally. Source/shaders не менялись.
