Исправлено локально: финальный composite повторно resolveWithinSheet в момент записи, поэтому coarse уровни вновь dirty после асинхронного settle.

Регрессия before1FAIL/afterPASS; связанные WC/replay83PASS. Full unit267files/3414PASS. Browser mixed pairs before5PASS/1FAIL; after6/6PASS, два повтора P+M/WC+eraser/WC+smudge включают concurrent input, author undo/redo, late join. Typecheck+e2e typecheck+project oxlintPASS (existing warnings).

No push/merge. Более широкий #691 пока открыт: первоначальное расхождение трёх GPU/сложной мокрой истории требует отдельного подтверждения.
