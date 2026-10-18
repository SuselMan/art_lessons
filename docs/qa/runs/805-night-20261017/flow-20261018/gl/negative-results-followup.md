# Негативные результаты и один полезный reconstruction result

Read-only сводка сохранённых операторских proof; новых запусков/GPU/моделей нет. Технический PASS означает прохождение указанных guard/repeat/source checks, а не художественное принятие. Исходные bundle/input SHA, hardware и параметры остаются в связанных JSON; ниже не смешиваются разные границы времени.

| Вариант | Технический результат | Практический вывод на проверенных сценах |
|---|---|---|
|35 source-detail affinity | gain0 fullRGBA exact31, coarse/field/fine-ledger controls проходят; gains1/2 действительно меняют derived fine-paper SHA и пиксели | Новый cue работает, но заметной художественной пользы root не увидел; высокая цена upload/totalReady. Не продвигать как улучшение/оптимизацию. |
|33 single-pair DT4 | WholeRGBA и coarse4 exact controls, canonical endpoint/mapping/source proof | Balanced paused runToDependent хуже во всех6fixture×family парах. Меньше вычисленных пар не равно быстрее на этом GPU/compiler. |
|32 bounded pressure | Реальная pressure-only overshoot-проблема исправлена в доказанной области; device ledger/repeat/guards проходят | По визуальному review root после V28 горизонтально-вертикальные bands остаются. Не выдавать исправление одного компонента за устранение всего coarse-grid/splitting эффекта. |
|36 capacity-aware fine | Coarse evolution unchanged; fine0→fine4 integer sums точны внутри каждой policy | На stationary-a254/a255 заметно уменьшается final representation loss; полезный положительный диагностический результат. Это не глобальное сохранение encoded mass для произвольного изображения и не доказательство художественной победы. |

##35: expensive upload, не измеренный «CPU derive140–221ms»

[Gain0 control](../../measurements/flow20261018/functional-v31-source-detail-control-proof.json): fullRGBAExactGain0, allCoarseFineFieldExact, derivedPaperExactOriginal=true на mini. При этом контрольные warm medians31/35gain0 отличаются118.60/110.75ms: один fixed-order короткий прогон не является speedup proof, byte equality — отдельный факт.

[Quality arm](../../measurements/flow20261018/functional-v31-source-detail-quality-proof.json), gains1/2 × mini/sheets3/4/12: warmMedian **totalReady140.55–221.40ms**, не чистаяCPU derivation. В warm samples uploadJs80.2–215.6ms включает CPUderive+SHA+исходный reducer+GPUwrite wait; runToDependent44.8–53.0ms также не чистый GPU timestamp. Отдельного on-device таймера чистой derivation нет. VPS Node CPU-only witness59.7–98.0ms не переносится как phone measurement. Поэтому корректная формулировка: дорогая подготовка/полная готовность при малой замеченной визуальной пользе, а не «phone CPU paper140–221ms».

Derived SHA совпадает с CPU fixture witness, original base input preserved; это реальное изменение cue, не игнорируемая config. Но sourceDetail работает локально по alpha, не восстанавливает потерянные RGB/цветовые детали; body/кромку root оценил как слабо изменившиеся. Визуальная оценка здесь — сообщённый root review, не формальный pixel-art score и не самостоятельный просмотр автором этой сводки.

##33: exact-but-slower отрицательный результат

[Balanced paused timing](../../measurements/flow20261018/functional-v29-single-pair-timing-proof.json) содержит ABBA/BAAB, четыре warm samples после фактических5s пауз на model/fixture плюс cold samples. Все outputs/coarse4 exact. Медианы runToDependent old→singlePair:

| Scene | Lite, ms | Fine4, ms |
|---|---:|---:|
|mini|25.15→29.80|35.85→41.60|
|two-strokes|27.20→31.00|36.85→43.20|
|sheet12|25.95→31.65|38.65→44.20|

TotalReady включает шумящий upload: miniLite82.75→74.95ms не отменяет отрицательное наблюдение compute-dependent boundary. Не называть wait чистым GPU и не обобщать33 на coalesced38 или quotient40: у них собственные source/layout/driver последствия и отдельные проверки. [Numeric smoke](../../measurements/flow20261018/functional-v29-single-pair-smoke-proof.json) остаётся полезным точным контролем.

##32: proved scalar bound не равно visual fix

[Device proof](../../measurements/flow20261018/functional-v28-pressure-proof.json)8cases: passes/errors/repeat/ledger guards. Его all4CoarseExact — инвариант all-channel conservation, **не равенство старым30outputs**. Timing arm fixed-order quality, не balanced speed A/B. Root visual review сообщил оставшиеся axis bands; численного no-banding oracle нет. Fine blur может скрывать coarse ступени и не устраняет причину. Head-bound относится к pressure transfer до curl/absorption; coarse8px grid и редкая H0/V0/H1/V1 alternation приDT4 остаются.37/CFL иDT2 — отдельные уже запланированные сравнения, не заранее объявленный ответ.

##36: positive reconstruction witness, limited scope

[Paired reconstruction proof](../../measurements/flow20261018/functional-v31-reconstruction-proof.json): a255 fine4 alphaRatio **.9925382643→.9994644039** old31→new36; a254 **.9929677278→.9994710522**. a255 fine0 также .9925244762→.9994582230, поэтому основной эффект — reconstruction selection, не четыре fine exchange. Coarse4AllExact=true, fine0/fine4 ledger sums совпадают **внутри** old и new policies; old/new initialized fine sums отличаются. Это signed representation change, не исправление физических потерь solver.

a128 примерно прежний (.99960699→.99960461), sheet12 fine4 улучшается лишь .99745281→.99794283. Нельзя объявлять универсальную «массу починили» или все RGB ratios=1; разные каналы/квантование остаются. Fine4 оставляет отдельные compute/буферы;41 переносит capacity selector в Lite PACK как самостоятельный будущий контроль, его результат на момент записи **pending**, не наследует автоматически36numbers. Никаких новых вариантов для этой сводки не добавлено.

Остаточных процессов/устройств/сервисов автором сводки не создано. Браузерные context lifecycle ведёт sole GPU operator в исходных proof.
