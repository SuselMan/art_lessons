# Один opt-in host неподвижной лужи — B-lite

ID `wgsl-fixed-wet-b-lite-coherent`, единственный preset `{fineSteps:12}`. Допустимы кратные четырём 4..32; остальные ключи отвергаются до GPU allocation. Это новая политика/модель, **не исправление всех исторических алгоритмов**, не заявление о качестве или скорости. GPU ещё не запускался.

## Настоящий путь материала

`webgpu/fixed-wet-b-lite.ts` сохраняет исходный carrier и маску: `raw water > 0` разрешает обмен; W0 сохраняет исходный RGBA буквально. RGB>A несовместим с этим bounded common-carrier host и явно отвергается; старое предупреждение о семи пикселях sheet7 относится к иной capture/provenance. QA перепроверил все 30 текущих frozen inputs: RGB>A=0 (sheet7 SHA2638edf9…). Эти входы не требуют adapter; общий validator остаётся failclosed, без clamp.

Полный мокрый 8×8 cell входит в bulk. Частично мокрый cell не входит в coarse пигмент вообще: его мокрые raw пиксели позднее входят в fine M без уменьшения и без stationary freeze. Сухой raw пигмент находится только в literal. Bulk/partial/dry — непересекающееся разбиение. Вода всех coarse cells сохраняет исходную редукцию; новый gate запрещает pair flux, если хотя бы один cell не full-wet. Локальное W→S/M→D поглощение остаётся. Coarse использует actual physicalDtSource(3,4), e8/c64, 64 фазы; добавляется только этот gate. Stream ψ действительно вычисляет существующая coherent factory.

После bulk fine INIT распределяет coarse M/D по owner cell, добавляет исходный partial-wet M; dry M/D строго нулевые. Затем 12 фаз shared-component quartermix (H-even,H-odd,V-even,V-odd), каждый face требует два original-wet пикселя. Один capacity-limited коэффициент применяется ко всем RGBA; одинаковая alpha не запрещает RGB смешение. Fine D остаётся неподвижным. PACK читает только fine M+D и dry literal; нет bilerp, выходной PNG-маски или вычитания утекшей массы.

Это ограниченный B-lite: partial boundary не участвует в раннем coarse переносе, только в обязательном fine обмене; начальный owner-nearest bulk может оставлять cell-рисунок. Paper affinity пока отсутствует. Результат и характер края требуют GPU проверки, затем просмотра.

## Ledger и владение

`partition` содержит четыре суммы raw bulk/boundary/literal и известный `quantizationDelta`: coarse average округляется; его физическая масса не объявляется точной исходной. `fineLedger` после actual mapped M/D содержит четыре `totals`, `expected = 64*finalCoarseRGBA + rawBoundary`, `delta`, `conserved`, число capacity/premul нарушений и `dryChanged` по output bytes. Coarse ledger — существующий actual readback. Byte PACK округление отдельно от prequant ledger. Immutable-kind доказано readonly bindings/source и единственным upload writer; отдельного GPU kind readback нет.

Base владеет states, stationary, output и своими staging. Новый host лишь заимствует эти handles; уничтожает только собственные buffers и вызывает base.destroy один раз. На pipeline/allocation throw очищает уже созданное. run публикует output только после fine command submission; base intermediate PACK остаётся redundant, но не отдаётся наружу. Устройство и command submission остаются у caller; concurrent destroy во время await upload/readback и device loss этим CPU mock не доказаны.

Собственные GPU buffers: M0/M1 16 MiB, D 8 MiB, immutable kind 4 MiB, raw boundary source 4 MiB, diagnostic fine staging 16 MiB, uniforms 64 B — **48 MiB + 64 B**, включая staging. Base ~14.5 MiB + 64 B; итого ~62.5 MiB, без driver overhead. CPU prepared arrays ~13 MiB плюс caller input, временные mapped/readback копии и allocations; это не бесплатный Lite. 64 coarse + 1 redundant base PACK + INIT +12 fine+PACK =79 dispatches.

## Проверки и следующий gate

7 CPU math tests (включая 100k occupied-D пары), 5 actual-factory/source/ownership mock tests PASS. Strict TypeScript всего registry и config contract PASS. CPU mock не компилирует WGSL, не доказывает реальную GPU arithmetic/driver/cancel correctness. Узкий следующий operator gate: thin1/2/7 equal-alpha RGB, bulk↔partial, dry/water-only, wall/diagonal/isolated; затем mini-wave и sheet12. Проверять output raw, all4 prequant totals, dry literal и immutable input SHA; не только PNG. Старые IDs/default shaders не изменены.
