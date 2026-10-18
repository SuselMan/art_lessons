# Следующий ограниченный эксперимент именно native Mini1024

Source-only, без GPU и реализации. База — front8-detail-flow-v4; не u32 solver, не A2. Прочитаны original-mini-audit, research-findings и фактические WatercolorSettlePlan/WatercolorFrontPaths/WatercolorPasses/shaders.

## Что уже известно

Исторический trace одного мазка: 161 draw, из них61front =28native+17prefix-jump+16prefix-build. Это не универсальный passcount. Lazy-noise fullP/C/coverage exact на трёх fixed-state случаях, но ABBA284–407 против300–385мс не убедил. One-octave дал умеренный сигнал, не кратное ускорение. Повторять gather-specialization/finalOnly как новые идеи нельзя: уже не выиграли. Пробные readPixels per-op синхронизируют очередь; их длительности не чистый GPU profile.

Фактические точки:

- WatercolorSettlePlan.ts:172–179/229–255: native detail-flow уже уменьшает поле через watercolorSettleScale, сохраняет brush reconstruction. Простое ещё одно снижение разрешения меняет характер кисти.
- :564–619: outward prefix8+8unit, inward2flat+остальные и mode11/6. Inward и group-dry повторяют дорогой native shader.
- shaders.ts:4120–4168: feather зависит только от мирового px/бумаги, но вычисляется заново на каждой итерации; 2октавы×4lattice fetch. Paper height нужен центру и соседям, film одинаков для всех8соседей. Компилятор может hoist film, но не переиспользовать feather между draw.
- WatercolorFrontPaths.ts:32–55/116–139: base unitEdge считает тот же feather для двух направлений и четырёх pairdraw; aggregate затем только суммирует packed16cost. Общие uniforms/bindings повторяются каждый draw, getAttribLocation вызывается в common:84. Это CPU-вызовы, но без нового профиля нельзя объявить их главным bottleneck.
- WatercolorSettlePlan.ts:483–486/579/619/641: исходные снимки, перенос результата домой и gather parity-copy существуют, но исключать их без lifetime/aliasproof нельзя. Представление уже можно отключить; его устранение не решило очередь.

## 1. Главный кандидат: кэш статической карты feather, а не lazy ветвления

Один собственный QA pass перед первым фронтом вычисляет ТОЛЬКО `smoothstep(...wcFbm(worldPx*scale+offset))` в field-sized NEAREST RGBA8: два канала encode16, два свободны. DITHER выключен только на записи, восстановлен. Native unit и prefix base-build читают эту карту вместо FBM. Высоту бумаги, film, соседей, min/cost, порядок проходов, relief и все pigment/detail operators оставить исходными. u_climb умножается в исходном месте; flat-climb0 не требует отдельной карты. Кэш ключ: field dimensions, world origin/scale, noise texture/seed; на reset/cancel/destroy сбрасывается, между разными жестами не угадывается.

Это меняет feather из-за16bit квантования, поэтому не exact shortcut. Ошибка smoothstep≤0.5/65535; ошибка множителя climb≤4*u_climb*0.5/65535, но min-plus/выходRGBA8 могут усилить её: похожесть доказывать картинками, не этим bound. RGBA8 выбор намеренно не требует float-render-target extension. Цена: +1draw и +4*w*h bytes (4MiB максимум1024²; фактический field часто меньше). Выигрыш гипотетический:8noise fetch на каждый активный unitfragment и повторная FBM в prefixbase заменяются одним cachefetch; spatial fetch/cache/driver могут съесть выгоду. Нулевой early guard оставить перед чтением cache. Не объявлять texture transactions точным source-level подсчётом.

Sourceproof: strict unique anchor толькоfeather RHS в native и prefix unitEdge; удаление fbm вызова не трогает export WC_NOISE/другиеmaterial modes. Записать original/patched shaderSHA, cacheparams/format/sourceSHA, actual drawcounts, восстановление texture units/FBO/DITHER/program и отсутствие extra observerreads. Compile/alloc до timed sample; cachefill входит в totalReady/GPU completion. Native pressure G остаётся исходным paper height.

## 2. Резерв: объединить четыре prefix направления через MRT

Если WebGL1 WEBGL_draw_buffers и минимум4color attachments/drawbuffers реально доступны, четыре независимых pairbuild/aggregate можно писать в4attachments за один draw каждого уровня. Тогда16prefix-build draw →4 (base+stride1/2/4), те же4directionpairs и encode/decode16 без перестановки их внутренней арифметики. Native/jump/gather/pigment не менять. Это не сокращает число сумм/texelfetch/bandwidth; уменьшает FBO/draw/state overhead. Нужен8texture pingpong вместо5, то есть ещё3*w*h*4 bytes. На мобильном MRT bandwidth может оказаться хуже; при отсутствии extension failunsupported, без включения flags.

Это второй приоритет: только если measured front-build существенен после первого кандидата. Sourceproof — независимые4outputs послекаждогоlevel против прежних4textures, shadertext каждогоchannelpair эквивалентен; full pressure/mask/final fields. Не обещать ускорение от числаdraw.

## Ограниченный gate: шесть изображений, фиксированный исходный материал

Native resetFromScratch из одного сохранённого собственного native snapshot на каждый arm; НЕ converted805 input вместо настоящего native материала. Сцены: mini-wave, mini-two-colors, большой drop/pool, authoredgallery sheet3, sheet7, sheet12. Они покрывают relief fingers/кольцо, цветовой carry, широкий front, кистевую фактуру и слабый пигмент. Для каждой normalrepeat и один candidate; baseline/currentmodel/seed/paper/origin/brush metadata одинаковы. Сохранить по6baseline/candidate PNG одинаковым compositor/масштабом и полные P/C/coverage SHA/диффы (для MRT ожидается exact, дляfeather16 — similarityqualified). Проверить пустуюводу/сухой край отдельно как технические control, без выдачи их за дополнительные художественные картинки.

Сначала correctness/визуальная приёмка, затем balanced ABBA из одного fixed-state с паузами, без per-pass readPixels. TotalReady включаетcachefill/всеdraw; GPU completion измеряется реально зависимым чтением вне CPU-submit timing либо разрешённым timerquery. Иначе снова получится спорный lazy-подобный результат. Ни200мс, ни сохранение всех старых пикселей заранее не обещаются.
