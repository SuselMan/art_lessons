# #728: что известно о первом crossGPU расхождении

CPU-only, без новых моделей/flags/GPU. Точка world994,1231: final transparent
alpha50→126, opaque max65. Baked OFF воспроизводит тот же outlier: новый gradient
не необходим для него. Это не установление причины и не strict compatibility PASS.

## Сохранённые данные

Проверены VPS728-ring-expanded-gates/temp/regression:
`samsung-warm-same42-retry1`, `samsung-clean340-gradientOFF`, `samsung-inherited-c092`.
Во всех report.result ровно12 material records: только суммы/nonzero в target61
ROI910,455..1264,721; no per-pixel bytes, worstMaterial0, neighborhood rows0.
Значит они не покрывают1231y и не определяют даже исходный P в проблемной точке.
В этой retained VPS regression директории PGM файлов0. Любые старые PGM другого
sheet/target нельзя выдавать за seq64/65 first-stage proof. Инвентаризация SHA
сохранена private `temp/crossgpu-review/inventory.json`.

Реальные рассматриваемые original ops: water Gq9CPrzxWh/64 и pigment
 ytlRBmw3Tg/65, wash CEiuPnsbmF. Full42/41 executable, medium3508×2480;
исключён ровно reference imageYr38r8lLbf, не водный/структурный predecessor.
Journal SHA ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9.

## Точный frozen source для будущего опыта

f685fe1c33aab70618c5ee7e9522bb965e5a1cdb:

- index.ts a536c840a40957e63ec672c3702f5504c547d97f6bec3505845be8cbcaaf8577
- raster/WatercolorPasses.ts 5f54211d560869e5ee297a7f752b7f4572649b51eb6859dc681aae6650074550
- raster/WatercolorSettlePlan.ts e5ba3c89701130cd7074dc7f9779ae6eb3b6d8958869f6f2ddafe8f6585ce07d
- raster/shaders.ts 533a7346014f5bef13606dbd8a89039761978bcf700f1668cc14fcb24a92c699
- paper/paperLoader.ts 32ad79f2baf0d82be8ce308a460a5eeaec145faeb8071c48f9e8ba786fef1a6e

Старые clean340 reports имеют SAME последние4 SHA, но index SHA ad92b433…:
между340/f685 добавлены typed async option(defaultfalse) и foreignWaterSourceStart.
Не называть весь старый runtime byte-identical f685. Для следующей пары обе GPU
должны загрузить один frozen manifest, constructor gradientFibres:false.

## Capture plan: без гадания о float

Existing docs/qa/harness/728-crossgpu-neighborhood ещё не запускался hardware.
CPU5 mapping/selection/FBO-return controls PASS. Он корректно читает tiny5×5 по
actual x0,y0/S и GLbottom, но field modes только0/1/6/7/14/15/16/19 + diffuse.
Не захватывает waterFront, brushPass, stitch/fromTile/resample, modes10/11/12,
и не все optional c/d/e/path inputs. Поэтому его «first divergence» означает
лишь первый ЗАХВАЧЕННЫЙ output; входы раньше могли уже отличаться.

Минимальный опыт на обеих GPU с одинаковым manifest/full42:

1. Перед seq64, после64, перед65, после65:5×5 raw resident P/C/V/cov/composite,
   actual tile origin/buffer dimensions, nonzero guards. Если до64 уже различно —
   этот target не причина начала, следующий window переносится на предыдущий op.
2. Только в64/65 пассивно пронумеровать ВСЕ реальные pass вызовы: stitch/resample,
   front, brush, field(mode/inputs/options), diffuse и landing/fromField.
   Сохранять FBO identity и semantic label, не использовать handleID для crossGPU
   alignment. Аргументы/return/canonical clocks не менять.
3. На readback window: BEFORE все реально читаемые textures и AFTER output,
   actual uniforms/domain/UV/sampler settings. Tiny5×5 suffices only для местного
   output; для доказательства равных входов carry64 нужен clipped stencil halo,
   diffuse knight — actualradius·2. Не объявлять input-equal по5×5, если shader
   читает за ним. Сначала компактный window/ordinal, затем при необходимости
   расширенный stencil только у первого отличающегося pass.
4. Compare reject different operation/order/domain/bounds/paperSHA/keys, cap-hit
   INCOMPLETE. Pair bytes first, optical PNG second. CPU bilinear paper height
   не измеряет GPU interpolation; если PAPER input понадобится, захватить исходные
   LA bytes+sampler, не подменять unsupported LA FBO чтением RGBA.

Общий budget/owned-engine/finally и RAM проверяются перед отдельным grant. Никаких
новых source shader операторов/texture allocations/rAF performance claims здесь.
Это конкретный missing-capture plan; первый расходящийся physical pass пока неизвестен.
