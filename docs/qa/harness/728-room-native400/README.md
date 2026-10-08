# OFFLINE ordinary native Room400 gate

**Не запускался на устройстве.** Runtimea83/fa86 не изменены. Root выделяет слот
и замороженную сборку отдельно; source head/passports должны соответствовать
именно runtime, а не HEAD контроллера. RAM1700/500 и INIT120s сохранены.

Используются те же env, что у `728-room-native-first`. QA_SCENARIO=first400:
пигмент400 world300→360. Только после PASS новый fresh run QA_SCENARIO=
water-pigment400: вода400 по той же линии → пигмент400 в центре. Геометрия внутри
origin-zero1024 tile (центр300+, радиус200); реальный resolver может всё равно
явно отклонить расширенные bounds — не подменяем плитки/масштаб или guards.

Обычный cohort QA_CAPTURE_FIELDS=0 сохраняет source trace, actual packed tape,
GL live/final visibility, final export. **Отдельный diagnostic cohort**
QA_CAPTURE_FIELDS=1 читает AFTER idle все owner tile roles, текущие1536 settle
roles и foreign auxiliary solvent roles последовательно: dimensions, sums,
nonzero, max, SHA. Один readback resident за раз, aggregate cap256MiB. Его
дополнительное ожидание между водой и пигментом может изменить live wet sampling;
поэтому это не unperturbed timing/physical latency и не доказательство отсутствия
transient400 bug. До чтения idle обязателен, released buffers вызывают FAIL.

Water-only diagnostic требует настоящие P.B ==0 (Rwater/Gwet/Aamount могут быть положительными), C-поля все RGBA ==0 и solventLoad nonempty;
отсутствующие P-поля не дают ложного PASS. Final material hash и все owner field
hashes описывают конкретное исполнение, не parity сами по себе. Смена scratch
может удалить прежние роли: отсутствия сохранены явно.

## Следующий честный source parity

Сначала сохранить original packed StrokeOperations (dabsPacked, wet, preset,
seed/wash/actor/time) из unperturbed actual native Room. В двух свежих serial
owners на одной Fine2048 paper, том же1024origin-zero tile и production1536
planner replay **тот же packed tape**, не заново вводить перо. Native replay vs
native author проверяет chunk/provenance. GL replay должен использовать actual
PencilEngine appendOperation, без cached Room snapshot; native replay — тот же
existing engine native routing. Финальный decoded whole/material и matched role
поля сравнить по GL-bottom row convention; slot roles/числа операций не путать.

Затем отдельный first-divergence cohort: source cov/P/C/V на finish-before-settle,
identical planner metadata, front seed/pressure/coverage, prediffuse, final.
Для сравнения исходной source geometry перехватить immutable prepared delivery
один раз и одинаковую последовательность phases в обоих backends; **не** заново
prepare per tile. В прошлом bounded gate source RGBA расходился на1Q8 и
усиливался на thresholds; текущий ordinary Room parity пока не проверен.
Stage readbacks меняют cadence; нельзя ими маскировать400 unperturbed bug.

Offline checks: `node --check .../controller.mjs` и
`node --test docs/qa/harness/728-room-native400/capture-fields.test.mjs`.

Packing source proof: WebGL shaders.ts1448 and587 encode P=(amount*water, amount*wet, amount*strength, amount); native stamp.ts49/deposit paint match. Old allRGBA P0 FAIL is INVALID ORACLE, not model defect. Failed records now persist before controller rejects.
