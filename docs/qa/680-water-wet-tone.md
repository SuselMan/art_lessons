# Ослабление водяного тона: CPU кандидат

Основа main f5397918, отдельная agents/680-water-wet-tone. Production KJc0OoVo выгружена read-only:47операций; есть чистая вода normal100:0, мокрыйпигмент100:100, слабыйпигмент и0:60. Originalops сохранены `temp/wet-tone/KJc0OoVo-ops.json`; не открывали/менялипользовательскуюкомнату.

Причина отображения: PAPER_COMPOSE_FRAG накладывает damp нейтральныйтон1.2%, freshwater набумаге7%, standingpool8%. Поверхпигмента идут последовательно exponent1+0.35fresh и1+0.45pool, поэтому полнаявода может очень сильнотемнитьсреднийцвет. Это презентационныеwetMapтермы; они не являются P/C/V pigmentdeposit или driedsolver. Exporter `_renderPaperComposeInto` отключаетwetRect(0,0,-1,-1), значит сухойэкспорт не получаетниdamp/fresh/pool.

Узкийкандидат добавляет два явныхкоэффициента WC_WET_PAPER_TONE_SHARE0.35 иWC_WET_PAINT_TONE_SHARE0.12, плавно смешанные существующим onPaint. Они ослабляют все damp/fresh/pool tone термы, не растекание, не сухуюкраску и не формуwetmask. Стабильныепереходы границы воды/пигмента сохраняют старыйsmoothstep. Paper microcontrast flatten/gloss не менялись.

Для следующихживыхсмотрин варианты baseline1/1, mild0.5/0.2, candidate0.35/0.12. CPU арифметикаприfullfresh/fullpool: baselinebare0.8453 vs candidatebare≈0.9442; точные числа в cpu-tone-variants.json. Это расчеткоэффициентов, а не измерениеGPU/визуальнаяоценка. Приwet0 всеwetтермы0, сухойцвет аналитически прежний.

Проверено CPU: shader template импортирован существующимtsx без новыхdeps/symlinks; ровноодно onPaint; git diff --checkPASS. НиGLSL link/coldcompile, ни реальноеPNGexact, ни liveabovebare/painted, Dry/UndoReplay пока НЕпроверены. Нужен согласованныйGPUслот,2–3настройки наизолированномстенде и exactdry endpoint. Push/deploy не делались.
