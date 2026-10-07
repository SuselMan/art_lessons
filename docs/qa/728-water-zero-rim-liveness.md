# #728: zero-pigment rim — dependency proof (CEA6eff7)

Диагностика OFF. Разрешение захватывается один раз: purePlan && strong caller
proof && scratch.pigmentInputsKnownZero && diagnosticSkipZeroPigmentRim.
Preset pigment0, colour=false или пустой список paints разрешения не дают.

| Команда | Читает | Пишет | Нужный downstream consumer |
|---|---|---|---|
| outward seed mode10 | mobile P, coverage | pressure | outward unit relaxation |
| outward waterFront | cost/src, coverage, paper, foreign water | pingpong COST | следующие outward и mode11 |
| mode11 | coverage, **outward pressure** | tmp | копия tmp→coverage |
| inward seed12 + unit front | outward pressure, old band, coverage, paper | mask/tmp COST | band mode6 только |
| band6 + gather5 | mask/pressure/coverage | band/mask COST | pigment rim/carry/tide |
| zero groupTide seed19/front/band6/gather5 | coverage/paper | mask/pressure/band/free COST | pigment tide7/14; при fullzero они уже отсутствуют |
| zero groupTide clear | — | outDep/outCol | dry pigment landing |

На pure ветке нет carry/diffuse/contact/streak/fibres — не существует читателя
inward mask/band из pigment path. Outward остаётся с теми же unit strides,
исходными operands и последовательностью RGBA8 writes. Mode11 не читает mask,
band или собранную rim. Отложенное расширение coverage не зависит от этих полей.

Land при S1 заменяет mask копией текущего tile coverage, затем band mode20
(max(field.coverage, mask)) и copyback. При S>1 mode2 wcResample читает только
field.coverage и tile coverage. Поэтому прежняя inward mask/band не участвует.
Source running-film replay выполняется после land с собственными captured
commands; прямого sampler pressure/band/mask в этих командах нет.

GroupTide при zero пишет только временные COST и затем clear dryP/C. Возвращаем
тот же dryP/C clear без предшествующего COST. Реальная UI Dry вне prepare остаётся
неизменной, default аргумент false. Нулевые/отсутствующие snapshots не угадываем.

Ограничение: итоговые диагностические COST bytes намеренно могут отличаться.
CPU tests сравнивают полные outward аргументы и mode10/mode11/mode20 operands,
не только число вызовов. Они не заменяют hardware V/coverage/P/C/solvent/source
SHA и pure→pigment следующего полного поля. Off/negative command traces unchanged.
До аппаратного gate ни defaultON, ни performance claim.

## Mode20 и область чтения

Shader high mode20 выполняет `gl_FragColor=max(a,b); return;` для всех RGBA.
`u_a=field.coverage`, `u_b=field.mask`. Field.mask в каждом copied overlap
заново получает entry.coverage. `u_c/u_d` и прежний output band не читаются.
Pass.fieldOp использует beginReplaceDraw → BLEND disabled, поэтому destination
не участвует в source-over. Band полностью перезаписывается shader draw, а в
entry.coverage возвращается только подготовленный overlap. Части mask вне overlap
не объявляются доказанно равными: обязательный hardware fullcoverage SHA ловит
ошибки координат/границ. При half-res mode2 resample использует coverage/base,
не band/mask/pressure. CompositeDomain рассчитывается до scheduling и неизменен.

Captured initial next-op заново clears/loads P/C/coverage/solvent. Его ordinary
front mode10/12 перезаписывают cost до reads. При running film команда source-rebase
замкнута на ink/stroke/base/solvent/coverage entry buffers, не на SettleField cost.

## CPU результаты

База CEA6eff7; diagnostic OFF. `WatercolorSettlePlan.test.ts`: 86 PASS/19.08s
(новые6 сценариев: group/op dry,3 negative gates, captured permission).
Новый strict outward assertion на неизменном CEA source: **2 FAIL**,84 skipped,
3.30s; старый source действительно выполняет лишние inward/tide front calls.
Исходник после counterexample восстановлен точно, runtime stand не изменялся.
Web TS PASS, oxlint PASS, diffcheck PASS; реальные существующие deps680-device-qa-guards.
Raw: `temp/pure-water-plan/causal-trace/rim-{tests,old-counterexample,types,lint}.log`.

Аппаратный эксперимент ещё не выполнялся. Нужны same-tape full P/C/V/coverage,
solvent/source/dryCol, half-res и следующий пигмент до defaultON. CPU совпадение
операторов не доказывает пиксельную точность, скорость или плавность.
