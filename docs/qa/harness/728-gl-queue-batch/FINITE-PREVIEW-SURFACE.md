# Finite preview Surface ONE, 2026-10-09

Frozen ac5474b6, вода400→pigment70 actual Room5353, EARLY/DIRECT/FLOAT,
CURRENT_SOURCE_SPACING и FINITE включены. Raw `temp/device-runs/owner-water-dab-finite-surface.json`,
compact `owner-water-dab-finite-summary.json`, новая лента `owner-water-dab-finite-tape.json`.
Preflight2168MiB/controller2170, min923, post2071; abortfalse, собственная страница
закрыта, Surface RELEASE. GLerror0/lostfalse. Canonical/paper SHA в rawpassport.

ActualFloat32/no fallback, prewarm19267584 bytes, 13finite stages, CPUmaterial
submit total2.0ms/max.3ms (НЕGPUвремя). Dry/Undo/Redo meaningful/exact:
`90a6e5474ae444813e83790f30a1de7397f3a51f25bcde2014b81ca6eced71ab`;
undo transparent. Это только internal history, original SAME NEWtape ещё не сравнен.

UP2=30064.1ms, parentland=32342.5ms, ownland=33144.3ms. Первый preview step
30249.6ms, то есть185.5msпослеUP. Filmstrip кадры51.4/101.2/314.5/713/1213.1/2113.1ms.
Два первых полностью одинаковы; дальше maxRGBΔ123/78/76/76, >5 pixels661/3089/3178/3167.
Кадр5 сохраняет маленькое фиолетовое ядро, но выразительного широкого растекания
не видно. Не artist-ready и не доказательство гладкого морфинга.

Probe снял только undepleted MOVING P/C: P.A sum5.67254920→5.67254943,
max.368627→.028329. Эти peak нельзя называть combined-opacity/общей массой:
fixed+mobileWeight*moving не снят. Следующий offline probe добавляет actualfixed
и combined, оставаясь1.5MiB внутри прежних2MiB; старые данные не дополняются
предположениями.

## Почему finite diffusion не заменяет canonical transport

`CanonicalWatercolorSettlePlan.ts:468` готовит waterFront/cost. В700–759 carry
15/16 переносит total mobile+fixed по pressure/cost/solvent, stride path;
766–791 remobilization18 меняет mobile/fixed. 975–1018 brush pulses читают actual
immutable contact flow и P/C одновременно. Только после этого860+ идут два
smooth, core.45, puddle weighted slices и fine.

Preview берёт captured own source P/C **до** этой цепи и применяет только
13diffuse stages. Flat second-moment budget не учитывает directed carry, front
и remobilization; увеличение D не исправляет отсутствующую операцию. Следующий
кандидат должен добавить bounded visual material-front/carry с собственными
readonly wet-domain/cost inputs, не generic RGBblur, и измерить долю изменения
P/C на canonical границе pre-settle. Нынешнее малое core не доказывает ошибкуD.

После аппаратного ONE исправлено CPUaccounting: timestamps обновляются для
всех sealed clocks; неeligible получает pause и не накапливает чужое ожидание.
Новый combinedprobe/clockfix аппаратно ещё не проверялись.
