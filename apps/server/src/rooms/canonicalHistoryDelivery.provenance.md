# Один owner и фактические строки cold replay/history

Startup создаёт один CanonicalRoomTransport и явно передаёт его socket и HTTP
registrations. Resolver epoch остаётся у этого owner; отдельного HTTP resolver,
registry, session или receipt map нет. Изолированные тестовые registrations могут
по-прежнему создать свой owner по умолчанию.

PreparedSnapshotReplay сохраняет только transient canonicalRows, прочитанные
теми же существующими target/structure/history SQL queries. Индексные
room/user/id/seq/type/layer/tool и полный JSON проверяются до immutable copy;
row.data указывает именно на этот copy. Ранний no-snapshot return не делает
добавочных queries. Изначальный cold roomLoader уже устанавливает существующие
knownCanonicalWrite receipts из собственных verified rows, без изменений здесь.

Mixed projector проверяет каждый delivered canonical op: actual indexed row,
если он есть в exact transient closure, либо успешный receipt этого actual
resident object. Одинаковый JSON без row не даёт resident authority. Дубликат,
лишняя или конфликтующая row отвергает атом целиком; row не вызывает adopt.
Temporary Map существует лишь во время подготовки payload. Same-gesture source
проверяется existing bounded shared attachment validator.

join_room передаёт только строки final snapshot tail в свой existing sync
finish до seating. History projection использует тот же owner/read auth/lifetime
и board epoch, не reader BEGIN. Исходный array копируется перед возвратом page.

Shared REST тип CanonicalRecordedHistoryPage={operations,canonicalCapabilities};
OperationHistoryResponse=Operation[]|CanonicalRecordedHistoryPage. HTTP пока
НЕ активирует новый body: historical material codec prefix 1| остаётся exact
array lane; V2/unknown version требует same-owner preparation и возвращает 409
до готовности paired whole-page client reader. Raster frame.version не является
material version. Mixed V1/V2 нельзя частично отдавать новому reader.

Проверки: actual durable resident + cloned cold indexed row в одной gesture,
same epoch as BEGIN/read scope, no synthetic adopt, extra/duplicate/tampered rows,
policy OFF/stale lifetime; recovered canonical snapshot dependencies and mutation
isolation; injected HTTP owner, V1 byte equality and V2 refusal; прежние реальные
socket/channel и snapshot replay regressions.

Production straight admission/client engine guards остаются OFF. Сервисов,
браузеров, runtime/dependency копий эта работа не создаёт.
