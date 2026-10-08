# #728: следующий bounded presentation этап

Canonical FIFO теперь подтвердил actual rapid3 target/load/undo/redo. Это не полный UX: visible owner удерживает live picture до своего land, а существующий reveal до этого времени скрыт overlay. Нельзя выдать эту задержанную смену картинки за живое растекание.

## Причина ownership разрыва

`_finishRibbonStroke` создаёт `_revealWash` из текущего **canonical** target, который на момент FIFO finish может отличаться от видимого owned presentation. `_asyncLocalPreviewTiles` затем рисует поверх него последний owner. После `coordinator.land` owner сразу retires, и preview исчезает; reveal-before не обязан совпадать с последним видимым source. Исправление начинается с реального visible-before, не с другой модели воды/пигмента.

## Узкая следующая граница

1. Только последний owner, когда младших pending/drawing нет: до own canonical finish передать копию фактически видимого presentation в existing reveal-before. Использовать одинаковую фильтрацию/мipmap semantics target, как `_revealWash`, не nearest scratch. Не читать framebuffer на CPU.
2. Передача физическая: copy into отдельный owned reveal slot до возврата 13-role source lease. Reveal slot нельзя считать возвращённым в source pool; ledger и fence имеют отдельный lifetime. Сначала prewarm explicit4MiB1024RGBA slot вне DOWN; учесть дополнительные wetMask/pending existing reveal ресурсы отдельно, не прятать их в156MiB budget.
3. Пока младший owner виден, старый land не изменяет и не освобождает младший overlay. Для смешивания morphing старого wash с младшим source требуется отдельное доказательство delta/composition; текущий полный snapshot не является изолированной дельтой. Эта ветка остаётся явно вне первого прототипа.
4. Start morph clock после UP без паузы на canonical calculation; пока вычисление не готово, показывать доступный progressive canonical intermediate только с его owner token. Не запускать другую физику и не объявлять progress если actual intermediate ещё нет. Dry ускоряет presentation clock до2с, но не сокращает canonical pass list.
5. Cancellation/layer remove/history/engine dispose: reveal lease fenced отдельно, generation-token поздних callbacks не трогает новый owner. Четвёртый pending сохраняет explicit backpressure; scope нельзя тихо сделать unlimited.

## Gate до Room wiring

CPU state machine: old finish не меняет new overlay; canonical land и reveal retention разные состояния; slot не переиспользуется до fence; capacity/memory counters учитывают оба lifetime. GPU: actual before-UP/after-UP/pre-land/post-land framebuffer timeline на одинаковом mask, no sudden alpha depletion; target и samepacked original/history остаются exact. Final-field readback проводится отдельно от timing. Это proposed contract, не готовый morphing implementation.

## Первая DOWN allocation

Prewarmed owner pool даёт0texture allocations при DOWN2/3, но DOWN1 всё ещё1. Источник пока не доказан: engine `_updateWetTexture`/tip/preview или другой original allocation. Opt-in `collectAllocationStacks` сохраняет ≤8caller stacks в QA scenario (defaultfalse), это отдельная диагностическая серия; её timings не сравнивать с passive latency cohort. Не prewarm произвольные ресурсы до actual caller evidence.
