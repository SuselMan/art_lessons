# Неполный snapshot prefix: pending authoritative repair

Принцип: baked snapshot — ускоряющая производная, OperationLog — authoritative truth. Отменить covered stroke вычитанием из baked pixels нельзя. Полный исходный prefix позволяет корректный replay; неполный не позволяет ни оставить Undo невидимо проигнорированным, ни удалить единственную base.

Existing seams: SnapshotIO.absorbHistorical → OperationLog.prependHistorical; Room.useRemoteOperations.backfillHistory → walkHistoryBackward (ограничен HISTORY_BACKFILL_DEPTH); existing restoreFailure/replayGate. Understanding: snapshots/737 и collaborative-undo/ADR002. Нужен явный узкий pending-repair контракт между движком и уже существующим backfill coordinator, не новый storage/op format.

1. Covered mutation с неполным prefix регистрирует layerId/coveredSeq и target IDs. Confirmed Undo остаётся в log, snapshot layer dirty/unpublishable. Эта layer физически pending: same-layer start и canonical material не применяются до восстановления; другие layers не блокируются. Старое изображение может оставаться ранним preview, но не считается ready/canonical.
2. Каждый ordinary absorb page пробует complete-prefix oracle. При успехе снять stale snapshot+derived CP/coverage, перестроить layer из CURRENT authoritative states (Undo/Redo мог поменяться во время fetch), затем снять pending. Pending задаёт слой, не старую copy log.
3. Не стартовать duplicate fetch пока ordinary backfill активен. По завершении обычной bounded walk, если repair остаётся, продолжить existing walk от минимального реально полученного serverSeq до1. Historical dedup уже есть. Отсутствующий/ошибочный page — explicit restoreFailure, pending не объявляется successful и не печёт snapshot.
4. Нужно новое typed уведомление/запрос repair к Room и getter pending layer (либо existing generic readiness hook, если найден). Source callbacks должны быть after-log-safe и scope layer; не onInvariant в роли скрытой управляющей шины.
5. Abort/loss/destroy epoch: network page старого room не применяется к новому engine; confirmed log сохраняется, staleGL не трогать. Restore может сам собрать full prefix, тогда pending repair повторно использует его. Нельзя очищать pending лишь потому что пропал CP handle.

Гейты: неполный page с covered Undo даёт pending/нет snapshot bake; same-layer input blocked явно; unrelated layer работает; последнее page→full prefix→exact endpoint; обычный bounded backfill без duplicate запросов; Undo→Redo во время fetch; failure/empty page/actual loss; accepted remote ops во время repair и final wholeRGBA. До review не реализовано.
