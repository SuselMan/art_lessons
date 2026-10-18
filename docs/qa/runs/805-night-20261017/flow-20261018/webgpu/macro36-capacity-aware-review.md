# Macro36: свободная ёмкость вместо любого stationary как запрета BLR

Изолированный новый ID `wgsl-macro-capacity-aware-fine`, export capacityAwareFineDefinitions. Shared11/17/18/31 не меняются. Actual coherent physicalDtSource4 +fast CPUinitializer, e8/c64/base64/paper1, compact aux/carrier, fine0/4. Изменён **только выбор M/D в INIT**: всегда вычислить floorBLRM/D; использовать их при `257*literalA+biM.a+biD.a<=65535`, иначе исходные nearestM/D. Остальные guard/Wgate/fineD/packet/PACK/sourcefield неизменны; affinity source literal меняется лишь на явно выбранный base64, точно как old31sameconfig.

## Почему ограничено

При valid coarse totalM.a+D.a≤65535 независимые floorBLRM/D имеют сумму≤weightedtotal≤65535, сохраняют premul. Для literal0 это всегда прежний BLR — точный прежний выбор только на этапе INIT данного пикселя. На смешанном изображении конечные nonstationary pixels могут измениться из-за fine exchange с изменёнными соседями. Wholeoutput exact следует лишь если literal отсутствуют вообще во всём изображении. Для opaque255 свободная ёмкость0; nearestcoarsecap0 даётM/D0, BLR выбирается только если также0 — opaque неизменен. Частично сухие/непрозрачные literals могут получить новый мокрый носитель при наличии свободной ёмкости; это разрешено текущим dynamic contract, а не неизменяемая сухая стенка.

`fixedAlpha` и auxfree используют **выбранный** D.a, поэтому initialM помещается в свободный residualcapacity. Fine packet остаётся ограниченнымэтойёмкостью. Shared-threshold PACK с последующим добавлением literal сохраняетRGB≤A≤255 безclamp. Еслиnearestfallback не помещается — исходныйguard срабатывает, не выполняется скрытыйrepair.

Это **не глобальное сохранение представления**: selectionmask зависит от локальных данных иёмкости, разрушая columnsum argument общегоbilinear. Замена может как увеличить, так и уменьшить globalM/D sums по отношениюoldnearest. Простой witness: near0→BLRA40 подliteral64 даёт+40; nearA40→BLRA20 даёт−20, обаfit. Coarseledger проверяет solverstate, не это изменение fineinitialization; finepair сохраняет четыре канала только внутри новой инициализации. FinalRGBA8 quantization добавляет свою отдельную погрешность.

## Причина реального наблюдения и ограничения

В a254/a255 fixtures каждый из64anchors может freeze целый8×8coarsecell: до4032wetpixels переносятся вstationary вместе с64anchors. Старый запрет BLR на **любой** stationaryslot действует на все4096slots, не только на64opaqueточки. Новая политика разрешаетBLR у частичнонепрозрачных frozenwetpixels при достаточнойёмкости; anchor255 остаётсяnearest0. Это правдоподобный механизм уменьшения observedrepresentationloss, **не измеренное исправление**. Приa128 ячейки могут вообще неfreeze, поэтому это отдельный контроль, а не предположениео том же механизме.

100k independentCPU selections PASS: bounds/premul, nonstationary/opaque oldexact, accepted/fallback; sourcebacktransform восстанавливает исходныйMACRO17INIT дословно кромеaffinityliteral. Actual old31/new36 factories имеют идентичные всеnonINITshaders, uploads/ψ, размерыcompactplanes, числоdispatches дляfine0/4 иlifecyclecleanup. WGSLreservednames/escapes clean; строгийTypeScript/scopedoxlint0. GPUcompiler/device ещё не проверены.

GPU план16cases old31/new36×fine0/4×a128/a254/a255/gallery12. Сравнивать raw4sums/alphaRatio иизображения, opaqueexact/partialliteral lowerbounds, fineledger, coarse/sourceSHA. Не объявлять победой только приближениеalphaRatioк1. Если mini содержитstationary, егоfullRGBAexactне следуетизnonstationaryproof; сначалаизмеритьmaskcondition.
