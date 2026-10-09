# ONE angular residual diagnostic

Аппаратный запуск пока не выполнен. CPU фикстуры времени не являются Surface замерами.

Frozen input: actual owner2 composite recipe, source epoch, point; operationTape с записанными dab seeds; SHA исходников, бумаги и shared bilinear. Uniforms диагностического raw shader равны runtime source/init/current mobile/current fixed/mobileWeight перед material. Политика authoritative не меняется; диагностический GPU readback нарушает обычную плавность и не подходит для FPS benchmark.

Выход: четыре строки requested0/300/1000/2000 плюс реальные at/elapsed. Для P/C всех RGBA — raw sum, projected clipped sum, count отрицательных, negativeClampAdded и upperClampRemoved. По радиусам0–4/4–12/12–32/32–64 — clipped-positive alpha mass и h4/h8; отдельно signed raw mass, absolute raw mass, raw h4/h8 (нормализация absolute mass). Центр берётся из actual point/8, Y перевёрнут из world в texture.

Всего retained binary ровно0.5MiB: последние actual raw P/C по256KiB; промежуточные пары заменяются после вычисления статистики. Эти binary принадлежат disposable каталогу; после анализа оставить компактные данные и только нужные доказательства. `analyzeAngularPair.mjs p.bin c.bin centerX centerY` печатает SHA и проверяет формат/размер.

Проверки отдельно: whole t0 exact уже PASS; negative clamp GPU attribution OPEN; угловая анимация OPEN; same-packed canonical OFF/ON OPEN. Публикационный handoff требует actual owner2 land и canonical pending=false без settle/rebuild, затем три фактических кадра. Исторический parent1 land с pending=true не закрывает этот пункт. Undo/redo equality проверяет историю, не OFF/ON physics parity.
