# GPU-задачи акварели: математический аудит

Источник: `6aa14a43`. Это предложения, не результаты применения. Размер поля обозначен w×h, Q8 — запись RGBA8. Профайлер CPU измеряет отправку GL-команд, не длительность GPU shaders. Viz/Skia 456 мс wall и 10 мс CPU не устанавливает виновника.

Главный принцип: сохранять массивы входов, последовательность операторов и каждую промежуточную квантовку. Эквивалентное вещественное уравнение может дать иной RGBA8 результат после иной группировки операций.

## Passes.fieldOp

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:87` (6aa14a43).

**Операция:** O[p]=Q8(F_mode(A[p],B,C,D,E,path)); для stencil modes также соседи. Q8 — запись RGBA8 после каждого прохода.

**Объём:** Один draw 6 вершин; wh либо площадь scissor; 671 вызов в старом инструментированном сценарии, не 671 GPU timed samples.

**Кандидат без изменения качества:** Кэшировать неизменные uniforms/texture bindings только при централизованном владельце GL state. Ограничивать pointwise pass точным dirty rect, предварительно сохранив наружную область dst.

**Обоснование:** Если F локальна и dst вне R уже равен требуемому результату, запись только R эквивалентна. Для соседских F добавить точный halo. Не сливать Q8(F(Q8(G(x)))) в Q8(F(G(x))).

**Приближение, проверять отдельно:** Слияние проходов без промежуточной квантовки; уменьшение разрешения/пропуск mode; другой carry law.

**Риски:** Feedback если out совпал с sampler; shared GL state; clamp/dither; разные ветви shader; Adreno compile size.

## Passes.costDomainStep

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:148` (6aa14a43).

**Операция:** Четыре направленных признака связности; packed код floor(255v+.5), затем битовые уровни через mod/floor; unpacked min по направлению.

**Объём:** Один полноэкранный draw wh, 4 directional paths, stride влияет на зависимость; count данного метода не установлен.

**Кандидат без изменения качества:** Вынести повторную выборку центрального texel в main и передать значение четырём path, сохранив точные pixel/UV и операции.

**Обоснование:** Все четыре вызова path используют тот же (pixel+.5)/resolution и неизменный source; texture value общая. Шейдерный компилятор может уже устранять повтор, выигрыш требует замера.

**Приближение, проверять отдельно:** Заменить packed код непрерывной маской или снизить precision/размер.

**Риски:** Packed требует DITHER off и восстановления; UV rounding; stale dst вне scissor; salted compile.

## Passes.waterFrontStep

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:174` (6aa14a43).

**Операция:** C_next(i)=Q8(min(C_i, min_j(C_j+edge(j,i)))/costMax); восемь направлений, relief/film/foreign water и stride.

**Объём:** Один draw wh на шаг; K_out=watercolorFrontSteps(budget/S,radius/S,wet), K_in=width+2; ping-pong и иногда финальный copy.

**Кандидат без изменения качества:** Убрать финальный home-copy через передачу фактического pp.src последующим читателям, если ни один alias/closure не ожидает home. Кэш uniforms для одной серии.

**Обоснование:** Идентичность буфера не влияет на математический массив, но весь граф потребителей должен читать итоговую чётность. Нельзя менять K или порядок strides под видом exact.

**Приближение, проверять отдельно:** Другая min-plus shortest path solver, early convergence/readback, меньше strides: RGBA8 и конечный schedule делают результат иным.

**Риски:** Boundary dry/clamp, stride halo, noise world coordinates, parity и поздние closures.

## Passes.diffuseStep

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:255` (6aa14a43).

**Операция:** I_next(i)=Q8(max(I_i−Σ give_ij I_i+Σ take_ji I_j,0)); gate=min(w_i,w_j), восемь axial/diagonal или knight соседей.

**Объём:** Один draw wh на итерацию для deposit и colour; до 3 central + 3 на соседа texture fetches, фактически число зависит от dry/bounds branches.

**Кандидат без изменения качества:** Предрасчёт неизменных water/height коэффициентов возможен только в формате, сохраняющем исходные highp значения; первый практичный шаг — точный active rect с halo max offset и запись неизменной внешней области.

**Обоснование:** При нулевом pigment снаружи поддержки и нулевом входящем flux оператор вне expanded support тождественен. Halo на каждой итерации axial radius либо knight 2radius; pooled dst нельзя оставлять stale.

**Приближение, проверять отдельно:** Implicit/PDE solve, separable blur, сокращение K, другая donor arithmetic; перераспределение сумм меняет float rounding.

**Риски:** Масса математически conserved до RGBA8/clamp; tiny perstep rounding влияет на final. Halo должен расширяться по всему schedule, не только текущему dab.

## Passes.wcResample

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:220` (6aa14a43).

**Операция:** Mode0 2×2 mean; mode1 base+bilinear(new)−bilinear(old); mode2 max(base,bilinear(new)); запись Q8.

**Объём:** Один draw dw×dh, 2×2 mean либо до трёх sampled fields; subsequent copyRegionInto добавляет память.

**Кандидат без изменения качества:** Если final target не совпадает ни с base/src/old sampler, писать сразу в target вместо tmp→copy. Иначе tmp обязателен.

**Обоснование:** Функция имеет одинаковые UV/clamp/dest origins; framebuffer выбран иной, но texels совпадают при отсутствии feedback и одинаковом формате.

**Приближение, проверять отдельно:** Использовать hardware mip вместо exact 2×2 либо меня́ть interpolation/canonical S.

**Риски:** Base==dst запрещён WebGL; tile borders clampRect и bottom-up offsets; filtering; write/read alias.

## Passes.brushPass

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:296` (6aa14a43).

**Операция:** Один chronological contact переносит paint по flow и standing-water gate; pigment и colour читают один pre-contact record, затем copyback.

**Объём:** Один draw на scissor area; 1406 calls в instrumentation; step=max(1,round(radius*.25/S)).

**Кандидат без изменения качества:** Передать results swap-буферами вместо copyback только если оба record passes завершены до любых замен source; сохранить contact order. Пул flow upload storage при совпадении размеров.

**Обоснование:** Перестановка имён после окончания пары не меняет функцию; перестановка самих contacts меняет композицию F_n∘…∘F_1.

**Приближение, проверять отдельно:** Объединение dab/contact, decimation или уменьшение brush mixing step; цвет после изменённого pigment.

**Риски:** Shared pre-contact dependency, sampling outside scissor stale output, chronology, RGBA8 and colour ratios.

## Passes.pigmentColor

Источник: `apps/web/src/engine/src/raster/WatercolorPasses.ts:331` (6aa14a43).

**Операция:** Однопигментное absorption record τ×deposit, field mode2.

**Объём:** Один draw wh; фактический count не установлен.

**Кандидат без изменения качества:** Специализированный короткий shader с тем же выражением mode2 и арифметическим порядком; исключить unused bindings только если shader действительно не имеет этих samplers.

**Обоснование:** Ветка mode2 постоянна: dead-code specialization допустима; общее shader объявляет c/d и сейчас безопасно связывает их для предотвращения feedback.

**Приближение, проверять отдельно:** Изменить absorption model или fuse с deposit без промежуточного Q8.

**Риски:** Adreno compile, compiler rounding, режимы blend/dither; не просто убрать bindings общего program.

## Buffer.clear

Источник: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:311` (6aa14a43).

**Операция:** Полное присваивание RGBA=(0,0,0,0).

**Объём:** Площадь wh на clear; fieldFor чистит 10 records, capture повторно чистит 5 (a,b,coverage,ca,cb). GPU fast-clear cost не равен wh shader draw.

**Кандидат без изменения качества:** Удалить первую очистку только если до следующего чтения тот же полный zero-clear гарантирован. Сохранить c/cc/mask/pressure/band и все other callers.

**Обоснование:** Dead-store elimination: Z; no read; Z ≡ Z. Локальное доказательство domination на всех error/early-return путях, а не предположение о пустом поле.

**Приближение, проверять отдельно:** Частичный clear без dirty lifetime tracking; пропуск captureclear.

**Риски:** Pooled stale bytes, zero-pigment water contacts, exception branches, scissor state.

## Buffer.copyTo

Источник: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:409` (6aa14a43).

**Операция:** Полная копия texels source в destination; legacy путь может переопределить storage.

**Объём:** Память порядка 4wh bytes RGBA8 чтение + 4wh запись; возможна allocation/driver sync; число copyTo не GPU duration.

**Кандидат без изменения качества:** copyTexSubImage2D при доказанном same-context, разных textures и существующем destination storage нужного размера/формата; иначе сохранить copyTexImage2D.

**Обоснование:** Для одинакового framebuffer-source и offsets texel значения совпадают; storage identity сохраняется. Не применять к самокопии/cross-context.

**Приближение, проверять отдельно:** Переход на другой texture format/half size или deferred copy без lifetime guarantee.

**Риски:** Resize/snapshot restore logical dimensions vs actual storage; invalidate mips; GL feedback; context loss.

## Buffer.copyRegionInto

Источник: `apps/web/src/engine/src/buffers/AccumulationBuffer.ts:443` (6aa14a43).

**Операция:** Прямоугольный перенос R→R′, вне R′ dst сохраняется.

**Объём:** 1512 calls; область w×h неизвестна без отдельного counter; примерно 8wh bytes RGBA8 traffic, driver может оптимизировать.

**Кандидат без изменения качества:** Удалять лишь копии, для которых следующая запись полностью перекрывает R′ до чтения. Или swap ownership при идентичном полном region и доказанном lifetime.

**Обоснование:** Dead-store / renaming equivalence; subrect нельзя заменить swap всего буфера с другим внешним содержимым.

**Приближение, проверять отдельно:** Увеличить rect до всего буфера или отложить копию после изменения source.

**Риски:** Bottom-up coords, clipped page/tile, retained outside contents, mips invalidation.

## Engine._updateWetTexture

Источник: `apps/web/src/engine/index.ts:8980` (6aa14a43).

**Операция:** max union видимых water rasters; separable 5×5 body max и tent; pack RGBA8 padded border; upload.

**Объём:** w,h≤162,≤104976 upload bytes; throttle120ms; CPU O(sources×wh + wh), не full1536² solver.

**Кандидат без изменения качества:** Reuse scratch arrays с гарантированным zero-reset; texSubImage2D при одинаковых dimensions; texture params задать один раз per GL name.

**Обоснование:** Вычисленные bytes, world rect, padding и filtering те же; storage allocation не часть математического результата.

**Приближение, проверять отдельно:** Меньший CAP, реже throttle, cache без учёта time-decay/visibility/material sources.

**Риски:** ActiveTexture2 critical; UNPACK_ALIGNMENT restore; no-zero pooled raster creates fake puddles; context restore resets size cache.

## Engine._display

Источник: `apps/web/src/engine/index.ts:9348` (6aa14a43).

**Операция:** Композиция видимых слоёв, paper/wet/reveal + canvas framebuffer, далее браузер Viz/Skia.

**Объём:** 114 calls; canvas1554×1698=2638692 pixels в trace (другой run чем instrumentation); layer count и perdraw areas неизвестны.

**Кандидат без изменения качества:** Coalesce только несколько requests с одинаковой scene revision до одного rAF; сохранить first-touch немедленный display и independently advanced reveal/water/camera state. Измерить overdraw и canvas uploads.

**Обоснование:** Одинаковый scene state даёт одинаковый display; отсутствие scene change не доказано только отсутствием ops (wet clock/morph/camera меняются).

**Приближение, проверять отдельно:** Снизить DPR, preview texture size или частоту morph; canvas context options изменить отдельно.

**Риски:** Задержка первой точки; compositor scheduling; screenshots не подтверждают presentation latency; reuse texture несёт in-flight lifetime.

## Compositor.FinishPaintRenderPass

Источник: `apps/web/src/engine/index.ts:9348` (6aa14a43).

**Операция:** Chrome Viz/Skia завершает render pass canvas; происхождение конкретного WebGL draw отсутствует в trace.

**Объём:** 113 events; max wall456.409ms при threadCPU10.173ms, totals nested/nonadditive. НЕ доказанные 456ms shader execution.

**Кандидат без изменения качества:** Сначала correlation markers scene revision / submit / frame-present и GPU timers по coarse stages; затем ablation extra fullcanvas displays и texture reallocations. Это измерение, не оптимизация shader.

**Обоснование:** CPU idle + большой wall span допускает ожидание fence/driver/OS; не позволяет выбрать математический solver виновником.

**Приближение, проверять отдельно:** Уменьшение resolution/DPR может ускорить но меняет изображение; отключение синхронизации может ломать lifetime.

**Риски:** Native task не имеет exact JS stack; tracing overhead; исключить lost/background context; не менять chrome пользователя.

## Проверки перед включением

- Одинаковые входы, seed, wet, размеры, расписание; сравнить все RGBA material buffers и сухой export побайтно на одном GPU.
- Live/replay/undo/redo, два цвета и слоя, соседние лужи, границы тайлов, холодный/переиспользованный scratch, context restore.
- Surface и Samsung salted compile + GL errors/context loss; отдельное сравнение baseline/candidate на каждом GPU.
- Парные замеры без profiler overhead: latency старта/UP, rAF p95/max, clear/copy/draw/upload bytes; GPU duration отдельным поддерживаемым timer, без gl.finish в каждом draw.

Точная общая оценка GPU work требует счётчиков mode/rect/width/height/iterations/upload bytes. Один brushPass на маленьком scissor и один full-field diffuseStep не равны по цене, хотя оба один draw. Не добавлять readPixels или gl.finish после каждого прохода: это изменит расписание и характер паузы.

JSON: `methods[]` с id, source, shader, formalOperation, work, exactOptimization, mathematicalJustification, qualityChangingApproximation, risks, gates, priority/status. id соответствует узлам existing graph для Passes/Buffer/Engine; compositor — дополнительный native task.
