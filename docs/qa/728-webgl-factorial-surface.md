# Surface: full-engine GL1/MRT × front batching

Frozen actual engine f603f9ae, исходная zigzag400 tape, Fine,1024 canvas, настоящая Surface/Chrome154. Восемь wall запусков в прямом и обратном порядке, без GPU query обёрток. Во всех arms canonical tape, whole/material export, retained field records, meaningful Undo/exact Redo совпали; GL0/lostfalse. MRT действительно упражнён, fallbacks0. [Компактный паспорт](harness/728-webgl-factorial/surface.json), [методика](harness/728-webgl-factorial/README.md).

| Backend / queue | Прямой paint, ms | Обратный paint, ms | Среднее, ms |
| --- | ---: | ---: | ---: |
| GL1 / original | 21126.9 | 22115.4 | 21621.2 |
| GL2 MRT / original | 21069.7 | 21198.9 | 21134.3 |
| GL1 / front batching | 20015.7 | 19979.9 | 19997.8 |
| GL2 MRT / front batching | 19647.7 | 19602.2 | 19625.0 |

Front batching gain в этих двух порядках: GL1 **5.3–9.7%** (средние7.5%), MRT **6.7–7.5%** (средние7.1%). MRT whole delta: original **0.27–4.14%** (средние2.25%), batched **1.84–1.89%**. Комбинация против GL1original **7.0–11.4%**, средние9.2%. Выборка два значения на arm; порядок/прогрев влияют. Это наблюдаемый fixed replay, не гарантия масштаба выигрыша для всех сцен/устройств. Проценты не складываются; isolated42% не перенесён на whole engine.

Отдельный query cohort, только timed paint, EXT_disjoint_timer_query, outer intervals без nesting, все samples valid/capacity0. GL1original 2048 actual brushPass samples: median1.183ms/p901.242ms, сумма2229.57ms. MRToriginal 1024 actual brushPair samples: median1.389ms/p901.487ms, сумма1333.91ms. Пара обрабатывает P/C вместе, singles — по одному полю: sampled brush workload экономит **40.2%** суммы. При front batching sums2175.63→1350.17ms (**37.9%**). Это всего brush workload, не GPU время всех front/diffuse/composite. Query samples CPU submission sums233→225ms около того включают overhead instrumentation; чистый JS own time не измерен.

Срезов queue original1235–1239 → front1143–1147; CPU+sync tick sums242–384ms слишком зависимы от порядка для уверенного собственного CPU выигрыша. Падение wall связано также с меньшим количеством frame/scheduling границ, а не только GPU arithmetic. Init и readback/export/Undo отдельно; physical pen-to-visible/power не измерены.

Первый query GL1original не собрал samples из-за опечатки brush вместо brushPass и **исключён**. GPU cohort позднего GL1front диагностически исправлен accessor alias brush↔actual brushPass; отдельный GL1original повтор использовал правильный brushPass напрямую. Реальный GPU scope и query nesting проверены; wall cohort alias/wrappers не затронут. Source harness исправлен67cdffff. Последний дополнительный hash/field gate также exact. RAM guard actual Surface preflight≥1700MiB, abort<500; минимум полной серии915.5MiB, supplemental1177.9MiB. Все собственные targets закрыты, Chrome и посторонние страницы не закрывались.

Raw данные на диске: `temp/factorial-surface/report-ready.json`, `temp/factorial-surface/missing-gpu.json` в worktree728-source-live-scope. Приватные URL/стэки в Git не входят. Defaults не менялись. Для решения о production отдельно нужны Samsung/iPad compilation и live input/Room gates.
