# Диагностическая политика расхода воды (#680)

Отдельный эксперимент поверх c3b128ec, V accounting не меняется. Dev-only
`diagnosticWaterPolicy`: legacy (старое pigment-gated depletion), finite (вода
истощается и у чистой, и у цветной кисти), bottomless (вода не истощается ни у
чистой, ни у цветной кисти). Pigment budget/clock не меняются. Pickup использует
contact-before; после доставки water availability может физически изменить
wetPull и дозу пигмента. Это source-water абляция, не fixed-P origin тест.

На genuine Vega natural actual15 direct48 vs prewater47→48:

| Policy | Direct water tail | Direct source P.b | Prewater source P.b | Direct V sum | Prewater V sum |
|---|---:|---:|---:|---:|---:|
| legacy |0.062846|2112034|2180193|46852.47|165958.62|
| bottomless |1|2179069|2180193|84567.91|165958.62|
| finite |0.062846|2112034|2180193|46852.47|144127.65|

V sum — loaded-contact pixel units, P.b — sum RGBA8 codes, не произвольные
absolute grams. Source depth.a совпадает с P.b. Bottomlessdirect descriptor6.806811
совпадает с prewater descriptor; actual integrated P source отличается0.052%.
Предварительная вода остаётся визуально неизменной legacy→bottomless; direct
перестаёт иметь выраженный мраморный истощённый хвост и становится значительно
ближе приятному prewater виду. V prewater≈1.96×direct, поэтому pixel identity не
обещается. После settle P кодовая масса всё ещё слегка теряется при transport.

Natural harness пересчитывает pigment op wet из actual PaperWetness после source
waterpolicy delivery, на fresh timestamp. Original ops не переписываются,
generatedWet отдельно в report. Prewater finite всё ещё samples 'e'209dabs,
waterpickup сохраняет brushWater1; finite policy поэтому не решает direct tail.
Historical same-op-wet cases — отдельный causal input контроль. Geometry-matched
prewater fixtures используют те же209dabs, что pigment48; original water47 имеет66.

В этом диагностическом варианте bottomless действует на любой waterlevel.
Для дальнейшего usercandidate обсуждена explicit независимая от пигмента policy:
100% воды bottomless, менее100% finite у чистой и цветной кисти. Это отдельный
brushmodel choice, не скрытое утверждение о conservation жидкости.

Стенд5297 изолирован;5296 frozen. Диагностика temp/policy/qa.mjs и cases.json:
только source/final V/P/depth stats и PNG, без fulltile basefilm base64 snapshots.

Полный15-case policy GPU прогон завершился: GL0/contextlost false во всех,
Chrome закрыт. Typecheck/lint/map:rules прошли (исторические предупреждения).
