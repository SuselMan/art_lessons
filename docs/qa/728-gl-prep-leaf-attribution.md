# ONE GL400: подготовку тормозит CPU raster, не allocation

Source26291656/controller8031e4f7; durable `harness/728-gl-timing/one400-prep-leaf-surface-summary.json`. ONE обычный GL Surface, fixed2gestures400, actualgap16.1ms/centerwet.98553, pending и lease приняты, DOWN drain0, GL errors0. Не paired gain/физическая задержка/GPU execution.

| UP | total | preparation | field acquire | nested allocation/clear | CPU stencil+contacts | остаток preparation | op0 stitch |
|---|---:|---:|---:|---:|---:|---:|---:|
| first |121.8|86.1|.4|replace+10alloc .1|76.1|9.6|1.1|
| second |60.3|16.6|.1|exact-size clear .0|15.6|.9|.2|

В этом запуске основная цена preparation — eager CPU raster; гипотеза долгой allocation не подтверждена. Остаток preparation включает bounds/setup/input acquisitions/schedule construction вне двух интервалов; его нельзя назвать чистым schedule или GC без свидетельств. First/second не одинаковые workloads и cold/warm JIT не разделены. Фазы сохраняют собственника UP; warm/cold cache не включён.

CPU-only real prepare integration PASS: observer ON/OFF дают одинаковые upload bytes/contact pulses/field operator schedule; оба preparations имеют owned UP field/raster spans. 8 existing timing/lifecycle tests и appTS PASS. Аппаратный source passport включает изменённый CanonicalPlan. Исключения observer не меняют drawing; незавершённая фаза при material throw не притворяется полным интервалом.

## Следующий конкретный точный кандидат

Не включать replaycache. Изолированный math-preserving loop-invariant hoist в brushDragField: вычислить на dab `decay = -length / ry * d.water`, `dirX = d.dx / length`, `dirY = d.dy / length` один раз, в row — `py` и bottom-up row offset; внутри cells сохранить исходный порядок r2, Math.exp, Float32 stores и Q8 rounding. Это удаляет повторные division/multiplication per covered cell без изменения математического выражения, ownership или количества visits. Нельзя заменять division умножением на reciprocal, экспоненту approximation, менять порядок accumulation/coalesce dabs.

До runtime candidate нужен CPU oracle против неизменённого brushDragFieldWork (генератор содержит исходную формулу), adversarial radii/angles/direction/water/crop и полный Uint8 byte compare. Только после baseline-vs-candidate CPU workload benchmark можно обещать ожидаемый gain; JIT может уже hoist часть выражений, поэтому сейчас процента нет. Если CPU gain мал, следующий substantive путь перенос exact CPU contact raster в GPU — отдельное решение с сохранением ordered Float32 accumulation/rounding, не часть этой атрибуции.

RELEASE Surface: owned context disposed, frontend5382/forward9455 остановлены; postRAM1924MiB. gl-prep-leaf400-5382 finished=true, standard privileged guard cleanup у root. Manual5381/backend4558 не изменены. Новых аппаратных повторов не было.

## CPU hoist prototype outcome

Неподключённый `BrushDragHoisted.ts` прошёл 64 детерминированных adverse cases против production и неизменённого generator oracle. Warm VPS alternating benchmark 12 dabs/512×512: median baseline 5.186 ms, hoisted 5.061 ms (2.4% nominal). Один короткий CPU прогон с шумом не доказывает значимый gain; этого недостаточно, чтобы решать 76ms Surface raster. Prototype не подключён к runtime. Более сильный следующий кандидат должен уменьшать число cell visits/exp или переносить CPU raster, с отдельным exact oracle; простого algebraic hoist недостаточно.

## DEV candidate prepared, default OFF

First-call CPU benchmark (8 separate fresh Node processes per arm, startup excluded, alternating order): median baseline 34.817 ms vs hoisted 31.225 ms, nominal 10.3% reduction. Samples overlap/noise; no Surface prediction.

`wcContactHoist=1` is strict DEV opt-in through Room parser→Engine→CanonicalPlan. Production ignores; direct native/async/deferred/mixed/material-presentation combinations reject before expensive init. OFF chooses original brushDragContacts; ON only substitutes exact field producer after unchanged ordered grouping. Lazy contact generator/cache precedences remain unchanged, workspace reuse/reset retained. Stencil, texture upload, solver schedule and finish ownership untouched.

CPU exact oracle includes64 deterministic random+36 signed-zero/extreme/zero-water cases, unchanged generator oracle, workspace growth/shrink with independent retained output buffers. Real prepare integration verifies full ordered uploaded bytes (including foreign stencil), contact pulses and field operator schedule against OFF.12 lifecycle/oracle/parser tests passed before workspace addition; final 4 focused tests plus appTS passed. Hardware candidate not run, manual5381 unaffected.

## Exact exp reuse census, not a new runtime candidate

CPU-only exact Float64 argument census with unchanged Math.exp restored in finally: grid-aligned synthetic travel has114986 duplicate calls/120086 (95.8%); .013-subpixel x increments only4487/120098 (3.7%); changing radius .013 yields58934/120186 (49.0%). This shows why a generic exact exponent cache is risky as a performance proposal: recorded subpixel pressure/position may destroy reuse, while exact key/lookup work adds cost. No rounded keys, LUT, approximation or actual optimization implemented. This census is not actual room metadata and gives no production hit-rate claim. Stronger reuse must first demonstrate hit rate on immutable real brushTravel; repeated-exponent evidence cannot be inferred from regular-looking pixels.
