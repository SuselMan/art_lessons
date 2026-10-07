# #728: прямой half-resolution copy-back

Кандидат `diagnosticDirectResample` выключен по умолчанию. Включение:
`engine._settlePlan.diagnosticDirectResample = true`.

Mode1 wcResample вычисляет base + up(new) − up(old) и пишет RGBA8 в rect.
Исходная цепочка — draw в tile-sized temporary, затем побайтная GL copy rect
в target. Если target не совпадает ни с одним из трёх sampler buffers, можно
провести тот же draw непосредственно в target: те же dimensions, framebuffer
format, scissor, origins, clamp, shader и промежуточная Q8 запись. За пределами
rect target остаётся нетронутым. При любой object alias остаётся исходная цепочка.
AccumulationBuffer владеет собственной texture, её имена не делятся между buffers.

Это сокращает одну pool acquire/release и copy rect на каждый eligible landing.
Не меняет solver, число diffusion iterations, контакты или scheduler. В preview
новые load/chroma отличаются от sampled base; при finish с snapshot тоже может
быть eligible. Final dry с base==target и coverage mode2 здесь не оптимизируются.

Счётчики `resampleLandingStats`: direct, temporary, copyPixelsAvoided. Для RGBA8
приблизительно 8×copyPixelsAvoided байт read/write traffic больше не требуется;
точная стоимость драйвера/ускорение по времени до A/B неизвестны.

Аппаратный gate: сравнить все final material records и exported PNG побайтно с
OFF, снять counters в одинаковом brush400 сценарии, undo/redo, fresh/reused pool,
двухцветное смешение и остановку через zoom/newFilm. Проверить GL0/context alive.
На каждом GPU сравнивать candidate с его baseline, а не требовать точного
совпадения разных GPU между собой. Учесть framebuffer dither/compiler behavior.
