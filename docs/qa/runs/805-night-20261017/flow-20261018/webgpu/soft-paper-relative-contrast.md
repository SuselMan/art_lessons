# Управление относительным контрастом мелкой бумаги

## Почему старый gain почти не управлял амплитудой

Fine pair drive зависит от отношения carrierA/affinity. При общем масштабе q→kq выражение `drive/[4*(qa+qb)]` почти не меняется: масштаб сокращается (кроме целочисленных ступеней). Старое q=1+floor((255−paper)*gain/4) приgain1и3 в основном масштабирует почти нулевую baseline. Поэтому называть gain1→3 полноценной регулировкой амплитуды зерна было неверно.

CPU контроль на actual mini-wave paper patch64×64x480/y480 (paper4..251), uniformM=[24000,12000,4000,30000],12фаз, всёwet, capacity65535:

| additive base | gain | HF RMS r2 | corr paper r2 |
|---:|---:|---:|---:|
|1|0|0|не определена|
|1|1|.19514|−.94299|
|1|3|.19817|−.94278|
|64|0|0|не определена|
|64|1|.06143|−.95546|
|64|3|.11338|−.95313|
|128|0|0|не определена|
|128|1|.03642|−.95402|

Base128/gain3 отклонён: globalmaximum319>256. Это не подгонка под nativeRMS, а проверка управляемости одного коэффициента. Все разрешённые комбинации сохраняют четыре массы, premul и capacity в CPU. Full inputSHA/patchSHA/диапазоны/sums/r4 в `soft-paper-cpu-analysis.json`. Скрипт `macro23-soft-paper-analysis.cjs` читает сохранённый6MiB input; GPU не использует.

## Новый полный prototype

`macro23-soft-paper-coherent-fine.ts`, `softPaperDefinitions`, id `wgsl-macro-soft-paper-coherent-fine`. Основа — actual fast initializer и coherent factory с прежней водой, ψ и coarse mixing; smoothFine initM/D и finepair оператор прежние. Единственное новое fine правило — явный additive base:
`q=base+floor((255−paper)*gain/4)`.

Optional FineOverrides.affinityBase проходит через macro18 к macro17. Только при explicit option изменяется единственный literal `1u` в init shader; существующий Params/uniforms не меняется, defaultsource byte-for-byte прежний. До allocation проверяется base1..256, gain0..4, base+floor(255*gain/4)≤256. Тем самым остаются прежние u32bounds и CPU доказательства pair positivity/capacity/mass.

Config controls:64/1(soft),128/1(softer),64/3(stronger),64/0(neutral), coarse256/fine12/coherentcurl128/eddy16/mobility3. Constant64/gain0 pair математически совпадает с прежнимconstant1/gain0:5krandomCPU пар подтвердили точное равенство all4outputs. Общую pipelineGPU идентичность ещё проверит оператор.

3CPU tests PASS: neutral equivalence/mass; actual wholefactory source отличается только init literal, все coarse/fine upload values и fieldSHA совпадают с fast baseline при одинаковомgain; invalid128/3 failclosed before allocation. TypeScript/lint PASS. Это новая управляемая fine affinity, не exact-output оптимизация, не художественный победитель. Старые frozen bundle и default modes не перезаписывались.
