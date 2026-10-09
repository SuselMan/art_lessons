# GL: цена UP и один точный кандидат подготовки

Измерение ONE Surface, runtime 6249fbf4 / controller f33b8806; компактные свидетельства: `harness/728-gl-timing/one400-up-surface-summary.json`. Это CPU elapsed / GL submission, не GPU execution и не физическая задержка появления пикселя. Второй DOWN был через 16.5 ms после возврата первого UP; мокрота центра .9855075, pending true, lease принят, DOWN drain отсутствует.

Первый UP 106.9 ms: хвост 25.6 (generator 23.8), diffusion preparation 68.6, start/op0 stitch .9; объединение наблюдавшихся интервалов 105.9, остаток 1.0. Второй UP 76.2: хвост 26.8 (generator 23.9), предыдущий completeSettle 28.4, preparation 12.9, start/op0 .2; объединение 76.0, остаток .2. Вложенный finish TOTAL не суммируется с детьми. Max RAF gap 67.8. Новое измерение не объясняет ретроспективно весь прошлый UP110.7.

## Что находится внутри preparation

`Engine._diffuseWashOps → WatercolorSettlePlan.prepare → CanonicalWatercolorSettlePlan.prepare` включает вычисление границ, `_diffuseFieldFor(w,h,true)`, приобретение input buffers, CPU foreign-water stencil и eager brush contact rasters, построение расписания solver.

`_diffuseFieldFor` при совпадении ТОЧНЫХ размеров повторно использует поле и очищает пять входных buffers; при изменении размеров уничтожает прежнее и создаёт десять RGBA8 buffers. Больший buffer со scissor не эквивалентен прежней математике texel stepping/границ. У framebuffer status есть once-per-context guard. Отдельных leaf timestamps alloc/clear/raster пока нет: разница 68.6→12.9 не доказывает, что виновата allocation.

Создание/upload flow textures, очистка остальных полей и stitching выполняются в op0 captureInputs внутри SettleQueue.start, уже ЗА пределами preparation. В этом прогоне их CPU spans .9/.2 ms; возможный driver/GPU stall внутри вызовов измеритель не разделяет.

## Выбранный CPU prototype: exact bounded contact-field cache

Уже существующий `BrushContactFieldCache` и `CanonicalWatercolorSettlePlan.diagnosticContactFieldCache` дают один узкий кандидат без изменения transport/finish: переиспользовать только чистый CPU brushDragField при повторном replay/Undo одинакового travel/crop. GL Engine сейчас этот opt-in не проводит; runtime flag не включён и код рисования не изменён.

Ключ содержит точные Float64 bits crop x/y/w/h, cellPx и упорядоченных x/y/radius/aspect/angle/dx/dy/water. Это полный набор входов brushDragField; settleRadius влияет только на descriptor radius, который пересчитывается вне cache. Цвет/пигмент не являются входами данного поля. Никаких округлённых hashes, изменения группировки, gain, Q8 округления или порядка contacts.

Ownership: cache хранит приватную копию; каждый hit отдаёт новую копию mutable upload bytes. Приостановленный solver сохраняет собственные bytes через другой owner, eviction и clear. Нет переиспользования GPU output, scratch или solver buffers. Ограничение 4 MiB/128 entries, группы >64 bypass; reset/context loss/destroy очищают cache существующими CanonicalPlan lifecycle methods. OFF сохраняет исходный path.

17 CPU tests PASS, включая полную byte equality, каждый изменённый вход, порядок, crop, signed zero, caps/bypass и новый suspended-owner/reset guard. Это доказательство CPU output equivalence, не GPU parity и не performance claim. Cache не устраняет cold первый UP и может не дать hit при новой траектории; до включения нужен отдельный DEV GL constructor seam, counters и измерение hit/miss с полной material parity. Не обещаем экономию 68.6 ms.

Следующий минимальный измерительный шаг при новом разрешении: три leaf spans внутри preparation (fieldFor; CPU stencil/contact raster; оставшаяся schedule construction). Не откладывать finish, не менять UP callback order и не переносить mutable scratch на следующий DOWN.

Surface RELEASE: own contexts закрыты, frontend5382/forward9455 остановлены; postRAM1979 MiB. Disposable gl-up-timing400-5382 finished=true, cleanup safe-hold передан root для стандартного privileged process guard. Manual5381/shared4558 не менялись.
