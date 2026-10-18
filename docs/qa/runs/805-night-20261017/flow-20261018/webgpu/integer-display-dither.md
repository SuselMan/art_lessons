# Целочисленный контроль округления macro9

`macro10-integer-dither.ts` экспортирует `integerDitherDefinitions`. Physics/pair source по умолчанию остаётся MACRO9_PAIR, меняется только PACK. Для nearest `round(255*c/65535)` заменён на `(c+t)/257`, t=hash%257; для integer half-pixel bilinear сумма имеет знаменатель65792, t=hash%65792. Единый порог всех4каналов сохраняет C≤A. Stationary literal добавляется отдельно только в уже существующей безопасной nearest ветви. Не меняются wet-domain, mixing, absorption или capacity admission.

u32 hash зависит от координат и input.seed xor805. Это display quantization dither, не физическая грануляция. Нулевые данные дают ровно0; maxima65535дают255. При полном переборе всех t среднее каждой компоненты точно равно рациональному исходному коду. Реальное поле hash имеет modulo bias (2^32 не кратно257/65792), поэтому нельзя обещать точную сумму конкретного PNG. Масса до8bit обязана остаться прежней; minor-channel итог оцениваем измерением, не гарантией.

Factory macro9 получила options четвёртым аргументом:
`{packSourceOverride?:string,pairSourceOverride?:string,packSeed?:boolean}`.
Defaults не меняют source, allocation, flags, uniforms. packSeed создаёт отдельный16-byte uniform для PACK и записывает input.seed в p.phase; четыре физические фазы остаются неизменны. Это также позволяет root exact-program подменить только pair shader.

Проверки: existing6macro9 PASS; новые3CPU PASS: полные threshold cycles обоих знаменателей/нулевой фон/premul, actual factory overrides/отдельный seed uniform/default allocation +16bytes только optin/lifecycle, отсутствие f32 и reserved WGSL names. Strict TypeScript и scopedlint PASS. Реальный компилятор и меж-GPU проверка выполняются только оператором.
