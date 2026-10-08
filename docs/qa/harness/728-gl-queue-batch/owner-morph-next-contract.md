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

## Реализованный diagnostic-only этап

`diagLastOwnerMorph=1` добавляет4existing-engine reveal slots по4MiB, всего16MiB отдельного explicit бюджета. Source pool156MiB и reveal pool не алиасят; physical identities source раскрыты read-only. Reveal fields передаются engine lifecycle и не уничтожаются при возврате source lease. При ошибке setup source pool после GPU-safe fence освобождается; partial reveal acquire возвращается engine pool ровно1раз.

В owned original finish только lastowner/no-younger `_revealWash` создаёт настоящий held.before, и actual source presentation копируется в него GPU→GPU. После передачи preview больше не затеняет existing reveal, а canonical pass list/order не меняется. Old finish с младшим visible owner не передаёт старую картинку и не снимает новый overlay. CPU tests подтверждают порядок copy/preview и эти token guards; аппаратная morph/transparency/target проверка пока не выполнена.

Режим **не пользовательский кандидат**: новый DOWN во время transferred reveal явно отвергается с QA сообщением. Это instrumentation gate для исходной visible-before передачи, не решение непрерывного рисования. Defaultfalse и исходный5352не меняется.

## Younger без остановки рисования: следующий proof

Нельзя переносить RGB delta `oldLayerAfter−oldLayerBefore` поверх нового fullsnapshot: composite нелинеен по P/C/coverage, clamp/Q8 и optical-depth нормализация нарушают такое сложение. Нужен retained per-gesture **material** contribution: собственные MAX P/C/V film и own coverage command record отдельно от predecessor base. При old land видимые younger P/C base можно latebind к реально landed prior материалу и пересчитать presentation `base+ownfilm` теми же mode1 passes; canonical FIFO input остаётся неизменным. Coverage union нельзя получить вычитанием — нужен own coverage film/typed command replay над обновлённой predecessor coverage.

Сначала CPU/gpu same-record два epoch: predecessor changes, own film unchanged, no doubleprepare/no canonical writes, oldland cannot retire younger; затем visual timeline. Только после proof разрешается убрать diagnostic backpressure. Это отдельная работа, не реализована текущим fullsnapshot adapter.

## Material rebase API (diagnostic, not Room wiring)

OwnedGlPreparedSource optionally retains cloned canonical commands and composite inputs. A rebase validates owner-token identity, layer, predecessor gesture, monotonic epoch, dimensions and all borrowed-versus-owned texture aliases before any write. It copies six predecessor roles into owned storage, then executes the immutable source commands through the existing prepared GL port. No geometry or delivery is prepared again. Canonical FIFO inputs remain separate.

A submission exception poisons this presentation owner without releasing its lease; the coordinator must apply its cancellation fence before physical retirement. Epoch advances only after submission succeeds. The 2 MiB serialized-payload/2048-chunk cap bounds serialized inputs, not actual JavaScript heap usage. GPU ownership remains thirteen 1024² RGBA fields per owner.

CPU tests cover mutation after capture, stale/foreign/future callbacks, alias rejection before writes, correct six copy destinations, replayed F32 input and composite bounds, and failure without premature release. These are command/resource-contract checks; they do not establish GPU field parity or smooth morphing. Next boundary is actual prepared GL replay against a changed predecessor, then Room epoch wiring without rejecting a new DOWN.
