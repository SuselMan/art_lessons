# Matched actual contact payload: CPU census

Private own QA fixture `contact-hoist-6pbY2G4A-ops.json` получен read-only из Operation.data только своей тестовой комнаты; raw payload в Git не входит. Recorded IDs/strokeIds/actor/tool/layer/preset/color/packed/wet проходят exact gate относительно durable Surface паспорта. Реальные prepareDrawableRibbonDabs→prepareRibbonDelivery→brushDragContactGroups восстановили canonical input. Большой неклипующий rect разрешён исключительно после сверки всей30-element uploadFlow sequence (SHA, dimensions, order) с фактическими Surface GPU uploads: PASS. Фальшивые seed/pressure не вводились. Negative changed-pigment preset даже при тех же flow bytes отвергается full input gate.

Каждый из двух strokes:104 decoded dabs →31 drawable→30 brush travel→14 contact groups. Каждая группа имеет свой grid, поэтому цифры ниже — сумма по groups, не уникальные world pixels.

| За stroke | Count |
|---|---:|
| candidate pixel×dab tests |220514|
| Math.exp calls / inside ellipse contributions |167890|
| touched group-grid cells |100392|
| повторные contributions по touched cells |67498 (40.2%)|
| output grid cells |130280|
| совокупные3Float32 scratch allocations bytes |1563360|

Перекрытия не являются лишними одинаковыми операциями: каждый dab последовательно меняет Float32 velocity/weight, направления отличаются. Пропуск или свёртка через exp/log меняют округления и порядок смешивания. Между двумя recorded strokes геометрические flow payloads совпадают, но это не разрешение автоматически кешировать live delivery.

Benchmark: только canonical contact producer, без foreign stencil/GPU/schedule/readback. Workspace отсутствует в actual default plan (`diagnosticReuseFlowRaster=false`, нет Engine/Room setter); runner использует ту же ветку. Warm:2warmup rounds+8 alternating samples за arm, median двух strokes OFF21.33→ON20.06ms; повтор с полным identity gate22.54→20.89ms. Fresh-process3 cold samples median74.95→70.14ms, ON outlier113.60. Это небольшой CPU выигрыш с шумным cold, не доказательство Surface UP улучшения. DefaultOFF остаётся.

Canonical workload обеих operations одинаков: recorded packed/wet, travel/group/cell counts и30 flow hashes. Поэтому natural Surface second raster12.0→20.9ms нельзя приписать другому recorded количеству dabs. Его live metadata, stencil invocation/work, compilation/GC и queue effects не записывались; конкретная причина пока неизвестна. Hardware cohort имел0 uploadForeign, нельзя расширять его byteproof на foreign stencil.

Следующий узкий CPU кандидат: Float64 column memo для exact `px`, `px*c`, `-px*s` и row constants `py*s`, `py*c`, сохраняя исходные сложение/деление/Math.exp/Float32writes. Не переносить деление через сумму, не approximate exp, не пропускать contributions. Сначала100-case exact byte oracle+actual30hash matched benchmark; runtime пока не менять.
