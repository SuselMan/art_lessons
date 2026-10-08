# Native runner → canonical log → production GL

Standalone diagnostic, without Room, server, fake ACK, input mocks or alternate physics.
Both paths execute real GPU source/settle/composite passes. Native uses actual
CanonicalWatercolorGesture/DabSystem and its authoritative packed operations;
legacy PencilEngine replays those original IDs, wet profile and stroke seed.
Native per-event batch boundaries and legacy packed-operation boundaries deliberately
remain visible to the comparison. A mismatch is a finding, never hidden by tolerance.

```
node docs/qa/harness/728-native-end-to-end/build.mjs temp/native-end-to-end /absolute/path/to/baked/paper
node docs/qa/harness/728-native-end-to-end/check.mjs temp/native-end-to-end 100
node docs/qa/harness/728-native-end-to-end/check.mjs temp/native-end-to-end 400
```

Build copies the production Fine manifest and raw gzip assets. Missing assets are
fatal at runtime; flat paper is NOT an acceptable substitution. The check script
uses real WebGPU + WebGL SwiftShader and writes latest-100.json or latest-400.json.
Secure localhost is used. On trusted hardware import run.js then call
`window.runEndToEnd({size:100})`; 400 requires `{size:400,allowLarge:true}`.

100: zigzag. 400: water stroke then pigment over the same retained wet wash.
All points fit the single bounded1024 tile. Canonical1536 settle fields are not
reduced. GPU owners run sequentially and are destroyed before the next backend
allocates resources. 400 has a conservative512MiB soft estimate and rejects a
reported system memory below4GiB; unknown deviceMemory is reported, not fabricated
VRAM. This is not a memory safety guarantee. Do not run400 concurrently with any
other software GPU job. GL stage timeout is10minutes by default.

Final material RGBA is read once per backend. GL tile rows are reversed from
bottom-up to WebGPU top-down before stitching into the1024 page. Report includes
whole-layer hashes, changed byte count, maximum/mean absolute byte difference,
nonempty checks, paper/tape hashes, original tape, elapsed wall times and errors.
There is no per-frame full field dump, no all-transient-field parity assertion.
Elapsed times include CPU submission, queue wait and orchestration; they are not
GPU timer measurements. Software output differences do not establish hardware
exactness or performance. No Room concurrency, undo/redo or animation claim.

Third-owner isolation: after native author disposal, a fresh native runner replays
the same original packed tape with end timestamps preserved. It must not emit new
operation IDs or mutate the tape. Report adds `authorVsNativeReplay`,
`nativeReplayVsLegacy`, `nativeReplaySha256`, `replayPreservedTape`, nonempty
and elapsed time. Existing `wholeLayer` remains author-versus-GL. If author/replay
differs, input delivery/batch boundaries already differ before comparing GPU
backends; if they match but packed-native/GL differs, investigate raster/settle
backend parity. Both can differ, so neither implication is a complete proof of
a single faulty method. All three GPU owners remain strictly sequential.

Stage localization: `runEndToEnd({size:100,stages:true})`. Only packed-native and
GL owners receive observers; author remains the uninstrumented control. Captures
source coverage/P/C/V before actual planner.prepare, first fieldOp10 front seed,
first front/diffuse/brush outputs, then reads all independent copies after normal
completion. Native copies are encoded in the original owner scope; GL copies
restore framebuffer/current active-unit texture binding. Original method arguments,
returns and chronology are preserved. No per-pass synchronous readback, no PNG
paper composition and no injected physics. Snapshot cap96MiB is enforced; two
large source jobs can exceed it and explicitly fail instead of allocating without
bound. Use100 first. All snapshots are destroyed after readback.

`stageComparison` gives ordered keys, extents, changed byte count/max/mean; missing
roles or changed extents are explicit. `stageMetadata` preserves original bounds,
bloom/radius/water/landedWet/standing/wetPeak/dwell. Source divergence points toward
preparer/source/material ownership. Exact source+frontSeed but differing first
front narrows the investigation to front uniforms/filtering/kernel; it does not
prove a single arithmetic expression caused it. Compare preserved metadata before
blaming WGSL. These diagnostic copies add memory/work and invalidate performance
comparisons. The existing authorVsNativeReplay whole gate detects observer-caused
output differences relative to the clean author control in this same scenario.

Node controller invariants (not GPU pixel proof):
`npx tsx --test docs/qa/harness/728-native-end-to-end/stages.test.ts`.

Stage oracle revision: paired mixed-colour diffusion starts with COLOR; the
selected single-colour100 scenario starts with PIGMENT (colour=null).
Additional copies preserve first diffuse input and water gate BEFORE execution;
primitive metadata identifies actual channel, filters and prepared stencil. Brush
comparison now restricts to the written production scissor; stale outside output
bytes are excluded, and unequal scissor rectangles reject comparison. Full final
layer remains unrestricted. See `../../728-native-stage-review.md`.

Coarse binary localization BEFORE diffusion: `runEndToEnd({size:100,stages:'prediffuse'})`.
Alternative cohort, not added on top of basic snapshots: sourceP/coverage/V,
first mobile split(mode0), frontSeed(mode10), outwardPressure when mode12 seeds
inward, extendedCoverage(mode11), band(mode6), firstCarry input/output(mode15),
first diffuse input/gate. Approx93MiB for one1024/1536 job, hard96MiB cap.
Basic firstfront/diffuseoutput/brush and sourceC are omitted in this cohort.
`stageMetadata.nativeChronology/glChronology` record at most512 real ordered
field/front/absorption/resample primitives, mode/scalars and logical buffer roles
until first diffusion. Buffer roles are identified from actual source scratch and
planner fieldFor; no guessed CPU physics or new settle steps. A differing coarse
checkpoint localizes an interval; earlier operator inputs still need an isolated
same-input gate before fixing any shader. Use100, not multiple jobs/400 yet.

Для независимой диагностической выборки: `await window.runEndToEnd({size:100,stages:'prediffuse',diagnosticHardwareLinearInputs:true})`. Одинаковый флаг включает аппаратную LINEAR выборку только native settle у author и packed replay. Landing/source executor временно возвращает baseline; GL неизменён. Отчёт явно содержит флаг и область. OFF остаётся default; это эксперимент, не production fix. Не сочетать с диагностической специализацией mode, пока root не разрешил комбинацию явно.

Mode11 входы отдельно: `runEndToEnd({size:100,stages:'coverage',diagnosticHardwareLinearInputs:true})`. Только три immutable snapshot (coverage до mode11, pressure до mode11, output после), ~27MiB на owner. `mode11Correlation` сообщает top-row координаты, RGBA входов/выходов и сколько отличных output pixels совпадают с отличиями входов. Скалярные threshold/width/k — `stageMetadata.*Primitives.mode11`. Корреляция не доказывает равенство LINEAR соседей/UV; если same-pixel inputs одинаковы, этот результат явно считается необъяснённым. Нет новой физики.

Pressure gate: `runEndToEnd({size:100,stages:'pressure',frontIndex:0,diagnosticHardwareLinearInputs:true})` сохраняет только вход/выход mode1 k0 copy-to-pressure (~18MiB); `pressureCopyInvariant` сравнивает input/output каждого backend независимо. `frontIndex:1` (или другой положительный индекс) вместо copy сохраняет вход/выход выбранного настоящего front оператора и coverage (~27MiB), его координаты/скаляры/роли записаны в `selectedFront`. Выбор фиксирован заранее; GPUоператоры не меняются. Это локализация унаследованного расхождения; same-input front replay ещё отдельный следующий gate.

Same-input front: `runEndToEnd({size:100,stages:'pressure',frontIndex:1,sameInputFront:true,diagnosticHardwareLinearInputs:true})`. После основных readbacks GL повторяет выбранный оператор над своими неизменными captured input/coverage; затем GL owner уничтожается. Новый native owner получает ТОЧНО эти GL RGBA8 bytes (без Q8 перепаковки/уменьшения), тот же Fine LA→RGBA, production noise lattice, source/destination filters и original x0/y0/scale/cost параметры. `frontOracle.comparison` — сравнение этих двух повторов, отдельно от унаследованного native input. GL output использует существующий snapshot buffer: три fixture поля остаются ~27MiB. Foreign film пока явно unsupported и бросает, не заменяется нулём молча. Timing oracle не benchmark.

Изолированный source coverage: `runEndToEnd({size:100,coveragePrimitives:true})`. Сначала обычный неизменный сценарий. Из реального source executor сохраняются первые coverage stamp и ribbon (structuredClone сохраняет exact Float32 bytes), затем каждый отдельно рисуется на пустой coverage/availability. Native pipeline неизменён; production GL primitive oracle сравнивается с DITHER ON и OFF. `coverageOracle` возвращает vertex hash/uniforms, числа различий по каналам, первые координаты и validation. Это различает primitive rounding от последующего blend накопления; blank upstream availability намеренно одинакова и не претендует на полный production source. Dither toggle действует только на новый isolated oracle context, не основной GL replay.

Накопление coverage: `runEndToEnd({size:100,coverageSequence:true})`. Все actual native coverage commands сохраняются в исходном порядке, без дедупликации; лимит 200 бросает, не обрезает. Native и GL начинаются с одинакового нулевого Q8 поля. После каждой команды сравнивается coverage; GL DITHER ON/OFF — отдельные последовательные arms, сохраняются только два полноразмерных CPU поля и короткий отчёт. GL coverage-only oracle переносит накопленный Q8 через lossless upload между новыми контекстами (без resample). Дозы/вершины/порядок неизменны. Команды, действительно потребляющие upstream availability, явно отклоняются до запуска — заменять их пустой водой нельзя. Это полный coverage draw stream для первого сухого fixture, не replay compound source operators/foreign imports. Сценарий с несколькими retained washes требует отдельного начального state capture и здесь не считается доказанным.

Парные команды на одинаковом накопленном входе: `runEndToEnd({size:100,coverageSequence:true,coverageSameInputIndices:[9,11]})`. Индексы нулевые, из original ordered stream. Непосредственно перед каждой выбранной командой native coverage заменяется exact предыдущими GL Q8 bytes; GL получает те же bytes. После неё выводятся `sameInput:true`, actual stamp uniforms и до 64 координат с initialGl/native/gl RGBA. Это диагностический новый owner, основной автор/replay не меняется. Сравнение последующих невыбранных команд после такого reset уже не прежняя independent accumulation baseline; `sameInputIndices` явно помечает весь отчёт. Availability-consuming commands по-прежнему отклоняются.

Stamp intermediate shader gate: `runEndToEnd({size:100,coverageSequence:true,coverageSameInputIndices:[9,11],coverageStampDebug:true})`. Для выбранных stamp ON arm отдельно заменяется только coverage output production shader, оставляя vertex/interpolation/helper функции и literal uniforms. Три RGBA8 группы показывают across/hair/opening/contact; nibCoverage/pressure/world; localUV/openingNoise/hairDrift. Координаты включают критический x457/yTop372 и первые отличные пиксели. Debug вывод не blend'ится с предыдущим coverage; после него исходный native coverage восстанавливается exact Q8, основной stream неизменён. Это Q8 промежуточные наблюдения: instrumentation может изменить compiler оптимизации и не доказывает равенство sub-byte floats.

Debug группы 3–6 дополнительно усиливают знак localY/across (`clamp(.5+value*1e5,0,1)`), показывают fract/floor hair-coordinate, четыре first-octave lattice значения, обе noise октавы и промежуточные mix. floorHairX закодирован /16; сильные значения могут clamp'иться, это подписано. Эти наблюдения проверяют непрерывность noise у integer границы. Никакого округления/snap или изменения щетины в production нет.

Noise compiler hypothesis: добавить `diagnosticGlConsistentNoise:'subtract'` или `'clamped-subtract'` к ordered/same-input stamp gate. Только isolated GL oracle меняет `wcNoise` fractional evaluation с `fract(p)` на `p-i` (где `i=floor(p)`) или `clamp(p-i,0,1)`. Native unchanged; настоящий production GL replay unchanged. Default shader identical. `changedChannels` по каждой ordered команде позволяет отличить alpha от encoded-across rounding. Debug группы с явно вычисленным `fract(hp)` по-прежнему показывают исходный builtin; rowMix группы 6 поэтому служат контрольным старым вычислением, а octave/hair вызывают выбранный `wcNoise` вариант. В идеальной арифметике все варианты эквивалентны; аппаратный результат проверяет гипотезу compiler reassociation/contracted выражений, не разрешает автоматически менять production модель.

Настоящий GL replay, диагностически: `runEndToEnd({size:100,stages:'prediffuse',diagnosticHardwareLinearInputs:true,diagnosticProductionGlConsistentNoise:'subtract'})`. После прежнего native author/replay два настоящих PencilEngine GL owners выполняются последовательно: baseline без hook и corrected с canvas-scoped shaderSource hook. Только точный wcNoise fract anchor заменяется; другие контексты не меняются. Hook восстанавливается после owner, включая constructor/cleanup errors. `productionGlDiagnostic` содержит original/patched shader SHA256, baseline/corrected whole hashes, baselineVsCorrected/nativeVsCorrected, обе staged сравнения и corrected metadata. Обычные top-level whole/stage поля остаются baseline. Tape/paper hashes общие, native не перерисовывается дополнительно. При `exportImages:true` correctedImage отдельно. Stage cohort каждого owner ≤96MiB; CPU readback snapshots нескольких owners временно удерживаются, это диагностический overhead, не performance benchmark. Вариант выключен по умолчанию; residual non-exact нельзя объявлять исправленным.

Две bounded проверки alpha stamp17: `runEndToEnd({size:100,coverageSequence:true,coverageSameInputIndices:[17],coverageBlankSelected:true,diagnosticGlConsistentNoise:'subtract'})`. Для одной выбранной команды измеряются same accumulated GL input и blank input; дополнительный OFF dither arm пропускается (DITHER уже исключён предыдущим gate). `blank` возвращает whole diff/channels и значения blank outputs на accumulated diff координатах. Original availability-consuming guard остаётся. Native accumulated Q8 после blank восстанавливается; исходный author/replay untouched. Если blank Q8 совпал, это ещё не доказательство одинаковых до-квантизации float fragment: их малые различия могут проявиться только при blend.

Diagnostic source/live submission gate (default OFF): run `runEndToEnd({size:100,diagnosticSourceLiveSubmission:true,stages:'prediffuse'})` and compare with the same options OFF. Both author and native packed replay share source+live in one encoder only when enabled. Original draw order, render-pass boundaries, Q8 targets, tape, profiles and settle remain unchanged; transient resources retire after that combined submit. Require identical native OFF/ON layer hashes and stage hashes, author/replay exactness, no errors/loss, then measure pointer latency separately. This removes submissions, not GPU operators, and is not yet a hardware performance claim. Start with 100px; 400px solvent instability is a separate open gate.

`submissionMetrics:true` counts successful `CanonicalPlanAdapter.runQuantum` submissions only, separately for author/replay, captured before final readback. It excludes backend direct submissions (initial clear, readback and presentation), counts no GPU draws and adds no query/wait. `nativeComputeMs`/`nativeReplayComputeMs` stop after drain before final readback; these are CPU wall durations including queue completion and scheduling, not GPU time. For six alternating OFF/ON 100px runs use stages/exportImages/coverage gates OFF and compare final hashes; keep cache options and paper/tape identical. No intermediate field readbacks unless explicitly requested by another flag.

Literal stamp vertex OFF diagnostic: `runEndToEnd({size:100,coverageSequence:true,coverageSameInputIndices:[9],coverageBlankSelected:true,diagnosticHardwareLinearInputs:true,diagnosticLiteralStampVertex:true})`. Compare against identical options with the final flag false. Only the isolated sequence oracle uses the candidate; the main author/replay stays baseline. The candidate preserves production DAB_VERT evaluation order, not an artistic change; hardware parity and benefit are unproven.
