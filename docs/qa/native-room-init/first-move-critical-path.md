# #728: первый MOVE в обычной WebGL комнате

Read-only анализ root `0f438f1b`, 08.10.2026. Измеренная пауза около первого MOVE: 533ms OFF / 450ms queue ON, при DOWN CPU 6.4 / 4.2ms. Это не локализованная стоимость `_onMove` и не время появления собственного пигмента. Новых аппаратных прогонов и изменений runtime нет. Рассматриваются joinedTouch=1, mixed=0, deferred=0, material=0.

## Что действительно выполняется

`PointerInput._handleMove` синхронно передаёт каждый coalesced sample → `_onMove` → DabSystem → `_paintStrokeDabs` → `_paintDabs` → `_paintRibbonDabs` → RibbonStrokePainter. Live ribbon generator исчерпывается синхронно: его yield не уступает браузеру. DabSystem имеет задержку в один реальный sample, поэтому первый MOVE может ещё не выдать дабы. Нужно считать emitted samples/dabs и мерить следующий MOVE также.

1. **CPU wetness.** `_paintStrokeDabs` вызывает `sampleUnderNib` для каждого даба, затем drain/deposit. Это Map-сетка 8px, без GL readback. Круг радиуса200 посещает около1963 клеток; при aspect/nib multiplier стоимость растёт квадратично. Отсутствующий слой возвращает0 сразу: холодная сухая бумага принципиально отличается от существующего мокрого слоя. Список coalesced events и число дабов могут умножать эту работу.
2. **Холодная геометрия/ресурсы.** Painter строит pigment/water/solvent bands, получает actual targets; scratch.getOrCreate выделяет original/coverage/P/C и копирует/очищает их. filmBuffers на новой materialGesture создаёт/очищает stroke P/C и копирует bases. TexImage2D может иметь driver cost; это гипотеза, не замер. Framebuffer status уже проверяется один раз на GL context, а не при каждом буфере.
3. **Первое мокрое взаимодействие.** При foreignSources=null и wetPeak>0 `_ribbonDabsWork` сканирует журнал, декодирует прежние мазки/footprints. Painter импортирует foreign solvent отдельным water-only replay и modes20/1. Это одноразовая подготовка по состоянию scratch, не обязательная стоимость каждого MOVE. Нужны cache-hit и число foreign chunks/footprints.
4. **Барьер между событиями.** joinedTouch пропускает `_completeSettle` только при точном совпадении scratch/gesture/preset/color/layer и прочих gates; mixed=0 не разрешает смену цвета. Иначе start синхронно завершает старый job. `_runSlice` и очередь используют GPU completion barriers. Кроме того `_scheduleDisplay` в debug при pending timestamp вызывает gl.finish после display: дешёвый submit DOWN может оставить большой backlog именно в следующем rAF. Проверить actual debug state до причинного вывода.

## Минимальная следующая трасса

Сохранять один monotonic clock и отдельный event.timeStamp: controller dispatch/send/ack; raw pointerdown/move entry; coalesced count; `_onMove` entry/exit и number of dabs; DabSystem; wet sample/drain/deposit totals и visited-cell counts; prepareDelivery; три buildBands; foreign scan/import counts; pool acquire hit/miss и texImage2D wall; source draw-submit; `_display` entry/exit; каждый sync с callsite/job phase. Кольцевой CPU журнал без console по каждому дабу и без readPixels/gl.finish, добавленных ради трассы. GPU timestamp — отдельный прогон. Gap до handler отделить от handler CPU, GPU barrier и controller scheduling. First own pigment идентифицировать source gesture, не первый любой draw старого settle.

Сравнить cold fresh dry400, повтор по сухому с прогретым pool, same-wash/same-color pending400, water→pigment pending400; фиксировать actual tape/paper и число samples. Debug OFF/ON только как диагностический A/B с паспортом: выключение диагностического fence не объявляет физическую задержку исправленной.

## Идеи без изменения математики — только после локализации

- Если доминирует allocation: заранее acquire пустых buffers нужного actual tile/filter во время idle и сохранить тот же clear/copy/order при первом source. Не prefill материальное состояние и не вытеснять активные поля; сравнить память и final bytes.
- Если доминирует CPU wetness: exact per-batch spatial candidate enumeration/общая подготовка координат; каждый dab всё равно получает собственный max с тем же now/decay и круговым predicate. Нельзя заменить max средним или кэшировать между drain/deposit без invalidation.
- Если доминирует geometry: shared pure band batch из неизменных delivery maps, с frozen Float32 command goldens. Не продвигать delivery clocks повторно на tile.
- Если доминирует foreign preparation: immutable decoded-dab/footprint cache по operation identity плюс явные undo/restore/layer invalidations; не менять временной отбор или порядок merges.

Ни одна гипотеза пока не доказывает происхождение 533/450ms. Queue ускоряет завершение settle; onset первого MOVE остаётся отдельным незакрытым вопросом.

Исходники: `engine/index.ts` (_onStart/_onMove/_paintStrokeDabs/_ribbonDabsWork/_scheduleDisplay), `input/PointerInput.ts`, `dabs/RibbonStrokePainter.ts`, `buffers/RibbonStrokeScratch.ts`, `buffers/AccumulationBuffer.ts`, `paper/paperWetness.ts`. Числа устройства — root `docs/qa/728-queue-finish-2026-10-08.md`; это живые независимые tapes, не межверсионный exact oracle.
