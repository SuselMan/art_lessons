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

### Sheet 3, slot 2: материальная граница на source 7b11 (07.10.2026)

Отдельный диагностический replay использовал неизменный curated `ops_3.json`: SHA `ecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9`, 42 операции, 41 после исключения image_import, target pigment seq61 после clear60. Все предшествующие history/layer/Dry операции сохранены. ROI `[910,455,1264,721]` относится к physical 3508×2480 Medium. Baked/rebase/async включены в обоих arms; менялся только phase. Это fresh standalone replay, без Room, snapshot, ACK или performance claim.

Whole source `7b11b29e2cfc33e8146c3d8fb5c3578cd2fbce12`: 970 tracked web/shared файлов SHA exact, archive SHA `4d7e7b3b7660334e0156e2c8e3692866358c18a9d17d7ab6661e1410cddf267b`. Собственный 5325; внешняя граница 600 секунд, preflight 1772 MiB, монитор abort ниже500 MiB. Handle14744 завершился exit0, `completed=true`, `ownedChromeClosed=true`, timeout отсутствует. Оба arms: selected prepare ровно1, carry14, groupTide stages5, GL0/lostfalse. Фактических phase calls OFF0/ON14. Pre-carry P/V/coverage/cost hashes exact. Final PNG3508×2480 непустые; равенство OFF/ON endpoint не ожидается и не заявляется.

ROI читался непосредственно354×266 с actual front map x0=742,y0=312,S=1; GL read y1127. P/C/V/coverage nonzero guards пройдены. До реконструкции цвета C помечен total input, а не mobile C. Захваты: seed/precarry, после carry до diffuse, после diffuse до groupTide, обе19 union seeds,6 band,7 lift,14 dryP,2 reconstructed dryC. Raw HOME `680-puddle-outline/temp/onset-runtime/temp/onset/sheet3-stage-first`, report.json, compressed planes, boundary-profiles.json и stage-atlas.jpg. Контроллеры/CPU анализаторы находятся в собственном `temp/onset/sheet3-*`; диагностические readbacks не относятся к измерению отзывчивости.

Signed-Manhattan профиль относительно **первоначальной P-support**, а отдельно относительно границы wetV, локализует материальную впадину на исходном цветном мазке. Mean P.b внутреннего краевого кольца(-1)/первого наружного(0):

| Стадия | OFF | ON |
|---|---:|---:|
| После carry |16.6 /81.4|50.7 /72.2|
| После diffusion |41.6 /63.7|53.4 /60.1|
| После groupTide dry reconstruction |40.5 /62.0|52.0 /58.6|

Таким образом phase существенно уменьшает исходный carry-провал; остаток уже присутствует до diffusion, а groupTide не вводит новый провал. Это ROI средние, не точечный luma и не независимая абляция tide. Cost у inner(-1) ≈0.03 code, outer(0)≈3.97: plateau closure работает на zero-cost ядре, далее остаётся directional positive-cost drain. Прерывание этой closure на границе — конкретная следующая гипотеза, а не доказанный новый исправляющий оператор.

Суммы P.b внутри ROI OFF:758185→754289(carry)→730830(diffuse)→712801(dry); ON:758185→753424→730235→712311. V ROI2845621 неизменна. ROI конечен, поле RGBA8, поэтому ни глобальная сохранность массы, ни причина потерь по одним суммам не заявляются. Новые shader/model изменения не выполнялись; GPU после finally передан следующему агенту.
