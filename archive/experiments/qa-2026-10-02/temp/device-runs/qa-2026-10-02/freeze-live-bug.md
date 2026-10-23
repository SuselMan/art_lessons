QA #689/QA-016, HTTPS5288/API4593, main8990c479 + QA branch.

1. Student рисует native mouse жест, оставляет кнопку нажатой. Teacher видит streamed live ink, но stroke operation ещё нет.
2. Teacher нажимает Freeze project.
3. Student отпускает кнопку: сервер отвергает operation (room_frozen), его Outbox корректно discards own optimistic ink.

Teacher остаётся с линией, отсутствующей в журнале. После15сек всё ещё bounds x430,y1232,w476,h16; Student bounds=null. Reload/late join не содержит этого рисунка. Ожидание: после запрета окончательная отвергнутая часть жеста отсутствует у всех.

Причина: room/participant freeze handlers меняют UI flags; streamed dabs уже painted в peer layer. Конечная operation отвергнута и не broadcast; прежнее ожидание `endPeerLiveStroke` операции никогда не разрешается. Для peer_left уже существует тот же repair через requestFullResync.

Сохранён browser regression lessonControls.spec.ts, failing assertion teacher contentBounds=null; screenshot/video/trace в temp/device-runs/qa-2026-10-02/fixed-e2e-artifacts/. Будет проверен room freeze, point freeze и closed lesson.
