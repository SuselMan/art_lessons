# Smooth128 inverse warp: только предложение

Radial synthetic oracle `radialInverseWarpOracle.mjs`: source1024, мокрый диск R240, smooth injective map сохраняет boundary и имеет математический identity при scale1. Scale5 без determinant создаёт примерно23.65× массу; с inverse determinant общая масса314.159 сохраняется. Смесь65% фиксированного source +35% перевезённого conservatively source также сохраняет массу и заметный центр. Это условная аналитическая модель, не фактическая GPU анимация и не новая физика.

Плюс: нет high-source minus blurred-low residual, поэтому отрицательная разность и clamp-induced пустая кольцевая зона не нужны. P/C семплируются одним inverse warp и умножаются одним положительным determinant, что сохраняет их отношение.

Обязательные условия: Jacobiandet>0 без складок; source и destination в той же связной мокрой области; displacement не перескакивает сухой промежуток; boundary map и sampler clamps не создают/удаляют массу. Float128 bilinear displacement нужно дифференцировать тем же правилом, а не приближать произвольным соседним детерминантом. При нескольких source reservoirs однозначный warp ограничивает mixing: нужны отдельные conservative remap contributions, и это уже усложнение.

Ограничения: расширение области неизбежно уменьшает центральную плотность. Простое растягивание с сохранением исходной непрозрачности размножает пигмент. В нашем radial map determinant у boundary падает до0.00125: поле с краской на самом boundary может давать чрезмерную компрессию, даже когда голая Gaussian там пренебрежима. Real raster finite-volume remap/boundary mask нужен для массы; аналитический oracle не доказывает его. Affine/radial warp нельзя молча объявлять решением общего рисунка.

Текущий actual angular diagnostic остаётся подготовленным; runtime physical model не менялся, candidate не внедрён.
