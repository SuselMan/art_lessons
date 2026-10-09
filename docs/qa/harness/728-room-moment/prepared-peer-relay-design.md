# Достижимый split peer cohort без clock/scheduler overrides

Текущий strict all-three-events-under-lease controller остаётся сохранён. Новая схема — отдельный proof с явно более узким утверждением: **первый peer source принят при actual lease, последующие controls удержаны в той же очереди того же активного жеста**, даже если old solver естественно закончил lease между событиями.

Подготовка до A.hold:

1. Создать собственную QA-комнату, два actors; B получает отдельный слойL2 обычным UI до эксперимента, A рисует наL1. Дождаться actor/room/restore readiness и реального live idle обоих. Все structural operations закончены до A predecessor, manualroom защищена.
2. B обычной pencil кистью24 выполняет реальный DOWN+MOVE на своём слое, **оставляя UP неисполненным**. Это не precomputed operation injection: реальные pressure/geometry/dabs/source продолжают принадлежать PointerInput, будущий UP обычным образом создаёт network stroke contract. Начальный B DOWN не зависит от будущего A water predecessor.
3. A создаёт water predecessor и сразу pigment DOWN (старый проверенный hold path), доказывает actual lease и initial failclosed exports. После этого B выполняет UP. Incoming A water, если приходит под B input, обрабатывается естественной peer queue; не пропускается и не замораживается.

Фаза1 — exact first peer stroke server seq/ID должен прийти к A пока lease активен и попасть в _opQueue. Иначе INCOMPARABLE без увеличения deadline. B source/ID возвращаются одним browser call; begin/end markers остаются обязательны.

Фаза2 — B actual UI Undo/Redo target того же source ID. Они могут потребовать естественного завершения B live work; длительность фиксируется отдельно. A pen всё ещё удерживается обычным PointerInput. Natural completion A predecessor может снять lease, но peer source должен оставаться в очереди, потому что A gesture активен. Controls должны иметь возрастающий server seq, exact target, same A strokeId/active owner и retained source prefix в queuedAfter. Если контроль пришёл вне lease — не утверждать full three-event lease overlap, сохранять natural-retirement subtype.

Фаза3 — A UP, настоящий queue/canonical idle и server ACK, application callbacks в exact arrival order, accepted identities/targets, Surface canonical PNG/whole. VPS B pixels не являются hardware oracle. Дополнительный rejoin требует отдельного actual snapshotseq readiness, не предполагать его по catch-up watermark.

Это может завершиться incomplete на медленном VPS, но не закладывает заведомо несовместимую precondition «B получил и досушил Awater, пока Aoldlease ещё не закончил». Один Surface context1700 guard, own VPS sender, max120 общего окна, no retry/timeout enlargement. GPU/performance причина предыдущего Hard120 пока не доказана. Нового hardware запуска нет.
