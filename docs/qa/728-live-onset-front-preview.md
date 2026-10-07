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

## Уточнение crop-edge и абсолютных записей

S=1 `fromField` всегда выполняет непосредственный `copyTexSubImage2D`, не читает `fOld`/`base`; full-resolution snapshots в prepare не создаются (они только S>1). Поэтому direct cropped copy имеет ту же семантику абсолютной записи: existing tile сначала копируется целиком, overlap перезаписывается reconstructed fixed+mobile P/C. Старый материал не прибавляется второй раз. UV преобразование состоит только из целочисленного смещения GL-Y на1536−h; texel centers сохраняются, масштабирования/интерполяции material-copy нет. CPU контролируется nonzero world origin и подпрямоугольник с ненулевым background вне overlap. Численная copy-coordinate проверка относится только к абсолютному копированию байтов, не к консервативности transport или точности shader C reconstruction.

Первоначальная оценка stencil margin2 была недостаточна: wcCapillary читает3×3 cost.g с шагом3, capJ относится к соседнему donor; максимум cost reach4 texels плюс LINEAR halftexel. Теперь private transport ограничен расстоянием исходного source bounds до crop edge минус5. Один stride1 перенос расширяет поддержку mobile максимум на1texel, поэтому после этого числа private шагов preview перестаёт развиваться до следующего обычного canonical preview. Source envelope на краю вообще выключает partial experiment. Это guard диагностического показа, не новый fitted water threshold. На hardware обязательно проверить, что captured mobile P/C nonzero footprint действительно находится внутри supplied bounds; один CPU bounds аргумент этого не доказывает.

Partial experiment дополнительно требует `presentationOwnerLocked` независимо от `splitQuanta`. Отрицательный ownerfalse test проверяет отсутствие cropped allocations даже при включённом partial flag. В actual Engine lock даёт async owner14, поэтому следующий аппаратный OFF/ON должен держать `_wcAsyncFinish=true` в обоих arms, на версии с исправленным midpen-tail lifecycle (47f1d339 или новее). Синхронный caller без immutable finish ownership не получает partial preview.

## Первая actual wave c3e4638b: INVALID, собственный Chrome закрыт

HOME own5325, root-base47f1d339 +prototype,969 tracked files exact;14CPU tests/typecheck были зелёными. Один bounded OFF/ON run handle5457: OFF завершён GL0 ибезprivate operators, ON невалиден. Диагностический wrapper требовал nonzero P/C от самого первого private carry, но это был clear-water job1 (radius45, water1, landed0), не целевой pigment. Captured384² P/C полностью0, V ненулевая (9268 texels), canonical field1536². Paint signature setsize1 не является доказательством pigment input: clear water также сохраняет цветовую signature. Throw самого fixture внутри fieldOp остановил async job; затем wait вернул Idle deadline. Это не воспроизведение app deadlock и не аппаратный PASS. Outer finally закрыл Chrome, GPU освобождён. Сравнение нулевых P/C не выдаётся за meaningful crop/material proof; early/final preview result не заявлен.

Исправление scope: partial допускается только при положительной pigmentStrength из immutable finish profile, дополнительно к owner14 иone-signature guard. Pure-water profile0 с signature1 отдельным actual prepare CPU negative исключается. Следующий harness не бросает исключение внутри canonical операторов: собирает scoped seed stats, пропускает пустой preview source и проверяет nonzero/copy/envelope после возврата actual result. При idle failure сохраняет queue/settle/canonical/asyncError state. Raw первоначального невалидного опыта сохранён неизменным: HOME680-puddle-outline/temp/onset-runtime/temp/onset/partial-c3e-first/report.json, копия VPS temp/onset/partial-c3e-first-report.json.

### Аппаратный положительный контроль 4cd44b3d — 7 октября

Один собственный Vega Chrome, controller `temp/onset/partial-run.mjs`, terminal
30265 exit0 и `ownedChromeClosed=true`. HOME raw:
`680-puddle-outline/temp/onset-runtime/temp/onset/partial-4cd-positive/`;
`report.json`, `early-atlas.jpg` и исходные OFF/ON PNG сохранены.
Runtime5325: root47f1d339 + prototype4cd44b3d, 969 tracked web/shared files
byte-exact; archiveSHA265542fed1c5dc56244a912df3b3cca0aa5b605b6d03405e8727528413d67d1c.
Чужие5316/4539 не изменялись. Standalone Fine384×384, без Room/serverACK.

OFF записал настоящий callback tape: water100/pigment0 размер100, затем
water100/pigment100 размер48. ON использовал тот же tape, IDs и время.
Packed/wet/preset/color/strokeId/washId равны. Phase, baked, sourceRebase,
async и frontBatch включены в обоих вариантах; partial только ON,
owner14 locked=true, splitQuanta=false, contactBatch=false, debug=false.
Без PaperDry, canonical export только после естественного idle.

Достигнуты реальные частные операторы: OFF0, ON56 (28 пар C/P).
Перед первым частным carry seedP/C имеют2129 ненулевых alpha-пикселей,
V9177; bboxP/C GL[165,170,229,213], V[129,147,262,236]. P crop384²
совпал с соответствующим canonical1536² crop:0 отличий, вне source envelope0.
Суммы P=[381503,381503,381503,381503], C=[144398,100140,45603,381503],
V=[669193,0,0,669193]. Это проверка captured inputs, не доказательство
сохранения массы частным переносом. Итоговые полные384×384 decodedRGBA
OFF/ON exact0/max0; GL0/lostfalse/errors[]. Trace349/434 rows, cap768 не достигнут.

Первый pigment-job preview callback: OFF476.5мс после start, next36/front118;
ON104.8мс, next4/front4. Следующий ON callback513.0мс уже next36/front118.
Clear-water job не запускал частные carry благодаря positive-profile guard.
Это доказательство более раннего физического partial preview до полного front.
Один диагностический seed readback в ON принудительно синхронизировал GL:
данные не являются FPS или парным performance benchmark.

В атласе первые изменения края ON очень небольшие. До примерно1с заметного
широкого роста всё ещё мало; основное видимое растекание1–4с почти одинаковое.
Номинальный t500 фактически OFF541мс/ON622мс: нельзя приписывать весь визуальный
разрыв прототипу. Natural final-visible наступил9361/9470мс. Более ранний callback
не равен решению пользовательской претензии о заметной живости. Default OFF
сохраняется; интеграция и расширение на большие поля не выполнены.

### CPU-разбор слабого видимого onset, без нового аппаратного прогона

`next4/front4` — индекс первого outward entry, не четыре шага перемещения
пигмента. Один entry содержит четыре relaxations cost, затем прототип выполняет
ровно один mode16/15 stride1. На S1 это максимум один world-pixel расширения
поддержки за первый callback, то есть0.26% ширины384; в атласе256 это0.67px.
Частный транспорт использует travelling share0.35 и rate0.5, поэтому новый
внешний пиксель дополнительно слабее тела. Канонический carry после полного front
использует цикл dyadic strides, частный — только единичные шаги. Это существенное
различие скорости исследуемого presentation solver, не ошибка UV: S1copy без
масштабирования и capturedcrop был exact.

Pending появляется рано, однако `_advanceWashReveal` при startedAt=null следует
за ним через `washRevealStep(dt,null)=1-exp(-dt/1400)`. За150мс фильтр показывает
примерно10.2% постоянного target-delta, за400мс24.9%; меняющиеся targets могут
отставать ещё больше. `hold=1` сохраняет before, но не запрещает pending-follow.
Первый tiny pixel-step плюс этот фильтр объясняют слабость видимого раннего края
на уровне кода. SeedP/C/V nonzero исключают пустой источник; только их начальная
поддержка измерена. Cost/P непосредственно после первого partial шага не считаны:
мы не доказали, что движение происходит исключительно внутри ядра или достигает
границы wet domain. До такого считывания не объявляем этот механизм единственной
причиной.

Следующий узкий counterfactual, пока НЕ реализован: сохранить private operators и
их расписание, но в отдельном presentation-only режиме показывать последнее
реально рассчитанное partial состояние без дополнительного1400мс chasing.
Это direct rendering текущего физического P/C с текущим partialcost, а не
crossfade готовой сухой картинки. На first target сравнить private material
support/delta с pending RGBA и displayed RGBA, отдельно cost-front support.
Если private material-edge уже движется, а visible подавлен фильтром — эта
абляция выделит reveal bottleneck; если private-edge почти стоит, reveal менять
как исправление бессмысленно. Owner14/cancel/loss обязательны, final wholeRGBA
должно остаться exact, private copies не возвращаются в canonical.

Отдельный, не смешиваемый вариант для недостаточного material movement:
один private unitcarry на каждую реально выполненную unitfront relaxation
вместо одного на four-step entry, с прежним общим stencil-safe stepLimit и
bounded quanta. Это синхронизирует presentation transport/front-clock, но
ускоряет исследуемый private physical trajectory и требует самостоятельного
проверяемого контракта; нельзя считать его канонической промежуточной стадией.
Ни reveal, ни transport вариант не включён по умолчанию и не доказан hardware.

### Opt-in CPU prototype actual-progress + physical-target cadence

Новый независимый `diagnosticPartialFrontProgress=false` меняет только уже
разрешённый private preview (сам `diagnosticPartialFrontPreview` тоже требуется).
Canonical front/carry/diffuse/backwrite не переставлены. Outward callback сообщает
фактическое количество unit relaxations (1 при splitQuanta,4 в обычном entry).
Частный P/C выполняет столько же unit-exchanges, но не более оставшегося
source-margin−5. Никаких новых stride/radius/rate/volume constants. Это progress
clock частной физической траектории, не утверждение эквивалентности canonical
intermediate. Cost текущего entry общий для его ограниченных1/4 paired exchanges.

Timestamp каждого реально опубликованного physical target фиксируется до
reconstruction и передаётся отдельной immutable metadata; clock локальный для
одного prepare/capture. Tau равен интервалу между такими targets (первый от seed
capture), ограниченному прежними150мс publication cadence и1400мс default.
Нижняя граница150 означает при существующем clampdt40 не более23.41% одного
рассчитанного target-delta за display-frame. Повторные/backwards/nonfinite clocks
не меняют adaptive state. Каждая операция — convex interpolation before→current
partial, без overshoot, fade конечного dry target или canonical writes. Первый
обычный canonical preview и окончательный startReveal сбрасывают этот opt-in tau
к прежнему поведению. Новые поля только ephemeral WashReveal, не log/snapshot.

CPU tests: actualPlan17 +clock/reveal3 =20 PASS; canonical destinations/operands/
mode/band/dir sequence старого partial и progress варианта совпадает. Actual first
private metadata steps4 (или1 при split), total≤stencil15 в64²fixture; повторный
prepare начинает clock сначала, owner14 cancel освобождает inputs и запрещает
последующие writes. Purewater/ownerfalse/cropedge/oversize guards прежние.
Скалярная monotonicity относится к cumulative steps/timestamps/reachable-domain
allowance, НЕ к pixel contour/mass. Byte support/mass/crop-edge behavior нового
operator count требуют отдельного аппаратного контроля. Hardware ещё НЕ запускался.

### Hardware progress-clock eeb4b7fd — отрицательный результат заметной живости

Own Vega handle55389 exit0, Chrome finally CLOSED; runtime5325/sourceeeb4b7fd,
971trackedfiles byte-exact, archive00c760b24607370587522c8680abc87281f22d1a564744bc2e273d25e745f17d.
HOME `680-puddle-outline/temp/onset-runtime/temp/onset/progress-eeb-first/`
содержит report/rawPNG/early-atlas.jpg; исходный4cdконтроль сохранён отдельно.
OFF/ON тот же native tape и packed/wet, finalwhole384×384RGBAexact0; GL0,
lostfalse/errors[]. Частные ops OFF0/ON194=97пар C/P, ровно stencil-safe limit97.

Первый pigment callback OFF533.3мс/next36/front118; ON106.7мс/next4/front4,
metadata steps4/tau150. Второй ON435.8мс/next28/front100: steps97/tau329.2.
Первый ordinary callback593.5мс сбросил adaptive tau. Trace349/570 rows<cap768.
Readback seed и двух private steps диагностический, НЕ performance benchmark.
Кадр t500 фактически OFF515мс/ON608мс; визуальное сравнение не точно time-paired.
Атлас показывает более раннюю тонкую перемену края, но не широкое заметное
растекание<1с. Основной рост1–4с сохраняется; дальнейшее наращивание этих unit
steps или ускорение tau не обосновано. Кандидат не предлагается к интеграции.

Материальные probes теперь отделяют transport от reveal:
- seedP alphaNonzero2129, bboxGL[165,170,229,213], sum381503 во всех4channels;
- private4:2134 (+5new support), bbox[165,169,229,214], Psum381325;
  openCost3039, Pnonzero с cost.r=0:2123;
- private97:2147 (+18new support), bbox[165,167,229,214], Psum384278;
  openCost7472, Pnonzero с cost.r=0:2123.
Расширение cost-domain произошло, пигмент практически остался в начальном ядре.
2123 — количество поддержанных пикселей, НЕ равенство их amounts или identities.
Psum drift+2775/+0.727% относительно seed: RGBA8 private mass НЕ сохранена строго.
Csum seed[144398,100140,45603,381503], finalprivate
[145467,100751,45635,384278]. Source P/C/V nonzero/crop exact/envelope guards PASS.

Причина на уровне действующего оператора: unitcarry equalises соседнюю travelling
concentration, а не advects packet по всей достигнутой cost области. При fullphase,
равной capacity и4равных axisweights локальный коэффициент приблизительно
rate0.5×travel0.35×1/4=0.04375 на adjacent density-excess. Это медленная локальная
релаксация; типичная diffusion длина97шагов sqrt(2×0.04375×97)≈2.9px/axis,
согласованная с измеренным bbox. Эта оценка не точный oracle фактического relief:
weights, Vphase и capacity неоднородны. Отдельный flux<0.5byte округляется;
в локальной равномерной оценке adjacent excess<≈11.4codes уже не даёт одного
полного code transfer по face. Все входы писать RGBA8 после каждого tiny exchange
может остановить слабый край и накопить measured mass drift. Уточнение CPU audit:
в этом actual default run opDry=false, groupDry=true, mobileShare=1; объяснение
через fixed25% к нему НЕ относится (share0.75 только opDry ветка). Travel35%
снижает обмен, но не следует объявлять остальные65% mobile математически
навсегда фиксированными при повторных шагах.

Нужный следующий proof — actual per-cell cost/V/P face excess/rounding у края,
а не новые tuned steps/rates/tau. Existing canonical dyadic carry + diffusion
не равны нашему97unitcarry trajectory; широкий canonical финал не доказывает,
что ранний локальный private solver обязан прийти к нему с этой скоростью.
Никакого нового GPU прогона или physics-source изменения после negative не было.

### CPU design: canonical multiscale prefix without unfinished-front extrapolation

Не выполнять coarse carry на недосчитанном partialcost: unreached.r=1 означает
неизвестность, а не доказанную сухую стенку; переход к другому cost между exchanges
уже не является prefix канонической последовательности. Чистая первая seam —
после последнего OUTWARD relaxation и copy-to-home pressure, ДО inward mode12,
band mode6 и remobilisation. Pressure на этой seam — тот же окончательный outward
cost/g, который позже читает canonical carry. В eeb измеренный mode12 наступил
472мс после jobstart; этим опытом ещё не доказано время будущего multiscale target.

Capture-private уже владеет исходным mobileP/fixedP/C/V. На outward-complete один
раз копируется окончательный actualpressure в privatecost. НЕ использовать
предыдущую97-unit evolvedP как начало; отдельный режим вообще не запускает раннюю
unit траекторию, чтобы не сбросить её обратно в seed. Далее ordered prefix
`watercolorCarryStrides(budgetPx)` с ТЕМИ ЖЕ params (rate/travel/phase/band/costMax)
на частных копиях. Строго останавливаться на первом неподдержанном stride, не
пропускать его ради более позднего fine шага. No wall-clock radius inflation.
Это потенциально полезный target<1с для smallblot, но не универсальная гарантия:
он всё равно ждёт реальный outward-front. Внесение новых промежуточных ops меняет
только scheduling/presentation, canonical operator sequence/inputs должны остаться.

Стэнсил текущего7b11: WatercolorPasses нормализует u_dir=s/outSize; wcCapillary
множит его на3/s, следовательно relief footprint ±3 PHYSICAL pixels при любомs.
Donor-capacity достигает s+3; nestedincomingweight endpoint —2s; costLINEAR требует
ещё один conservative texel. Reach=max(2s,s+3)+1 (unit5). После префикса с
максимальным displacement R=sum(strides) перед очереднымs проверить
R+s+reach(s)≤captured support-to-crop margin по обеим осям. P/C/V/coverage reads
имеют не больший reach; координатный oracle перечисляет реальные обращения
(и проверяет выражения исходного7b11 shader/Passes) для1/2/4/8/16/32/64.
97px margin допускает prefix1/2/4/8/16 (R31), но НЕ32. `temp/onset/multiscale-coordinate-oracle.mjs`
PASS — геометрическое dependency-доказательство, не pixel/mass/shader oracle.

S1/crop≤512, owner14, knownpositiveprofile/singlepaint/noCarry/finitebounds guards
и прежние12buffers/12MiB state/17MiB scopedpeak сохраняются. Один pairedC/P шаг
в work quantum; present после такого же four-stride блока, как canonical carry,
или после конца допустимого prefix. Cost immutable после outward seam, seed
immutable; dispose/loss retirement прежние. No extra canonicalcopies/readbacks.
P-prefix byte-equivalence требует hardware comparison crop↔fullfield на одинаковых
captured inputs и offset/background/edge negatives. Singlepaint canonical C
может реконструироваться позже pigmentColor(P,tau), а privateC следует mode16;
поэтому не обещать C-prefix byte-equivalence без отдельного сравнения. Endpoint
канонических слоёв всё равно обязан exact. Measured mass/support обязательно,
никакого MAX-contour или fitted conductivity.

### Остаточная каёмка sheet3: ограничение текущего CPU audit

Изучены именно7b11 source: PlanSHA
b3a23be4de64a3d3c03a7d97a4b159cb26980b2685cc6891abacf93267340ce9,
shaderSHA bf97bd94bc9756187918536196528b3fa88ac6348fa75cbc7f2dc6b5156f3857.
Rootgallery journal ops_3.json SHAecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9
(42stored/41render,20strokes) отличается от полного historical78seq dump; не
подменять входы. CPUslotmap: slot1 clear58→pig59, slot2 60→61, slot3 62→63,
slot4 64→65, slot5 later74→75, slot6 76→77; всеchisel100:100, кроме earlier
33%/dry0 controls. Predecessors/clear/undo/Dry сохранены в реальном journal.
Кропы root[910,154..1925,1264,...] определяют шесть случаев, не один genericcircle.

Phase меняет только plateau-парыcost.r≈0 с реальнойV; положительный cost gradient,
tail capacity и groupTide НЕ выключены. DefaultgroupDry=true: после wetcarry+
diffusion строится отдельный provisional inkDry/colorDry groupTide по wholecoverage
(mode19→inward→mode6→gather→modes7/14). GroupTide не читает V и не зависит отphase;
он остаётся реальным возможным источником dry-only контуров. Diffusion независимо
использует density2P.b/max(V,0.002); fringe с extendedcoverage иV0 не эквивалентен
влажному core и может тормозить. Это reachable code paths, НЕ установленная
причина конкретного остаточного светлого кольца. Базовый slot/line profile должен
сравнить actualP/C доcarry/послеcarry/последiffuse/доgroupTide/inkDry +composite
при одном7b11journal. Без таких plane-данных утверждение material-vs-composite
или groupTide-vs-carry снято. Атлас f877 phase+baked изменяет два флага и не
показывает7b11stage; широкий светлый ореол сам по себе не доказательство бага.
