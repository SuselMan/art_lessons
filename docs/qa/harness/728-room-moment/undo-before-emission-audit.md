# Undo: материальная работа предшествует сетевой отправке

Проверено текущим исходным кодом и CPU actualEngine test24. Не аппаратный causal proof VPS timeout.

| Звено | Файл/метод | Порядок |
|---|---|---|
| Настоящая кнопка | Room/panels/RoomHeader.tsx onClick handleUndo | UI callback |
| Проверка и возможный диалог | Room/useOperationDispatch.ts handleUndo | readiness/editing; peekUndo; structural confirmation; engine.undo |
| Выбор точного target | engine/index.ts undo | per-author undoTarget; forgetLayer; создаёт control с targetOpId; appendOperation |
| Материальная преграда | engine/index.ts _appendOperationNow | обычный путь сначала _completeSettle; только затем log.append |
| Изменение истории | operation_undo switch → _applyHistoryChange | applyUndo; gestureLayerIds → _rebuildLayerOrDefer; обычный unsuspended путь _rebuildLayer/_replayInto |
| Финальное досведение | _settleLayers | до callback |
| Сетевой callback | _onLocalOperation | после материальных шагов |
| Outbox | Room/engineNetwork.ts onLocalOperation | appliedIds; void outbox.enqueue (durable queue/retry); фактическая Socket.IO отправка ещё позднее |

CPU test `ordinary undo completes pending material before network emission; failing drain has not emitted` использует настоящий engine и pending watercolor. Подтверждает drain:end раньше history:begin, history:end раньше network:undo, точный target. Прерывание _completeSettle sentinel до material finish даёт emission0 и отсутствие undo в log. Обычный stroke target peekUndo=null, structural dialog не требуется.

Это полезная локализация: отсутствие control в QA DB само по себе не доказывает отсутствие click, потому что уже вызванный Undo может застрять до сетевого callback. В нашем VPS прогоне UI performing click и DBnoUndo не различают click delivery, renderer занятость до handler и синхронную material работу внутри handler. Для точного доказательства не хватает begin/end handler/append/settle; QA console observer теперь сохраняет append/settle события непосредственно в Node, не ждёт повторного page.evaluate.

## Предложение на review, не внедрено

Одного переноса `_onLocalOperation` выше rebuild недостаточно: пока синхронный JS/GPU submission не вернул управление, транспорт/outbox и экран всё равно могут ждать. Кроме того, ранний callback до log mutation меняет гарантии appliedIds/ack/rollback.

Узкий кандидат: для обычного локального undo/redo использовать существующую canonical command очередь как отдельную ветку: захватить exact target/control identity, зарегистрировать упорядоченный intent/материальную инвалидность, enqueue network через существующий outbox, затем вернуть управление и исполнять repair bounded slices. Новые source/read/export должны видеть тот же command order и readiness, а server confirmation/reject не должны повторять repair или терять target. Препятствие: нельзя мутировать visible/history-ready snapshot до predecessor boundary; нужны owner/generation/rollback gates. Это асинхронное изменение semantics, а не безопасный локальный reorder. До root review ничего не менялось.

Более низкорисковая отдельная возможность: если pending settle принадлежит другой, независимой L1, а undo target только L2 pencil, доказать dependency-disjointness и не требовать глобальной L1 drain для L2 history repair. Нельзя просто проверять layerId: water/snapshot/merge/gesture read sets могут пересекаться. Это может сократить ненужную преграду без ранней emission, но требует explicit read/write sets и сохранения replay equivalence. Также только предложение.
