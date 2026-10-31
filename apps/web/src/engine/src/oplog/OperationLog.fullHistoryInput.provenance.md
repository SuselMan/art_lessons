# Оригинальная delivery полной истории в журнале

Продолжение `canonicalRoomState.fullHistory.provenance.md`: V2 read сохраняет
оригинальные нормализованные undo/redo atoms вместе с frame/close. Metadata
принимается ingress только из исходного full-history lifetime, с frozen strict
shared schema, без canonicalRead и с точным указателем в его исходном tail.
Data-only scope не создаёт delivery; произвольный frozen metadata object не
становится элементом исходной истории.

OperationLog повторно проверяет исходный owner до и после bounded shared capture.
Для сравнения тела восстанавливается только authoritative server sequence;
локальный op.seq остаётся порядковым номером журнала. Timestamp, target, actor,
ID, тип и закрытая структура должны совпадать. Undo/redo не получают gesture
identity из targetOpId; правило lifetime одного gesture остаётся у frame/close.

`OperationLog.fullHistoryInput.test.ts` использует настоящий
prepareCanonicalRoomState full-room-prefix-v2, частичный frame + close + undo +
redo. Покрыты append, отдельные historical scratch logs, prependHistorical,
empty-journal revision CAS, сохранение исходного delivery, отличное локальное
seq, copied proof/pointer, изменённое тело/target, stale owner, getters, попытка
добавить canonicalRead к metadata и mint из data-only/foreign input.

Это локальная prerequisite полной baseline истории. Live undo/redo ingress,
legacy authority, Room activation и серверная emission этим изменением не
расширяются. Новые процессы, сервисы и device resources не создавались.
