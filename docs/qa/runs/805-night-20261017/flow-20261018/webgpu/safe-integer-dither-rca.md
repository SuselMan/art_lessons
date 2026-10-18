# Отрицательный V10 PACK и точный bytefold-контроль

V10 actual integer dither НЕ прошёл численную проверку: operator наблюдал alpha ratio3.74647 на drop, резкое усиление minor channel и ненулевой дальний фон. Сохранённый старый macro10 не исправляется задним числом. Его CPU математические тесты не подтверждают корректность driver compilation.

Последующий actual GPU probe root на16384значениях сообщил8180ошибок для наблюдаемой constant `%65792` цепочки и столько же для `%257`; в случаях нарушения `(0+remainder)/D` давало1. Сам u32 hash и quotient n/D совпали с CPU. Uniform-divisor варианты обоих знаменателей и constant65536 прошли. Это локализует конкретные проверенные shader/compiler expression paths; нельзя обобщать «весь constant modulo на WebGPU сломан» или считать диагноз универсальным для всех GPU.

## Новый отдельный macro15

`macro15-safe-integer-dither.ts`, экспорт `safeIntegerDitherDefinitions`, id `wgsl-macro-integer-smooth-safe-dither`. Динамические pair shader и state untouched. PACK заменяет только две remainder expressions на точные integer bytefold helpers. Никакой epsilon, смещения распределения или понижения качества.

Для u32 n с байтами b0..b3 имеем256≡−1 mod257:
`r=b0+b2+514−b1−b3`, диапазон4..1024.
Три условных вычитания257 дают точный остаток0..256. Для D65792=256*257:
`n mod65792 = 256*((n>>8) mod257)+(n&255)`.
Helpers не содержат `/` или `%`, только bounded u32 add/sub/shift/compare. Intermediate unsigned underflow отсутствует: минимум4. Shared RGBA threshold и общий hash остаются прежними; denominator final PACK деление остаётся и проверяется отдельно.

CPU3PASS: весь alternating-sum диапазон4..1024, миллион full-u32 против точного JS remainder, крайние числа/zeroquant/границы/отсутствие reserved и float, actual factory compile source+неизменныйpair+отдельныйseeduniform+lifecycle. Strict TypeScript и lint PASS. Эти проверки готовят GPU gate, а не заменяют actual compiler verification.

Для SAFE GPU gate нужно сначала probe bytefold mode2, затем полныйsame-input PNG/mass/zero-background/повторSHA/cross-device. Fine variant пока содержит прежний `%257` и должен либо оставаться помеченным отрицательным/непроверенным, либо получить отдельный новый safe-PACK ID. Нельзя молча переписать frozen V12.
