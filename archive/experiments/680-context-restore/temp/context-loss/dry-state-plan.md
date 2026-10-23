# Следующий CPU-prepared QA: Dry и восстановление живой влажности

GPU не запускался. Controller dry-state.mjs: один собственный Chrome,2auth,180s finally,3 новых комнаты. Source7e/последующий эквивалентный release явно сверять SHA перед grant.

1. Ordinary native watercolor100/40 → actual UI Dry everything → ACK paper_dry → peak=0. Затем actual context loss/restore. Peak и sample в середине старого stored dab обязаны остаться0. Непустой canonical сверяется с обоими fresh server reader.
2. Такой же Dry→UIUndo→Redo. После Undo удалённая owngesture, после Redo canonical возвращён, но paper_dry остаётся в подтверждённом журнале. Повторная гидратация старого stroke не должна возвращать wetness. Freshreader ожидается0.
3. Watercolor→Dry→новый watercolor120screenpx ниже. Старый sample обязан0, новый>0 и послеrestore. Это защищает от blanket 'любая Dry делает всю историю сухой'. Сравнения nonzero величин по разному возрасту не oracle; здесь однозначный invariant старого sample=0.

Controller использует настоящий UI, WEBGL_lose_context и штатный codec strokeDabs (динамический import реального shared/dabCodec.ts). Sample позиции из stored dabs. Не имитирует модель wetness; записывает реальные peak/sample и полные rawjournals. Разные ephemeral-water результаты помечаются logicalPass, а не маскируются tolerance.

CPU source findings:
- _wetFromForeignStroke отсекает только age и tip/tool, не log Dry/clear barrier.
- Restore/_replayStrokeSlice и обычный redo вызывают helper повторно.
- _appendOperationNow новый lost branch не выполняет PaperWet.clear/forgetLayer, что тоже требует отдельного logical-state решения.
- Уже есть hasActiveWater.ts, корректно использующий порядок doneoperations и сбрасывающий доступность по paper_dry/layer_clear. Следующий минимальный eligibility helper должен использовать тот же ordered-log принцип и op IDs (а не сравнение timestamp Dry/stroke из разных часов).

После аппаратного proof возможный ограниченный план:
1. Единый active young stroke-ID set после последних глобального Dry и соответствующего layer clear; undone/revoked исключаются doneOperations. Expiration остаётся прежним WET_DRY_MS.
2. Передать opID из replay callers в _wetFromForeignStroke и не регидратировать stroke, расположенный до barrier. Live uncommitted packets рассматриваются отдельно как current-time ephemeral; не заменять их старой записью.
3. Lost metadata Dry/clear выполняет только CPU PaperWet clear/forget, без watercolorDryAll (она запускает GL/drying jobs).
4. Учитывать уже существующую влажность при restore: логический barrier должен быть применён и к сохранённым ephemeral cells, не только новым deposit. Сохранить все legitimately fresh post-Dry источники. Прототип после proof, не менять shader/model/dab delivery.

Никаких изменений production source для этой следующей темы пока не сделано.
