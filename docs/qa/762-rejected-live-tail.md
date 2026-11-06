# #762 — окончательный отказ завершает живой хвост

06.11.2026. База `1165a3837a70bb621a6a1c6512477991faa666b7`.
Worktree `762-release-live-tail`, ветка `agents/762-release-live-tail`.

Сервер после окончательного отказа в stroke отправляет наблюдателям существующее
`peer_stroke_live_end(cancelled=true)` и забывает хвост своего сокета.
Обычный UP не заменяет эту отмену: на момент UP вердикта по durable операции ещё нет.
Уже принятые chunks остаются в canonical history. Транзиентные not_joined/server_error
сохраняют возможность retry; используется общий isTransientReject.

## Проверки

Настоящий Socket.IO: до фикса 3 FAIL / 52. После 52 / 52 PASS (5.69 с).
Проверяются room freeze с обычным UP и без него, participant freeze, сохранение
ранее принятого chunk, duplicate ACK после freeze без лишней отмены,
server_error без cancellation с последующей успешной повторной отправкой.

Браузер: e2e/specs/rejectedLiveTail.spec.ts, настоящий Chromium/SwiftShader,
PostgreSQL и Socket.IO. Наблюдатель — реальный Grafetto; отдельный аутентифицированный
Socket.IO-автор посылает packed dabs, принятый chunk и незаписанный хвост одного жеста,
затем обычный UP. Учитель замораживает проект через UI, автор отправляет следующий
chunk и получает room_frozen. Проверяются явная cancellation на исходящем к
наблюдателю WebSocket и точные SHA256 непустых RGBA tiles сохранённого chunk.
Автор остаётся подключённым, отказанная операция отсутствует в истории.

Первый browser baseline с одним сравнением пикселей прошёл: клиент уже имеет
resync при room_frozen_changed. Это существующая страховка, не доказательство
серверного исправления. Поэтому regression требует явный terminal wire verdict;
браузерная проверка не заявляется доказательством отсутствия прежней страховки.

Компактные логи/хеши исходников находятся в игнорируемом temp/762-release-live-tail.
Собственные runtime, PostgreSQL/volumes, trace/video и dependency views убираются
после завершения проверок.

Уточнённый browser baseline before-wire: FAIL (103.1 с), отсутствует явная отмена
на WebSocket после подтверждённого room_frozen. Pixel-only baseline не используется
как доказательство исправления.

С исправлением: browser PASS (47.1 с); rooms/routes + peer events и регрессии
peer-live/async cancellation: 669 / 669, 27 файлов (48.07 с). Typecheck, lint:fix,
map:check и map:rules: exit 0. Собственные QA-процессы, три контейнера/volumes,
trace/video и временные представления зависимостей убраны.
