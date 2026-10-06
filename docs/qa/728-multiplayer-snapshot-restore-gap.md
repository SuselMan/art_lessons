# #728: совместная акварель и потеря возвращённого мазка при snapshot restore

Проверка 2026-10-07 на настоящей Vega. Неизменный HOME frontend5322/backend4538, source18018025, паспорт combined-web baseafaaf937 +main0ed9cf21, tar84575f2c0fcc6a90fdcb966988e36d42ad7c0b1df6ac34aa56f94e0ed4850538. Один собственный Chrome, два независимых auth-context, физическая комната Custom640×480 (Room model.width/height640/480), viewport640×480, кисть100. Default flags, без изменения renderer/model/source. Все процессы закрыты finally.

## Подтверждённый дефект

Комната P8TL9XaE, исходный полный журнал17 операций сохранён в JSON внутри страницы из `_log.entries.map(e => e.op)`. Последовательность: вода A → пигмент B по воде → второй цвет A → shared UI Dry → отмена/возврат второго цвета A → отмена/возврат пигмента B → операции второго слоя и удаления/возврата удаления → final UI Dry → обычный перезаход B.

До перезахода17 барьеров подтвердили authoritative ACK, одинаковые состояния журнала/слоёв, отсутствие pending/settle/rebuild/reveal/live, GL0/lostfalse и побайтное равенство whole transparent PNG двух участников. Отмена A касается собственного цветного мазка, **не paper_dry**: Dry не undoable и остаётся done.

Автоматически опубликован настоящий snapshot layer-1 наseq5: hash0f3e6d26a93e1b99db97ca086a986296f3925349ee5473f9b49fa59362e7dbf1. Перезаход B реально скачал index200 и blob `/api/rooms/P8TL9XaE/snapshots/layer-1/5`200. После восстановления tail и состояния присутствующих записей совпадают, оба idle/GL0, но whole PNG расходится **22784px/max255/alphaMax255/premultMax216.0039**.

Восстановленный B побайтно совпадает с картинкой `foreign-pigment` и `A-own-undo-colour`: возвращённый redo6 цветной мазок A отсутствует. Отдельный чистый PencilEngine с тем же paper/page и **полным исходным журналом17, включая undo5/redo6**, дал PNG EXACT0 относительно текущего A; относительно restoredB та же delta22784. Это реальный restore gap, не расхождение native/packed input.

Raw HOME680-lifetime-hardware:

- `temp/multiplayer/default18018025-stable-keys/`: report, original whole PNG, `reconnect-phase-comparison.json`.
- `temp/multiplayer/default18018025-fresh-oracle/`: полный исходный журнал, fresh.png, report с exactA0, GL0/lostfalse.

## CPU причинная граница (ещё не исправлена)

Snapshotseq5 снят после undo второго цвета, поэтому его пиксели не содержат stroke3. Tailredo6 применяется до asyncbackfill; отсутствующий target даёт applyRedo no-op. Backfill начинается с beforeSeq5, то есть сама boundaryundo5 не попадает в историческую страницу1–4. SnapshotIO.absorbHistorical создаёт stroke3 в состоянии done, prependHistorical не пересчитывает уже применённые tailmeta, markCovered маркирует его по seq≤snapshot. Поэтому запись done после загрузки не доказывает, что redo восстановил пиксели. Нужна targeted snapshot-state/dependency closure; простое ожидание backfill или blanketfullreplay не проверено и не является готовым исправлением.

## Семантика B undo: проверенные и непроверенные границы

Контроль `default18018025-Bundo-semantic-fixed`: Bundo до A2colour изменил16293px/max255; после A2colour изменил16283px/max201. В обоих состояниях undone target IDs проверены и current PNG EXACT0 с чистым replay **того же полного журнала**; GL0/lostfalse. Ранний Bundo/redo добавлен в эту последовательность, поэтому она не идентична первоначальному сценарию, где поздний Bundo был pixel-noop. Старый случай не опровергнут: для него требуется самостоятельный sameoriginaljournal oracle.

## Отозванные fixture claims

Первоначальные metadata barriers ошибочно требовали полное равенство resident entries после snapshot: покрытый undo5 не возвращается сервером. Также JSON.stringify layerState ошибочно считал порядок ключей различием. Контроллер теперь допускает только отсутствие покрытых undo/redo≤actualsnapshotseq, требует совпадение strokes/tail/state и нормализует ключи объектов. Historical serverSeq подтверждается HTTPoperations, не локальным op.seq.

Ранние reports использовали getOperations (doneOperations), поэтому они **не полный журнал** для replay отменённого stroke. В stable-keys и всех новых oracle используется _log.entries. Первый semantic attempt передал PaperState.color функцию вместо результата color(); это ошибка harness до получения oracle, не appbug. Latejoin после текущего restoreFAIL не запускался. Opt-in sourcefilm/phase matrix не запускалась. Peer agreement, CPU план, частичные PNG и defaultOFF не выдаются за combinedON/persistencePASS.
