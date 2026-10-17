# #783: поздний вход не воскрешает сокет и не отменяет новое намерение

Дата: 17.10.2026. Исходники: база `b8bb3074`, отдельный worktree
`783-join-generation`, ветка `agents/783-join-generation`.
Issue: https://github.com/SuselMan/art_lessons/issues/783.

## Baseline

Реальный Socket.IO server/client, Postgres mock с управляемым promise в snapshot
query. Disconnect awaited на сервере до release query, никаких sleep для выбора
порядка событий. На неизменённом b8bb3074:

- Disconnect во время prepareSnapshotReplay → после query существовал ghost
  participant late-user и был отправлен peer_joined.
- J1(main) завис на query, J2(child) завершился; release J1 возвращал participant
  и серверный socket на main. Оба регрессионных теста FAIL.
- UI lifecycle baseline: старый transient отказ показывал toast до и после
  завершения новой доски (2 FAIL / 15 PASS).
- Дополнительный baseline: disconnect во время create cold load, pending join →
  new create и UI B→C→B stale refusal — 3 FAIL. Совпадение boardId не различает
  первое и третье намерение B.

## Исправление

create_room и join_room делят per-socket generation. После await ensure/load,
access gate и snapshot query проверяются socket.connected и актуальность
намерения до любого seating/room_state/peer_joined. Устаревший connected запрос
получает существующий `{ok:false,error:'server_busy'}`; shared контракт не менялся.

Per-room счётчик ожидающих запросов переносит cleanup в finally: отменённый вход
не удаляет холодную комнату, пока второй актуальный вход ждёт её query. Последний
waiter освобождает только неиспользуемую resident запись; durable данные не удаляются.

Клиентский switchBoard имеет поколение намерения, проверяет его перед emit и в
ack. Stale ошибка не трогает wanted/socket board, ready, notices и hasJoined.
Актуальный отказ по-прежнему разблокирует прежнюю доску и показывает ошибку.

## Проверки

- Actual Socket.IO: disconnect во время load/access/snapshot; ghost participant,
  roster и лишний peer_joined отсутствуют; холодная отменённая комната освобождается.
- Два pending запроса одной cold room: первый disconnected/released, второй всё
  ещё в query; resident запись остаётся, второй запрос успешно входит.
- J1 delayed → J2 completed → J1 release; latest board остаётся активной,
  stale ACK transient. Create disconnect, pending join → create и pending create →
  join проверены тем же настоящим transport fixture.
- UI pure lifecycle: stale отказ при pending/completed новой доске; ABA B→C→B;
  актуальный server_busy продолжает показывать toast.
- Финальный прогон: 39 suites / 727 tests PASS (все server + joinFlow).
- Server и web `tsc --noEmit`, oxlint изменённых server/web файлов и
  `git diff --check` PASS.

## Отдельный подтверждённый дефект вне этого фикса

[#784](https://github.com/SuselMan/art_lessons/issues/784): если последний уже
сидящий участник отключается во время query newcomer, leaveRoom может выселить
комнату. Actual Socket.IO proof: sole owner → newcomer snapshot await → owner
server disconnect + flush → query release даёт `{ok:false,error:'not_found'}`.
Проверено отдельно и оставлено открытым; универсальный residency pin не добавлялся.
Счётчик #783 защищает только cleanup завершающихся handler requests от другого
pending request этой же комнаты. Он не меняет eviction в rooms.ts.
Failing proof сохранён как fragment/log в temp/qa783-evidence, в passing suite
не включён; durable данные не удалялись.

Browser/device проверка остаётся координатору в отдельном integration окне.
Следовал grafetto-verify для выбора relevant checks, maxWorkers=1. Здесь только
CPU/Socket.IO; GPU, backend 4558 и исходники интеграции не затрагивались.
Зависимости заимствованы scoped links при совпадающем lockfile с выбранным shared
source. Временные links/build/config удаляются после проверок; source worktree
сохраняется. Компактные baseline/final logs — ignored temp/qa783-evidence.
