# #748: открытый блокер строгой сходимости

Утренний вывод: **AMD/Intel dry targets пока не совпадают точно.**
Не закрывать задачу визуальным сходством, допуском maxDiff или общим числом
прошедших unit-тестов. Все ниже — реальные GPU с одинаковым recorded input.

Подтверждены минимум два независимых источника расхождения:

1. Brush deposition: первая разница уже в draw0 nib coverage, на одинаковых
   CPUargs/uniforms/GLstate/shaderSHA и нулевом FBO. Это до solver.
2. Solver: загрузили на AMD/Intel точно одинаковые original/P/C/coverage/
   solvent bytes и CPUmetadata; финальные solver P/C всёравно различаются.
   Первый расходящийся after — draw1 ContrastPhase.bg,256², actual fragment
   SHA9681c26f542b28f0df04d7927fbfa890f733cbb2b848550c80ea78dea17fd403.
   Coverage финального equal-source solver совпала.

В каждомGPU equal-source повтор reused1/reused2/freshsolver+freshlocalpool
совпал точно3/3; это не подтверждает stale-pool причину на данном входе.
Shared production settle fields при freshlocalpool оставались общими,
поэтому отдельный checkpoint5bytegap этим тестом не опровергнут и не решён.

DITHER default/off×2 и highp samplers дали прежний результат накаждомGPU.
Constant scalar varyings→uniforms тоже не изменили результат. Аналитический
nibUV изменил некоторые bytes и Intel target, но сходимость не дал:
firstdraw41pixels/57channels max1, AMDtarget9d3aa5ec…, Inteltargetee4110b4….
Даже полное исправление nibUV не устранило бы независимую проблему solver.

Доказательства: `runs/748-first-deposition-2026-10-17/` и
`runs/748-dither-ab-2026-10-17/`. Следующий scoped diagnostic — actualbytes
первого backgrounddraw +samplerfilters, затем ONLYего UV из gl_FragCoord.
Это поиск первой причины, не готовый универсальный rendererfix.

## Граница канонического результата

Принцип проекта в `.claude/rules.md` → Cross-device pixel determinism:
общий итог не должен зависеть от live per-device GPU floating-point.
Для бумаги это решено offline CPU asset. Для динамической воды заранее
сохранить все картинки невозможно, но тотже принцип требует одного точно
определённого вычисления общего материала либо одного авторитетного результата.
GPU animation может оставаться локальной декорацией. CPU/WASM сам по себе
не является доказательством: правила чисел, округления и sampling должны
быть явно определены и повторены на разных устройствах.

Ниже варианты для обсуждения; **решение не принято и реализация не начата**.

| Вариант | Что делает результат общим | Что требуется | Практическая цена |
| --- | --- | --- | --- |
| Client CPU/WASM canonical kernel | Одни integer/fixed-point операции, integer sampling, явное округление и versioned baked LUT/шум/кисти на каждом клиенте | Покрыть ВСЮ цепочку deposition→fluid→dry composite, overflow bounds, ordering и material state; scalar fallback без relaxed SIMD/неопределённых math imports | Большая работа и CPU/память на Samsung/Surface; можно worker+dirtyrect, но нужен реальный бюджет, GPU остаётся preview |
| Точный ограниченный WASM f32 kernel | Одинаковая последовательность elementary wasm operations без contraction и с фиксированными math approximations | Явно реализованные transcendental/noise/sampling, rounding-to-RGBA8; не использовать platform Math.sin/cos или relaxed SIMD как canonical | Ближе к нынешней математике, но перенос shaderопераций/фильтрации всёравно полный; одного f32 недостаточно для исторической художественной совместимости |
| Central canonical material+bitmap | Один исполнитель по room seq публикует content-hashed target tiles на определённом watermark; все участники показывают теже bytes | Авторитетный material state(P/C/water), versioned renderer, journal/rastercommit связь, server-side undo/rebuild и rejoin checkpoints; bitmapбезmaterial не поддерживает следующую воду | RTT и серверный compute; offline только prediction. GPU executor может обеспечить одинаковую раздачу, но его долгосрочный replay тоже надо фиксировать версиями/сохраняемыми результатами |

Набор локальных shaderpatches может уменьшить текущие различия и остаётся
полезен для локализации. Но каждый из сотен float/texture/blend шагов должен
получить доказанный canonical contract, прежде чем такой набор станет строгим
решением. Произвольная финальная quantization/tolerance не решает сравнения
на границе buckets и может менять художественный результат.

Нужно отдельно выбрать художественный reference и версионирование. Сейчас
нет одного прежнего GPU image, совпадающего на всех устройствах: обещать
побитовое сохранение одновременно AMD и Intel невозможно. Новый canonical
kernel должен иметь согласованный reference/modelversion; старые операции
нельзя молча мигрировать или перерисовать новым алгоритмом под старым id.

Для утренней передачи: #748 остаётся OPEN. Продуктовые решения undo/dry и
исправления crash/data-loss не отменяют этот блокер. Собственных GPUcontext/
сервисов у автора этого отчёта нет; отчёты компактны, исходные private transfer
bytes временно держит QAoperator до окончания численной диагностики.
