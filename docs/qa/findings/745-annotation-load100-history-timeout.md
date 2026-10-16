# Annotation entry100 strokes: readiness есть, full-history gate истёк

Кампания #745, Vega realGPU, runtime0c83ca99. Fixture100 strokes×8dabs,
dryEvery20, seed728745, inputSHA3a49cc12ee2f1e4acf0080d9573045756af7cf4a63f5cd7c45e3ed1eecbe48e5.
Normal entry completed: navigation→ready11693ms, engineReady11979ms,
firstVisibleRaf11746.7ms, fullhistory22752ms;107authoritative operations.
Next fresh context at ?qaModel=m70-r2-v1&preview reached engineReady and
assert annotationMode===true, then historyReady gate timed out after60000ms.
Compact third mode was NOT reached. No reported pageerror.

This timeout alone does not identify missing history versus pending replay/solver.
Original harness did not preserve failing log/job metadata; enhanced catch now
records actualannotationMode, logIDs/states, pendingSnapshotHistoryRepairs,
opQueue, pendingRebuilds/jobs, puddle pending/drying and screenshot for replay.
Need distinguish legitimate cached-preview path from broken hydration. First
normal close may produce a preview: cached-preview behavior was not independently
controlled and must not be claimed covered.

Evidence: temp/device-runs/745-final3-load100/loading-report.json, normal.png.
Own fixture retained: qa-undo-v1-7d6c3a43-37f9-46a3-8435-e889c346bafa.
Auth private, not committed. Hardware contexts closed. Follow-up should inspect
actual historyIDs and pending flags before assigning product severity.

Уточнение после повторной диагностики (runtime2f52616d): фактически log102,
нехватающие5strokes inputseq2..6; все repair/jobs/queue/puddle.pending пусты.
Обычный backfill намеренно ограничен100ops (`HISTORY_BACKFILL_DEPTH`), а снимок
достигаетseq107. Backend API сохраняет107ops, room_state содержит6tailmeta,
индекс слоя покрываетseq107. Поэтому strict raw-ID gate слишком строг для
этой комнаты: timeout пока не доказывает дефект продукта. Новый loading gate
требует присутствие каждого op либо **для stroke** позитивное подтверждение
restored SnapshotLedger.isCovered(layerId,serverSeq); все meta обязаны быть
в журнале. Следующий аппаратный повтор сохранит ledger и omittedCoveredIDs.
