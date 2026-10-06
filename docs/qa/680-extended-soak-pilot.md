# Расширенный soak: остановленный пилот

06.10.2026, настоящая Vega, runtime5308/source3d582373, источники неизменны.
План20раундов/20–40мин НЕ завершён: первый корректный раунд выявил различие
сухой картинки второго автора и свежего читателя. Не выдаём91с за длинный soak.

Предыдущий пилот остановился на fixture лимите: короткий zig дал48keptdabs.
После уменьшения геометрии повтор записал8операций по28–32даба, каждая singlechunk,
двумя настоящими UI-участниками поочерёдно; затем настоящий Dry, seq8 ACK.

Первый корректный раунд: A=fresh RGBAhash, B другойhash; PNG тогданебылисохранены.
Bounded повтор сохранил все3PNG и actualJSONjournals. A/B/fresh журналы deepEXACT,
9productionflags одинаковы, GL0/lostfalse; B previews/live/queue/reveals все0.
A=fresh байтово0differentpixels. B/fresh:

-3137RGBApixels различаются, max15, meanabsolute0.0016103744 по всему PNG;
-RGB3127pixels, alpha2566;224pixels maxdiff>8;
-2975pixels находятся в маленьком zig,153 в средней линии,9 в верхней;
-2563pixels в40worldpx от поворотов,477 в10worldpx;
-0pixels в2px отtile seam; минимальное расстояние189 при TILE_SIZE1024.

Визуально отличие слабое, но неизменённый нулевой oracle не проходит. Это
локализует следующий анализ на native/peer/replay маленького zig, не доказывает
причину, floatpacking либо конкретный solver. Порог и физика не менялись.
Ни потери операций, ни пустого экспорта, ни GLошибки этот повтор не показал.
Оба собственных Chrome закрытыfinally; GPU освобождён.

Raw: домашняя680-paper-dry-replay/temp/context-loss/pilot-capture/,
локально680-context-restore/temp/context-loss/pilot-capture/. report.json содержит
полные actualoperationJSON, decodecounts/gesture/chunks,3SHApassport и ресурсы.
round-0-A/B/fresh.png — исходные canonicalPNG; rgba-diff.json — offlinePIL/numpy;
geometry.json — официальныйstrokeDabs для recordedgeometry;
compare.png — fresh/nativeB/difference×12, без изменения исходных PNG.

До следующего sourceизменения нужен bounded sourcefield/finish-context oracle
на этом exactrecordedgesture; длительный soak не должен скрывать такое
расхождение повышенным допуском.
