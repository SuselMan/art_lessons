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
