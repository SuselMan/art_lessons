# Исходная полная пустая база в restore

Opt-in `restoreCanonicalEmptyRoom(engine,read,originalTail)` передаёт исходный
private read-owner и exact tail целиком. Sink обязан выполнять настоящую engine
транзакцию и независимо отвергать pending/live ресурсы до reconciliation;
проверка UI pending previews не является доказательством пустого engine.
Фактический Room sink не подключён, source/renderer guards остаются OFF.

До gate/display/image/store/pending effects проверяются original base, sink,
engine, null snapshot, initial join с alreadyHadSeq=0, отсутствие UI previews.
Numeric0 сам по себе не авторитет: base проверяется исходным owner. Затем один
вызов sink в SAME replay ticket/display lifecycle, включая пустой cut. Вся legacy
ветка filter/preload/per-op/pending/unpainted обходится. После await проверяется
owner; existing end(ticket) отвергает superseded restore до sync/readiness/cursor,
owner повторно проверяется после drain. Ошибка whole transaction не проглатывается
как ошибка отдельного кадра; display suspension балансируется.

Canonical snapshot bootstrap не запрашивается: coverage остаётся false. Старый
canonical no-base callback путь сохранён без изменения; обычные Room callers
новый sink не передают. Нет controller/factory/новой очереди или registry.

Тесты используют actual prepareCanonicalRoomState и closed shared attachment с
двумя original users/gestures (не source prefix grant из скопированного JSON).
Проверяют complete pointer handoff/cut0, ранние отказы и stale/throw/superseded
после await без readiness/cursor, баланс display. Логи R52/empty-base-restore-*.
Host mocks не доказывают устройство или GPU транзакцию будущего sink.
