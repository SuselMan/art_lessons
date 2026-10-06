# #728: быстрый путь чистой воды — CPU исследование

Источник: initial combined436b2c1c/e8af6155, без ring/q кандидатов. Код и GPU не менялись.

## Вывод

Узкий путь возможен: пропускать перенос/контакт/осаждение пигмента, когда оба входных material records P и C доказанно нулевые. Полный выход из settle или отключение coverage/V небезопасны. Готового достоверного CPU флага нулевого пигмента сейчас нет.

На принятом segmentDelivery + pigmentRecord источнике pure water уже не рисует P/C nib/bands: RibbonStrokePainter.pigmentPhase проверяет inkStrength>0. Но после него создаются film buffers, выполняется base+film, выставляется diffusePending; WatercolorSettlePlan всё равно строит mobile split, carry/diffusion/tide и chronological brush contacts. На water400 именно contact.substeps зависит от radius и exposure, хотя физически передвигать нулевой P/C нечего. Численное ускорение пока не измерено.

## Что является и не является доказательством

- RibbonStrokeScratch.getOrCreate очищает P/C; это точная начальная база. Water-only при принятых flags не добавляет P/C. importForeignWater читает donor через waterOnly и импортирует V, не P/C. Сумма/положительный перенос/разность с тем же нулём сохраняют ноль.
- `hasLayerContent`/OperationLog.pixelOpDoneCount НЕ подходят: pure water сама считается pixel operation.
- `scratch.paints` НЕ подходит: цвет добавляется безусловно даже при pigmentStrength=0; несколько цветовых настроек чистой воды дают paints.size>1.
- `pigment=0` текущего пресета НЕ подходит: wash может содержать прежний P/C; под ним может быть старая краска/original. Не оптимизировать воду поверх окрашенного слоя.
- contentRects/coverage/solventLoad/PaperWet также НЕ доказывают отсутствие пигмента. Буфер может быть present-but-empty; отсутствие buffer не заменяет его контракт.
- Undo/Clear/PaperDry различаются: Dry НЕ удаляет пигмент; только выполненный layer_clear или доказанная новая пустая layer устанавливают empty provenance. Undo clear возвращает unknown/nonempty.

## Минимальный conservative proof gate

Без нового формата операции можно вывести состояние из полной ordered active history на operation boundary:

1. Известная новая пустая layer либо актуальный done layer_clear, которому соответствует реально очищенная/rebuilt layer. Если snapshot restore имеет covered prefix без доказанного clear/new-layer — UNKNOWN, медленный путь. Checkpoint не даёт сам по себе пигментного CPU доказательства.
2. После этой границы все done/pending pixel writes и текущий незаписанный live stroke — только watercolor с effective pigmentStrength===0 при действующих segmentDelivery/pigmentRecord/solvent flags. Любой другой stroke, merge/duplicate/import/paste/fill/shape/filter/transform — UNKNOWN. Консервативно даже erase не восстанавливает доказательство empty.
3. Сам scratch создан очищенным в этом интервале, не восстановлен из неизвестного carried/checkpoint state. Если нужна передача zero flag через парковку/capture/restore — новое только внутреннее scalar metadata, older absent=>UNKNOWN; не опираться на paints.size.
4. Любой ввод ненулевого pigment инвалидирует zero ДО рисования, даже до появления local operation в журнале. Разная нарезка gestures/chunks и peer queue не должна давать ложный true. Для первой версии проверять после flushLiveComposite и до prepare, на уже завершённом operation.

Полную историю можно кешировать по OperationLog.revision, но одного revision недостаточно во время local live stroke: нужен отдельный current-stroke guard. Это план gate, не готовая реализация.

## Какие проходы пропускать сначала

Первый ограниченный кандидат: при zero-P/C gate не строить `brushDragContacts` и не добавлять brushPass/copyRegionInto обменов. Эти pulses читают только P/C и flow geometry, не изменяют coverage/V. Для доказанного нуля оба выхода равны входам. Это наиболее локальная экономия без изменения water-front/resource alias порядка.

Второй шаг после причинного контроля: mobile split/carry/remobilization/bloom/puddle pigment diffusion/rim/groupTide/pigmentColor дают ноль; их можно заменить известными нулевыми dep/col endpoints. Но field scratch alias и финальный land сейчас переплетаются с front/coverage, поэтому просто убрать callbacks из общего списка недостаточно. Не позволять новой film пигментного штриха, начатой во время старого settle, обнулиться: сохранить existing runningFilm base+film и fromField delta semantics.

Обязательно оставить:
- waterByDab/standing/depletion/landing metadata, wetContacts и геометрию, V solventFilm MAX внутри gesture и ADD между gestures;
- PaperWet deposit, damage и видимость воды;
- покрытие coverage и waterFrontOps/его capture-land. Seed mode10 читает material.a, поэтому не заменять его constant stencil: на pure water P.a=0 front обычно не растёт, но exact equivalence coverage ещё требуется;
- dryCtx, diffusePending consumption, film release, wash lifecycle/capture/checkpoints/foreign-source identity/dedup;
- final composite/исходный original и корректное завершение reveal. Pure water не означает пустой presentation, а следующий pigment stroke должен видеть ту же собственную/чужую V.

## Нужные причинные проверки будущего кандидата

Без изменения source P/C/V сравнить baseline/fast на новой пустой layer: water80/400 прямой и zigzag, две pure-water gestures, same-wash pigment потом, foreign-wash pigment потом, chunked water. P/C должны быть полностью нулевыми до первого pigment; V/coverage/standing и последующий цветной dry PNG должны быть byte-exact. Отдельные отрицательные контроли: вода поверх старой краски, чужого цвета, restored snapshot unknown и Undo clear — fast gate=false. Restore/UndoRedo/replay gate должен давать тот же результат; performance замерять actual contacts/pass count и hardware duration, не число CPU callbacks.
