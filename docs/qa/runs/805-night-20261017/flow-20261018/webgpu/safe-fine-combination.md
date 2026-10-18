# Новый safe fine ID и комбинация с подвижностью воды

`macro16-safe-fine-paper.ts` экспортирует `safeFineDefinitions`:

- `wgsl-macro-integer-safe-fine-paper`: прежний coarse macro9 + fine operator, только безопасный bytefold `%257` threshold.
- `wgsl-macro-mobility-safe-fine-paper`: тот же fine operator после macro13 `mobilitySource(gain)`, gain3 явно в metadata/config.

Старые frozen macro11 и macro10 не переписаны задним числом. Fine factory получила fourth optional `{packSourceOverride?:string;basePairSourceOverride?:string}`; безoptions прежние kernels/alloc/commands остаются. Новый finalPACK использует тот же threshold, что был математически задуман; helper не содержит remainder/division. Основное PACK деление257 остаётся и нуждается в actual GPU gate. Не называем весь integer modulo неисправным: дефект установлен только root actual probe для конкретных constant257/65792 expressions; CPU phase `%4`/`%2` и GPU другие остатки этим результатом не опровергнуты.

Fine paper transport, finalW+S gate, stationary capacity, deposited identity и ledger не меняются. Комбинированный вариант меняет coarse mobility намеренно; это отдельная физическая/феноменологическая модель, не speed optimization с исторической pixel identity.

2CPU PASS: safe/old actualfactory shaders отличаются только finalfinePACK, borrowed/own cleanup и ledger; combined actualfactory выбирает точный macro13pair и прежнийfineoperator. 3existingfine tests PASS; TypeScript/lint PASS. Реальные GPU/визуальные проверки ещё ожидаются, ошибочный старый dither не предъявляется как работоспособный.
