# #680: одинаковая жидкость, разные источники пигмента

Изолированная база c2064b58; не пользовательский стенд.

Контроль `temp/finish/small-labels/report.json`: при неизменных SHA coverage,
inkLoad, inkColor, solventLoad замена только finishContext landedWet/wetPeak
0→1 дала полностью одинаковый RGBA результат. Genuine Vega, GL0, context intact.
Это отвергает этот конкретный причинный кандидат для fullwet100, не всех режимов.

Контроль `temp/finish/equal-water/report.json`: direct100:100 против distinct
clear100:0→dry0:100, одинаковые геометрия/seed. V SHA идентичен, r/a369294,
g/b0. Material P/depth969232→980769 (+1.19%), material.r969232→0;
coverage alpha1569196→1610672 (+2.64%). Финальные7535px различаются, max236.
Таким образом одинаковая V ещё не даёт одинаковый материальный источник.

Фактические preset функции: pigment run dry8/wet80, rate2.4/1.2;
run×rate19.2/96 (пятикратная разница). Комментарий о равном бюджете устарел.
Новая default-off diagnosticPigmentFluidDose меняет только аргумент run/rate:
profile.waterLevel→availableHere, не pigUsed/pigLevel/pickup/V/геометрию.
При меняющейся доступной воде экспонента может увеличить остаток: это
диагностическая абляция однородно мокрой пары, не консервативный reservoir.

Большой первый actual15 запуск stalled на перегруженном домашнем хосте;
результата нет. Не считается доказательством ошибки движка. Новый harness
убрал snapshot retention/fulltilebase64, считает SHA в странице и имеет
внешний90sec wall deadline с закрытием только собственного Chrome.

## Причинная абляция P-source

`temp/finish/dose-pair/report.json`, 4 genuineVega cases GL0/lostfalse:
full100 direct P/depth969232 unchanged OFF/ON; explicit dry-on-water
980769→969232. V369294 exact. Direct PNG unchanged0px; residual
between origins7535→6661px, max236. Не полное визуальное совпадение.

`temp/finish/dose15/report.json`, 6 cases GL0/lostfalse:
15% direct P143589/depth957956 unchanged; explicit P153026→143589,
depth972191→957956. Residual7361→5236px, max123. Dry-on-dry
P148574/depth671166 и PNG exact OFF/ON. Chrome closed finally.

Оставшиеся nominal-water ветви не изменены: ink.r, brushTravel gate,
halo solver bounds. В shaders wcTransportField читает a.r/a.a (1208),
composite читает ink.r/ink.a (1627). Их активность/эффект требуют отдельных AB.
Следующий безопасный clock — accumulated hazard Δused/run(available),
remaining exp(-H); не восстанавливает израсходованный остаток dry→wet.

## Монотонный clock

Следующий кандидат сохраняет default-off switch, но вместо instantaneous
exp(-used/run) накапливает H += max(ΔpigUsed,0)/run(availableHere).
Remaining exp(-H); переход dry→wet не возвращает потраченную краску.
Clock входит в scratch scalars snapshot/spill/restore, сбрасывается beginStroke
и destroy. Фактический max(rate×run)96.266666… приwater17/18, не96.

CPU4 meaningful tests PASS: постоянная среда/partition identity, no recovery,
переменная среда finite upper bound, scratch snapshotrestore/reset.
GenuineVega `temp/finish/hazard100` + `hazard15`,10cases GL0/lostfalse;
все PNG RGBAexact диагностической instantaneous формуле на этих постоянных
средах. App typecheck PASS. **GPU native/live partition и меняющийся wet-field
ещё не проверены**; CPUpartition не заменяет slicing invariance движка.
