# L2 pencil Undo при L1 watercolor: границы независимости

Принцип решения из существующей архитектуры: сервер владеет порядком операций, клиент — пикселями; материальный результат публикуется только после завершения собственного восстановления. `understanding.yaml` прочитан; статусы понимания Ильи не изменялись. Здесь только анализ/DEV defaultOFF предложение, runtime не изменён.

## Необходимые условия коммутативности

Для U=Undo точного pencil gesture на L2, S=pending watercolor на L1 требуется одновременно:

* U gestureLayerIds={L2}, target/client identity неизменны, не multi-layer erase/structural/history control target.
* Вся replay история L2 — только независимые pencil strokes/проверенные local-only pixel ops, без merge/duplicate/transform/import/filter/snapshot зависимостей от L1.
* S canonical target/scratch/reveal/rebuild owner не alias L2; нет активного input, joined lease, peer preview, native command или queued foreign intent, который читает оба слоя.
* Snapshot history mutation/dependent layers/read sets не связывают L1/L2; export/checkpoint пока S не завершён остаётся закрыт, нельзя считать весь room ready после U.
* Per-layer paperWet forget/restore, carried ribbon chunks, field/cache/budget eviction и composite generation не меняют canonical S, его owner и финальный результат.
* server ACK/overtaken journal repair и contextloss replay восстанавливают тот же operation order и exact target, независимо от порядка исполнения независимых material writes.

Непересекающиеся layerId доказывают только первый пункт. Они не доказывают остальных.

## Почему один skip не является кандидатом

1. `_appendOperationNow` глобально `_completeSettle` перед log append.
2. Даже если убрать эту преграду для U, `_applyHistoryChange`→`_rebuildLayerOrDefer`→`_rebuildLayer`→`_replayInto`→`_dropCarriedGestureState(bufL2)` снова **безусловно завершает любой `_settle`**, до фильтрации ribbon chunks по buf. Значит одно изменение не даёт выигрыш.
3. `_dropCarriedGestureState` дополнительно глобально чистит smudge replay chunks (кроме текущего input), а не только L2. `_applyPixelOp` может retirement wash/native invalidation и paperWet restore; поэтому обход обеих преград требует отдельного доказательства разделяемого состояния.
4. `_settleLayers` после Undo просматривает глобальное `_unsettledLayers`, не только L2. Даже независимая U может инициировать другие repairs до network callback.
5. S queue owner/reset — engine-wide; `_completeSettle` finally обнуляет joined lease. Разрешить U параллельно S означает изменить lifetime/cache/budget contracts, а не только layer pixels.

Невозможность математической независимости не доказана; доказано, что **текущий narrow layerId-only skip недоказан и недостаточен**. CPU parity для такого runtime кандидата не предлагается до полного read/write/ownership gate; фальшивый speedup от mock GPU здесь не помог бы.

## Предпочтительный минимальный протокол на review

DEV defaultOFF локальный deferred-history request использует существующий `_opQueue`/`_scheduleOpDrain` порядок:

* На click выбрать exact target/control identity один раз и сохранить в request, не `undoTarget` заново после ожидания. Локальный room/history пока не мутировать и не эмитить раньше material acceptance.
* Если есть pending predecessor, append intent в существующую FIFO очередь; rAF уже ждёт естественного окончания `_settle` и input. Не вызывать `_flushOpQueue` синхронно только ради UI Undo.
* Когда queue допускает исполнение, обычный `_appendOperationNow` выполняет U; существующий callback/outbox/ACK порядок сохраняется. Snapshot/export остаются gated queue, как сейчас.
* Повторные Undo/Redo, новый input, contextloss/destroy/remote arrivals требуют explicit pending-control owner/identity semantics: нельзя silently переселектировать target, потерять already-emitted intent или перепрыгнуть serverordered queued op.

Это убирает принудительное завершение S внутри click, **не обещает немедленный server delivery** и не отменяет стоимость L2 repair. Оно сохраняет существующий publish-after-material контракт и не требует раннегоemit. Нужен root review API pending command/lifetime, затем defaultOFF CPU coverage: exact identity/queue FIFO, repeated control, source while pending, contextloss+restore, final pixels OFF/ON. До review реализации нет.
