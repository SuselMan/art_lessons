# Макроскопический перенос пигмента: второй ночной этап #805

CPU/source-only, 18.10.2026. Новых устройств, GPU-контекстов, сервисов и зависимостей этот агент не открывал. Новые `macro-*` находятся рядом с прежними WebGPU-прототипами; старые пути и index не изменены. Вход/выход соответствует прежнему Candidate, RGBA8 packed buffer 1024; внутренние подвижные carriers — f32, не RGBA8 на каждом шаге.

## Почему прежний короткий LBM почти не течёт

`webgpu/lbm.ts`: fluid initial rho=1+.12*water, zero momentum; uniform pool почти не создаёт градиента давления. Momentum дополнительно затухает и ограничен .15 клетки/шаг. Dye не является LBM population: это отдельный semi-Lagrangian tracer + convex neighbour mixing. При n256/16steps скорость сама ограничивает максимальный перенос одной траектории 9.6finepx, а область зависимости ограничена64px. При diffusion .015 каждый сосед имеет вес≤.015/4; оценка sigma по одной оси≤sqrt(16*.015/2)*4≈1.39px (без advection). Seed не создаёт силы. Ни настоящее название D2Q9, ни снижение сетки не задают автоматически нужный физический горизонт50–200px.

## Первичные работы и решение

[Chu/Tai, MoXi, HKUST](https://researchportal.hkust.edu.hk/en/publications/moxi-real-time-ink-dispersion-in-absorbent-paper-2/) подтверждает исходную работу по ink dispersion; в этот этап не заявляется полный перенос MoXi, её материала и brush deposition. Доступный университетский record не заменяет самостоятельную проверку всех формул статьи.

[Curtis et al., Computer-Generated Watercolor](https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf), §4: разделяет surface water/pigment, deposition и capillary saturation; capillary layer отвечает за изменение мокрой маски. Вывод для нас: движение красителя в уже большой луже и рост самой лужи — разные механизмы. Нельзя принять декоративную кайму за доказательство переноса массы.

[Stam, Stable Fluids](https://www.josstam.com/publications): стабильная advection/implicit diffusion позволяет выбирать большой временной шаг, но стабильность не гарантирует сохранение деталей/массы при интерполяции. Новый implicit prototype решает только diffusion/concentration exchange, не выдаётся за весь incompressible solver.

[Peaceman/Rachford, 1955](https://turkertopcu.org/wp-content/uploads/2018/04/JSocIndustApplMath3_28_1955.pdf) — первичная работа по alternating-direction implicit решению. Наш вариант проще: **Lie-split backward Euler**, а не их схема второго порядка. Такой выбор сохраняет M-matrix/positivity каждого directional solve при большом lambda; temporal splitting error и осевая анизотропия остаются проверяемыми недостатками.

[Alexiades et al., Super-Time-Stepping](https://web.math.utk.edu/~vasili/va/descr/sts.CNME96.pdf) ускоряет explicit parabolic integration большим составным шагом. Не выбран первым: стабильность составного цикла сама по себе не гарантирует положительность carrier на промежуточных стадиях. Blind clamp там изменил бы массу. Спектральный FFT также потребовал бы решения мокрых масок/границ; большой periodic convolution без этого провалил бы сухой разделитель.

## Два реализованных подхода

**wgsl-macro-implicit** (`macro-implicit.ts`). Coarse128/256, каждую строку/колонку решает независимый Thomas thread, scratch в storage. Два directional backward-Euler solve на цикл. Face conductance=min(water_i,water_j)/(1+paperDrag*avgPaper), ноль на dry face. Обычный режим решает Fick carrier diffusion; concentration=1 решает mass=W*concentration и приводит равновесие к M∝W, не к постоянной массе независимо от воды. Nominal sigma64/112/160finepx, 2–3цикла. Это nominal fully-wet horizon: water/permeability замедляют перенос. Implicit tails не имеют конечной скорости, потому reach надо измерять по значимой массе/байтам, не по любому epsilon.

**wgsl-macro-darcy** (`macro-darcy.ts`). Отдельная связанная схема: head=W+paperHead*paper+solutalPressure*alpha; four-face outgoing water flux donor-limited, gather переносит pigment concentration с этой водой. Затем pair-symmetric concentration mixing. Каждый macro-step=3dispatch, 96–256steps на64/128grid. Solutal pressure — явно phenomenological настройка расширения окрашенной капли, не калиброванное свойство PB15 и не скрытое добавление массы. В отличие от static implicit, water действительно перераспределяется и carrier переносится водой; wet-domain пока фиксирован исходной маской. Large-grid count задаёт настоящий путь переноса, без stride-jump через сухую стенку.

Обе схемы: all-fine-pixels-wet admission coarse cell, no-flux через rejected cell. Это консервативно сохраняет тонкую сухую полосу ценой сужения краёв domain. Итог — нормированная bilinear reconstruction по доступным coarse cells + optional fixed raw fraction, raw полностью сухих/rejected cells копируется неизменным. Поэтому coarse conservation **не является доказательством full-resolution quantized mass**; reconstruction/saturation/float должны проверяться отдельно на hardware. Coarse loss и возможная сетка не скрыты.

## Проверки и интеграция

`macro.test.cjs`: 6 CPU tests PASS: positive/conservative implicit line с100finepx reach; large-lambda dry barrier; два раздельных carriers встречаются в центре; raw all-channel/downsample barrier; 128coupledsteps conservewater+pigment и не пересекают сухую полосу; реальные create/upload/run/destroy lifecycle через mock, dispatchcount/no timed allocations/fresh upload. Oracle f64, **не доказательство WGSL f32 или реальной компиляции**. Strict tsc/esbuild/oxlint PASS.

Интегрировать отдельно `import {macroDefinitions} from './webgpu/macro-registry'`, добавить в root registry вне старых default paths. Объект тот же `{id,label,configs,create}`; timings root: upload+await отдельно/totalReady, run+queue completion, полный readback/SHA после. Рекомендуемый первый smoke: implicit256/2/sigma64 и Darcy64/96 на bigpooldrop и separatedcolors-onepool; затем sigma112/160 и сетку128. Hardware-компиляция/фактический reach/потеря массы/смешение/скорость пока **не проверены**. GPU делает только основной оператор.
