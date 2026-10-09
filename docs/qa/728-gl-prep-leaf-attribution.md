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
