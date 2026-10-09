# Mixed lease: следующая независимая матрица

Runtime остаётся без новых изменений до ручной оценки. Manual frontend5381, shared backend4558 и пустая комната уже доступны; Surface не занимать без allocator.

CPU realEngine: 22/22 PASS. К существующим export/snapshot prefix guards, Undo/Redo, FIFO двух peer strokes, естественному completion, cancel/destroy добавлены реальные смешанные owned scenarios: mid-input Dry обнуляет wet cells, помечает dryAtPenUp, UP освобождает lease и следующий штрих создаёт другую wash; context loss снимает old job с очереди, destroy не воспроизводит captured source commands. Дополнительно peer stroke→Undo→Redo queued при active lease сохраняет FIFO pixel-application callbacks и exact targetOpId; redo возвращает peer entry в done. Accepted history может отражаться ещё до pixel application, поэтому getOperations presence не служит доказательством ранней отрисовки. App/SW typecheck PASS. WeakMap presence при удерживаемом job не является утечкой, а direct watercolorDryAll не публикует network paper_dry: это отдельные обязанности Room.

Следующий bounded browser multi-peer cohort — только после allocation:

1. Одна новая QA-комната, два own isolated contexts, общий backend4558; actor A candidate, B ordinary peer. Fresh RAM admission для каждого, максимум два contexts; threshold не ослаблять.
2. A выполняет фиксированный overlapping pigment400 source, SECOND DOWN доказывает lease admission, paused input сохраняет active lease. B отправляет stroke и Undo именно его ID, затем Redo; фиксируются server seq и actual application FIFO, не только count.
3. До A UP material exports/snapshot должны fail closed, никаких чужих partial snapshots. После UP и canonical idle оба done stroke identities/control targets согласованы; canonical per-layer and whole RGBA сравнивать после server ACK/queue drained. Читать pixels вне latency span.
4. Отдельно UI Dry B во время A input: A wet map очищается и последующие source dabs фиксируют сухую бумагу; replay parity проверяется новым rejoin, а не checkpoint view старой картины. Если memory budget не допускает этот дополнительный scenario в том же cohort — остановить после первого, не создавать третью вкладку.
5. Cleanup closes только own contexts; captured evidence до disposable finish. При любом failure остановить, сохранить readiness/seq/actor/PNG/whole BEFORE assert, no automatic retry. Physical visible latency не выводить из rAF.

Этот план не утверждает, что concurrent hardware parity уже пройдена. Ранее hardware PASS покрывает source-field equality, single-user UI Undo/Redo/Dry и exact snapshot rejoin; новые peer control пересечения пока CPU/planned.
