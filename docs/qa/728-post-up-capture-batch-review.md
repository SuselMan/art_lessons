# #728: Неограниченный capture после UP — CPU review

Источник чтения: root680-water-wet-tone, не изменение движка. Аппаратный
контроль source3aab: `728-pure-water-plan/temp/pure-water-plan/causal-trace/deferred-surface-3aab-pair4/report.json`.

Overlap OFF: UP88.5ms, RAF1010.2ms; ON: UP43.1ms, RAF80.5ms.
NoOverlap OFF/ON: старого job нет, UP51.1/56.8ms, RAF866.1/960.1ms.
Deferred admission поэтому не объясняет оставшуюся паузу. Эти RAF интервалы
не являются shader GPU duration или фактическим display timestamp.

Конкретный пакет без budget:

- Engine `_finishRibbonStroke` вызывает `_diffuseWashOps`/Plan.prepare до Queue.start.
- Plan.prepare получает field через ctx.fieldFor (строка199).
- Engine `_diffuseFieldFor` на reused exact-size field синхронно очищает
  десять full-field FBO a/b/c/coverage/ca/cb/cc/mask/pressure/band.
- Plan captureInputs (342–387) вновь очищает a/b/coverage/ca/cb, затем
  stitches все overlap tiles, snapshots и half-resolution resamples.
- Queue.start вызывает весь ops[0] сразу, next становится1. Одно queue unit
  содержит весь capture; число clear/copy/draw внутри unit не bounded.
- `_runSlice` ограничивает иной generator drawing path; его бюджет эту
  подготовку и ops[0] не ограничивает.

Старый70101 `surface-tail-attribution.json` показывает800.2ms worst RAF;
в окне6772.4–7572.6 единственный записанный CPU display5.1ms и next1/125.
Это подтверждает расхождение CPU submission/RAF stall, но не атрибуцию GPU
конкретно пяти clears, shader, compositor или allocation.

Одна предлагаемая абляция: на reused exact-size field в scoped Plan fieldFor
подавить только первые пять clears a/b/coverage/ca/cb. Остальные пять сохранять;
поздние capture clears сохранять полностью и немедленно. Cold allocation
не менять. Plan между fieldFor и capture только создаёт closures/descriptors
и отдельные input buffers, не читает эти пять textures. Capture first clears
precede every actual read/write of them. Нет отсрочки захвата mutable scratch,
удаления физических passes или изменения presentation.

До реализации нужны CPU command read-before-write oracle с reused/cold field,
throw/dispose и flagsOFF; затем actual same tape meaningful19 fields/wholeRGBA,
GL0, draw/clear counts и отдельно noOverlap native RAF. Пять убранных clear
могут дать небольшой либо нулевой выигрыш; неизвестную900ms причину нельзя
объявлять решённой по одному source review. Абляция не выполнена, GPU не занят.
