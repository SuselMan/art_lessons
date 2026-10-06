# #680: isolated idle settle batching candidate

Base8c4bc5c2. Default OFF, manually set `engine._settleQueue.idleBatch=true` only for a benchmark. No model/shader/operation data change. No GPU measurements yet; do not integrate or present as a performance fix.

The queue batches only known local contact callbacks while idle/on-time. Drawing and late-frame behavior stay unchanged. Hard total16draw equivalents/2^21pixel equivalents per tick,12ms budget checked after GPU completion; this initial version synchronizes after each local callback conservatively. Unknown/fullfield callbacks keep one-entry frame boundaries. The last callback is always unknown because advance also executes finish/full-tile rendering and may replace the job. Upload callbacks remain unknown.

A contact exchange estimates5draw equivalents (2brush draws,2copies,presentation allowance) over its actual canonical scissor including one-cell halo. Its throttled presentation may reconstruct whole tiles/acquire buffers: whenever150ms presentation is due within20ms, cost becomes unknown. Cold upload, absenttexture and unsetbounds are not treated as cheap. Every operator/presentation callback remains in original chronology, including same pre-contact P/C sources and paired copy-back.

CPU gates: fulltypecheck and lint:fix pass(existingwarnings),18targeted queue/plan tests pass, map:check/map:rules pass(noerrors). Tests cover defaultoff/unknown boundary, drawing, draw/pixel caps, completedGPU clock, cancel/replacement, destroyed-scratch metadata access and chronological operators. No new GPU buffers/programs; one smallcost getter percontact. ActualGL cost/PNG parity remain unverified.

Required Vega AB: same recorded operations OFF/ON canonical PNG + P/C/V bytes exact; native80 active/burst/singlepurewater/waterpig phase rAF, solverduration, per-callback syncedGPU upperbound, no GL/UI errors. Existing nativebaseline active45Hz vsidle60Hz and nextstroke133–167ms spikes retained. New timing must measure GPU completion; CPUcomplete11–15ms only measured submission. Samsung cold behavior/realGPU safety required before normal use. No current release changes.

## Correctness-base port

Ветка `agents/680-settle-idle-reentrant` основана на 9eb2a6fe.
Эксперимент по умолчанию выключен. Все guards пакетного выполнения используют
тот же `isAlive(job)`, что и исправленный основной lifecycle: owned empty drawing
не считается уничтоженным, потеря ownership прекращает metadata reads, cancel
закрывает coroutine. Solver без custom lifecycle сохраняет scratch.live.

Старый аппаратный OFF/ON ecba043d результат принадлежит старой базе, а не этому
source. Аппаратные timing/fields на новой базе ещё не выполнены.

## Vega QA новой базы — 2026-10-06 01:29–01:33 UTC

Source `696a8068`, Chrome154, AMD Radeon Graphics (radeonsi renoir ACO),
A2/Medium, DPR1, девять runtime production-review flags подтверждены.
Один owned Chrome за раз; каждый закрыт finally; GL0, ошибок страницы нет.

Фиксированные 65 dabs: OFF/ON source, actual P/C/V, dryP/C и прозрачный PNG
совпадают точно. PNG непустые: 83103 пикселя alpha>0, maxalpha126.
Wall выполнения 17.592→8.0425 секунды. Это не FPS и не photon latency.

Native synthetic PointerInput size80:

| Метрика | OFF | ON |
| --- | --- | --- |
| Dense active median/p95 rAF | 22.2/22.3 ms | 22.2/22.3 ms |
| Idle baseline median rAF | 16.7 ms | 16.7 ms |
| Dense solver idle | 15.5207 s | 8.009 s |
| Dense reveal idle | 24.2344 s | 16.7242 s |
| Burst2 max rAF | 150 ms | 149.9 ms |
| Burst3 max rAF | 183.4 ms | 233.3 ms |
| Burst3 LoAF max (whole burst) | 194.4 ms | 250 ms |
| Forced complete CPU submission, burst2/3 | 12.7/5.2 ms | 11.9/6.5 ms |

При обычном рисовании около45Hz против idle60Hz, несмотря на отсутствие кадров
>33ms. Burst — три штриха по1.2s, пауза150ms; перед следующими Down остаётся
около960–976 операций. ON ускоряет фон, **не устраняет** задержки начала следующих
штрихов; в этом одиночном A/B третий пик хуже. Не считаем это готовым исправлением
отзывчивости и сохраняем defaultOFF. Native OFF/ON независимо формируют dabs по rAF;
байтовая корректность доказана отдельной фиксированной последовательностью.

В отдельном fixed65 cost probe после каждого known callback читался1×1pixel
из заранее выделенного собственного FBO с восстановлением framebuffer binding.
Native timing этот probe не устанавливает. 896 callback по12500pixel-equivalents:
OFF p50/p95/max2.10/2.70/6.70ms, ON0.80/2.20/2.80ms; exactfields/PNG сохраняются.
Это submission+readback wall, включая предшествующую driver queue, а не чистое
время shader/GPU. Сам оператор не изменялся.

Артефакты сохраняются на VPS и домашней машине в `temp/idle-batch/ab-696a`,
`native-696a-off`, `native-696a-on`, `cost-696a`. Сводки `native-summary.json`,
`cost-summary.json`. Старые ecba043d результаты не перезаписаны.

## Следующий изолированный кандидат: grace250ms

В `agents/680-settle-idle-grace` fast batching по-прежнему defaultOFF.
При включении первые250ms каждого нового settle выполняются строго через
исходный perTick путь, без дополнительных `syncGpu`. Только после этого при
on-time idle frame применяется прежняя ограниченная группировка16draws/2Mpx.
Timestamp принадлежит job; chained drawing→solver или следующий stroke получают
собственную паузу. Drawing/late/dead/cancel guards остаются прежними.

Цель — не добавлять barrier в обычную150ms паузу быстрых повторных штрихов,
сохранив ускорение более долгого idle. Это не обещает устранения исходного
150–183ms burst hitch. Shader/operator/film/order не изменяются.

39 targetedCPU тестов проверяют в том числе no-sync grace, переход после grace,
late-frame fallback, grace нового chained job, drawing fallback и ownership
empty recipient/cancel. Аппаратные ON negative controls этого кандидата ещё
не выполнены; предыдущий696a burst результат к нему не относится.

## Grace250 Vega QA — 2026-10-06 01:46–01:49 UTC

Source `7322a325`, тот же AMD/Chrome154/DPR1/A2 паспорт и267 source SHA.
Первыеbootstrap попытки не дошли доfixture: исходнаяформа/create timeout после
Vite restart, затем ошибка временного diagnostics driver доgoto. После CPU
коррекцииdriver и controlledretry форма/комната созданы; source не менялся.
Все рабочие cases GL0, pageerrors отсутствуют, owned Chrome закрыты finally.

Fixed65 OFF/ON: source, actualP/C/V,dryP/C,PNG byteexact; alpha>0 у83103pixels
вобоих. Wall17.6162→8.0458s, не FPS. Artifacts `ab-7322-retry2`.

Native80 dense: OFF/ON median/p95 active22.2/22.3ms, idle baseline16.7ms.
Solver idle15.7224→8.1105s; revealidle24.4398→16.8267s.
ON дополнительныйsync впервые приjobAge250.7ms (978callbacks вactive-settle).

Burst3×1.2s/150ms: OFFmax2/3=149.9/233.4ms, ON150/172.3ms.
OFFforcedcomplete CPU13.1/5.5ms, ON12.6/5.9ms (submission, неphoton latency).
Оба остаются с100+ms hitches. В ON **ноль дополнительныхsync** во всех active
фазах и первыхдвух150ms паузах;913sync толькопосле третьегоUp, минимальный
jobAge262.6ms. Это подтверждаетсохранениеbaselinepath в короткихпаузах.

ОдиночноеOFF→ON наблюдение не доказываетулучшенияburst. НовыйOFF233.4ms
показываетвариативностьbaseline: предыдущие696a ON233vsOFF183 сами по себе
не доказываютпричинноеухудшениеbatching. DefaultOFF сохранён. Длявключениянужны
чередующиесяповторыOFF/ON, минимумдвепары, и отдельныйdevice gate.

Артефакты `native-7322-off`, `native-7322-on`, `native-7322-summary.json` в
`temp/idle-batch` наVPS;raw сохранены и на домашнеймашине. Никакихreadbacks или
дополнительныхGL barriers в nativeframe loop: instrumentation толькооборачивает
существующийqueue.ctx.syncGpu дляcounter/time и восстанавливаетсяfinally.

## Чередующийся повтор ON/OFF/OFF/ON — 2026-10-06 01:58–02:02 UTC

Source7322,267SHA, прежний AMD/Chrome паспорт. Поdense80 иburst3×1.2s/150ms
в каждом режиме, итого8nativecases; толькоодин ownedChrome одновременно,
каждый finallyclosed, GL0/pageerrors0, прозрачныйink непустой. DefaultOFF.

| Метрика | ON, два повтора | OFF, два повтора |
| --- | --- | --- |
| Dense solver idle | 8.1123/8.0097s | 15.2269/15.7288s |
| Burst solver idle | 8.0134/8.0106s | 15.1215/15.3246s |
| Dense active median/p95 rAF | 22.2/22.3ms | 22.2/22.3ms |
| Burst2 max rAF | 183.3/183.3ms | 149.9/150ms |
| Burst3 max rAF | 216.8/216.6ms | 216.7/133.3ms |
| Burst LoAF max | 229.8/228.5ms | 231.7/177.7ms |

OFF extraSync0. ON sync толькопосле финальногоUp: minjobAge253.7–263.7ms;
в active и первыхдвух коротких150ms паузах extraSync0. Background после полной
готовности median16.7ms,max≤22.4ms, без>33ms, во всех8case. Нетlongtasks>200ms,
однако меньшие иLoAF существуют. Native submission/forcedcomplete неphoton latency.

Повтор подтверждаетускорениефона иотсутствиеextra barriers вкраткойпаузе, но
**не доказывает consistent-no-regression активныхburst**: ONmax здесь выше.
Это не изолированноеcausal доказательство: native rAF формирует разное числоdabs,
а IDs/seed/точноеpacing различаются; фиксированнаяsourceparity отдельная.
Поэтимданнымdefaultenable не рекомендуем иbaselinehitchне объявляем исправленным.

Raw `temp/idle-batch/repeat-7322/{pair1-on,pair1-off,pair2-off,pair2-on}`,
сводка `repeat-7322-summary.json` сохранены наVPS и домашнеймашине. Summarizer
проверяетsource/mode/GL/nonempty/finished/grace исохраняетmemory/draws/relativeFPS,
latencies/forcedsubmission/backgroundframe distributions отдельно. Прежние
артефакты7322/696a/ecba не перезаписаны; новыхзависимостей/шейдеров/моделинет.

## Нативная трасса существующих GL API — 2026-10-06 02:15 UTC

Baseline source7322, idle batching OFF, один native80 burst. Девять flags и
AMD/Chrome паспорт подтверждены. Node memory monitor: до запуска1794MiB
MemAvailable, минимум во время проверки1394MiB. Resource stop не сработал.
GL0, pageerrors0, canonical ink непустой, finally Chrome закрыт02:15:50.922UTC.

Обёрнуты существующие drawArrays/drawElements,texImage2D,createFramebuffer,
checkFramebufferStatus,copyTexSubImage2D,readPixels,finish,flush. Original this,
arguments,result,throw сохраняются; новых GL calls/barriers нет. 22189 вызовов:
ни одного>1ms, поэтому top30slow stacks пуст. В burst2/3 максимальный APIwall
для draw/tex/copy/createFB0.1ms. Учтённое время JSmetadata16.7ms за весь прогон,
ошибок observer0. Это APIwall, не чистое GPU время; overhead не вычитается из FPS.

Forced `_completeSettle` submission19.2/9.8ms при971/962 remaining ops.
В burst2 пауза rAF133.3ms (t6915.3→7048.6) включает только move1.4ms;
complete закончился раньше (t6877.2+19.2). Затем кадр83.3ms с move11.4ms.
В burst3 пауза133.3ms (t8293.1→8426.4) включает move3ms;
complete раньше (t8262.6+9.8). Затем83.3ms с move26.6ms.

Наблюдаемые100+ms паузы не находятся внутри измеренных CPU/GL API вызовов.
Очередь GPU либо compositor/frame scheduling после bulk submission — вероятное
объяснение, **ещё не доказанное GPU trace**. Не объявляем архитектурный фикс на
основании одного APItrace; не включаем idle оптимизацию. Сохранились rAF timestamps,
handler/complete timestamps, per-phase GL aggregates и memory timeline для
следующего сопоставления с GPU/compositor trace.

Артефакты: `temp/idle-batch/causal-burst-7322/{burst.json,causal-summary.json,
burst.events.jsonl,system-memory.jsonl}`. CPU scripts и SHA в `causal-native/`.
CPU proof проверяет passthrough/throw/return/30cap/restore/observer errors.

### Ограниченная CDP-трасса baseline OFF, 2026-10-06 02:21 UTC

Source7322, idleBatch OFF, те же actual9flags/AMD, native80 burst3, GL0/errors0/nonempty. Никаких дополнительных GL barriers/readbacks в измеряемом пути. OwnedChrome закрыт02:21:55UTC. Preflight MemAvailable1762MiB; монитор не остановил тест. Категории Tracing.getCategories сохранены; Node останавливает трассу через15s, buffer8MiB, outputcap16MiB. Выбранные verbose cc/gpu/toplevel категории превысили filecap: **полная JSON обрезана**, не используется для отрицания отсутствующих событий. Сохранено55430 полных событий начала трассы в `temp/idle-batch/cdp-burst-7322/trace-prefix.json`; анализ явно partial.

В первом рывке burst2 rAF6921.6→7054.8ms (133.2ms), затем7054.8→7138.2 (83.4ms), положительно присутствуют:

- CrGpuMain `GLContextEGL::MakeCurrent`6918.037ms, CPUwall104.715ms;
- CrGpuMain WebGL/CommandBuffer::Flush7029.666ms,21.991ms;
- CrGpuMain compositor `NativeViewGLSurfaceEGL:RealSwapBuffers`7074.763ms,76.902ms.

Pointerdown13.8ms, `_completeSettle`11ms (971pending), move внутри первого интервала2.7ms. MinorGC в7092.99ms занимает1.78ms. Это положительное свидетельство задержек GPU-service/driver/context-switch и swap, перекрывающих observedRAFhitches; их нельзя объяснить одним только synchronous JavaScript-handler. Это **CPUwall GPU-thread, не чистое hardwareGPUexecution и не photonlatency**. Трассировка сама заметно нагружает браузер (например первый конец штриха FireAnimationFrame62ms), поэтому её числа не подменяют исходный passthrough/nativeperfbaseline. Второйburst не покрыт сохранённым prefix; отрицательных выводов нет.

Следующая диагностическая трасса при отдельном grant должна убрать verbose scheduler/toplevel/disabled debug categories, ограничить10s и сохранить нужные timelineGC/cc/gpu/viz события без увеличения16MiB cap. Модель и defaultOFF неизменны. Root получил GPUfree и все paths.

### Узкая CDP-трасса, 02:39 UTC

Без debug/toplevel/scheduler, категории devtools.timeline/v8/cc/gpu/viz/user_timing,10s. GL0/nonempty/errors0, ownedChrome закрыт02:39:30. JSON всё равно превысил16MiB;81201 полных prefixevents покрывают performance5043–13371ms, включая оба следующих PenDown. Burst2rAF133.3/99.9ms перекрываются CrGpuMainOnAsyncFlush88.923ms(at6983.669) иSwapBuffers75.802(at7131.878). Burst3rAF138.8ms перекрывается MakeCurrent116.892(at8371.084), затемSwap67.533(at8519.549). Это повтор положительных driver/GPU-service CPUwall событий; wholetraceобрезана, absenceclaims запрещены.

CPU подготовлен lossless streaminggzip (`temp/idle-batch/cdp-native/boundedTrace.mjs`):10s/8MiBbuffer/16MiBcompressed/64MiBdecoded,256KiBIOchunks+backpressure, no wholememory. MockCDP proof458907decoded→26170compressed точногоJSON, endonce/detach/noGL PASS. Новый GPUrun требует отдельного grant. Никакого appsource/defaultenable изменения.
