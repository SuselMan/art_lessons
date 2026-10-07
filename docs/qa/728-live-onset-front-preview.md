# #728: задержка первого физического промежуточного кадра

## Граница и принцип

CPU review immutable6b186883: WatercolorSettlePlan present() вызывается впервые в carry, после split, полного outward front, inward mask, extended coverage, band/gather. Пока front считает путь, pigment/color ещё не перенесены. Поэтому раннее изменение непрозрачности само по себе не даст растекание. Принцип следующего опыта: показывать реальное промежуточное транспортное состояние на отдельной presentation копии, не писать canonical материал и не менять сухой operator/order. Тема акварели остаётся открытой #687; это исследование #728, не новая продовая модель.

## Проверка существующего frontBatch

Раздельный worktree728-live-onset от6b186883. Source менять не пришлось: runtime opts OFF/ON existing settleQueue.frontBatchEnabled, contactBatch=false. Phase+baked+sourceRebase=true в обоих вариантах. Нормальный actual PointerInput OFF записал callback tape, ON исполнил тот же tape. Packed dabs/wet/preset/color/strokeId/washId совпали. Job и callback tracing пассивный: без GLqueries/новых GLdraws, без оборачивания ops и потери WeakSet batch tags. Его OFF identity/аргументы/returns/callback/restore проверены3CPU seam controls; это проверка harness, не физики.

Vega source passport6b1868833d447564c78bd91d0e7b6ff412500c20/966files exact, own5316 standalone640×480 Fine. Первый pigment preview callback OFF690.4мс →ON379.2мс после queue.start. Оба на том же job.next42 после139frontcalls. Actual ON94existing syncGpu calls, OFF0; front+selected field mode call sequence exact. Trace461/459rows не достиг768cap. Полный final canonical640×480 RGBA exact0/max0, GL0/lostfalse, packed/wet exact. One Chrome закрыт finally exit0 handle96944.

Ранний callback не равен выраженному раннему росту. Atlas показывает: до500мс движение слабо, ON даёт тонкий ободок/едва заметную периферию, заметное растекание всё ещё около1–2сек. Это diagnostic capture wave, не FPS/latency benchmark и не общий performance PASS. Глобальные default flags не включены.

Артефакты HOME680-water-wet-tone-qa/temp/onset/frontBatch-6b/{report.json,comparison.json,frontBatch-atlas.jpg,OFF/ON-PNG}. Копии и controller: own VPS temp/onset. Исходники protected runtime не менялись.

## Следующая ограниченная гипотеза, пока НЕ реализована

Считать presentation-only парные P/C с immutable captured source по текущему outward partial cost. Min-plus relaxation сохраняет seed и понижает верхнюю оценку стоимости; ещё недостигнутые cells остаются sentinel. Поэтому preview должен использовать только реально достигнутый поддомен, current ping-pong cost, а не старый pressure home. Один existing stride1 carry с actual V и paired color density; canonical P/C/front не трогать. Для его показа понадобится временная extended coverage из того же partial cost, без произвольного заполнения V. Последующие previews можно заново получать из immutable source, не накапливать новую физику в canonical.

Риски: дополнительный P/C/coverage GPU budget и pool lifetime; artificial edge на ещё растущем domain; сохранение концентрации и pigment source; dry/V0 gaps, islands и tiny lowV bridge; continuity при смене presentation target и finalcanonical. Верхняя оценка cost — свойство front, не утверждение о физической истинности preview. Перестановка canonical carry перед inward/band отвергается: затронет материалы, порядок и replay.

Перед source prototype нужны CPU ownership/immutable-source tests; actualsource samejournal wholecanonical exact; bounded cold compile/dry0/dry10/purewater/islands/lowV controls; passive trace первого callback и visible frames100/250/500/1000. Затем самостоятельная измерительная волна без readback. Source эксперимент только defaultOFF после root review.

## Изолированный cropped prototype, аппаратная проверка ожидается

`diagnosticPartialFrontPreview` по умолчанию выключен. Реальный canonical field остаётся1536×1536. Прототип активируется только при S=1, active rectangle≤512×512, одном overlap, одном pigment signature и tile≤512×512; pure water, несколько цветов, половинное разрешение и большие tiles идут старым путём. Не менять canonical `_diffuseFieldFor` ради этого опыта.

После первого split копируются mobile/fixed P и mobile/fixed C, исходная coverage и доступная V. Cropping GL-origin: source `(0,1536−h)` →destination `(0,0)`; reconstruction обратно использует `fy=h−(oy1−y0)` при неизменном разрешении. Четыре captured material seed records после копирования не переписываются. На каждом существующем outward front entry текущая cost копируется в отдельный LINEAR буфер, выполняется один парный C→P unit carry на частных рабочих копиях и mode11 coverage из того же cost. Последующий показ использует существующий present/reveal и его150ms throttle. Canonical field/operator sequence не переставляется; новые writes ограничены owned buffers. Preview эволюционирует на собственных копиях, а не начинает с mutable canonical P заново.

Дополнительное состояние:12 cropped RGBA8 buffers =12×w×h×4 bytes, максимум12 MiB. Временная reconstruction existing present добавляет2 cropped buffers и3 tile buffers на overlap; при максимальном512² суммарный дополнительный одновременно живой scoped state может достигать17 MiB, а не8 MiB. LINEAR cost создаётся напрямую и никогда не возвращается в NEAREST pool. Общий owner dispose/destroy/forget и owner14 generator cleanup учитывают его отдельно. Полные8×1536²≈72 MiB private copies отвергнуты.

CPU MockGL tests проверяют реальные prepare/operators/lifecycle: размеры1536/crop, bottom-up copying, OFF/ON canonical destination sequence, парный C/P с одним pre-step P density, immutable seeds, отрицательные scope guards, dispose/destroy/context loss и отмену owner14 внутри callback. Это resource/order checks, не пиксельное доказательство и не доказательство физической истинности такого preview. Cropped sampler boundary и переход private preview→full canonical ещё требуют actual GPU контроля. Не заявлять mass conservation, более ранний видимый рост, wholeRGBA exact или performance PASS до аппаратной волны.

Следующий ограниченный опыт: один simple blot≤512 на отдельном собственном runtime, same captured native tape OFF/ON, одинаковые phase/baked/rebase/frontBatch; actual cropped carry count и source passport, ранние кадры100/250/500/1000, nonzero material guards и final wholeRGBA exact. Далее dry/V0 gap, islands и low-V bridge. Никакого нового final model, произвольной заливки V или opacity-only подмены.
