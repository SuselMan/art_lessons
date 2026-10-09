# DEV mutation authority: только проверка неизменности

captureDiagnosticAuthority создаёт opaque owner-bound token с existing snapshot и приватной revision. Tracking включается только после успешного explicit capture. deposit/drain/commitPending/dropPending/forgetLayer/clear консервативно инвалидируют authority один раз, включая no-op. Prune теперь content-aware (см. ниже). Private peak/bounds writes происходят внутри этих mutators; cell scans/allocations/clocks для revision не добавляются. Обычные reads и независимые fork mutations live authority не меняют.

validateDiagnosticAuthority потребляет capability при любой попытке; foreign instance, forged schema, изменённая модель и повторное использование отвергаются. Точный snapshot/fork прежнего API сохраняется, даже когда validation rejected. Token schema version не content revision; приватный счётчик не характеристика количества воды.

Это prerequisite будущей guarded promotion, а не install/merge/material ownership. Engine/Room/runtime не подключены. Нет обещания атомарной публикации, GPU capture или живого UX ускорения.

## Guarded CPU full-state promotion

promoteDiagnosticFork потребляет authority, проверяет неизменного live owner/revision, exact fork provenance к authority.snapshot, отсутствие pending/drained. Чужой snapshot с одинаковыми bytes не допускается. Не более65536 records; независимая полная копия готовится до изменения live. Затем synchronously устанавливаются private maps/set/peak/time/box при сохранении live object; clocks/callbacks/prune/deposit не вызываются. Успех инвалидирует остальные live capabilities. Snapshot/fork исходного API сохраняются.

Raw oracle сравнивает все maps/cell fields (timestamps/pool), drained/peak/bounds с исходной обработкой того же recorded gesture; query oracle на нескольких временах дополняет это. Stale same-cell, foreign fork/instance, reuse и unfinished pending/drained rejected без изменения live.

Граница синхронной CPU функции не доказывает GPU atomic publication. Empty pending/drained — проверка состояния, не доказательство accepted operation/complete material. Engine wiring, merge concurrent histories и runtime activation отсутствуют; caller material protocol остаётся HOLD.

## Content-aware prune policy после causal proof

Только prune изменяет DEV authority policy: существующий deletion loop отмечает удаление expired cell/empty layer; прежний _recomputeBox выполняется неизменно. При armed DEV capture четыре прежних box scalar values сравниваются через Object.is с новым bounds; одинаковый новый box object не считается content change. Дополнительных scanners/clocks/per-cell allocations нет. Empty или unchanged prune сохраняет authority; реальные удаления и stale-box shrink инвалидируют. Остальные6 mutators остаются conservative даже при no-op.

Actual Engine fresh-empty replay с реальным300ms интервалом и natural drying watcher теперь успешно promotes full raw oracle state несмотря на семантически пустые prune calls. Это CPU MockGL proof; предыдущий Surface writer по-прежнему UNKNOWN, GPU retry не выполнялся.
